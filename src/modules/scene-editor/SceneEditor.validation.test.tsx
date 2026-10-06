import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { createDefaultSceneData } from './sceneEditor'
import { buildSceneEditorApiScene, mockCreateScenePageFetch, renderCreateScenePage, renderEditScenePage, storeSceneEditorSession } from './test-fixtures'
import { sceneSubmissionErrors } from './sceneValidation'

const capture = vi.fn(async () => 'data:image/png;base64,cHJldmlldw==')
vi.mock('@modules/player', async original => {
  const actual = await original<typeof import('@modules/player')>()
  const React = await import('react')
  return { ...actual, MagePlayer: ({ sceneBlob, renderProfile, onCaptureFramePreviewChange }: {
    sceneBlob: unknown; renderProfile?: string; onCaptureFramePreviewChange?: (callback: typeof capture | null) => void
  }) => {
    React.useEffect(() => { onCaptureFramePreviewChange?.(capture); return () => onCaptureFramePreviewChange?.(null) }, [onCaptureFramePreviewChange])
    return <div data-testid="preview" data-scene={JSON.stringify(sceneBlob)} data-profile={renderProfile} />
  } }
})
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})

beforeEach(() => { capture.mockClear(); storeSceneEditorSession() })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })
const preview = () => JSON.parse(screen.getByTestId('preview').getAttribute('data-scene')!)
const effect = (label: string) => within(screen.getByRole('heading', { name: label }).closest('.effect-card-group') as HTMLElement).getByRole('checkbox')
async function rawEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  const showJson = screen.queryByRole('button', { name: 'Show Raw JSON' })
  if (showJson) await user.click(showJson)
  return screen.getByLabelText('Scene Data JSON')
}

