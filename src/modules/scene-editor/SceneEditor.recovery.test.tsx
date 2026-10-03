import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMagePlayer, sceneRecovery, sceneRecoveryKey } from '@modules/player'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { buildMagePlayerController } from '../player/test-fixtures'
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
  it('preserves unsaved fields and shader source through failure, safe editing, and retry', async () => {
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
    const shader = 'sphere(0.7) // unsaved source'
    fireEvent.change(screen.getByLabelText('Custom Shader', { exact: true }), { target: { value: shader } })
    await waitFor(() => expect(first.loadSceneBlob).toHaveBeenLastCalledWith(expect.objectContaining({
      visualizer: expect.objectContaining({ shader }),
    }), expect.any(Object)))
    const loaded = vi.mocked(first.loadSceneBlob).mock.lastCall![1]!.recoverySceneBlob
    const key = sceneRecoveryKey(loaded)!
    blockedKeys.add(key)
    act(() => sceneRecovery.block(key, 'runtime'))
    expect(screen.getByText('This scene could not keep rendering.')).toBeInTheDocument()
    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Custom Shader', { exact: true })).toHaveValue(shader)

    await user.click(screen.getByRole('button', { name: 'Browse in safe mode' }))
    const corrected = 'sphere(0.6) // corrected unsaved source'
    fireEvent.change(screen.getByLabelText('Custom Shader', { exact: true }), { target: { value: corrected } })
    expect(screen.getByText('Safe mode is on.')).toBeInTheDocument()
    expect(createMagePlayer).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Leave safe mode' }))
    await waitFor(() => expect(resumed.loadSceneBlob).toHaveBeenCalledWith(expect.objectContaining({
      visualizer: expect.objectContaining({ shader: corrected }),
    }), expect.any(Object)))
    expect(sceneRecovery.getBlock(key)?.reason).toBe('runtime')
    expect(screen.getByLabelText('Custom Shader', { exact: true })).toHaveValue(corrected)
    await user.click(screen.getByRole('button', { name: /^Details$/ }))
    expect(screen.getByLabelText(/scene name/i)).toHaveValue('My unfinished scene')
  })

  it('does not reload a failed saved scene when the editor adds default fields', async () => {
    vi.mocked(createMagePlayer).mockClear()
    storeSceneEditorSession()
    const raw = { visualizer: { shader: 'sphere(0.7)' } }
    const key = sceneRecoveryKey(raw, 12)!
    blockedKeys.add(key)
    sceneRecovery.block(key, 'load')
    mockCreateScenePageFetch((input) => input === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: raw, tags: [] })) : undefined)
    renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByRole('button', { name: 'Retry scene' })
    expect(createMagePlayer).not.toHaveBeenCalled()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^Scene$/ }))
    expect(screen.getByLabelText('Custom Shader', { exact: true })).toHaveValue(raw.visualizer.shader)
  })
})
