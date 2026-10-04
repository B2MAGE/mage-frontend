import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { assertWorkerCheckBundle, WORKER_CHECK_ALLOWED_MODULES, WORKER_CHECK_PARENT_ORIGIN, WORKER_CHECK_RENDERER_URL,
  WORKER_CHECK_PATH, WORKER_CHECK_CSP, renderWorkerCheckDocument } from './worker-check-page.mjs'

const fixture = { scriptPath: 'assets/worker-abc123.js', stylePath: 'assets/worker-def456.css',
  scriptIntegrity: `sha384-${'A'.repeat(64)}`, styleIntegrity: `sha384-${'B'.repeat(64)}` }

test('fixed live worker parent permits only its exact child and no parent compiler or requests', () => {
  assert.equal(WORKER_CHECK_PARENT_ORIGIN, 'https://mage.peterbucci.com')
  assert.equal(WORKER_CHECK_RENDERER_URL, 'https://d2wwpgc7sgvmnm.cloudfront.net/index.html')
  assert.equal(WORKER_CHECK_PATH, '/player-check/worker/')
  const directives = WORKER_CHECK_CSP.split('; ')
  assert(directives.includes(`frame-src ${WORKER_CHECK_RENDERER_URL}`))
  for (const resource of ['connect', 'worker', 'object', 'base-uri', 'form-action']) {
    assert(directives.includes(`${resource}${resource.includes('-') ? '' : '-src'} 'none'`))
  }
  assert(directives.includes("script-src 'self'"))
  assert(directives.includes("style-src 'self'"))
  assert(!/unsafe-eval|unsafe-inline|blob:|https:\*|http:/.test(WORKER_CHECK_CSP))
})

test('worker parent document has fixed buttons and exactly two integrity-pinned external assets', () => {
  const html = renderWorkerCheckDocument(fixture)
  assert(html.includes(`content="${WORKER_CHECK_CSP}"`))
  assert(html.includes(`src="./${fixture.scriptPath}" integrity="${fixture.scriptIntegrity}"`))
  assert(html.includes(`href="./${fixture.stylePath}" integrity="${fixture.styleIntegrity}"`))
  assert.equal((html.match(/<script\b/g) ?? []).length, 1)
  assert(!/<script\b[^>]*>\s*[^<\s]/.test(html))
  for (const id of ['start', 'stop', 'player', 'status', 'results', 'summary', 'saved-runs', 'download', 'show-report', 'report-json']) {
    assert(html.includes(`id="${id}"`))
  }
  assert(!/<input\b|<textarea\b|<form\b|\son\w+=/.test(html))
  assert(html.includes('Network requests, GPU behavior, normal app flows and full browser release approval require their separate checks.'))
  for (const change of [{ scriptPath: 'https://other.invalid/main.js' }, { scriptPath: 'assets/worker-abc123.css' },
    { stylePath: 'assets/worker-abc123.js' }, { stylePath: '../secret' }, { scriptIntegrity: 'missing' }]) {
    assert.throws(() => renderWorkerCheckDocument({ ...fixture, ...change }))
  }
})

test('worker parent build excludes the compiler, source runner, app code and extra outputs', () => {
  const root = resolve('worker-parent-test')
  const bundle = (paths = WORKER_CHECK_ALLOWED_MODULES) => ({ 'parent.js': { type: 'chunk', imports: [], dynamicImports: [],
    modules: Object.fromEntries(paths.map(path => [resolve(root, path), {}])) } })
  assert.doesNotThrow(() => assertWorkerCheckBundle(bundle(), root))
  for (const module of ['scripts/worker-check-runner.ts', 'scripts/worker-check-child.ts',
    'src/isolated-renderer/compiler/client.ts', 'node_modules/@notrac/mage/dist/compiler.js',
    'node_modules/@notrac/mage/dist/mage-engine.js', 'src/modules/auth/api.ts']) {
    assert.throws(() => assertWorkerCheckBundle(bundle([module]), root), /Unexpected module/)
  }
  for (const field of ['imports', 'dynamicImports']) {
    const imported = bundle(); imported['parent.js'][field] = ['external.js']
    assert.throws(() => assertWorkerCheckBundle(imported, root), /self-contained/)
  }
  const split = bundle(); split['extra.js'] = split['parent.js']
  assert.throws(() => assertWorkerCheckBundle(split, root), /self-contained/)
})
