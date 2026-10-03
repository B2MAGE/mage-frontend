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
  const React = await import('react')
  return { ...actual, MagePlayer: (props: import('@modules/player').MagePlayerProps) => {
    const { sceneBlob, onAudioResponseCapabilitiesChange } = props
    React.useEffect(() => {
      onAudioResponseCapabilitiesChange?.(sceneBlob ? {
        sceneBlob,
        capabilities: { mode: 'mapped-v1', signals: ['bass-hit'], targets: ['size'], supportedTargets: ['size'], unsupportedTargets: [], warnings: [] },
      } : null)
    }, [sceneBlob, onAudioResponseCapabilitiesChange])
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
    expect(screen.getByRole('button', { name: 'Pass Order' })).toBeInTheDocument()
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
    expect(screen.getByRole('spinbutton', { name: 'Scene Scale numeric value' })).toHaveAttribute('max', '200')
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    expect(screen.queryByRole('group', { name: 'Creation mode' })).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Animation speed' })).toHaveAttribute('max', '10')
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
    expect(screen.getByRole('spinbutton', { name: 'Orbit speed numeric value' })).toHaveAttribute('max', '50')
    expect(screen.getByRole('spinbutton', { name: 'FOV numeric value' })).toHaveAttribute('min', '1')
    expect(screen.getByRole('spinbutton', { name: 'FOV numeric value' })).toHaveAttribute('max', '179')
    await user.click(screen.getByRole('button', { name: 'Effects' }))
    const bloom = screen.getByRole('checkbox', { name: 'Bloom' })
    if ((bloom as HTMLInputElement).checked) await user.click(bloom)
    expect(screen.queryByRole('spinbutton', { name: 'Strength numeric value' })).not.toBeInTheDocument()
    await user.click(bloom)
    expect(screen.getByRole('spinbutton', { name: 'Strength numeric value' })).toHaveAttribute('max', '10')
    expect(screen.getByRole('spinbutton', { name: 'Radius numeric value' })).toHaveAttribute('max', '10')
    expect(screen.getByRole('spinbutton', { name: 'Threshold numeric value' })).toHaveAttribute('max', '10')
    const tint = screen.getByRole('checkbox', { name: 'Colorify' })
    if ((tint as HTMLInputElement).checked) await user.click(tint)
    expect(screen.queryByLabelText('Color')).not.toBeInTheDocument()
    await user.click(tint)
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#112233' } })
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

  it('edits the full Basic camera settings and preserves integer summary values without adding source', async () => {
    mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Camera' }))
    fireEvent.change(screen.getByLabelText('Camera Position X'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('FOV numeric value'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Camera Target Y'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Zoom', { exact: true }), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Camera Orientation numeric value'), { target: { value: '90' } })
    await user.click(screen.getByRole('button', { name: 'Show advanced camera controls' }))
    fireEvent.change(screen.getByLabelText('Camera Orientation Mode'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Camera Orientation Speed'), { target: { value: '0.8' } })
    expect(previewDocument().settings).toMatchObject({
      controls: { position0: { x: 12 }, target0: { y: 4 }, zoom0: 2 },
      camera: { fov: 100, tilt: Math.PI / 2, orientationMode: 2, orientationSpeed: 0.8 },
    })
    const draft = previewDocument()
    expect(draft.kind).toBe('template')
    expect(JSON.stringify(draft)).not.toContain('"shader"')
    const raw = await openRawJson(user)
    expect(JSON.parse((raw as HTMLTextAreaElement).value)).toEqual(draft)
    expect(screen.getByText('7 · Confirm')).toBeInTheDocument()
    expect(draft.parameters.scale).toBe(10)
    expect(screen.getByText('Scale', { selector: 'dt' }).nextElementSibling).toHaveTextContent(/^10$/)
    expect(screen.getByText('FOV', { selector: 'dt' }).nextElementSibling).toHaveTextContent(/^100$/)
  })

  it('edits both Basic music response versions while keeping simulated beats out of the saved template', async () => {
    mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Motion' }))
    fireEvent.change(screen.getByLabelText('Animation speed', { exact: true }), { target: { value: '1.5' } })
    await user.click(screen.getByRole('button', { name: 'Show advanced animation controls' }))
    fireEvent.change(screen.getByLabelText('Starting animation time'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Input gain numeric value'), { target: { value: '0.7' } })
    await user.click(screen.getByRole('button', { name: 'Show advanced music controls' }))
    fireEvent.change(screen.getByLabelText('Response offset'), { target: { value: '0.4' } })
    await user.selectOptions(screen.getByLabelText('Response mode'), 'mapped-v1')
    await user.selectOptions(screen.getByLabelText('Frequency focus'), 'bass')
    fireEvent.change(screen.getByLabelText('Amount numeric value'), { target: { value: '0.17' } })
    fireEvent.change(screen.getByLabelText('Hit sensitivity numeric value'), { target: { value: '1.2' } })
    await user.selectOptions(screen.getByLabelText('Response style'), 'flowing')
    expect(previewDocument()).toMatchObject({ parameters: { speed: 1.5 }, settings: {
      motion: { minimizing_factor: 0.7 }, state: { time: 8, volume_multiplier: 0.4 }, audioResponse: 'mapped-v1',
      audioResponseConfig: { sensitivity: 1.2, mappings: [{ target: 'size', source: 'bass-hit', amount: 0.17, attack: 0.2, release: 1 }] },
    } })
    const beforeSimulation = previewDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Simulate beat' }))
    expect(previewDocument()).toEqual(beforeSimulation)
    expect(beforeSimulation.kind).toBe('template')
    expect(JSON.stringify(beforeSimulation)).not.toContain('"shader"')
  })

  it('retains all Basic effects and pass ordering with the shared four-effect budget', async () => {
    mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Effects' }))
    expect(screen.getAllByRole('checkbox').map(control => control.getAttribute('aria-label'))).toEqual(expect.arrayContaining([
      'Bloom', 'RGB Shift', 'Afterimage', 'Colorify', 'Kaleidoscope', 'Glitch', 'Dot Screen', 'Technicolor', 'Luminosity', 'Bleach Bypass', 'Toon', 'Sobel', 'Halftone', 'Gamma Correction',
    ]))
    if (!(screen.getByRole('checkbox', { name: 'Bloom' }) as HTMLInputElement).checked) await user.click(screen.getByRole('checkbox', { name: 'Bloom' }))
    fireEvent.change(screen.getByLabelText('Radius numeric value'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Exposure numeric value'), { target: { value: '1.7' } })
    await user.click(screen.getByRole('checkbox', { name: 'RGB Shift' }))
    fireEvent.change(screen.getByLabelText('Shift Amount numeric value'), { target: { value: '0.02' } })
    await user.click(screen.getByRole('checkbox', { name: 'Afterimage' }))
    await user.click(screen.getByRole('checkbox', { name: 'Colorify' }))
    expect(screen.getByRole('checkbox', { name: 'Glitch' })).toBeDisabled()
    expect(previewDocument().settings).toMatchObject({ bloom: { radius: 2 }, tint: { enabled: true }, effects: {
      toneMapping: { exposure: 1.7 }, passes: { rgbShift: true, afterImage: true }, params: { rgbShift: { amount: 0.02 } },
    } })

    await user.click(screen.getByRole('button', { name: 'Pass Order' }))
    await user.click(screen.getByRole('button', { name: 'Move RGB Shift up' }))
    expect(previewDocument().settings.effects.passOrder).toContain('RGBShift')
    expect(screen.getByRole('button', { name: 'Move Output up' })).toBeDisabled()
    const draft = previewDocument()
    expect(draft.kind).toBe('template')
    expect(JSON.stringify(draft)).not.toContain('"shader"')
    const raw = await openRawJson(user)
    expect(JSON.parse((raw as HTMLTextAreaElement).value)).toEqual(draft)
    expect(screen.getByText('7 · Confirm')).toBeInTheDocument()
  })

  it.each([
    ['settings.camera.autoRotate', 'checkbox', 'Automatic orbit'],
    ['settings.bloom.enabled', 'checkbox', 'Bloom'],
    ['settings.camera.orbitSpeed', 'spinbutton', 'Orbit speed numeric value'],
    ['settings.camera.orientationSpeed', 'spinbutton', 'Camera Orientation Speed'],
    ['settings.controls.position0.x', 'spinbutton', 'Camera Position X'],
    ['settings.effects.params.rgbShift.amount', 'spinbutton', 'Shift Amount numeric value'],
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
    expect(screen.getByRole('button', { name: 'Pass Order' })).toBeInTheDocument()
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
