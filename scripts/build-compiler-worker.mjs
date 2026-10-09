import { build } from 'vite'
import { resolve } from 'node:path'
import { assertCompilerWorkerBundle } from '../deployment/isolated-renderer/compiler-build-policy.mjs'

/** Build only in memory: no separate public script or broader worker URL source. */
export async function buildCompilerWorker(root) {
  let source = ''
  let modules = []
  await build({
    root,
    configFile: false,
    envDir: false,
    publicDir: false,
    envPrefix: '__MAGE_RENDERER_NO_CLIENT_ENV__',
    define: { 'import.meta.env': JSON.stringify({ MODE: 'production', PROD: true, DEV: false, BASE_URL: '/' }) },
    plugins: [{
      name: 'isolated-compiler-boundary',
      generateBundle(_options, bundle) {
        const output = assertCompilerWorkerBundle(bundle, root)
        source = output.code
        modules = Object.keys(output.modules).map(id => id.replaceAll('\\', '/'))
      },
    }],
    build: {
      write: false,
      target: 'es2022',
      sourcemap: false,
      cssCodeSplit: false,
      lib: { entry: resolve(root, 'src/isolated-renderer/compiler/worker.ts'), name: 'MageCompilerWorker', formats: ['iife'] },
      // Shader Park exposes its DSL to submitted source through direct eval.
      // Those functions have no static call sites, so tree-shaking would remove
      // valid built-ins such as box() and setGeometryQuality().
      rollupOptions: { treeshake: false, output: { inlineDynamicImports: true } },
    },
  })
  if (!source) throw new Error('Compiler worker build produced no source.')
  return { source, modules }
}
