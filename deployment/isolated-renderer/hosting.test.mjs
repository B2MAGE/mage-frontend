import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, get } from 'node:http'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { runInNewContext } from 'node:vm'
import { assertNonCredentialedResponse, createHostingManifest, integrityOf, parseParentOrigins, renderDocument } from './hosting-policy.mjs'
import { createCloudFormationTemplate } from './cloudformation-template.mjs'
import { assertCompilerWorkerBundle, COMPILER_WORKER_ALLOWED_MODULES } from './compiler-build-policy.mjs'
import { createRendererRequestHandler, loadRendererBuild } from '../../scripts/serve-isolated-renderer.mjs'

const bundle = Buffer.from('window.rendererLoaded = true;')
const localManifest = () => createHostingManifest({ bundlePath: 'assets/renderer-test123.js', bundle, parentOrigins: parseParentOrigins() })
const productionManifest = () => createHostingManifest({ bundlePath: 'assets/renderer-test123.js', bundle, parentOrigins: parseParentOrigins('https://mage.example.com', true), production: true })

test('HTTP verification accepts omitted/false credential allowance but rejects credentials or cookies', () => {
  assert.doesNotThrow(() => assertNonCredentialedResponse(new Headers()))
  assert.doesNotThrow(() => assertNonCredentialedResponse(new Headers({ 'Access-Control-Allow-Credentials': 'false' })))
  assert.throws(() => assertNonCredentialedResponse(new Headers({ 'Access-Control-Allow-Credentials': 'true' })), /credentials/)
  assert.throws(() => assertNonCredentialedResponse(new Headers({ 'Set-Cookie': 'session=forbidden' })), /cookies/)
})

test('only exact configured parent origins are accepted, with no permissive production default', () => {
  assert.deepEqual(parseParentOrigins(), ['http://127.0.0.1:5178', 'http://localhost:5178'])
  assert.deepEqual(parseParentOrigins('https://mage.example.com,https://www.mage.example.com', true), ['https://mage.example.com', 'https://www.mage.example.com'])
  for (const value of ['', '*', 'https://*.example.com', 'https://mage.example.com/', 'https://mage.example.com/path', 'https://user:password@mage.example.com', 'https://mage.example.com?x=1', 'http://mage.example.com', 'null', 'https://mage.example.com; connect-src *']) {
    assert.throws(() => parseParentOrigins(value, true), value)
  }
  assert.throws(() => parseParentOrigins(undefined, true))
  assert.throws(() => parseParentOrigins('http://127.0.0.1:5178', true))
})

test('response policy keeps direct navigation opaque and permits only the immutable script and fixed style', () => {
  const manifest = localManifest()
  const csp = manifest.headers['Content-Security-Policy']
  assert(csp.includes('sandbox allow-scripts;'))
  assert(!csp.includes('allow-same-origin'))
  assert(csp.includes(`script-src '${integrityOf(bundle)}' 'unsafe-eval'`))
  assert(!csp.includes("'self'"))
  assert(!csp.includes("'unsafe-inline'"))
  for (const source of ['connect', 'frame', 'child', 'object', 'media', 'font', 'manifest']) assert(csp.includes(`${source}-src 'none'`))
  assert.equal(csp.split('; ').find(directive => directive.startsWith('worker-src ')), 'worker-src blob:')
  assert(!csp.split('; ').find(directive => directive.startsWith('script-src ')).includes('blob:'))
  assert(csp.includes("form-action 'none'"))
  assert(csp.includes("base-uri 'none'"))
  assert.equal(manifest.headers['Referrer-Policy'], 'no-referrer')
  assert.equal(manifest.headers['Access-Control-Allow-Origin'], '*')
  assert.equal(manifest.headers['Access-Control-Allow-Credentials'], undefined)
  const html = renderDocument(manifest)
  assert(html.includes(`integrity="${integrityOf(bundle)}" crossorigin="anonymous"`))
  assert(!html.includes('type="module"'))
})

test('compiler worker module boundary excludes the DOM engine, application code and any external chunks', () => {
  const root = resolve('compiler-boundary-test')
  const bundle = (paths = COMPILER_WORKER_ALLOWED_MODULES) => ({ 'worker.js': {
    type: 'chunk', code: '(() => {})();', imports: [], dynamicImports: [],
    modules: Object.fromEntries(paths.map(path => [resolve(root, path), {}])),
  } })
  assert.doesNotThrow(() => assertCompilerWorkerBundle(bundle(), root))
  for (const path of [
    'src/isolated-renderer/playback.ts',
    'src/isolated-renderer/compiler/client.ts',
    'src/modules/auth/api.ts',
    'node_modules/@notrac/mage/dist/mage-engine.js',
    'node_modules/other-package/index.js',
    '../untrusted/compiler.js',
  ]) assert.throws(() => assertCompilerWorkerBundle(bundle([path]), root), /Unexpected module/)
  const virtual = bundle([])
  virtual['worker.js'].modules['\0unexpected-helper'] = {}
  assert.throws(() => assertCompilerWorkerBundle(virtual, root), /Unexpected module/)
  for (const imports of ['imports', 'dynamicImports']) {
    const external = bundle()
    external['worker.js'][imports] = ['remote.js']
    assert.throws(() => assertCompilerWorkerBundle(external, root), /self-contained/)
  }
  const split = bundle()
  split['extra.js'] = split['worker.js']
  assert.throws(() => assertCompilerWorkerBundle(split, root), /self-contained/)
  const asset = bundle()
  asset['worker.js'].type = 'asset'
  assert.throws(() => assertCompilerWorkerBundle(asset, root), /self-contained/)
  const empty = bundle()
  empty['worker.js'].code = ''
  assert.throws(() => assertCompilerWorkerBundle(empty, root), /source is missing/)
})

