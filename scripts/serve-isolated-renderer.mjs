import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHostingManifest, integrityOf, renderDocument } from '../deployment/isolated-renderer/hosting-policy.mjs'

export async function loadRendererBuild(directory) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'hosting-manifest.json'), 'utf8'))
  if (!/^assets\/renderer-[A-Za-z0-9_-]+\.js$/.test(manifest.bundlePath ?? '')) throw new Error('Invalid renderer build manifest.')
  const bundle = await readFile(resolve(directory, manifest.bundlePath))
  const expected = createHostingManifest({ bundlePath: manifest.bundlePath, bundle, parentOrigins: manifest.parentOrigins, production: manifest.production })
  if (JSON.stringify(manifest) !== JSON.stringify(expected)) throw new Error('Renderer manifest does not match its bundle and required hosting policy. Rebuild first.')
  const html = await readFile(resolve(directory, 'index.html'))
  if (html.toString() !== renderDocument(manifest) || integrityOf(bundle) !== manifest.scriptIntegrity) throw new Error('Renderer document or bundle was modified after build.')
  const files = new Map(Object.entries(manifest.files).map(([path, entry]) => [path, { ...entry, body: entry.file === 'index.html' ? html : bundle }]))
  return { manifest, files }
}

export function createRendererRequestHandler({ manifest, files }) {
  return (request, response) => {
    for (const [name, value] of Object.entries(manifest.headers)) response.setHeader(name, value)
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    // Exact raw paths deliberately reject query strings, encoded traversal and SPA/API paths.
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD')
      response.writeHead(405).end('Method not allowed')
      return
    }
    const host = (request.headers.host ?? '').split(':')[0]
    if (!['localhost', '127.0.0.1'].includes(host)) {
      response.writeHead(421).end('Unknown renderer host')
      return
    }
    const entry = files.get(request.url)
    if (!entry) {
      response.writeHead(404).end(request.method === 'HEAD' ? undefined : 'Not found')
      return
    }
    response.setHeader('Content-Type', entry.contentType)
    response.setHeader('Cache-Control', entry.cacheControl)
    response.setHeader('Content-Length', entry.body.length)
    response.writeHead(200).end(request.method === 'HEAD' ? undefined : entry.body)
  }
}

export function createReloadingRendererRequestHandler(directory, initialBuild, initialManifestSource) {
  let build = initialBuild
  let manifestSource = initialManifestSource

  return async (request, response) => {
    try {
      const nextManifestSource = await readFile(resolve(directory, 'hosting-manifest.json'), 'utf8')
      if (nextManifestSource !== manifestSource) {
        // Local editor and renderer builds are separate on purpose. Pick up a
        // completed rebuild without requiring the long-running server to restart.
        build = await loadRendererBuild(directory)
        manifestSource = nextManifestSource
      }
      createRendererRequestHandler(build)(request, response)
    } catch {
      if (response.headersSent) return response.end()
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Content-Type', 'text/plain; charset=utf-8')
      response.writeHead(503).end('Renderer rebuild is not ready')
    }
  }
}

export async function startRendererServer({ directory, port = 5181, tls } = {}) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const buildDirectory = directory ?? resolve(root, 'dist-isolated-renderer')
  const build = await loadRendererBuild(buildDirectory)
  const manifestSource = await readFile(resolve(buildDirectory, 'hosting-manifest.json'), 'utf8')
  const handler = createReloadingRendererRequestHandler(buildDirectory, build, manifestSource)
  const server = tls ? createHttpsServer(tls, handler) : createHttpServer(handler)
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept) })
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.MAGE_RENDERER_PORT ?? 5181)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid renderer port.')
  const cert = process.env.MAGE_RENDERER_TLS_CERT
  const key = process.env.MAGE_RENDERER_TLS_KEY
  if (Boolean(cert) !== Boolean(key)) throw new Error('Set both MAGE_RENDERER_TLS_CERT and MAGE_RENDERER_TLS_KEY for HTTPS.')
  const tls = cert ? { cert: await readFile(cert), key: await readFile(key) } : undefined
  await startRendererServer({ port, tls })
  console.log(`Isolated renderer: ${tls ? 'https' : 'http'}://localhost:${port}/ (loopback only)`)
}
