import { build } from 'vite'
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { assertWorkerCheckBundle, WORKER_CHECK_PARENT_ORIGIN, WORKER_CHECK_RENDERER_URL, WORKER_CHECK_PATH,
  renderWorkerCheckDocument } from '../deployment/isolated-renderer/worker-check-page.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outDir = resolve(root, 'dist-player-check/worker')
const integrityOf = body => `sha384-${createHash('sha384').update(body).digest('base64')}`

await build({
  root, configFile: false, envDir: false, publicDir: false, envPrefix: '__MAGE_WORKER_CHECK_NO_CLIENT_ENV__',
  define: {
    __MAGE_WORKER_CHECK_SCOPE__: JSON.stringify('production'),
    __MAGE_WORKER_CHECK_PARENT__: JSON.stringify(WORKER_CHECK_PARENT_ORIGIN),
    __MAGE_WORKER_CHECK_PATH__: JSON.stringify(WORKER_CHECK_PATH),
    __MAGE_WORKER_CHECK_CHILD__: JSON.stringify(WORKER_CHECK_RENDERER_URL),
    'import.meta.env': JSON.stringify({ MODE: 'production', PROD: true, DEV: false, BASE_URL: WORKER_CHECK_PATH }),
  },
  plugins: [{ name: 'fixed-worker-check-parent-boundary', generateBundle(_options, bundle) { assertWorkerCheckBundle(bundle, root) } }],
  build: {
    outDir, emptyOutDir: true, target: 'es2022', sourcemap: false,
    lib: { entry: resolve(root, 'scripts/isolated-worker-check.ts'), name: 'MageFixedWorkerCheckPage', formats: ['iife'] },
    rollupOptions: { output: { entryFileNames: 'assets/worker-[hash].js', inlineDynamicImports: true } },
  },
})

const assets = await readdir(resolve(outDir, 'assets'))
if (assets.length !== 1 || !/^worker-[a-zA-Z0-9_-]+\.js$/.test(assets[0])) throw new Error('Unexpected worker-check assets.')
const scriptPath = `assets/${assets[0]}`
const script = await readFile(resolve(outDir, scriptPath))
const style = await readFile(resolve(root, 'scripts/isolated-security-check.css'))
const stylePath = `assets/worker-${createHash('sha256').update(style).digest('hex').slice(0, 16)}.css`
const html = renderWorkerCheckDocument({ scriptPath, scriptIntegrity: integrityOf(script), stylePath, styleIntegrity: integrityOf(style) })
await writeFile(resolve(outDir, stylePath), style)
await writeFile(resolve(outDir, 'index.html'), html)
await writeFile(resolve(outDir, 'build-manifest.json'), JSON.stringify({ version: 1, parentOrigin: WORKER_CHECK_PARENT_ORIGIN, rendererUrl: WORKER_CHECK_RENDERER_URL,
  files: {
    'index.html': { integrity: integrityOf(html), contentType: 'text/html; charset=utf-8' },
    [scriptPath]: { integrity: integrityOf(script), contentType: 'text/javascript; charset=utf-8' },
    [stylePath]: { integrity: integrityOf(style), contentType: 'text/css; charset=utf-8' },
  },
}, null, 2) + '\n')
console.log(`Fixed worker check built for ${WORKER_CHECK_PARENT_ORIGIN}${WORKER_CHECK_PATH}. No renderer or release setting was changed.`)