test('local server serves only approved assets with real security headers, never API/SPA/query/method fallbacks', async () => {
  const manifest = localManifest()
  const html = Buffer.from(renderDocument(manifest))
  const files = new Map(Object.entries(manifest.files).map(([path, entry]) => [path, { ...entry, body: path.includes('assets/') ? bundle : html }]))
  const server = createServer(createRendererRequestHandler({ manifest, files }))
  await new Promise((accept) => server.listen(0, '127.0.0.1', accept))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const documentResponse = await fetch(base)
    assert.equal(documentResponse.status, 200)
    assert.equal(await documentResponse.text(), html.toString())
    for (const [name, value] of Object.entries(manifest.headers)) assert.equal(documentResponse.headers.get(name), value)
    assert.equal(documentResponse.headers.get('set-cookie'), null)
    assert.equal(documentResponse.headers.get('cache-control'), 'no-store')
    const asset = await fetch(`${base}/${manifest.bundlePath}`)
    assert.equal(await asset.text(), bundle.toString())
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    const head = await fetch(base, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(await head.text(), '')
    for (const path of ['/api/auth/me', '/create-scene', '/hosting-manifest.json', '/build-audit.json', '/compiler-worker.js', '/index.html?parent=https://attacker.invalid', '/assets/renderer-other.js', '/%2e%2e/package.json']) {
      const response = await fetch(`${base}${path}`)
      assert.equal(response.status, 404, path)
      assert.equal(response.headers.get('content-security-policy'), manifest.headers['Content-Security-Policy'])
    }
    assert.equal((await fetch(base, { method: 'POST', body: 'secret' })).status, 405)
    const reboundStatus = await new Promise((accept, reject) => {
      get(base, { headers: { host: 'rebound.invalid' } }, (response) => { response.resume(); accept(response.statusCode) }).on('error', reject)
    })
    assert.equal(reboundStatus, 421)
  } finally { await new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept())) }
})

