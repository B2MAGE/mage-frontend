import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { AudioAnalysisKernel } from '@notrac/mage/audio-analysis'
import { AudioResponseMapper } from '@notrac/mage/audio-mapping'

const bands = ['bass', 'mid', 'treble', 'overall']
const response = {
  version: 1,
  mappings: [
    { target: 'size', source: 'bass-hit', amount: 1, attack: 0.01, release: 0.12 },
    { target: 'bass', source: 'bass-level', amount: 1, attack: 0.025, release: 0.15 },
    { target: 'mid', source: 'mid-level', amount: 1, attack: 0.025, release: 0.15 },
    { target: 'treble', source: 'treble-level', amount: 3, attack: 0.01, release: 0.08 },
    { target: 'audioLevel', source: 'overall-level', amount: 1, attack: 0.2, release: 0.6 },
    { target: 'audioHit', source: 'overall-hit', amount: 1, attack: 0.01, release: 0.12 },
  ],
}

/** Real PCM is measured by the installed kernel; render cadence never drives analysis. */
export function analyzeRecordingPcm(channels, sampleRate) {
  const kernel = new AudioAnalysisKernel(sampleRate)
  const frames = []
  for (let offset = 0; offset < channels[0].length; offset += 128) {
    frames.push(...kernel.process(channels.map(channel => channel.subarray(offset, offset + 128)), offset / sampleRate))
  }
  assert(frames.length > 0, 'The excerpt must contain at least 10 ms of audio.')
  for (const [index, frame] of frames.entries()) {
    assert.equal(frame.sequence, index + 1)
    assert(Math.abs(frame.time - (index + 1) / 100) < 1e-8, 'Analysis must retain its 10 ms sample clock.')
    for (const band of bands) assert(Number.isFinite(frame.levels[band]) && frame.levels[band] >= 0 && frame.levels[band] <= 1)
  }
  return frames
}

export function replayRecordedFrames(frames, fps, { jitter = false, stall = false } = {}) {
  const mapper = new AudioResponseMapper(response)
  const duration = frames.at(-1).time
  let next = 0
  let cursor = 0
  const events = []
  const checkpoints = []
  let largestBatch = 0
  for (let tick = 1; tick <= Math.ceil(duration * fps); tick++) {
    const now = Math.min(duration, Math.round(tick / fps * 1e9) / 1e9)
    const checkpoint = Math.abs(now * 5 - Math.round(now * 5)) < 1e-7
    // Drop display ticks, not audio samples. A 400 ms stall cannot move the beats.
    if (stall && now > 0.4 && now < 0.8) continue
    if (jitter && !checkpoint && tick % 7 < 4 && now < duration) continue
    const batch = []
    while (next < frames.length && frames[next].time <= now + 1e-8) batch.push(frames[next++])
    largestBatch = Math.max(largestBatch, batch.length)
    const outputs = mapper.process(batch, now)
    assert(Object.values(outputs).every(value => Number.isFinite(value) && value >= 0 && value <= 4))
    const fresh = mapper.getEvents(cursor)
    events.push(...fresh)
    cursor = fresh.at(-1)?.id ?? cursor
    if (checkpoint) checkpoints.push({ time: now, outputs })
  }
  assert.equal(next, frames.length, 'Every available audio measurement must be consumed.')
  assert.deepEqual(events.map(({ band, time, strength }) => ({ band, time, strength })), frames.flatMap(frame => frame.hits), 'Every hit must be delivered once at its audio timestamp.')
  return { checkpoints, events, largestBatch }
}

