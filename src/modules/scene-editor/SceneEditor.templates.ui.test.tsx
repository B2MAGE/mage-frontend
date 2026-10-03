import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { createDefaultSceneData } from './sceneEditor'
import { createTemplateScene } from './templateEditor'
import { buildSceneEditorApiScene, mockCreateScenePageFetch, renderCreateScenePage, renderEditScenePage, storeSceneEditorSession } from './test-fixtures'

const renderedPlayer = vi.fn()
vi.mock('@modules/player', async original => {
  const actual = await original<typeof import('@modules/player')>()
  return { ...actual, MagePlayer: (props: { sceneBlob: unknown; renderProfile?: string }) => {
    renderedPlayer(props)
    return <div data-testid="template-preview" data-scene={JSON.stringify(props.sceneBlob)} />
  } }
})
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})

beforeEach(() => { renderedPlayer.mockClear(); storeSceneEditorSession() })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

const previewDocument = () => JSON.parse(screen.getByTestId('template-preview').getAttribute('data-scene')!)
async function openRawJson(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  const showJson = screen.queryByRole('button', { name: 'Show Raw JSON' })
  if (showJson) await user.click(showJson)
  return screen.getByLabelText('Scene Data JSON')
}
async function customEditor() {
  const source = { ...createDefaultSceneData(), visualizer: { shader: 'sphere(0.7)', scale: 17 } }
  mockCreateScenePageFetch(url => url === buildApiUrl('/scenes/12')
    ? jsonResponse(buildSceneEditorApiScene({ sceneData: { schemaVersion: 1, kind: 'custom', scene: source } })) : undefined)
  renderEditScenePage()
  await screen.findByLabelText(/scene name/i)
  return source
}

describe('Basic template editor controls', () => {
  it.each(['classic-facebook', 'mage-pulse'] as const)('starts with a source-free template in the %s theme', async theme => {
    mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage(theme)
    await screen.findByLabelText(/scene name/i)
    expect(screen.queryByRole('group', { name: 'Creation mode' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pass Order' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    const mode = within(screen.getByRole('group', { name: 'Creation mode' }))
    expect(mode.getByRole('button', { name: 'Basic' })).toHaveAttribute('aria-pressed', 'true')
    expect(mode.getByRole('button', { name: 'Advanced' })).toBeDisabled()
    const selector = screen.getByRole('combobox', { name: 'Template' })
    expect(selector).toHaveValue('embedded-scene-0')
    expect(screen.queryByLabelText(/^shader$/i)).not.toBeInTheDocument()
    selector.focus()
    await user.selectOptions(selector, 'reaction-rings-v1')
    expect(selector).toHaveFocus()
    expect(previewDocument()).toEqual(createTemplateScene('reaction-rings-v1'))
    expect(JSON.stringify(previewDocument())).not.toContain('shader')
    expect(renderedPlayer.mock.lastCall?.[0].renderProfile).toBe('preview')
    expect(screen.getByRole('spinbutton', { name: 'Scene Scale numeric value' })).toHaveAttribute('min', '1')
    expect(screen.getByRole('spinbutton', { name: 'Scene Scale numeric value' })).toHaveAttribute('max', '30')
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    expect(screen.queryByRole('group', { name: 'Creation mode' })).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Animation speed numeric value' })).toHaveAttribute('max', '3')
  })

  it('reveals bounded orbit and effect settings using the existing toggles', async () => {
    mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Camera' }))
    const orbit = screen.getByRole('checkbox', { name: 'Automatic orbit' })
    if ((orbit as HTMLInputElement).checked) await user.click(orbit)
    expect(screen.queryByRole('spinbutton', { name: 'Orbit speed numeric value' })).not.toBeInTheDocument()
    orbit.focus()
    await user.keyboard(' ')
    expect(screen.getByRole('spinbutton', { name: 'Orbit speed numeric value' })).toHaveAttribute('max', '2')
    expect(screen.getByRole('spinbutton', { name: 'FOV numeric value' })).toHaveAttribute('min', '20')
    expect(screen.getByRole('spinbutton', { name: 'FOV numeric value' })).toHaveAttribute('max', '100')
    await user.click(screen.getByRole('button', { name: 'Effects' }))
    const bloom = screen.getByRole('checkbox', { name: 'Bloom' })
    if ((bloom as HTMLInputElement).checked) await user.click(bloom)
    expect(screen.queryByRole('spinbutton', { name: 'Strength numeric value' })).not.toBeInTheDocument()
    await user.click(bloom)
    expect(screen.getByRole('spinbutton', { name: 'Strength numeric value' })).toHaveAttribute('max', '3')
    expect(screen.getByRole('spinbutton', { name: 'Radius numeric value' })).toHaveAttribute('max', '1')
    expect(screen.getByRole('spinbutton', { name: 'Threshold numeric value' })).toHaveAttribute('max', '1')
    const tint = screen.getByRole('checkbox', { name: 'Tint' })
    if ((tint as HTMLInputElement).checked) await user.click(tint)
    expect(screen.queryByLabelText('Tint color')).not.toBeInTheDocument()
    await user.click(tint)
    fireEvent.change(screen.getByLabelText('Tint color'), { target: { value: '#112233' } })
    expect(previewDocument().settings.tint).toEqual({ enabled: true, color: '#112233' })
  })

  it('keeps an invalid numeric draft beside its field while previewing the last valid template', async () => {
    mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Camera' }))
    const field = screen.getByRole('spinbutton', { name: 'FOV numeric value' })
    field.focus()
    fireEvent.change(field, { target: { value: '200' } })
    expect(field).toHaveValue(200)
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveFocus()
    expect(within(field.closest('[data-template-field]') as HTMLElement).getByRole('alert')).toBeInTheDocument()
    expect(previewDocument().settings.camera.fov).toBe(createTemplateScene().settings.camera.fov)
    fireEvent.change(field, { target: { value: '90' } })
    expect(field).toHaveAttribute('aria-invalid', 'false')
    expect(previewDocument().settings.camera.fov).toBe(90)
  })

  it.each([
    ['settings.camera.autoRotate', 'checkbox', 'Automatic orbit'],
    ['settings.bloom.enabled', 'checkbox', 'Bloom'],
    ['settings.camera.orbitSpeed', 'spinbutton', 'Orbit speed numeric value'],
  ])('shows and focuses a server error for %s, including settings hidden by a toggle', async (path, role, label) => {
    const saved = createTemplateScene()
    saved.settings.camera.autoRotate = false
    saved.settings.bloom.enabled = false
    mockCreateScenePageFetch((url, init) => url === buildApiUrl('/scenes/12')
      ? init?.method === 'PUT'
        ? jsonResponse({ message: 'Check the scene.', details: { [`sceneData.${path}`]: 'Please correct this setting.' } }, 400)
        : jsonResponse(buildSceneEditorApiScene({ sceneData: saved })) : undefined)
    const user = userEvent.setup()
    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: 'Update scene' }))
    const field = await screen.findByRole(role, { name: label })
    await waitFor(() => expect(field).toHaveFocus())
    expect(within(field.closest('[data-template-field]') as HTMLElement).getByRole('alert')).toHaveTextContent('Please correct this setting.')
    expect(previewDocument()).toEqual(saved)
  })
})

