import { resolve } from 'node:path'

// The worker must not accidentally pull the DOM/WebGL engine or account-bearing
// application into its compilation context. Keep this independent of the broader
// renderer allowlist so a new renderer dependency cannot widen worker access.
export const COMPILER_WORKER_ALLOWED_MODULES = Object.freeze([
  'src/isolated-renderer/compiler/worker.ts',
  'src/isolated-renderer/compiler/protocol.ts',
  'node_modules/@notrac/mage/dist/compiler.js',
  'node_modules/@notrac/mage/dist/compiled-shader.js',
  'node_modules/@notrac/mage/dist/compiled-shader-shell.generated.js',
  'node_modules/@notrac/mage/dist/shader-park-compiler.generated.js',
])

export function assertCompilerWorkerBundle(bundle, root) {
  const outputs = Object.values(bundle)
  if (outputs.length !== 1 || outputs[0].type !== 'chunk' || outputs[0].imports.length || outputs[0].dynamicImports.length) {
    throw new Error('Compiler worker must contain exactly one self-contained script with no external or dynamic imports.')
  }
  const output = outputs[0]
  if (typeof output.code !== 'string' || !output.code.trim()) throw new Error('Compiler worker source is missing.')
  const allowed = new Set(COMPILER_WORKER_ALLOWED_MODULES.map(path => resolve(root, path).replaceAll('\\', '/')))
  for (const id of Object.keys(output.modules)) {
    if (!allowed.has(id.replaceAll('\\', '/'))) throw new Error(`Unexpected module in compiler worker: ${id}`)
  }
  return output
}