export function verifyRecordingFrames(frames) {
  const reference = replayRecordedFrames(frames, 60)
  const referenceByTime = new Map(reference.checkpoints.map(checkpoint => [checkpoint.time, checkpoint.outputs]))
  const runs = [
    [15, {}], [30, {}], [60, {}], [120, {}],
    [60, { jitter: true }], [60, { stall: true }],
  ].map(([fps, options]) => {
    const result = replayRecordedFrames(frames, fps, options)
    for (const checkpoint of result.checkpoints) {
      assert.deepEqual(checkpoint.outputs, referenceByTime.get(checkpoint.time), 'Render rate or a short stall changed the sampled response.')
    }
    assert.deepEqual(result.events, reference.events)
    return { fps, ...options, checkpoints: result.checkpoints.length, largestBatch: result.largestBatch }
  })
  const summary = Object.fromEntries(bands.map(band => {
    const levels = frames.map(frame => frame.levels[band])
    const hits = frames.flatMap(frame => frame.hits).filter(hit => hit.band === band)
    return [band, {
      meanLevel: levels.reduce((sum, value) => sum + value, 0) / levels.length,
      peakLevel: Math.max(...levels),
      hits: hits.length,
      meanHitStrength: hits.length ? hits.reduce((sum, hit) => sum + hit.strength, 0) / hits.length : 0,
    }]
  }))
  const values = target => reference.checkpoints.map(checkpoint => checkpoint.outputs[target])
  const difference = (left, right) => {
    const a = values(left), b = values(right)
    return a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) / Math.max(1, a.length)
  }
  return {
    frames: frames.length,
    seconds: frames.at(-1).time,
    signals: summary,
    responseDifferences: {
      bassPulseVsTrebleLevel: difference('size', 'treble'),
      bassPulseVsSlowWholeMix: difference('size', 'audioLevel'),
      bassLevelVsWholeMix: difference('bass', 'audioLevel'),
    },
    renderChecks: runs,
  }
}

export function parseRecordingArguments(args) {
  const [file, ...options] = args
  if (!file || file.startsWith('--')) throw new Error('Usage: node scripts/check-audio-recording.mjs <local-audio-file> [--start seconds] [--seconds 5..60]')
  let start = 0, seconds = 20
  for (let index = 0; index < options.length; index += 2) {
    const name = options[index], value = Number(options[index + 1])
    if (options[index + 1] === undefined || !Number.isFinite(value)) throw new Error(`${name} requires a finite number.`)
    if (name === '--start' && value >= 0) start = value
    else if (name === '--seconds' && value >= 5 && value <= 60) seconds = value
    else throw new Error(`Unsupported option or value: ${name}`)
  }
  return { file: resolve(file), start, seconds }
}

function decodeRecording(file, sampleRate, start, seconds) {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(start), '-i', file, '-t', String(seconds), '-f', 'f32le', '-acodec', 'pcm_f32le', '-ar', String(sampleRate), '-ac', '2', 'pipe:1'], {
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    timeout: 60_000,
  })
  if (result.error) throw new Error(`Cannot decode the local recording. Install ffmpeg and ensure it is on PATH: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr.toString().trim()}`)
  const sampleCount = result.stdout.length / 8
  if (sampleCount < sampleRate * 5) throw new Error('Choose an excerpt with at least five seconds of audio remaining.')
  const channels = [new Float32Array(sampleCount), new Float32Array(sampleCount)]
  for (let index = 0; index < sampleCount; index++) {
    channels[0][index] = result.stdout.readFloatLE(index * 8)
    channels[1][index] = result.stdout.readFloatLE(index * 8 + 4)
  }
  return channels
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { file, start, seconds } = parseRecordingArguments(process.argv.slice(2))
    const rates = [44100, 48000].map(sampleRate => ({
      sampleRate,
      ...verifyRecordingFrames(analyzeRecordingPcm(decodeRecording(file, sampleRate, start, seconds), sampleRate)),
    }))
    process.stdout.write(`${JSON.stringify({
      file: basename(file), start, requestedSeconds: seconds,
      note: 'Selective analysis and mapping verification. Original remains a separate supported response. Metrics describe this excerpt; they do not certify musical quality or physical mobile playback. No audio files are saved or uploaded.',
      rates,
    }, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
