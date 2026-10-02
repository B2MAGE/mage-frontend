import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AudioAnalysisKernel,
  AudioAnalysisSession,
  createAudioAnalysisWorkletSource,
  type AudioAnalysisFrame,
  type AudioAnalysisSource,
} from '@notrac/mage/audio-analysis'

function workletHarness(sampleRate: number) {
  let time = 0
  let Processor: new (options: { processorOptions: { epoch: number } }) => {
    process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean
    port: { onmessage: (message: { data: unknown }) => void }
  }
  const messages: { epoch: number; frames: AudioAnalysisFrame[] }[] = []
  class ProcessorBase {
    port = { postMessage: (message: { epoch: number; frames: AudioAnalysisFrame[] }) => messages.push(message), onmessage: null }
  }
  const factory = new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', 'clock',
    `with(clock) { ${createAudioAnalysisWorkletSource()} }`)
  factory(ProcessorBase, (_name: string, constructor: typeof Processor) => { Processor = constructor }, sampleRate, { get currentTime() { return time } })
  const processor = new Processor!({ processorOptions: { epoch: 1 } })
  return {
    messages,
    reset(epoch: number) { processor.port.onmessage({ data: { type: 'reset', epoch } }) },
    process(channels: Float32Array[], startTime: number) {
      time = startTime
      const output = [new Float32Array(channels[0].length).fill(0.75)]
      expect(processor.process([channels], [output])).toBe(true)
      expect(output[0].every(value => value === 0)).toBe(true)
    },
  }
}

function sessionHarness(addModule: () => Promise<void> = async () => {}) {
  const context = { currentTime: 0, destination: {}, audioWorklet: { addModule: vi.fn(addModule) } }
  const output = { connect: vi.fn(), disconnect: vi.fn() }
  const node = { port: { onmessage: null as null | ((event: { data: unknown }) => void), postMessage: vi.fn(), close: vi.fn() }, connect: vi.fn(), disconnect: vi.fn(), onprocessorerror: null as null | (() => void) }
  const nodeFactory = vi.fn<(context: unknown, name: string, options: AudioWorkletNodeOptions) => AudioWorkletNode>(() => node as unknown as AudioWorkletNode)
  const session = new AudioAnalysisSession({ nodeFactory })
  const source = { context, getOutput: () => output } as unknown as AudioAnalysisSource
  return {
    session, source, context, output, node, nodeFactory,
    send(frames: AudioAnalysisFrame[], epoch = nodeFactory.mock.calls[0][2].processorOptions.epoch) {
      node.port.onmessage?.({ data: { epoch, frames } })
    },
  }
}

