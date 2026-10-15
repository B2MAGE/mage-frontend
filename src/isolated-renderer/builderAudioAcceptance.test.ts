import { describe, expect, it } from 'vitest'
import { AudioAnalysisKernel } from '@notrac/mage/audio-analysis'
import { parseSceneDocument, type BuilderSceneDocument } from '../modules/player/templates/sceneContract'
import { compileBuilderPreviewDocument } from '../modules/player/templates/builderCompiler'
import { builderUniformValues } from '../modules/player/templates/builderUniformValues'
import { createBuilderBindingController } from './builderBindings'

// Actual PCM -> installed analyzer -> validated saved document -> compiled
// bindings -> render uniforms. No second signal/mapping implementation.
describe('AR-10 independent Builder responses from recorded samples', () => {
  it.each([44100, 48000].flatMap(rate => ['legacy', 'mapped-v1'].map(mode => ({ rate, mode }))))(
    'retains distinct objects through JSON round trip at $rate Hz with $mode', ({ rate, mode }) => {
      const bands = ['bass', 'mid', 'treble'] as const
      const document = parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
        settings: { audioResponse: mode, audioResponseConfig: { version: 1, mappings: [] } },
        objects: bands.map(band => ({ id: band, operation: { type: 'sphere' }, bindings: [{
          target: 'scale.y', source: `${band}-level`, mode: 'add', amount: 2, offset: 0, attack: 0, release: 0,
        }] })),
      }) as BuilderSceneDocument
      const reopened = parseSceneDocument(JSON.parse(JSON.stringify(document))) as BuilderSceneDocument
      expect(reopened).toEqual(document)
      const compiled = compileBuilderPreviewDocument(reopened)
      let time = 0, values: readonly number[] = []
      const controller = createBuilderBindingController(compiled.uniforms, compiled.bindings,
        builderUniformValues(compiled.uniforms), next => { values = next }, () => time)
      const indexes = bands.map((_, objectIndex) => compiled.uniforms.findIndex(uniform =>
        'objectIndex' in uniform && uniform.objectIndex === objectIndex && uniform.target === 'scale.y'))
      const kernel = new AudioAnalysisKernel(rate)
      const checkpoints = new Map<number, number[]>()
      // Silence, bass, mids, treble, then silence. A band gets its own segment.
      for (let start = 0; start < rate * 2; start += 128) {
        const samples = Float32Array.from({ length: Math.min(128, rate * 2 - start) }, (_, index) => {
          const t = (start + index) / rate, segment = Math.floor(t / 0.4)
          const frequency = [0, 100, 700, 5000, 0][segment]
          return frequency ? 0.2 * Math.sin(2 * Math.PI * frequency * t) : 0
        })
        for (const frame of kernel.process([samples], start / rate)) {
          time = frame.time
          controller.input({ time, audioEpoch: 1, pointer: { x: 0, y: 0, down: false }, audio: {
            audioTime: time, loaded: true, playing: true, legacyAmplitude: 0, frame,
          } })
          const segment = Math.min(4, Math.floor((time - 1e-8) / 0.4))
          checkpoints.set(segment, indexes.map(index => values[index]))
        }
      }
      expect(checkpoints.get(0)).toEqual([1, 1, 1])
      for (let band = 0; band < bands.length; band++) {
        const output = checkpoints.get(band + 1)!
        expect(output[band]).toBeGreaterThan(1.1)
        for (let other = 0; other < bands.length; other++) {
          if (other !== band) expect(output[other] - 1).toBeLessThan((output[band] - 1) * 0.1)
        }
      }
      for (const value of checkpoints.get(4)!) expect(value).toBeCloseTo(1, 3)
      controller.dispose()
    },
  )
})
