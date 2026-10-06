import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneEditorShell } from './SceneEditorShell'
import { createDefaultSceneData } from './sceneEditor'
import { createTemplateScene } from './templateEditor'

const permission = vi.hoisted(() => ({
  snapshot: { allowed: true, code: 'AVAILABLE', message: '', checkedAt: 1 },
  listeners: new Set<() => void>(), targets: vi.fn(), capture: vi.fn(),
}))
vi.mock('@modules/player/availability/sceneAvailability', () => ({
  sceneAvailabilityStore: {
    getSnapshot: () => permission.snapshot,
    isAllowed: () => permission.snapshot.allowed,
    subscribe: (target: unknown, listener: () => void) => {
      permission.targets(target)
      permission.listeners.add(listener)
      return () => permission.listeners.delete(listener)
    },
  },
}))
vi.mock('@modules/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modules/player')>()
  const React = await import('react')
  return { ...actual, MagePlayer: ({ onCaptureFramePreviewChange }: import('@modules/player').MagePlayerProps) => {
    React.useEffect(() => {
      onCaptureFramePreviewChange?.(permission.capture)
      return () => onCaptureFramePreviewChange?.(null)
    }, [onCaptureFramePreviewChange])
    return <div>Scene preview</div>
  } }
})

function setAllowed(allowed: boolean) {
  permission.snapshot = { allowed, code: allowed ? 'AVAILABLE' : 'SCENE_DISABLED', message: '', checkedAt: 2 }
  permission.listeners.forEach((listener) => listener())
}

describe('editor thumbnail availability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permission.snapshot = { allowed: true, code: 'AVAILABLE', message: '', checkedAt: 1 }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('[]'))
    permission.capture.mockResolvedValue('data:image/png;base64,cHJldmlldw==')
  })

  it('accepts a pending capture after a permission recheck succeeds for the same source', async () => {
    let finish!: (value: string) => void
    permission.capture.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve }))
    render(<SceneEditorShell authenticatedFetch={vi.fn()} onComplete={vi.fn()} initialState={{ sceneData: createTemplateScene() }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Capture Thumbnail' }))
    await act(async () => {
      permission.snapshot = { allowed: false, code: 'CHECKING', message: '', checkedAt: 2 }
      permission.listeners.forEach(listener => listener())
    })
    await act(async () => setAllowed(true))
    await act(async () => finish('data:image/png;base64,cHJldmlldw=='))
    expect(screen.getByAltText('Captured thumbnail preview')).toHaveAttribute('src', 'data:image/png;base64,cHJldmlldw==')
  })

  it('disables draft capture while custom rendering is unavailable but keeps fields editable', async () => {
    setAllowed(false)
    render(<SceneEditorShell authenticatedFetch={vi.fn()} onComplete={vi.fn()} initialState={{ sceneData: createDefaultSceneData() }} />)
    expect(screen.getByRole('button', { name: 'Capture Thumbnail' })).toBeDisabled()
    expect(screen.getByText('Capture is unavailable while scene playback is paused.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/scene name/i), 'Repair draft')
    expect(screen.getByLabelText(/scene name/i)).toHaveValue('Repair draft')
    expect(permission.capture).not.toHaveBeenCalled()
    expect(permission.targets).toHaveBeenCalledWith('custom')
  })

  it('keeps the saved thumbnail and allows editing and saving a disabled scene', async () => {
    setAllowed(false)
    const fetcher = vi.fn(async () => new Response('{}'))
    const complete = vi.fn()
    render(<SceneEditorShell authenticatedFetch={fetcher} onComplete={complete} mode={{ type: 'edit', sceneId: 23 }} initialState={{ name: 'Repair scene', thumbnailPreviewUrl: '/saved.png', sceneData: createDefaultSceneData() }} />)
    expect(screen.getByRole('button', { name: 'Recapture Thumbnail' })).toBeDisabled()
    expect(permission.targets).toHaveBeenCalledWith(23)
    expect(screen.getByAltText('Captured thumbnail preview')).toHaveAttribute('src', '/saved.png')
    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
    await userEvent.click(screen.getByRole('button', { name: /update scene/i }))
    await waitFor(() => expect(complete).toHaveBeenCalled())
    expect(permission.capture).not.toHaveBeenCalled()
    expect(fetcher.mock.calls).toHaveLength(2)
  })

  it('cancels pending capture and discards its result even if playback is re-enabled', async () => {
    let finish!: (value: string) => void
    permission.capture.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve }))
    render(<SceneEditorShell authenticatedFetch={vi.fn()} onComplete={vi.fn()} mode={{ type: 'edit', sceneId: 23 }} initialState={{ name: 'Repair scene', thumbnailPreviewUrl: '/saved.png', sceneData: createTemplateScene() }} />)
    expect(permission.targets).toHaveBeenCalledWith('template:23')
    fireEvent.click(screen.getByRole('button', { name: 'Recapture Thumbnail' }))
    expect(screen.getByRole('button', { name: 'Capturing...' })).toBeDisabled()
    await act(async () => setAllowed(false))
    expect(screen.getByRole('button', { name: 'Recapture Thumbnail' })).toBeDisabled()
    await act(async () => setAllowed(true))
    expect(screen.getByRole('button', { name: 'Recapture Thumbnail' })).toBeEnabled()
    await act(async () => finish('data:image/png;base64,c3RhbGU='))
    expect(screen.getByAltText('Captured thumbnail preview')).toHaveAttribute('src', '/saved.png')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