describe('scene editor resource preflight', () => {
  it('keeps out-of-range typed values as a repairable draft and freezes only the preview', async () => {
    mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    expect(screen.getByTestId('preview')).toHaveAttribute('data-profile', 'preview')
    await user.click(screen.getByRole('button', { name: 'Camera' }))
    expect(screen.getByLabelText('FOV')).toHaveAttribute('max', '179')
    expect(screen.getByLabelText('FOV')).toHaveAttribute('min', '1')
    expect(screen.getByLabelText('Zoom')).toBeInTheDocument()
    expect(screen.getByLabelText('Camera Position X')).toBeInTheDocument()
    const field = screen.getByLabelText('FOV numeric value')
    fireEvent.change(field, { target: { value: '200' } })
    expect(field).toHaveValue(200)
    expect(preview().settings.camera.fov).toBe(75)
    expect(screen.getByText(/FOV:.*179.*last valid/i)).toBeInTheDocument()
    fireEvent.change(field, { target: { value: '100' } })
    expect(preview().settings.camera.fov).toBe(100)
    expect(screen.queryByText(/last valid settings/i)).not.toBeInTheDocument()
  })

  it.each([
    ['source size', JSON.stringify({ visualizer: { shader: 'x'.repeat(65537) } })],
    ['wrong type', JSON.stringify({ visualizer: { shader: 'sphere(1)', skyboxPreset: '4' } })],
    ['duplicate key', '{"visualizer":{"shader":"first","shader":"second"}}'],
    ['unknown field', JSON.stringify({ visualizer: { shader: 'sphere(1)' }, unsupported: true })],
  ])('keeps an invalid %s import intact and never previews or submits it', async (_label, text) => {
    const fetchMock = mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage()
    fireEvent.change(await screen.findByLabelText(/scene name/i), { target: { value: 'Test draft' } })
    const previous = preview()
    const editor = await rawEditor(user)
    fireEvent.change(editor, { target: { value: text } })
    expect(editor).toHaveValue(text)
    expect(preview()).toEqual(previous)
    await user.click(screen.getByRole('button', { name: /^create scene$/i }))
    expect(capture).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/thumbnail/') || url === buildApiUrl('/scenes'))).toBe(false)
    expect(screen.getByRole('button', { name: 'Download scene JSON' })).toBeEnabled()
  })

  it('leaves invalid saved repair data editable without ever creating a preview or coercing unrelated fields', async () => {
    const scene = buildSceneEditorApiScene({ sceneData: { ...createDefaultSceneData(), intent: { fov: 'broken', time_multiplier: 1 }, unknown: 'retain' } })
    mockCreateScenePageFetch(url => url === buildApiUrl('/scenes/12') ? jsonResponse(scene) : undefined)
    const user = userEvent.setup()
    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    fireEvent.change(screen.getByLabelText('Animation speed'), { target: { value: '2' } })
    const editor = await rawEditor(user) as HTMLTextAreaElement
    expect(JSON.parse(editor.value)).toMatchObject({ intent: { fov: 'broken', time_multiplier: 2 }, unknown: 'retain' })
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument()
  })

  it('counts bloom in the four-effect budget and leaves enabled controls available to turn off', async () => {
    mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage()
    const imported = await rawEditor(user)
    fireEvent.change(imported, { target: { value: JSON.stringify({ schemaVersion: 1, kind: 'custom', scene: createDefaultSceneData() }) } })
    await user.click(screen.getByRole('button', { name: 'Hide Raw JSON' }))
    expect(screen.getByTestId('preview')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Effects' }))
    for (const label of ['Bloom', 'Toon', 'Bleach Bypass', 'RGB Shift']) await user.click(effect(label))
    expect(screen.getByText('4/4 enabled')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/reached the 4-effect limit/i)
    expect(effect('Afterimage')).toBeDisabled()
    expect(effect('Bloom')).toBeEnabled()
    await user.click(effect('Bloom'))
    expect(effect('Afterimage')).toBeEnabled()
    const editor = await rawEditor(user) as HTMLTextAreaElement
    expect(JSON.parse(editor.value).fx.bloom.enabled).toBe(false)
    expect(screen.getByTestId('preview')).toBeInTheDocument()
  }, 15_000)

  it('checks the whole request budget before thumbnail capture or upload', async () => {
    const fetchMock = mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage()
    fireEvent.change(await screen.findByLabelText(/scene name/i), { target: { value: 'Oversized metadata' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'x'.repeat(524289) } })
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^create scene$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/524288/)
    expect(capture).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/thumbnail/') || url === buildApiUrl('/scenes'))).toBe(false)
  })

  it('shows nested server limits and keeps the draft after a rejected update', async () => {
    const scene = buildSceneEditorApiScene()
    mockCreateScenePageFetch((url, init) => url === buildApiUrl('/scenes/12')
      ? init?.method === 'PUT' ? jsonResponse({ code: 'VALIDATION_ERROR', message: 'Request validation failed.',
        details: { 'sceneData.scene.visualizer.shader': 'Shader source must not exceed 65536 UTF-8 bytes.' } }, 400) : jsonResponse(scene)
      : undefined)
    const user = userEvent.setup()
    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^update scene$/i }))
    expect(await screen.findByText(/Custom shader: Shader source must not exceed/)).toBeInTheDocument()
    expect(screen.getByLabelText('Scene Data JSON')).toHaveValue(JSON.stringify(scene.sceneData, null, 2))
  })

  it.each(['<html>Too large</html>', ''])('explains HTTP 413 even when its response is not JSON', async body => {
    mockCreateScenePageFetch(url => url === buildApiUrl('/scenes') ? new Response(body, { status: 413 }) : undefined)
    const user = userEvent.setup()
    renderCreateScenePage()
    fireEvent.change(await screen.findByLabelText(/scene name/i), { target: { value: 'Keep this name' } })
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^create scene$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/512 KiB/)
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByLabelText(/scene name/i)).toHaveValue('Keep this name')
  })

  it('maps both legacy and versioned nested field paths without losing metadata errors', () => {
    expect(sceneSubmissionErrors(400, { details: { name: 'Choose another name.', 'sceneData.intent.fov': 'Must be between 1 and 179.',
      'sceneData.scene.fx': 'Enable at most 4 optional effects, including bloom.' } }))
      .toMatchObject({ name: 'Choose another name.', sceneData: 'FOV: Must be between 1 and 179. Effects: Enable at most 4 optional effects, including bloom.' })
  })
})
