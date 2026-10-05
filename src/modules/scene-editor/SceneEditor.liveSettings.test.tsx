import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMagePlayer } from '../player/infrastructure/engineAdapter'
import { buildMagePlayerController } from '../player/test-fixtures'
import { extractLiveSceneSettings } from '../player/liveSceneSettings'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { createDefaultSceneData } from './sceneEditor'
import { buildSceneEditorApiScene, mockCreateScenePageFetch, renderCreateScenePage, renderEditScenePage, storeSceneEditorSession } from './test-fixtures'

// Keep the editor and MagePlayer real; only the renderer controller and server
// permission are fixtures, so these tests cover the actual UI-to-player wiring.
vi.mock('../player/infrastructure/engineAdapter', () => ({ createMagePlayer: vi.fn() }))
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})

beforeEach(() => { vi.clearAllMocks(); storeSceneEditorSession() })
afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear() })

describe('real scene editor live preview updates', () => {
  it.each(['Create', 'Edit'] as const)('%s applies camera and effect edits to the existing player and captures the updated preview', async mode => {
    const updateSceneSettings = vi.fn()
    const controller = buildMagePlayerController({ updateSceneSettings })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    mockCreateScenePageFetch(input => input === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: createDefaultSceneData(), tags: [] })) : undefined)
    const user = userEvent.setup()
    if (mode === 'Create') renderCreateScenePage('mage-pulse')
    else renderEditScenePage(undefined, 'mage-pulse')
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Camera' }))
    fireEvent.change(screen.getByRole('slider', { name: 'FOV' }), { target: { value: '82' } })
    await waitFor(() => expect(extractLiveSceneSettings(updateSceneSettings.mock.lastCall?.[0]).intent.fov).toBe(82))

    await user.click(screen.getByRole('button', { name: 'Effects' }))
    const bloom = screen.getByRole('checkbox', { name: 'Bloom' })
    if (!(bloom as HTMLInputElement).checked) await user.click(bloom)
    fireEvent.change(screen.getByRole('slider', { name: 'Strength' }), { target: { value: '1.7' } })
    await waitFor(() => expect(extractLiveSceneSettings(updateSceneSettings.mock.lastCall?.[0])).toMatchObject({
      intent: { fov: 82 }, fx: { bloom: { enabled: true, strength: 1.7 } },
    }))
    expect(controller.loadSceneBlob).toHaveBeenCalledOnce()
    expect(createMagePlayer).toHaveBeenCalledOnce()
    expect(controller.dispose).not.toHaveBeenCalled()
    expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Details' }))
    await user.click(screen.getByRole('button', { name: /^Capture (Thumbnail|Again)$/ }))
    await waitFor(() => expect(controller.captureFramePreview).toHaveBeenCalledOnce())
    const capture = vi.mocked(controller.captureFramePreview!)
    const captured = await capture.mock.results[0].value
    await waitFor(() => expect(screen.getByAltText('Captured thumbnail preview')).toHaveAttribute('src', captured))
    expect(updateSceneSettings.mock.invocationCallOrder.at(-1)).toBeLessThan(capture.mock.invocationCallOrder[0])
    expect(controller.loadSceneBlob).toHaveBeenCalledOnce()
    expect(createMagePlayer).toHaveBeenCalledOnce()
  })

  it('uses a complete scene load for template and skybox selections after live edits', async () => {
    const updateSceneSettings = vi.fn(), controller = buildMagePlayerController({ updateSceneSettings })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage('mage-pulse')
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Camera' }))
    fireEvent.change(screen.getByRole('slider', { name: 'FOV' }), { target: { value: '82' } })
    await waitFor(() => expect(updateSceneSettings).toHaveBeenCalledOnce())
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Template' }), 'reaction-rings-v1')
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledTimes(2))
    expect(vi.mocked(controller.loadSceneBlob).mock.lastCall?.[0]).toMatchObject({ kind: 'template', templateId: 'reaction-rings-v1' })
    const skybox = screen.getByRole('combobox', { name: 'Skybox' }) as HTMLSelectElement
    const nextSkybox = [...skybox.options].find(option => option.value !== skybox.value)!.value
    await user.selectOptions(skybox, nextSkybox)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledTimes(3))
    expect(vi.mocked(controller.loadSceneBlob).mock.lastCall?.[0]).toMatchObject({ settings: { skybox: Number(nextSkybox) } })
    expect(createMagePlayer).toHaveBeenCalledOnce()
    expect(updateSceneSettings).toHaveBeenCalledOnce()
  })
})
