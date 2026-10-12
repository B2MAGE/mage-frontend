import { AudioResponseMapper, SyntheticAudioFrames } from '@notrac/mage/audio-mapping'
import type { AudioAnalysisFrame } from '@notrac/mage/audio-analysis'
import type { BuilderUniform } from '../modules/player/templates/builderCompiler'
import { assertBuilderBindingManifest, type BuilderLiveBinding } from '../modules/player/templates/builderBindings'
import { assertBuilderUniformManifest, type BuilderUniformValue } from '../modules/player/templates/builderUniformValues'
import type { PlaybackPayloads } from '../modules/player/isolation/playbackProtocol'

type Input = PlaybackPayloads['input']
type Channel = { binding: BuilderLiveBinding; index: number; mapper: AudioResponseMapper | null; pointerValue: number }
type SignalChannel = Omit<Channel, 'binding'> & { binding: Pick<BuilderLiveBinding, 'source' | 'attack' | 'release'> & { mode?: never; offset?: never; amount?: never } }
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))
const key = (binding: BuilderLiveBinding) => `${binding.objectIndex}:${binding.target}`
const envelopeKey = (binding: BuilderLiveBinding) => `${binding.source}:${binding.attack}:${binding.release}`

/** Authored values remain separate from animation: output never becomes the next frame's baseline. */
export function createBuilderBindingController(
  manifest: readonly BuilderUniform[], initialBindings: readonly BuilderLiveBinding[],
  initialValues: readonly BuilderUniformValue[], write: (values: readonly number[]) => void,
  now: () => number = () => performance.now() / 1000,
) {
  let channels: Channel[] = [], baseline: number[] = []
  const signalChannels: SignalChannel[] = manifest.flatMap((uniform, index) => uniform.target === 'driver-signal' ? [{
    index, binding: { source: uniform.source, attack: 0.05, release: 0.2 }, pointerValue: 0,
    mapper: uniform.source.startsWith('pointer-') ? null : new AudioResponseMapper({ version: 1, sensitivity: 1,
      mappings: [{ target: 'size', source: uniform.source, amount: 1, attack: 0.05, release: 0.2 }] }),
  }] : [])
  let disposed = false, playing = true, lastTick: number | null = null
  let receivedAt = now(), input: Input | null = null
  let frames: AudioAnalysisFrame[] = []
  let lastAudioTime: number | null = null
  let source: 'audio' | 'synthetic' | 'none' = 'none'
  let simulation: PlaybackPayloads['synthetic'] = { enabled: false, seed: 1, tempoScale: 1 }
  const synthetic = new SyntheticAudioFrames(simulation.seed, simulation.tempoScale)

  function reset() {
    frames = []
    for (const channel of [...channels, ...signalChannels]) { channel.mapper?.reset(); channel.pointerValue = 0 }
    lastTick = null
    lastAudioTime = null
    source = 'none'
  }

  function advance(time = now()) {
    if (disposed || !Number.isFinite(time)) return
    if (lastTick !== null && (time < lastTick || time - lastTick > 1)) reset()
    const elapsed = lastTick === null ? 0 : Math.max(0, time - lastTick)
    lastTick = time
    const fresh = input !== null && time - receivedAt <= 1
    const realPlaying = input?.audio.loaded && input.audio.playing
    const nextSource = !playing ? 'none' : realPlaying ? fresh ? 'audio' : 'none' : simulation.enabled ? 'synthetic' : 'none'
    const projectedTime = nextSource === 'audio' ? input!.audio.audioTime + clamp(time - receivedAt, 0, 1) : time
    // Message scheduling can place a new measurement behind our last render projection.
    // Only an explicit transport reset may move the audio envelope clock backwards.
    const audioTime = nextSource === source && lastAudioTime !== null ? Math.max(lastAudioTime, projectedTime) : projectedTime
    lastAudioTime = audioTime
    if (nextSource !== source) {
      for (const channel of [...channels, ...signalChannels]) channel.mapper?.reset()
      synthetic.configure(simulation.seed, simulation.tempoScale, audioTime)
      source = nextSource
    }
    const sampled = source === 'audio' ? frames : source === 'synthetic' ? synthetic.process(audioTime) : []
    frames = []
    const values = [...baseline]
    for (const channel of [...channels, ...signalChannels]) {
      const { binding, index, mapper } = channel
      let signal = 0
      if (mapper) {
        signal = source === 'none' ? 0 : mapper.process(sampled, audioTime).size
      } else {
        const pointer = fresh && playing && input?.pointer.inside !== false ? input?.pointer : null
        const target = !pointer ? 0 : binding.source === 'pointer-down' ? Number(pointer.down)
          : binding.source === 'pointer-x' ? pointer.x : pointer.y
        const duration = Math.abs(target) > Math.abs(channel.pointerValue) ? binding.attack : binding.release
        channel.pointerValue = duration > 0 ? target + (channel.pointerValue - target) * Math.exp(-elapsed / duration) : target
        signal = channel.pointerValue
      }
      const uniform = manifest[index]
      values[index] = binding.mode !== undefined
        ? clamp((binding.mode === 'add' ? baseline[index] : 0) + binding.offset + binding.amount * signal, uniform.minimum, uniform.maximum)
        : clamp(signal, uniform.minimum, uniform.maximum)
    }
    write(values)
  }

  function configure(bindings: readonly BuilderLiveBinding[], values: readonly BuilderUniformValue[]) {
    if (disposed) return
    assertBuilderUniformManifest(values, manifest)
    assertBuilderBindingManifest(bindings, manifest)
    const previous = new Map(channels.map(channel => [key(channel.binding), channel]))
    const next = bindings.map(binding => {
      const old = previous.get(key(binding))
      const index = manifest.findIndex(uniform => 'objectIndex' in uniform
        && uniform.objectIndex === binding.objectIndex && uniform.target === binding.target)
      if (old && envelopeKey(old.binding) === envelopeKey(binding)) return { ...old, binding: { ...binding }, index }
      const mapper = binding.source.startsWith('pointer-') ? null : new AudioResponseMapper({ version: 1, sensitivity: 1,
        mappings: [{ target: 'size', source: binding.source, amount: 1, attack: binding.attack, release: binding.release }] })
      return { binding: { ...binding }, index, mapper, pointerValue: 0 }
    })
    baseline = values.map(value => value.value)
    channels = next
    advance()
  }

  configure(initialBindings, initialValues)
  return {
    configure,
    advance,
    input(value: Input) {
      if (disposed) return
      const previous = input
      if (previous && (value.time < previous.time || value.audio.audioTime < previous.audio.audioTime
        || value.audio.playing !== previous.audio.playing || value.audio.loaded !== previous.audio.loaded
        || value.audioEpoch !== previous.audioEpoch)) reset()
      input = value
      receivedAt = now()
      if (playing && value.audio.playing && value.audio.frame) frames = [...frames.slice(-31), value.audio.frame]
      advance(receivedAt)
    },
    synthetic(value: PlaybackPayloads['synthetic']) {
      if (disposed || simulation.enabled === value.enabled && simulation.seed === value.seed && simulation.tempoScale === value.tempoScale) return
      simulation = { ...value }
      reset()
      advance()
    },
    playback(value: boolean) {
      if (disposed || playing === value) return
      playing = value
      if (!value && input) input = { ...input, pointer: { ...input.pointer, down: false, inside: false } }
      reset()
      advance()
    },
    dispose() { disposed = true; channels = []; baseline = []; frames = []; input = null },
  }
}
