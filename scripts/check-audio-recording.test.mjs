import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeRecordingPcm, parseRecordingArguments, replayRecordedFrames, verifyRecordingFrames } from './check-audio-recording.mjs'

function recording(sampleRate) {
  return Float32Array.from({ length: sampleRate * 2 }, (_, sample) => {
    const time = sample / sampleRate
    const age = (time - 0.3) % 0.35
    const pulse = time >= 0.3 && age < 0.07 ? Math.sin(Math.PI * age / 0.07) ** 2 : 0
    return Math.sin(2 * Math.PI * 90 * time) * pulse * 0.4
      + Math.sin(2 * Math.PI * 700 * time) * 0.05
      + Math.sin(2 * Math.PI * 5000 * time) * Math.max(0, Math.sin(time * 10)) * 0.015
  })
}

for (const sampleRate of [44100, 48000]) {
  test(`AR-10: complete PCM remains distinct and on the same audio timeline through 15 FPS, jitter and a stall at ${sampleRate} Hz`, () => {
    const samples = recording(sampleRate)
    const frames = analyzeRecordingPcm([samples, samples.map(value => -value)], sampleRate)
    const report = verifyRecordingFrames(frames)
    assert.equal(report.frames, 200)
    assert.equal(report.signals.bass.hits, 5)
    assert(report.signals.mid.meanLevel > 0.03)
    assert(report.signals.treble.meanLevel > 0.003)
    assert(report.responseDifferences.bassPulseVsTrebleLevel > 0.05)
    assert(report.responseDifferences.bassPulseVsSlowWholeMix > 0.05)
    assert(report.renderChecks.find(run => run.stall).largestBatch >= 39)
  })
}

test('AR-10: silence stays silent at every rendering cadence', () => {
  const report = verifyRecordingFrames(analyzeRecordingPcm([new Float32Array(48000)], 48000))
  for (const signal of Object.values(report.signals)) assert.deepEqual(signal, { meanLevel: 0, peakLevel: 0, hits: 0, meanHitStrength: 0 })
})

test('AR-10: rendered pulses use the recorded hit time rather than the time a slow frame receives them', () => {
  const frames = analyzeRecordingPcm([recording(48000)], 48000)
  const interrupted = replayRecordedFrames(frames, 60, { stall: true })
  const hitsDuringStall = frames.flatMap(frame => frame.hits).filter(hit => hit.time > 0.4 && hit.time < 0.8)
  assert(hitsDuringStall.length > 0)
  for (const hit of hitsDuringStall) assert(interrupted.events.some(event => event.band === hit.band && event.time === hit.time && event.strength === hit.strength))
  assert.deepEqual(interrupted.checkpoints.find(checkpoint => checkpoint.time === 0.8), replayRecordedFrames(frames, 60).checkpoints.find(checkpoint => checkpoint.time === 0.8))
})

test('recording CLI requires an explicit local path and bounds decoding work', () => {
  const parsed = parseRecordingArguments(['music.mp3', '--start', '12.5', '--seconds', '30'])
  assert.equal(parsed.start, 12.5)
  assert.equal(parsed.seconds, 30)
  for (const args of [[], ['--seconds', '20'], ['music.mp3', '--seconds', '120'], ['music.mp3', '--start', '-1'], ['music.mp3', '--start'], ['music.mp3', '--unknown', '1']]) {
    assert.throws(() => parseRecordingArguments(args))
  }
})