function frame(time: number, sequence = 1): AudioAnalysisFrame {
  return { time, sequence, levels: { bass: 0, mid: 0, treble: 0, overall: 0.5 }, hits: [] }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('sample-clock audio analysis', () => {
  it.each([44100, 48000])('emits fixed 10 ms measurements across input blocks at %s Hz', (sampleRate) => {
    const kernel = new AudioAnalysisKernel(sampleRate)
    const frames: AudioAnalysisFrame[] = []
    for (let offset = 0; offset < sampleRate; offset += 128) {
      const count = Math.min(128, sampleRate - offset)
      frames.push(...kernel.process([new Float32Array(count).fill(0.25)], offset / sampleRate))
    }
    expect(frames).toHaveLength(100)
    frames.forEach((value, index) => {
      expect(value.time).toBeCloseTo((index + 1) / 100, 10)
      expect(value.sequence).toBe(index + 1)
      expect(value.levels.overall).toBeCloseTo(0.25)
    })
  })

  it('preserves stereo energy when left and right channels cancel in a mono mix', () => {
    const kernel = new AudioAnalysisKernel(48000)
    const result = kernel.process([new Float32Array(480).fill(0.5), new Float32Array(480).fill(-0.5)], 0)
    expect(result[0].levels.overall).toBeCloseTo(0.5)
    kernel.process([new Float32Array(480)], 0.01)
    expect(result[0].levels.overall).toBeCloseTo(0.5)
  })

  it('clears partial measurements across transport discontinuities and explicit resets', () => {
    const kernel = new AudioAnalysisKernel(48000)
    expect(kernel.process([new Float32Array(240).fill(1)], 0)).toEqual([])
    expect(kernel.process([new Float32Array(480)], 5)[0].levels.overall).toBe(0)
    kernel.process([new Float32Array(240).fill(1)], 5.01)
    kernel.reset()
    expect(kernel.process([new Float32Array(480)], 8)[0].levels.overall).toBe(0)
  })

  it.each([30, 60, 120])('runs the actual worklet with identical samples independently of %s FPS rendering', (fps) => {
    const worklet = workletHarness(48000)
    const reference = new AudioAnalysisKernel(48000)
    const expected: AudioAnalysisFrame[] = []
    const received: AudioAnalysisFrame[] = []
    let nextRender = 1 / fps
    let messageIndex = 0
    for (let offset = 0; offset < 48000; offset += 128) {
      const length = Math.min(128, 48000 - offset)
      const samples = Float32Array.from({ length }, (_, index) => Math.sin((offset + index) * Math.PI / 40) * 0.5)
      worklet.process([samples], offset / 48000)
      expected.push(...reference.process([samples], offset / 48000))
      if ((offset + length) / 48000 >= nextRender) {
        while (messageIndex < worklet.messages.length) received.push(...worklet.messages[messageIndex++].frames)
        nextRender += 1 / fps
      }
    }
    while (messageIndex < worklet.messages.length) received.push(...worklet.messages[messageIndex++].frames)
    expect(received).toEqual(expected)
    expect(received).toHaveLength(100)
    worklet.reset(2)
    worklet.process([new Float32Array(480)], 2)
    expect(worklet.messages.at(-1)).toMatchObject({ epoch: 2, frames: [{ sequence: 1, time: 2.01 }] })
  })
})

describe('audio analysis session lifecycle', () => {
  function mockObjectUrls() {
    const create = vi.fn(() => 'blob:audio-analysis-test')
    const revoke = vi.fn()
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = create
      static revokeObjectURL = revoke
    })
    return { create, revoke }
  }

  it('connects a silent side branch and disconnects only that branch', async () => {
    const { revoke } = mockObjectUrls()
    const fixture = sessionHarness()
    expect(await fixture.session.connect(fixture.source)).toBe(true)
    expect(fixture.output.connect).toHaveBeenCalledWith(fixture.node)
    expect(fixture.node.connect).toHaveBeenCalledWith(fixture.context.destination)
    expect(revoke).toHaveBeenCalledWith('blob:audio-analysis-test')
    fixture.session.disconnect()
    expect(fixture.output.disconnect.mock.calls).toEqual([[fixture.node]])
    expect(fixture.node.port.close).toHaveBeenCalledOnce()
    expect(fixture.session.status).toBe('idle')
  })

  it('does not attach a node after disposal while module loading is pending', async () => {
    const { revoke } = mockObjectUrls()
    let complete!: () => void
    const fixture = sessionHarness(() => new Promise(resolve => { complete = resolve }))
    const pending = fixture.session.connect(fixture.source)
    fixture.session.dispose()
    complete()
    expect(await pending).toBe(false)
    expect(fixture.nodeFactory).not.toHaveBeenCalled()
    expect(fixture.session.status).toBe('disposed')
    expect(revoke).toHaveBeenCalledOnce()
    expect(await fixture.session.connect(fixture.source)).toBe(false)
  })

  it('discards frames from old epochs and flushes pending measurements on reset', async () => {
    mockObjectUrls()
    const fixture = sessionHarness()
    await fixture.session.connect(fixture.source)
    fixture.context.currentTime = 0.02
    fixture.send([frame(0.01)])
    fixture.session.reset()
    fixture.send([frame(0.02)])
    expect(fixture.session.drain(0.02)).toEqual([])
    const epoch = fixture.node.port.postMessage.mock.calls[0][0].epoch
    fixture.send([frame(0.02)], epoch)
    expect(fixture.session.drain(0.02)).toHaveLength(1)
    expect(fixture.session.drain(0.02)).toEqual([])
  })

  it('bounds the queue, drops stale measurements, and returns independent snapshots', async () => {
    mockObjectUrls()
    const fixture = sessionHarness()
    await fixture.session.connect(fixture.source)
    fixture.context.currentTime = 1
    fixture.send(Array.from({ length: 600 }, (_, index) => frame(0.001 * index + 0.1, index)))
    expect(fixture.session.snapshot(1).queuedFrames).toBe(512)
    expect(fixture.session.snapshot(1).droppedFrames).toBe(88)
    const snapshot = fixture.session.snapshot(1)
    snapshot.frame!.levels.overall = 0
    expect(fixture.session.snapshot(1).frame!.levels.overall).toBe(0.5)
    expect(fixture.session.drain(5)).toEqual([])
    expect(fixture.session.snapshot(5).frame).toBeNull()
    fixture.context.currentTime = 10
    fixture.send([frame(1)])
    expect(fixture.session.drain(10)).toEqual([])
  })

  it('reports unsupported environments and module failures without per-render fallback', async () => {
    mockObjectUrls()
    const unsupported = new AudioAnalysisSession()
    expect(await unsupported.connect({ context: {}, getOutput() {} } as unknown as AudioAnalysisSource)).toBe(false)
    expect(unsupported.status).toBe('unsupported')
    const fixture = sessionHarness(async () => { throw new Error('worklet blocked') })
    expect(await fixture.session.connect(fixture.source)).toBe(false)
    expect(fixture.session.snapshot(0)).toMatchObject({ status: 'error', error: 'worklet blocked', frame: null })
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
    expect(fixture.output.connect).not.toHaveBeenCalled()
  })
})
