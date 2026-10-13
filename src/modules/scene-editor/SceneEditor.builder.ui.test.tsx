import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { createBuilderScene } from './builderEditor'
import { BUILDER_SHADER_TEMPLATE_VALUE } from './ui/SceneSetupControls'
import { buildSceneEditorApiScene, mockCreateScenePageFetch, renderCreateScenePage, renderEditScenePage, storeSceneEditorSession } from './test-fixtures'

const renderedPlayer = vi.fn()
vi.mock('@modules/player', async original => {
  const actual = await original<typeof import('@modules/player')>()
  return { ...actual, MagePlayer: (props: import('@modules/player').MagePlayerProps) => {
    renderedPlayer(props)
    return <div data-testid="builder-preview" data-scene={JSON.stringify(props.sceneBlob)} />
  } }
})
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})

beforeEach(() => { renderedPlayer.mockClear(); storeSceneEditorSession(); mockCreateScenePageFetch() })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

const preview = () => JSON.parse(screen.getByTestId('builder-preview').getAttribute('data-scene')!)

describe('Scene Builder object editor', () => {
  it('opens supported templates directly and labels only the adapted draft without renaming the scene', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.type(screen.getByLabelText(/scene name/i), 'My scene')
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    const template = screen.getByLabelText('Template')
    expect(screen.getByRole('heading', { name: 'Builder workspace' })).toBeInTheDocument()
    expect(template).toHaveDisplayValue('Prism Core')
    await user.selectOptions(template, 'embedded-scene-5')
    await screen.findByRole('heading', { name: 'Builder workspace' })
    expect(template).toHaveDisplayValue('Alloy Capsule')
    expect(screen.queryByRole('button', { name: 'Customize in Builder' })).not.toBeInTheDocument()
    await waitFor(() => expect(preview()).toMatchObject({ kind: 'builder', objects: expect.arrayContaining([
      expect.objectContaining({ id: 'recipe-5-object-1' }),
    ]) }))
    const original = preview()
    // An unchanged catalog template can be browsed without a replacement warning.
    await user.selectOptions(template, 'embedded-scene-1')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(template).toHaveDisplayValue('Steel Lattice')
    await user.selectOptions(template, 'embedded-scene-5')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(preview()).toEqual(original))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My motion' } })
    await waitFor(() => expect(template).toHaveDisplayValue('Alloy Capsule Adaptation (Unsaved)'))
    expect(within(screen.getByRole('group', { name: 'Your templates' })).getByRole('option', {
      name: 'Alloy Capsule Adaptation (Unsaved)',
    })).toHaveProperty('selected', true)
    expect(within(template).getByRole('option', { name: /^Alloy Capsule$/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(template).toHaveDisplayValue('Alloy Capsule')
    expect(within(template).queryByRole('option', { name: 'Alloy Capsule Adaptation (Unsaved)' })).not.toBeInTheDocument()
    await waitFor(() => expect(preview()).toEqual(original))
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(template).toHaveDisplayValue('Alloy Capsule Adaptation (Unsaved)')
    await user.selectOptions(template, 'embedded-scene-5')
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('Name')).toHaveValue('My motion')
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByLabelText(/scene name/i)).toHaveValue('My scene')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: 'Show Raw JSON' }))
    const savedDocument = JSON.parse((screen.getByLabelText('Scene Data JSON') as HTMLTextAreaElement).value)
    expect(savedDocument.kind).toBe('builder')
    expect(savedDocument).not.toHaveProperty('templateSourceId')
    expect(savedDocument.composition.groups[0].name).toBe('My motion')
  }, 30_000)

  it('retains invalid modifier, arrangement and spin drafts while keeping the last valid preview', async () => {
    const builder = createBuilderScene()
    builder.objects[0].modifiers = [{ type: 'shell', thickness: 0.1 }]
    builder.objects[0].arrangements = [{ type: 'linear', axis: 'x', count: 2, spacing: 1 }]
    builder.objects[0].motion = { type: 'spin', axis: 'y', speed: 1 }
    mockCreateScenePageFetch(url => url === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: builder })) : undefined)
    const user = userEvent.setup()
    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    const validPreview = preview()
    for (const [section, toggle, label, invalid, repaired] of [
      ['Modifiers', 'Expand Shell modifier 1', 'Thickness', '-1', '0.1'],
      ['Arrangement', null, 'Count', '33', '2'],
      ['Animation', 'Expand Spin animation', 'Speed numeric value', '100', '1'],
    ] as const) {
      await user.click(screen.getByRole('heading', { name: section, level: 4 }).closest('summary')!)
      if (toggle) await user.click(screen.getByRole('button', { name: toggle }))
      const input = screen.getByLabelText(label)
      fireEvent.change(input, { target: { value: invalid } })
      expect(input).toHaveValue(Number(invalid))
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(document.getElementById(input.getAttribute('aria-describedby')!)).toHaveTextContent(/expected|must|between|maximum|copies/i)
      expect(preview()).toEqual(validPreview)
      await user.click(screen.getByRole('button', { name: 'Camera' }))
      await user.click(screen.getByRole('button', { name: 'Scene' }))
      const restored = screen.getByLabelText(label)
      expect(restored).toBeVisible()
      expect(restored).toHaveValue(Number(invalid))
      restored.focus()
      expect(restored).toHaveFocus()
      fireEvent.change(restored, { target: { value: repaired } })
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'false')
    }
    await waitFor(() => expect(preview()).toEqual(validPreview))
  }, 60_000)

  it('starts a New Template beside shared scene controls and guards replacing its objects', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    const template = screen.getByLabelText('Template')
    expect(screen.queryByText('Creation mode')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Custom Code' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Scene settings', level: 3 })).toHaveClass('scene-effects-category__title')
    await user.click(screen.getByRole('button', { name: 'Template actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'New template' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(template).toBeEnabled()
    expect(template).toHaveValue(BUILDER_SHADER_TEMPLATE_VALUE)
    expect(within(screen.getByRole('group', { name: 'Your templates' })).getByRole('option', {
      name: 'New Template (Unsaved)',
    })).toHaveProperty('selected', true)
    expect(screen.queryByLabelText('Starting style')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Skybox')).toHaveLength(1)
    expect(screen.getAllByLabelText('Scene Scale numeric value')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Builder workspace', level: 3 })).toBeInTheDocument()
    const workspace = screen.getByRole('heading', { name: 'Objects', level: 3 }).closest('.builder-workspace')
    expect(workspace).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Objects', level: 3 })).toHaveClass('builder-object-section__title')
    expect(screen.getByRole('heading', { name: 'Selected object', level: 3 })).toHaveClass('builder-object-editor__title')
    for (const name of ['Size', 'Transform', 'Appearance']) {
      expect(screen.getByRole('heading', { name, level: 4 })).toHaveClass('builder-object-editor__subheading')
    }
    expect(screen.getByRole('heading', { name: 'Transform', level: 4 }).closest('details')).not.toHaveAttribute('open')
    expect(screen.getByRole('heading', { name: 'Size', level: 4 }).closest('details')).not.toHaveAttribute('open')
    expect(screen.getByText('Position 0, 0, 0 · Scale 1×')).toBeInTheDocument()
    await waitFor(() => expect(preview()).toMatchObject({ kind: 'builder', parameters: { scale: 1 }, objects: [{ material: { color: '#8066ff' } }] }))

    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Draft orb')
    const builderDraft = preview()
    await user.selectOptions(template, 'embedded-scene-2')
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent(/replaces every Builder object/i)
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(template).toHaveValue(BUILDER_SHADER_TEMPLATE_VALUE)
    await waitFor(() => expect(preview()).toEqual(builderDraft))
    await user.tab()
    expect(within(dialog).getByRole('button', { name: /^Use / })).toHaveFocus()
    await user.tab({ shift: true })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(template).toHaveFocus())
    expect(screen.getByLabelText('Name')).toHaveValue('Draft orb')
    await waitFor(() => expect(preview()).toEqual(builderDraft))

    await user.selectOptions(template, 'embedded-scene-1')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(template).toHaveFocus())
    await waitFor(() => expect(preview()).toEqual(builderDraft))
    await user.selectOptions(template, 'embedded-scene-1')
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /^Use / }))
    expect(template).toBeEnabled()
    expect(template).toHaveValue('embedded-scene-1')
    await waitFor(() => {
      expect(preview()).toMatchObject({ kind: 'builder', parameters: { scale: 10 } })
      expect(preview().objects).toHaveLength(4)
    })
    expect(screen.getByLabelText('Scene Scale numeric value')).toHaveValue(10)
    await user.selectOptions(template, 'embedded-scene-2')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(preview()).toMatchObject({ kind: 'builder', objects: expect.arrayContaining([
      expect.objectContaining({ id: 'recipe-2-object-1' }),
    ]) }))
    expect(screen.getByRole('heading', { name: 'Builder workspace' })).toBeInTheDocument()
  })

  it('converts a template starting point and edits objects without hiding scene-wide controls', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Template actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'New template' }))

    await waitFor(() => expect(preview()).toMatchObject({ kind: 'builder', objects: [{ id: 'object-1', operation: { type: 'sphere' } }] }))
    expect(screen.getByLabelText('Template')).toHaveDisplayValue('New Template (Unsaved)')
    expect(screen.queryByLabelText('Custom Shader')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Shape', { selector: '#builder-add-shape' }), 'box')
    await user.click(screen.getByRole('button', { name: 'Add object' }))
    const objectList = screen.getByRole('group', { name: 'Scene objects' })
    expect(within(objectList).getAllByRole('button', { name: /, (Sphere|Box)$/ })).toHaveLength(2)
    await user.click(within(objectList).getByRole('button', { name: /Box 2, Box/ }))
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Backdrop')
    await user.click(screen.getByRole('heading', { name: 'Transform', level: 4 }).closest('summary')!)
    await user.click(screen.getByRole('button', { name: 'Expand Position transform' }))
    fireEvent.change(screen.getByLabelText('Position X'), { target: { value: '4' } })
    await user.click(screen.getByRole('heading', { name: 'Size', level: 4 }).closest('summary')!)
    await user.click(screen.getByRole('button', { name: 'Expand Width size' }))
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '3' } })
    await user.click(screen.getByRole('heading', { name: 'Appearance', level: 4 }).closest('summary')!)
    await user.click(screen.getByRole('button', { name: 'Expand Color appearance' }))
    const colorCode = screen.getByLabelText('Color code')
    await user.clear(colorCode)
    await user.type(colorCode, '112233')
    expect(screen.getByRole('heading', { name: 'Appearance', level: 4 }).closest('details')).toHaveAttribute('open')
    expect(screen.getByLabelText('Color code')).toHaveValue('#112233')

    await waitFor(() => expect(preview().objects[1]).toMatchObject({
      id: 'object-2', name: 'Backdrop', operation: { type: 'box', width: 3 },
      transform: { position: { x: 4 } }, material: { color: '#112233' },
    }))
    expect(screen.queryByRole('menuitem', { name: 'Duplicate' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Object options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    await waitFor(() => expect(preview().objects.map((object: { id: string }) => object.id)).toEqual(['object-1', 'object-2', 'object-3']))
    expect(within(screen.getByRole('group', { name: 'Scene objects' })).getByRole('button', { name: /^Backdrop copy, Box$/ })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Camera' }))
    fireEvent.change(screen.getByLabelText('Camera Position X'), { target: { value: '8' } })
    await waitFor(() => expect(preview()).toMatchObject({ kind: 'builder', settings: { controls: { position0: { x: 8 } } } }))

    await user.click(screen.getByRole('button', { name: 'Scene' }))
    const beforeReplacement = preview()
    await user.click(screen.getByRole('button', { name: 'Template actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'New template' }))
    const replacement = screen.getByRole('alertdialog')
    await user.click(within(replacement).getByRole('button', { name: 'Cancel' }))
    expect(preview()).toEqual(beforeReplacement)
    await user.click(screen.getByRole('button', { name: 'Template actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'New template' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Use New Template' }))
    await waitFor(() => expect(preview()).toMatchObject({ kind: 'builder', objects: [{ id: 'object-1', name: 'Sphere 1' }] }))
    expect(screen.queryByText('Backdrop')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview()).toEqual(beforeReplacement))
  }, 60_000)

  it('opens a saved Builder document directly and retains it in raw JSON', async () => {
    const user = userEvent.setup()
    const document = createBuilderScene('embedded-scene-0')
    mockCreateScenePageFetch(url => url === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: document })) : undefined)
    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    expect(screen.getByLabelText('Template')).toHaveDisplayValue('New Template (Unsaved)')
    expect(screen.getByLabelText('Template')).toBeEnabled()
    expect(screen.getByLabelText('Template')).toHaveValue(BUILDER_SHADER_TEMPLATE_VALUE)
    expect(screen.getByText('Sphere 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: 'Show Raw JSON' }))
    expect(JSON.parse((screen.getByLabelText('Scene Data JSON') as HTMLTextAreaElement).value)).toEqual(document)
  })

  it('edits bounded modifiers, nested arrangements, and object animation in the live preview', async () => {
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('button', { name: 'Template actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'New template' }))

    await user.click(screen.getByRole('heading', { name: 'Modifiers', level: 4 }).closest('summary')!)
    await user.selectOptions(screen.getByLabelText('Modifier'), 'shell')
    await user.click(screen.getByRole('button', { name: 'Add modifier' }))
    fireEvent.change(screen.getByLabelText('Thickness'), { target: { value: '0.2' } })
    await user.selectOptions(screen.getByLabelText('Modifier'), 'twist')
    await user.click(screen.getByRole('button', { name: 'Add modifier' }))
    await user.selectOptions(screen.getByLabelText('Axis', { selector: '#builder-modifier-1-axis' }), 'z')
    fireEvent.change(screen.getByLabelText('Twist'), { target: { value: '1.5' } })
    expect(screen.getByRole('button', { name: 'Expand Shell modifier 1' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Collapse Twist modifier 2' })).toHaveAttribute('aria-expanded', 'true')
    const twistInfo = screen.getByRole('button', { name: 'Why Twist may not be visible on a sphere' })
    expect(twistInfo).toBeInTheDocument()
    expect(document.getElementById(twistInfo.getAttribute('aria-describedby')!)).toHaveTextContent('A sphere is symmetrical')
    await user.click(screen.getByRole('heading', { name: 'Arrangement', level: 4 }).closest('summary')!)
    await user.selectOptions(screen.getByLabelText('Arrangement'), 'linear')
    await user.click(screen.getByRole('button', { name: 'Add arrangement' }))
    for (const count of ['2', '6', '4']) fireEvent.change(screen.getByLabelText('Count'), { target: { value: count } })
    fireEvent.change(screen.getByLabelText('Spacing'), { target: { value: '2.5' } })
    expect(screen.getByLabelText('Line summary')).toHaveTextContent('Count: 4Spacing: 2.5')
    await user.click(screen.getByRole('button', { name: 'Collapse Line arrangement 1' }))
    expect(screen.queryByLabelText('Count')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expand Line arrangement 1' }))
    await user.selectOptions(screen.getByLabelText('Arrangement'), 'radial')
    await user.click(screen.getByRole('button', { name: 'Add arrangement' }))
    expect(screen.getByRole('button', { name: 'Expand Line arrangement 1' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Collapse Ring arrangement 2' })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: 'Expand Line arrangement 1' }))
    expect(screen.getByRole('button', { name: 'Collapse Line arrangement 1' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Expand Ring arrangement 2' })).toHaveAttribute('aria-expanded', 'false')
    await user.click(screen.getByRole('button', { name: 'Expand Ring arrangement 2' }))
    await user.click(screen.getByRole('button', { name: 'Remove Ring arrangement 2' }))
    await user.click(screen.getByRole('heading', { name: 'Animation', level: 4 }).closest('summary')!)
    expect(screen.queryByRole('button', { name: 'Expand Spin animation' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add spin' }))
    await user.selectOptions(screen.getByLabelText('Property'), 'rotation.z')
    fireEvent.change(screen.getByLabelText('Speed numeric value'), { target: { value: '1.25' } })
    expect(screen.getByText(/A plain sphere has no obvious orientation/)).toBeInTheDocument()
    expect(screen.queryByText('Spin speed is capped and stays inside this object’s isolated transform.')).not.toBeInTheDocument()

    await waitFor(() => expect(preview().objects[0]).toMatchObject({
      modifiers: [{ type: 'shell', thickness: 0.2 }, { type: 'twist', axis: 'z', amount: 1.5 }],
      arrangements: [{ type: 'linear', axis: 'x', count: 4, spacing: 2.5 }],
      motion: { type: 'none' },
      drivers: [{ target: 'rotation.z', mode: 'add', expression: { type: 'add', left: { type: 'multiply', left: { type: 'input', source: 'time' }, right: { type: 'constant', value: 1.25 } } } }],
    }))
    expect(screen.getByText('4 of 16 rendered copies used. Two arrangement stages may be nested.')).toBeInTheDocument()
  }, 60_000)
})
