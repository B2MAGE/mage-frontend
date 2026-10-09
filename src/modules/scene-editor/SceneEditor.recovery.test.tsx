import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMagePlayer, sceneRecovery, sceneRecoveryKey } from '@modules/player'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { buildMagePlayerController } from '../player/test-fixtures'
import { createTemplateScene } from './templateEditor'
import { createBuilderScene } from './builderEditor'
import { buildSceneEditorApiScene, mockCreateScenePageFetch, renderCreateScenePage, renderEditScenePage, storeSceneEditorSession } from './test-fixtures'

vi.mock('../player/infrastructure/engineAdapter', () => ({ createMagePlayer: vi.fn() }))

const blockedKeys = new Set<string>()
afterEach(() => {
  act(() => {
    sceneRecovery.setSafeMode(false)
    for (const key of blockedKeys) sceneRecovery.clear(key)
  })
  vi.mocked(createMagePlayer).mockReset()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('scene editor recovery', () => {
  it('treats choosing the bounded default Builder scene as an explicit retry', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()
    const player = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(player)
    const builder = createBuilderScene()
    const key = sceneRecoveryKey(builder)!
    blockedKeys.add(key)
    sceneRecovery.block(key, 'runtime')

    renderCreateScenePage('mage-pulse')
    await waitFor(() => expect(player.loadSceneBlob).toHaveBeenCalled())
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^Scene$/ }))
    await user.click(screen.getByRole('button', { name: 'Builder' }))

    await waitFor(() => expect(player.loadSceneBlob).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'builder', objects: [expect.objectContaining({ operation: { type: 'sphere', radius: 1 } })] }),
      expect.any(Object),
    ))
    expect(screen.queryByText('Playback paused')).not.toBeInTheDocument()
  })

  it('preserves unsaved template settings and details through repeated failure, safe editing, and explicit retry', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()
    const first = buildMagePlayerController()
    const automaticRetry = buildMagePlayerController()
    const resumed = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValueOnce(first).mockResolvedValueOnce(automaticRetry).mockResolvedValueOnce(resumed)
    const user = userEvent.setup()
    renderCreateScenePage('mage-pulse')
    await waitFor(() => expect(first.loadSceneBlob).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText(/scene name/i), { target: { value: 'My unfinished scene' } })
    await user.click(screen.getByRole('button', { name: /^Scene$/ }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Scene Scale numeric value' }), { target: { value: '12' } })
    await waitFor(() => expect(first.loadSceneBlob).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'template', parameters: expect.objectContaining({ scale: 12 }),
    }), expect.any(Object)))
    const loaded = vi.mocked(first.loadSceneBlob).mock.lastCall![1]!.recoverySceneBlob
    const key = sceneRecoveryKey(loaded)!
    blockedKeys.add(key)
    act(() => sceneRecovery.block(key, 'runtime'))
    await waitFor(() => expect(automaticRetry.loadSceneBlob).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'template', parameters: expect.objectContaining({ scale: 12 }),
    }), expect.any(Object)))
    expect(screen.queryByText('Playback paused')).not.toBeInTheDocument()
    expect(first.dispose).toHaveBeenCalledTimes(1)

    act(() => sceneRecovery.block(key, 'runtime'))
    expect(screen.getByText('Playback paused')).toBeInTheDocument()
    expect(screen.getByText(/playback error/i)).toBeInTheDocument()
    expect(automaticRetry.dispose).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('spinbutton', { name: 'Scene Scale numeric value' })).toHaveValue(12)

    await user.click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Scene Scale numeric value' }), { target: { value: '6' } })
    expect(screen.getByText('Playback paused')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Pause all scenes' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Resume scene' })).toBeDisabled()
    expect(createMagePlayer).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))
    expect(screen.getByRole('button', { name: 'Retry scene' })).toBeEnabled()
    expect(screen.getByText(/playback error/i)).toBeInTheDocument()
    expect(sceneRecovery.getBlock(key)?.reason).toBe('runtime')
    expect(createMagePlayer).toHaveBeenCalledTimes(2)
    expect(resumed.loadSceneBlob).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Retry scene' }))
    await waitFor(() => expect(resumed.loadSceneBlob).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'template', parameters: expect.objectContaining({ scale: 6 }),
    }), expect.any(Object)))
    expect(sceneRecovery.getAutomaticBlock(key)?.reason).toBe('runtime')
    expect(screen.getByRole('spinbutton', { name: 'Scene Scale numeric value' })).toHaveValue(6)
    await user.click(screen.getByRole('button', { name: /^Details$/ }))
    expect(screen.getByLabelText(/scene name/i)).toHaveValue('My unfinished scene')
  })

  it('keeps failed saved custom source editable and previews a valid edit separately', async () => {
    vi.mocked(createMagePlayer).mockReset()
    const repaired = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(repaired)
    storeSceneEditorSession()
    const raw = { visualizer: { shader: 'sphere(0.7)' } }
    const document = { schemaVersion: 1, kind: 'custom', scene: raw }
    const key = sceneRecoveryKey(document, 12)!
    blockedKeys.add(key)
    sceneRecovery.block(key, 'load')
    mockCreateScenePageFetch((input) => input === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: document, tags: [] })) : undefined)
    renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByLabelText(/scene name/i)
    expect(screen.getByRole('button', { name: 'Retry scene' })).toBeInTheDocument()
    expect(createMagePlayer).not.toHaveBeenCalled()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^Scene$/ }))
    expect(screen.getByLabelText('Custom Shader', { exact: true })).toHaveValue(raw.visualizer.shader)
    fireEvent.change(screen.getByLabelText('Custom Shader', { exact: true }), { target: { value: 'sphere(0.6)' } })
    await waitFor(() => expect(repaired.loadSceneBlob).toHaveBeenCalledWith(expect.objectContaining({ kind: 'custom', scene: expect.objectContaining({ visualizer: expect.objectContaining({ shader: 'sphere(0.6)' }) }) }), expect.any(Object)))
    expect(sceneRecovery.getBlock(key)?.reason).toBe('load')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(screen.getByText('7 · Confirm')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show Raw JSON' }))
    expect(JSON.parse((screen.getByLabelText('Scene Data JSON') as HTMLTextAreaElement).value)).toEqual({ schemaVersion: 1, kind: 'custom', scene: { visualizer: { shader: 'sphere(0.6)' } } })
  })

  it('keeps a failed saved template stopped until an explicit retry', async () => {
    vi.mocked(createMagePlayer).mockReset()
    storeSceneEditorSession()
    const source = createTemplateScene()
    const key = sceneRecoveryKey(source, 12)!
    blockedKeys.add(key)
    sceneRecovery.block(key, 'load')
    mockCreateScenePageFetch(input => input === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: source, tags: [] })) : undefined)
    const resumed = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(resumed)
    renderEditScenePage(undefined, 'mage-pulse')
    const retry = await screen.findByRole('button', { name: 'Retry scene' })
    expect(createMagePlayer).not.toHaveBeenCalled()
    await userEvent.setup().click(retry)
    await waitFor(() => expect(resumed.loadSceneBlob).toHaveBeenCalledWith(source, expect.any(Object)))
  })

  it('keeps a compiler-rejected custom draft editable and exports its exact text without replacing the saved thumbnail', async () => {
    vi.mocked(createMagePlayer).mockReset()
    storeSceneEditorSession()
    const player = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(player)
    mockCreateScenePageFetch(input => input === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: { visualizer: { shader: 'sphere(0.7);' } }, thumbnailRef: '/saved.png', tags: [] })) : undefined)
    const user = userEvent.setup()
    renderEditScenePage(undefined, 'mage-pulse')
    await waitFor(() => expect(player.loadSceneBlob).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: 'Show Raw JSON' }))
    const draft = JSON.stringify({ schemaVersion: 1, kind: 'custom', scene: { visualizer: { shader: 'while (true) { sphere(0.7); }' } } }, null, 2) + '\n'
    vi.mocked(player.loadSceneBlob).mockRejectedValue(new Error('Shader compiler rejected this draft.'))
    fireEvent.change(screen.getByLabelText('Scene Data JSON'), { target: { value: draft } })
    await screen.findByText('Shader compiler rejected this draft.')
    expect(screen.getByLabelText('Scene Data JSON')).toHaveValue(draft)

    await user.click(screen.getByRole('button', { name: /^Details$/ }))
    expect(screen.getByAltText('Captured thumbnail preview')).toHaveAttribute('src', '/saved.png')
    fireEvent.change(screen.getByLabelText(/scene name/i), { target: { value: 'Still editable after rejection' } })
    expect(screen.getByLabelText(/scene name/i)).toHaveValue('Still editable after rejection')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(screen.getByLabelText('Scene Data JSON')).toHaveValue(draft)
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:rejected-draft')
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const downloads: { filename: string; href: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ filename: this.download, href: this.href })
    })
    await user.click(screen.getByRole('button', { name: 'Download scene JSON' }))
    const exported = createUrl.mock.calls[0][0] as Blob
    const exportedText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(exported)
    })
    expect(exportedText).toBe(draft)
    expect(downloads).toEqual([{ filename: 'scene-12.json', href: 'blob:rejected-draft' }])
    expect(revokeUrl).toHaveBeenCalledWith('blob:rejected-draft')
    expect(player.captureFramePreview).not.toHaveBeenCalled()
  })
})

// This suite tests existing playback behavior with server permission already granted.
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})
