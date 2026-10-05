import { build } from 'vite'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createHostingManifest, integrityOf, parseParentOrigins, renderDocument } from '../deployment/isolated-renderer/hosting-policy.mjs'
import { createCloudFormationTemplate } from '../deployment/isolated-renderer/cloudformation-template.mjs'
import { assertPlaybackOnlyRenderer } from '../deployment/isolated-renderer/runtime-build-policy.mjs'
import { buildCompilerWorker } from './build-compiler-worker.mjs'

export async function buildIsolatedRenderer({ production = false, diagnostics = false } = {}) {
  if (production && diagnostics) throw new Error('Diagnostics renderer cannot be published.')
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  // Publishing must not replace the artifact used by the running local preview.
  const outDir = resolve(root, diagnostics ? '.local/diagnostics-renderer' : production ? 'dist-isolated-renderer-production' : 'dist-isolated-renderer')
  const parentOrigins = diagnostics ? ['http://127.0.0.1:5178', 'http://localhost:5178'] : parseParentOrigins(process.env.MAGE_RENDERER_PARENT_ORIGINS, production)
  const sourcePrefix = `${root.replaceAll('\\', '/')}/src/`
  const rootPrefix = `${root.replaceAll('\\', '/')}/`
  const allowedSharedFiles = new Set([
    `${sourcePrefix}modules/player/isolation/protocol.ts`,
    `${sourcePrefix}modules/player/isolation/playbackProtocol.ts`,
    `${sourcePrefix}modules/player/liveSceneSettings.ts`,
    `${sourcePrefix}modules/player/isolation/capture.ts`,
    `${sourcePrefix}modules/player/infrastructure/viewerPointerDeformation.ts`,
    `${sourcePrefix}modules/player/policy/renderBudget.ts`,
    `${sourcePrefix}modules/player/policy/sceneValidation.ts`,
    `${sourcePrefix}modules/player/templates/resolveScene.ts`,
    `${sourcePrefix}modules/player/templates/sceneContract.ts`,
    `${sourcePrefix}modules/player/templates/templateSettings.ts`,
    `${sourcePrefix}modules/player/templates/templateRegistry.ts`,
    `${sourcePrefix}modules/player/templates/versions/v1/definitions.ts`,
    `${rootPrefix}contracts/scenes/scene-limits.v1.json`,
  ])
  const diagnosticFiles = [
    `${sourcePrefix}modules/player/isolation/fixedRecoveryProtocol.ts`,
    ...['diagnostics-renderer-main', 'worker-check-child', 'worker-check-runner', 'worker-check-fixture', 'worker-boundary', 'fixed-recovery-child'].map(name => `${rootPrefix}scripts/${name}.ts`),
  ]
  if (diagnostics) for (const file of diagnosticFiles) allowedSharedFiles.add(file)
  let bundledModules = []
  // Inline the separately audited worker in the integrity-pinned renderer. An
  // opaque sandbox cannot safely fetch an origin-bound worker script; a Blob URL
  // also ensures the worker inherits the renderer's restrictive network policy.
  const { source: compilerWorkerSource, modules: compilerWorkerModules } = await buildCompilerWorker(root)

  await build({
    root,
    configFile: false,
    envDir: false,
    publicDir: false,
    envPrefix: '__MAGE_RENDERER_NO_CLIENT_ENV__',
    define: {
      __MAGE_RENDERER_PARENT_ORIGINS__: JSON.stringify(parentOrigins),
      __MAGE_COMPILER_WORKER_SOURCE__: JSON.stringify(compilerWorkerSource),
      'import.meta.env': JSON.stringify({ MODE: 'production', PROD: true, DEV: false, BASE_URL: '/' }),
    },
    plugins: [{
      name: 'isolated-renderer-boundary',
      generateBundle(_options, bundle) {
        const outputs = Object.values(bundle)
        if (outputs.length !== 1 || outputs[0].type !== 'chunk' || outputs[0].imports.length || outputs[0].dynamicImports.length) {
          throw new Error('Renderer must be exactly one self-contained script with no external or dynamic imports.')
        }
        bundledModules = Object.keys(outputs[0].modules).map((id) => id.replaceAll('\\', '/'))
        if (!diagnostics) assertPlaybackOnlyRenderer(bundledModules.map(id => id.slice(root.length + 1)))
        for (const id of bundledModules) {
          const localId = id.replace(/^\0/, '').split('?')[0]
          const physicalModule = /^[A-Za-z]:\//.test(localId) || localId.startsWith('/')
          if (physicalModule && !localId.startsWith(`${rootPrefix}node_modules/`) && !localId.startsWith(`${sourcePrefix}isolated-renderer/`) && !allowedSharedFiles.has(localId)) {
            throw new Error(`Main application code cannot be bundled in the renderer: ${localId}`)
          }
        }
      },
    }],
    build: {
      outDir,
      emptyOutDir: true,
      target: 'es2022',
      sourcemap: false,
      cssCodeSplit: false,
      lib: { entry: resolve(root, diagnostics ? 'scripts/diagnostics-renderer-main.ts' : 'src/isolated-renderer/main.ts'), name: 'MageIsolatedRenderer', formats: ['iife'] },
      rollupOptions: { output: { entryFileNames: 'assets/renderer-[hash].js', inlineDynamicImports: true } },
    },
  })

  const { readdir } = await import('node:fs/promises')
  const assets = await readdir(resolve(outDir, 'assets'))
  if (assets.length !== 1) throw new Error('Renderer build contains unexpected assets.')
  const bundlePath = `assets/${assets[0]}`
  const bundle = await readFile(resolve(outDir, bundlePath))
  const manifest = createHostingManifest({ bundlePath, bundle, parentOrigins, production })
  await writeFile(resolve(outDir, 'index.html'), renderDocument(manifest))
  await writeFile(resolve(outDir, 'hosting-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(resolve(outDir, 'build-audit.json'), `${JSON.stringify({
    diagnostics,
    sourceModules: bundledModules.filter((id) => id.startsWith(sourcePrefix) || allowedSharedFiles.has(id)).map((id) => id.slice(root.length + 1)),
    compilerWorker: {
      sourceIntegrity: integrityOf(compilerWorkerSource),
      sourceBytes: Buffer.byteLength(compilerWorkerSource),
      sourceModules: compilerWorkerModules.map(id => id.slice(root.length + 1)),
    },
  }, null, 2)}\n`)
  if (production) await writeFile(resolve(outDir, 'cloudformation.json'), `${JSON.stringify(createCloudFormationTemplate(manifest), null, 2)}\n`)
  console.log(`Isolated renderer built for ${parentOrigins.join(', ')}. Hosting files: ${outDir}`)

  return { outDir }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(argument => argument !== '--production')) throw new Error('Unknown renderer build option. Local diagnostics use a separate build.')
  await buildIsolatedRenderer({ production: process.argv.includes('--production') })
}
