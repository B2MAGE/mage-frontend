import { describe, expect, it } from 'vitest'
import { createPlaybackDiagnostics, readPlaybackDiagnostics } from './playbackDiagnostics'

describe('local playback evidence', () => {
  it('identifies the expected engine and protocol revisions without dependency URLs', () => {
    const { build } = readPlaybackDiagnostics()
    expect(build).toEqual({ expectedEngineRelease: expect.stringMatching(/^\d+\.\d+\.\d+-mage\.\d+$/),
      playbackProtocol: 2, compilerProtocol: 2 })
    expect(JSON.stringify(build)).not.toMatch(/https?:|github|source|token/i)
  })

  it('bounds sessions and events, retaining the failing operation through inspector polling', () => {
    for (let session = 0; session < 12; session++) {
      const record = createPlaybackDiagnostics()
      for (let generation = 0; generation < 100; generation++) record({ type: 'operation', at: generation,
        operation: 'load', requestId: generation, generation, phase: 'compiling' })
      record({ type: 'failure', at: 100, reason: 'compile-timeout', generation: 99, requestId: 99,
        phase: 'compiling', pendingCapture: false, pendingCapabilities: false, pendingInspector: false })
      for (let at = 101; at < 501; at++) {
        record({ type: 'progress', at })
        record({ type: 'operation', at, operation: 'audio-inspector', requestId: at, generation: 99, phase: 'completed' })
      }
    }
    const report = readPlaybackDiagnostics()
    expect(report.sessions).toHaveLength(8)
    expect(report.sessions.every(session => session.events.length === 80 && session.lastProgress === 500)).toBe(true)
    expect(report.sessions.at(-1)?.events.at(-1)).toMatchObject({ type: 'failure', phase: 'compiling', generation: 99 })
    report.sessions[0].events.length = 0
    expect(readPlaybackDiagnostics().sessions[0].events).toHaveLength(80)
  })
})