describe('custom repair and explicit template replacement', () => {
  it('never mounts custom playback and requires acceptance before replacing source', async () => {
    const user = userEvent.setup()
    const source = await customEditor()
    expect(renderedPlayer).not.toHaveBeenCalled()
    expect(screen.getByText(/custom scene preview is not available yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pass Order' })).toBeInTheDocument()
    let raw = await openRawJson(user)
    expect(JSON.parse((raw as HTMLTextAreaElement).value)).toEqual(source)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    expect(screen.getByRole('button', { name: 'Advanced' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Basic' }))
    await user.selectOptions(screen.getByLabelText('Start from a template'), 'reaction-rings-v1')
    const dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Basic' })).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Basic' }))
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Basic' })).toHaveFocus())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    raw = await openRawJson(user)
    expect(JSON.parse((raw as HTMLTextAreaElement).value)).toEqual(source)
    expect(renderedPlayer).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Basic' }))
    await user.click(screen.getByRole('button', { name: 'Replace custom scene' }))
    expect(screen.getByRole('combobox', { name: 'Template' })).toHaveValue('reaction-rings-v1')
    expect(screen.queryByRole('button', { name: 'Pass Order' })).not.toBeInTheDocument()
    expect(previewDocument()).toEqual(createTemplateScene('reaction-rings-v1'))
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByLabelText(/scene name/i)).toHaveValue('Aurora Drift')
  })

  it('confirms imported templates too, with cancel preserving the custom source', async () => {
    const user = userEvent.setup()
    const source = await customEditor()
    const raw = await openRawJson(user)
    const imported = createTemplateScene('reaction-rings-v1')
    fireEvent.change(raw, { target: { value: JSON.stringify(imported) } })
    expect(screen.getByRole('alertdialog')).toHaveTextContent('The imported template replaces your custom code and settings.')
    expect(renderedPlayer).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(raw).toHaveFocus())
    expect(JSON.parse((raw as HTMLTextAreaElement).value)).toEqual(source)
    fireEvent.change(raw, { target: { value: JSON.stringify(imported) } })
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Replace custom scene' }))
    expect(previewDocument()).toEqual(imported)
    expect(JSON.parse((raw as HTMLTextAreaElement).value)).toEqual(imported)
  })
})
