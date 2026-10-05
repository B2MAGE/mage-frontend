import { resolve } from 'node:path'

export const SECURITY_CHECK_ALLOWED_MODULES = Object.freeze([
  'scripts/isolated-security-live.ts',
  'scripts/isolated-security-ui.ts',
  'scripts/isolated-security-config.mjs',
  'scripts/isolated-security-probes.mjs',
  'scripts/isolated-security-report.mjs',
  'scripts/fixed-recovery-runner.ts',
  'scripts/fixed-recovery-host.ts',
  'src/modules/player/isolation/fixedRecoveryProtocol.ts',
  'src/modules/player/isolation/playbackHost.ts',
  'src/modules/player/isolation/playbackProtocol.ts',
  'src/modules/player/liveSceneSettings.ts',
  'src/modules/player/isolation/rendererHost.ts',
  'src/modules/player/isolation/protocol.ts',
  'src/modules/player/isolation/capture.ts',
  'src/modules/player/policy/sceneValidation.ts',
  'src/modules/player/policy/renderBudget.ts',
  'src/modules/player/templates/sceneContract.ts',
  'src/modules/player/templates/templateSettings.ts',
  'src/modules/player/templates/resolveScene.ts',
  'src/modules/player/templates/builderCompiler.ts',
  'src/modules/player/templates/builderSchema.ts',
  'src/modules/player/templates/templateRegistry.ts',
  'src/modules/player/templates/versions/v1/definitions.ts',
  'contracts/scenes/scene-limits.v1.json',
  'contracts/scenes/scene-v1.schema.json',
  'contracts/scenes/builder-rendering.v1.json',
  'node_modules/@notrac/mage/dist/audio-response.js',
])

export function assertSecurityCheckBundle(bundle, root) {
  const outputs = Object.values(bundle)
  if (outputs.length !== 1 || outputs[0].type !== 'chunk' || outputs[0].imports.length || outputs[0].dynamicImports.length) {
    throw new Error('Security check must contain exactly one self-contained script.')
  }
  const allowed = new Set(SECURITY_CHECK_ALLOWED_MODULES.map(path => resolve(root, path).replaceAll('\\', '/')))
  for (const id of Object.keys(outputs[0].modules)) {
    if (!allowed.has(id.replaceAll('\\', '/'))) throw new Error(`Unexpected module in fixed security check: ${id}`)
  }
}