test('modified files or relaxed manifest policies fail server startup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mage-renderer-hosting-'))
  const manifest = localManifest()
  try {
    await mkdir(join(directory, 'assets'))
    await writeFile(join(directory, manifest.bundlePath), bundle)
    await writeFile(join(directory, 'index.html'), renderDocument(manifest))
    await writeFile(join(directory, 'hosting-manifest.json'), JSON.stringify(manifest))
    assert.equal((await loadRendererBuild(directory)).files.size, 3)
    const relaxed = structuredClone(manifest)
    relaxed.headers['Content-Security-Policy'] = "default-src * 'unsafe-eval'"
    await writeFile(join(directory, 'hosting-manifest.json'), JSON.stringify(relaxed))
    await assert.rejects(loadRendererBuild(directory), /required hosting policy/)
    const relaxedWorker = structuredClone(manifest)
    relaxedWorker.headers['Content-Security-Policy'] = relaxedWorker.headers['Content-Security-Policy'].replace('worker-src blob:', 'worker-src blob: https:')
    await writeFile(join(directory, 'hosting-manifest.json'), JSON.stringify(relaxedWorker))
    await assert.rejects(loadRendererBuild(directory), /required hosting policy/)
    await writeFile(join(directory, 'hosting-manifest.json'), JSON.stringify(manifest))
    await writeFile(join(directory, manifest.bundlePath), 'window.tampered = true')
    await assert.rejects(loadRendererBuild(directory), /required hosting policy/)
  } finally {
    assert(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`), 'Temporary test directory must stay within the system temporary directory.')
    await rm(directory, { recursive: true, force: true })
  }
})

test('AWS template uses the same policy, private OAC bucket, exact paths, and no user-state forwarding', () => {
  assert.throws(() => createCloudFormationTemplate(localManifest()), /production/)
  const manifest = productionManifest()
  const template = createCloudFormationTemplate(manifest)
  const resources = template.Resources
  assert.deepEqual(resources.RendererBucket.Properties.PublicAccessBlockConfiguration, {
    BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true,
  })
  assert.equal(resources.OriginAccessControl.Properties.OriginAccessControlConfig.SigningBehavior, 'always')
  assert.equal(resources.OriginAccessControl.Properties.OriginAccessControlConfig.SigningProtocol, 'sigv4')
  const documentPolicy = resources.DocumentHeaders.Properties.ResponseHeadersPolicyConfig
  assert.equal(documentPolicy.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy, manifest.headers['Content-Security-Policy'])
  assert.equal(documentPolicy.SecurityHeadersConfig.ContentSecurityPolicy.Override, true)
  assert(documentPolicy.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy.includes('worker-src blob:'))
  assert(documentPolicy.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy.includes("connect-src 'none'"))
  assert.equal(documentPolicy.CorsConfig.AccessControlAllowCredentials, false)
  assert(documentPolicy.RemoveHeadersConfig.Items.some(({ Header }) => Header === 'Set-Cookie'))
  for (const name of ['DocumentCache', 'AssetCache']) {
    const cache = resources[name].Properties.CachePolicyConfig.ParametersInCacheKeyAndForwardedToOrigin
    assert.equal(cache.CookiesConfig.CookieBehavior, 'none')
    assert.equal(cache.HeadersConfig.HeaderBehavior, 'none')
    assert.equal(cache.QueryStringsConfig.QueryStringBehavior, 'none')
  }
  const distribution = resources.Distribution.Properties.DistributionConfig
  for (const behavior of [distribution.DefaultCacheBehavior, ...distribution.CacheBehaviors]) {
    assert.equal(behavior.ViewerProtocolPolicy, 'https-only')
    assert.deepEqual(behavior.AllowedMethods, ['GET', 'HEAD'])
    assert.deepEqual(behavior.FunctionAssociations, [{ EventType: 'viewer-request', FunctionARN: { 'Fn::GetAtt': ['AllowlistedFiles', 'FunctionMetadata.FunctionARN'] } }])
  }
  assert.equal(distribution.Origins.length, 1)
  assert.deepEqual(distribution.Origins[0].OriginAccessControlId, { Ref: 'OriginAccessControl' })
  assert.deepEqual(distribution.Origins[0].DomainName, { 'Fn::GetAtt': ['RendererBucket', 'RegionalDomainName'] })
  const bucketStatements = resources.RendererBucketPolicy.Properties.PolicyDocument.Statement
  const access = bucketStatements.find(({ Sid }) => Sid === 'CloudFrontReadOnly')
  assert.deepEqual(access.Principal, { Service: 'cloudfront.amazonaws.com' })
  assert.equal(access.Action, 's3:GetObject')
  assert.deepEqual(access.Condition.StringEquals['AWS:SourceArn'], { 'Fn::Sub': 'arn:aws:cloudfront::${AWS::AccountId}:distribution/${Distribution}' })
  const tls = bucketStatements.find(({ Sid }) => Sid === 'RequireTLS')
  assert.equal(tls.Effect, 'Deny')
  assert.equal(tls.Condition.Bool['aws:SecureTransport'], 'false')
  assert.equal(distribution.CacheBehaviors[0].PathPattern, manifest.bundlePath)
  assert(!distribution.CustomErrorResponses.some((entry) => entry.ResponsePagePath))
  const handler = runInNewContext(`${resources.AllowlistedFiles.Properties.FunctionCode}; handler`)
  const event = (uri, querystring = {}, method = 'GET') => ({ request: { uri, querystring, method } })
  assert.equal(handler(event('/')).uri, '/index.html')
  assert.equal(handler(event(`/${manifest.bundlePath}`)).uri, `/${manifest.bundlePath}`)
  for (const input of [event('/api/auth/me'), event('/index.html', { secret: { value: 'x' } }), event('/', {}, 'POST'), event('/assets/old.js')]) {
    const denied = handler(input)
    assert.equal(denied.statusCode, 403)
    assert(denied.headers['content-security-policy'].value.includes('sandbox allow-scripts'))
  }
})

test('AWS hosting needs no domain registration, DNS records, or custom certificate', () => {
  const template = createCloudFormationTemplate(productionManifest())
  const distribution = template.Resources.Distribution.Properties.DistributionConfig
  assert.equal(template.Parameters, undefined)
  assert.equal(distribution.Aliases, undefined)
  assert.deepEqual(distribution.ViewerCertificate, { CloudFrontDefaultCertificate: true })
  assert.deepEqual(template.Outputs.DistributionDomainName.Value, { 'Fn::GetAtt': ['Distribution', 'DomainName'] })
  assert.deepEqual(template.Outputs.RendererOrigin.Value, { 'Fn::Sub': 'https://${Distribution.DomainName}' })
  for (const { Type } of Object.values(template.Resources)) {
    assert(!Type.startsWith('AWS::Route53::'), 'Provider-issued hosting must not create DNS resources.')
    assert(!Type.startsWith('AWS::CertificateManager::'), 'Provider-issued hosting must not require an ACM certificate.')
  }
  assert(!JSON.stringify(template).includes('RendererDomainName'))
  assert(!JSON.stringify(template).includes('CertificateArn'))
})
