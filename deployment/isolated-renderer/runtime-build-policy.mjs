const retiredRuntimeModules = new Set([
  'src/isolated-renderer/sample.ts',
  'src/isolated-renderer/runtime.ts',
  'src/modules/player/isolation/fixedRecoveryProtocol.ts',
])

export function assertPlaybackOnlyRenderer(modules) {
  if (!Array.isArray(modules) || !modules.includes('src/isolated-renderer/main.ts')) throw new Error('Missing normal renderer entry.')
  for (const name of modules) {
    if (typeof name !== 'string' || name.startsWith('scripts/') || retiredRuntimeModules.has(name)) {
      throw new Error(`Diagnostic code cannot be published in the renderer: ${name}`)
    }
  }
}
