import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer, type MagePlayerAudioResponseCapabilitiesSnapshot } from './MagePlayer'
import {
  createMagePlayer,
  type MageAudioResponseCapabilities,
  type MagePlayerAudioState,
  type MagePlayerController,
} from './infrastructure/engineAdapter'
import { buildMagePlayerController, buildMagePlayerSceneBlob, buildMagePlayerTrack } from './test-fixtures'

vi.mock('./infrastructure/engineAdapter', () => ({ createMagePlayer: vi.fn() }))

function capabilities(target: 'size' | 'bass'): MageAudioResponseCapabilities {
  return { mode: 'mapped-v1', signals: ['bass-hit'], targets: ['size', 'bass'], supportedTargets: [target], unsupportedTargets: [], warnings: [] }
}

describe('player audio-response capabilities bridge', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('publishes the exact loaded document with adapter capabilities, then clears on removal and disposal', async () => {
    const compiled = capabilities('size')
    const controller = buildMagePlayerController({ getAudioResponseCapabilities: vi.fn(() => compiled) })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const scene = buildMagePlayerSceneBlob()
    const onChange = vi.fn()
    const { rerender, unmount } = render(<MagePlayer sceneBlob={scene} onAudioResponseCapabilitiesChange={onChange} />)
    expect(onChange).toHaveBeenLastCalledWith(null)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ sceneBlob: scene, capabilities: compiled }))
    expect(onChange.mock.calls.at(-1)![0].sceneBlob).toBe(scene)
    expect(vi.mocked(controller.getAudioResponseCapabilities).mock.invocationCallOrder[0])
      .toBeGreaterThan(vi.mocked(controller.loadSceneBlob).mock.invocationCallOrder[0])
    rerender(<MagePlayer sceneBlob={null} onAudioResponseCapabilitiesChange={onChange} />)
    expect(onChange).toHaveBeenLastCalledWith(null)
    unmount()
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(controller.dispose).toHaveBeenCalledOnce()
  })

  it('publishes fresh shader capabilities without associating the previous shader with the next document', async () => {
    const first = buildMagePlayerSceneBlob({ visualizer: { shader: 'input("size", 0); sphere(1);' } })
    const second = buildMagePlayerSceneBlob({ visualizer: { shader: 'input("bass", 0); sphere(1);' } })
    let compiled = capabilities('size')
    const controller = buildMagePlayerController({
      loadSceneBlob: vi.fn(scene => { compiled = capabilities(scene === first ? 'size' : 'bass') }),
      getAudioResponseCapabilities: vi.fn(() => compiled),
    })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const onChange = vi.fn()
    const { rerender } = render(<MagePlayer sceneBlob={first} onAudioResponseCapabilitiesChange={onChange} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ sceneBlob: first, capabilities: capabilities('size') }))
    onChange.mockClear()
    rerender(<MagePlayer sceneBlob={second} onAudioResponseCapabilitiesChange={onChange} />)
    expect(onChange).toHaveBeenLastCalledWith(null)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ sceneBlob: second, capabilities: capabilities('bass') }))
    expect(onChange.mock.calls.every(([snapshot]) => snapshot === null || snapshot.sceneBlob === second && snapshot.capabilities.supportedTargets[0] === 'bass')).toBe(true)
    expect(controller.loadSceneBlob).toHaveBeenCalledTimes(2)
  })

  it('updates response capabilities while an existing track keeps loading without rebuilding the scene', async () => {
    let finishTrack!: (state: MagePlayerAudioState) => void
    const controller = buildMagePlayerController({
      getAudioResponseCapabilities: vi.fn(() => capabilities('size')),
      loadAudio: vi.fn(() => new Promise<MagePlayerAudioState>(resolve => { finishTrack = resolve })),
    })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const first = buildMagePlayerSceneBlob()
    const tracks = [buildMagePlayerTrack({ sourcePath: '/song.mp3' })]
    const second = { ...first, audioResponse: 'mapped-v1', audioResponseConfig: { version: 1, sensitivity: 2, mappings: [] } }
    const onChange = vi.fn()
    const { rerender } = render(<MagePlayer sceneBlob={first} sceneKey="editor" onAudioResponseCapabilitiesChange={onChange} playlistTracks={tracks} selectedTrackId={tracks[0].id} />)
    await screen.findByText('Loading track…')
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ sceneBlob: first, capabilities: capabilities('size') }))
    onChange.mockClear()
    rerender(<MagePlayer sceneBlob={second} sceneKey="editor" onAudioResponseCapabilitiesChange={onChange} playlistTracks={tracks} selectedTrackId={tracks[0].id} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ sceneBlob: second, capabilities: capabilities('size') }))
    expect(onChange.mock.calls.every(([snapshot]) => snapshot !== null && snapshot.sceneBlob === second)).toBe(true)
    expect(controller.loadSceneBlob).toHaveBeenCalledOnce()
    expect(controller.setAudioResponseSettings).toHaveBeenLastCalledWith('mapped-v1', second.audioResponseConfig)
    expect(controller.loadAudio).toHaveBeenCalledOnce()
    expect(screen.getByText('Loading track…')).toBeInTheDocument()
    expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument()
    await act(async () => finishTrack({ currentTime: 0, duration: 100, hasSource: true, isLoaded: true, sourcePath: '/song.mp3', volume: 1 }))
    await waitFor(() => expect(screen.queryByText('Loading track…')).not.toBeInTheDocument())
  })

  it('clears prior capabilities when a new shader fails to load', async () => {
    const controller = buildMagePlayerController({ getAudioResponseCapabilities: vi.fn(() => capabilities('size')) })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const first = buildMagePlayerSceneBlob()
    const onChange = vi.fn()
    const { rerender } = render(<MagePlayer sceneBlob={first} onAudioResponseCapabilitiesChange={onChange} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ sceneBlob: first, capabilities: capabilities('size') }))
    vi.mocked(controller.loadSceneBlob).mockImplementationOnce(() => { throw new Error('shader failed') })
    onChange.mockClear()
    rerender(<MagePlayer sceneBlob={buildMagePlayerSceneBlob({ visualizer: { shader: 'broken' } })} onAudioResponseCapabilitiesChange={onChange} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('shader failed')
    expect(onChange.mock.calls.every(([snapshot]) => snapshot === null)).toBe(true)
    expect(controller.getAudioResponseCapabilities).toHaveBeenCalledOnce()
  })

  it.each(['missing', 'unsupported', 'throws'] as const)('keeps playback usable when the capability getter %s', async mode => {
    const getter = mode === 'missing' ? undefined : vi.fn(() => {
      if (mode === 'throws') throw new Error('capability unavailable')
      return null
    })
    const controller = buildMagePlayerController({ getAudioResponseCapabilities: getter as MagePlayerController['getAudioResponseCapabilities'] })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const onChange = vi.fn()
    render(<MagePlayer sceneBlob={buildMagePlayerSceneBlob()} onAudioResponseCapabilitiesChange={onChange} />)
    await screen.findByRole('button', { name: /pause scene and audio playback/i })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onChange.mock.calls.every(([snapshot]) => snapshot === null)).toBe(true)
  })

  it('clears capabilities during engine replacement even when the scene object stays identical', async () => {
    const first = buildMagePlayerController({ getAudioResponseCapabilities: vi.fn(() => capabilities('size')) })
    const second = buildMagePlayerController({ getAudioResponseCapabilities: vi.fn(() => capabilities('bass')) })
    let finishReplacement!: (controller: MagePlayerController) => void
    vi.mocked(createMagePlayer).mockResolvedValueOnce(first).mockImplementationOnce(() => new Promise(resolve => { finishReplacement = resolve }))
    const scene = buildMagePlayerSceneBlob()
    const onChange = vi.fn()
    const { rerender } = render(<MagePlayer sceneBlob={scene} onAudioResponseCapabilitiesChange={onChange} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ sceneBlob: scene, capabilities: capabilities('size') }))
    onChange.mockClear()
    rerender(<MagePlayer sceneBlob={scene} log onAudioResponseCapabilitiesChange={onChange} />)
    await waitFor(() => expect(createMagePlayer).toHaveBeenCalledTimes(2))
    expect(onChange).toHaveBeenLastCalledWith(null)
    await act(async () => finishReplacement(second))
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ sceneBlob: scene, capabilities: capabilities('bass') }))
    expect(onChange.mock.calls.every(([snapshot]) => snapshot === null || snapshot.capabilities.supportedTargets[0] === 'bass')).toBe(true)
    expect(second.loadSceneBlob).toHaveBeenCalledWith(scene)
    expect(first.dispose).toHaveBeenCalledOnce()
  })

  it('does not publish from an obsolete engine that finishes initialization after its replacement', async () => {
    const obsolete = buildMagePlayerController({ getAudioResponseCapabilities: vi.fn(() => capabilities('size')) })
    const current = buildMagePlayerController({ getAudioResponseCapabilities: vi.fn(() => capabilities('bass')) })
    let finishObsolete!: (controller: MagePlayerController) => void
    vi.mocked(createMagePlayer).mockImplementationOnce(() => new Promise(resolve => { finishObsolete = resolve })).mockResolvedValueOnce(current)
    const scene = buildMagePlayerSceneBlob()
    const onChange = vi.fn()
    const { rerender } = render(<MagePlayer sceneBlob={scene} onAudioResponseCapabilitiesChange={onChange} />)
    await waitFor(() => expect(createMagePlayer).toHaveBeenCalledOnce())
    rerender(<MagePlayer sceneBlob={scene} log onAudioResponseCapabilitiesChange={onChange} />)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ sceneBlob: scene, capabilities: capabilities('bass') }))
    onChange.mockClear()
    await act(async () => finishObsolete(obsolete))
    expect(obsolete.dispose).toHaveBeenCalledOnce()
    expect(obsolete.loadSceneBlob).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not repeat publication or scene loading when an inline callback updates parent state', async () => {
    const controller = buildMagePlayerController({ getAudioResponseCapabilities: vi.fn(() => capabilities('bass')) })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const scene = buildMagePlayerSceneBlob()
    const publications = vi.fn()
    function Parent() {
      const [snapshot, setSnapshot] = useState<MagePlayerAudioResponseCapabilitiesSnapshot | null>(null)
      return <>
        <output>{snapshot?.capabilities.supportedTargets.join(',') ?? 'Waiting'}</output>
        <MagePlayer sceneBlob={scene} onAudioResponseCapabilitiesChange={value => { publications(value); setSnapshot(value) }} />
      </>
    }
    render(<Parent />)
    await screen.findByText('bass', { selector: 'output' })
    expect(controller.loadSceneBlob).toHaveBeenCalledOnce()
    expect(controller.getAudioResponseCapabilities).toHaveBeenCalledOnce()
    expect(publications.mock.calls.filter(([snapshot]) => snapshot !== null)).toHaveLength(1)
  })
})

// This suite tests existing playback behavior with server permission already granted.
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})
