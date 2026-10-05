import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertPlaybackOnlyRenderer } from './runtime-build-policy.mjs'

const normal = ['src/isolated-renderer/main.ts', 'src/isolated-renderer/playbackRuntime.ts', 'src/isolated-renderer/compiler/client.ts']
test('normal renderer requires its normal entry and excludes fixed diagnostic modules', () => {
  assert.doesNotThrow(() => assertPlaybackOnlyRenderer(normal))
  assert.throws(() => assertPlaybackOnlyRenderer([]), /entry/)
  for (const name of ['scripts/diagnostics-renderer-main.ts', 'scripts/worker-check-child.ts', 'scripts/fixed-recovery-child.ts',
    'src/isolated-renderer/sample.ts', 'src/isolated-renderer/runtime.ts', 'src/modules/player/isolation/fixedRecoveryProtocol.ts']) {
    assert.throws(() => assertPlaybackOnlyRenderer([...normal, name]), /Diagnostic code/)
  }
})
