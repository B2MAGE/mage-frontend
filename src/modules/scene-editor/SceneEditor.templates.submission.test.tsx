import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseSceneDocument } from '@modules/player'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { buildSceneEditorApiScene, mockCreateScenePageFetch, renderCreateScenePage, renderEditScenePage, storeSceneEditorSession } from './test-fixtures'

const capture = vi.fn(async () => 'data:image/png;base64,cHJldmlldw==')
vi.mock('@modules/player', async original => {
  const actual = await original<typeof import('@modules/player')>()
  const React = await import('react')
  return { ...actual, MagePlayer: ({ sceneBlob, onCaptureFramePreviewChange }: {
    sceneBlob: unknown; onCaptureFramePreviewChange?: (callback: typeof capture | null) => void
  }) => {
    React.useEffect(() => { onCaptureFramePreviewChange?.(capture); return () => onCaptureFramePreviewChange?.(null) }, [onCaptureFramePreviewChange])
    return <div data-testid="template-preview" data-scene={JSON.stringify(sceneBlob)} />
  } }
})
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})

beforeEach(() => { capture.mockClear(); storeSceneEditorSession() })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })
const template = () => parseSceneDocument({ schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1,
  parameters: { scale: 8, speed: 0.7 }, settings: { skybox: 3, camera: { fov: 65, autoRotate: false }, tint: { enabled: true, color: '#abc123' } } })

describe('template editor API round trips', () => {
  it('creates a template with adjusted settings and reopens the saved document without introducing source', async () => {
    let submitted: Record<string, unknown> | undefined
    mockCreateScenePageFetch((url, init) => {
      if (url === buildApiUrl('/scenes') && init?.method === 'POST') {
        submitted = JSON.parse(String(init.body))
        return jsonResponse({ sceneId: 12 })
      }
      if (url === buildApiUrl('/scenes/12')) return jsonResponse(buildSceneEditorApiScene({ sceneData: submitted?.sceneData }))
    })
    const user = userEvent.setup()
    const view = renderCreateScenePage()
    fireEvent.change(await screen.findByLabelText(/scene name/i), { target: { value: 'Template round trip' } })
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.selectOptions(screen.getByLabelText('Template', { exact: true }), 'embedded-scene-1')
    fireEvent.change(document.getElementById('template-parameters-scale-number')!, { target: { value: '12' } })
    await user.click(screen.getByRole('button', { name: 'Camera' }))
    fireEvent.change(screen.getByLabelText('Camera Position X'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('Zoom'), { target: { value: '2' } })
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    fireEvent.change(screen.getByLabelText('Animation speed'), { target: { value: '1.8' } })
    fireEvent.change(screen.getByLabelText('Input gain numeric value'), { target: { value: '0.7' } })
    await user.click(screen.getByRole('button', { name: 'Effects' }))
    await user.click(screen.getByRole('checkbox', { name: 'RGB Shift' }))
    fireEvent.change(screen.getByLabelText('Shift Amount numeric value'), { target: { value: '0.02' } })
    await user.click(screen.getByRole('button', { name: 'Pass Order' }))
    await user.click(screen.getByRole('button', { name: 'Move RGB Shift up' }))
    const expected = JSON.parse(screen.getByTestId('template-preview').getAttribute('data-scene')!)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^create scene$/i }))
    await screen.findByText('My Scenes')
    const saved = parseSceneDocument(submitted?.sceneData)
    expect(saved).toEqual(expected)
    expect(saved).toMatchObject({ schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-1', templateVersion: 1,
      parameters: { scale: 12, speed: 1.8 }, settings: {
        controls: { position0: { x: 15 }, zoom0: 2 }, motion: { minimizing_factor: 0.7 },
        effects: { passes: { rgbShift: true }, params: { rgbShift: { amount: 0.02 } } },
      } })
    expect(JSON.stringify(saved)).not.toContain('shader')
    expect(capture).toHaveBeenCalledTimes(1)
    view.unmount()
    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    expect(JSON.parse(screen.getByTestId('template-preview').getAttribute('data-scene')!)).toEqual(saved)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: 'Show Raw JSON' }))
    expect(JSON.parse((screen.getByLabelText('Scene Data JSON') as HTMLTextAreaElement).value)).toEqual(saved)
  })

  it('updates a template camera setting while preserving its version and other parameters', async () => {
    let submitted: Record<string, unknown> | undefined
    const saved = template()
    mockCreateScenePageFetch((url, init) => {
      if (url === buildApiUrl('/scenes/12')) {
        if (init?.method === 'PUT') submitted = JSON.parse(String(init.body))
        return jsonResponse(buildSceneEditorApiScene({ sceneData: saved }))
      }
      if (url === buildApiUrl('/scenes/12/tags')) return jsonResponse([])
    })
    const user = userEvent.setup()
    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Camera' }))
    fireEvent.change(document.getElementById('field-of-view-number')!, { target: { value: '85' } })
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^update scene$/i }))
    await screen.findByText('My Scenes')
    expect(submitted?.sceneData).toEqual(saved.kind === 'template'
      ? { ...saved, settings: { ...saved.settings, camera: { ...saved.settings.camera, fov: 85 } } } : null)
    expect(JSON.stringify(submitted?.sceneData)).not.toContain('shader')
    expect(capture).not.toHaveBeenCalled()
  })

  it('shows a server field rejection beside the affected template control and keeps the draft', async () => {
    const saved = template()
    mockCreateScenePageFetch((url, init) => url === buildApiUrl('/scenes/12')
      ? init?.method === 'PUT'
        ? jsonResponse({ message: 'Invalid scene.', details: { 'sceneData.settings.camera.fov': 'Please choose a supported field of view.' } }, 400)
        : jsonResponse(buildSceneEditorApiScene({ sceneData: saved })) : undefined)
    const user = userEvent.setup()
    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^update scene$/i }))
    const field = await screen.findByLabelText('FOV', { exact: true })
    await waitFor(() => expect(document.querySelector('[data-template-field="settings.camera.fov"]')).toHaveTextContent('Please choose a supported field of view.'))
    expect(field).toHaveValue('65')
    expect(JSON.parse(screen.getByTestId('template-preview').getAttribute('data-scene')!)).toEqual(saved)
  })
})
