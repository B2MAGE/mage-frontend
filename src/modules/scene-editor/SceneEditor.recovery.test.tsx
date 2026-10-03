import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMagePlayer, sceneRecovery, sceneRecoveryKey } from '@modules/player'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { buildMagePlayerController } from '../player/test-fixtures'
import { createTemplateScene } from './templateEditor'
import { buildSceneEditorApiScene, mockCreateScenePageFetch, renderCreateScenePage, renderEditScenePage, storeSceneEditorSession } from './test-fixtures'

vi.mock('../player/infrastructure/engineAdapter', () => ({ createMagePlayer: vi.fn() }))

const blockedKeys = new Set<string>()
afterEach(() => {
  act(() => {
    sceneRecovery.setSafeMode(false)
    for (const key of blockedKeys) sceneRecovery.clear(key)
  })
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('scene editor recovery', () => {
  it('preserves unsaved template settings and details through failure, safe editing, and resume', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()
    const first = buildMagePlayerController()
    const resumed = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValueOnce(first).mockResolvedValueOnce(resumed)
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
    expect(screen.getByText('Playback paused')).toBeInTheDocument()
    expect(screen.getByText(/playback error/i)).toBeInTheDocument()
    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('spinbutton', { name: 'Scene Scale numeric value' })).toHaveValue(12)

    await user.click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Scene Scale numeric value' }), { target: { value: '6' } })
    expect(screen.getByText('Playback paused')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Pause all scenes' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Resume scene' })).toBeDisabled()
    expect(createMagePlayer).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))
    await waitFor(() => expect(resumed.loadSceneBlob).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'template', parameters: expect.objectContaining({ scale: 6 }),
    }), expect.any(Object)))
    expect(sceneRecovery.getBlock(key)?.reason).toBe('runtime')
    expect(screen.getByRole('spinbutton', { name: 'Scene Scale numeric value' })).toHaveValue(6)
    await user.click(screen.getByRole('button', { name: /^Details$/ }))
    expect(screen.getByLabelText(/scene name/i)).toHaveValue('My unfinished scene')
  })

  it.each(['legacy', 'custom'] as const)('keeps failed saved %s source editable without offering custom playback', async (mode) => {
    vi.mocked(createMagePlayer).mockClear()
    storeSceneEditorSession()
    const raw = { visualizer: { shader: 'sphere(0.7)' } }
    const document = mode === 'custom' ? { schemaVersion: 1, kind: 'custom', scene: raw } : raw
    const key = sceneRecoveryKey(document, 12)!
    blockedKeys.add(key)
    sceneRecovery.block(key, 'load')
    mockCreateScenePageFetch((input) => input === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: document, tags: [] })) : undefined)
    renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByLabelText(/scene name/i)
    expect(screen.queryByRole('button', { name: 'Retry scene' })).not.toBeInTheDocument()
    expect(screen.getByText(/Custom scene preview is not available yet/i)).toBeInTheDocument()
    expect(createMagePlayer).not.toHaveBeenCalled()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^Scene$/ }))
    expect(screen.getByLabelText('Custom Shader', { exact: true })).toHaveValue(raw.visualizer.shader)
    fireEvent.change(screen.getByLabelText('Custom Shader', { exact: true }), { target: { value: 'sphere(0.6)' } })
    expect(createMagePlayer).not.toHaveBeenCalled()
    expect(sceneRecovery.getBlock(key)?.reason).toBe('load')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(screen.getByText('7 · Confirm')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show Raw JSON' }))
    expect(JSON.parse((screen.getByLabelText('Scene Data JSON') as HTMLTextAreaElement).value)).toEqual({ visualizer: { shader: 'sphere(0.6)' } })
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
})

// This suite tests existing playback behavior with server permission already granted.
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})
