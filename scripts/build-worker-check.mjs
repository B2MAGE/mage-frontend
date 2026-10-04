import { build } from 'vite'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { buildCompilerWorker } from './build-compiler-worker.mjs'
import { createHostingManifest, integrityOf, renderDocument } from '../deployment/isolated-renderer/hosting-policy.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outDir = resolve(root, '.local/worker-check-renderer')
const compiler = await buildCompilerWorker(root)
const allowed = new Set(['scripts/worker-check-child.ts', 'scripts/worker-check-runner.ts', 'scripts/worker-check-fixture.ts',
  'src/isolated-renderer/compiler/client.ts', 'src/isolated-renderer/compiler/protocol.ts', 'src/isolated-renderer/boundary.ts',
  'node_modules/@notrac/mage/dist/compiled-shader.js'])
let modules = []
await build({ root, configFile: false, envDir: false, publicDir: false, envPrefix: '__MAGE_WORKER_CHECK_NO_ENV__',
  define: { __MAGE_COMPILER_WORKER_SOURCE__: JSON.stringify(compiler.source),
    'import.meta.env': JSON.stringify({ MODE: 'production', PROD: true, DEV: false, BASE_URL: '/' }) },
  plugins: [{ name: 'fixed-worker-fixture-boundary', generateBundle(_options, bundle) {
    const values = Object.values(bundle)
    if (values.length !== 1 || values[0].type !== 'chunk' || values[0].imports.length || values[0].dynamicImports.length) throw new Error('Fixed worker fixture must be one self-contained script.')
    modules = Object.keys(values[0].modules).map(id => id.replaceAll('\\', '/').replace(`${root.replaceAll('\\', '/')}/`, ''))
    if (modules.some(id => !allowed.has(id))) throw new Error(`Unexpected fixed worker fixture module: ${modules.filter(id => !allowed.has(id)).join(', ')}`)
  } }],
  build: { outDir, emptyOutDir: true, target: 'es2022', sourcemap: false,
    lib: { entry: resolve(root, 'scripts/worker-check-child.ts'), name: 'MageFixedWorkerCheck', formats: ['iife'] },
    rollupOptions: { output: { entryFileNames: 'assets/renderer-[hash].js', inlineDynamicImports: true } } },
})
const assets = await readdir(resolve(outDir, 'assets'))
if (assets.length !== 1) throw new Error('Unexpected fixed worker fixture assets.')
const bundlePath = `assets/${assets[0]}`, bundle = await readFile(resolve(outDir, bundlePath))
const manifest = createHostingManifest({ bundlePath, bundle, parentOrigins: ['http://127.0.0.1:5178'] })
await writeFile(resolve(outDir, 'index.html'), renderDocument(manifest))
await writeFile(resolve(outDir, 'hosting-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
await writeFile(resolve(outDir, 'build-audit.json'), `${JSON.stringify({ fixtureVersion: 'fixed-worker-1', sourceModules: modules,
  compilerWorker: { sourceIntegrity: integrityOf(compiler.source), sourceBytes: Buffer.byteLength(compiler.source), sourceModules: compiler.modules } }, null, 2)}\n`)
console.log(`Fixed worker child built at ${outDir}`)
