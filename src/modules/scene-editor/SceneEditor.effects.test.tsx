import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import {
  createDefaultSceneData,
  getSceneEditorModel,
  mergeSceneEditorBranch,
  parseSceneDataJson,
  prettyPrintSceneData,
  sanitizeSceneData,
  type SceneData,
  type ScenePassId,
} from './sceneEditor'
import { describePassState, getActivePassOrder, moveActivePass, moveActivePassTo } from './utils'
import {
  buildSceneEditorApiScene,
  mockCreateScenePageFetch,
  renderEditScenePage,
  storeSceneEditorSession,
} from './test-fixtures'

vi.mock('@modules/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modules/player')>()
  const React = await import('react')
  const capture = async () => 'data:image/png;base64,cHJldmlldw=='
  return {
    ...actual,
    MagePlayer: ({ sceneBlob, onCaptureFramePreviewChange }: {
      sceneBlob: unknown
      onCaptureFramePreviewChange?: (capture: (() => Promise<string | null>) | null) => void
    }) => {
      React.useEffect(() => {
        onCaptureFramePreviewChange?.(capture)
        return () => onCaptureFramePreviewChange?.(null)
      }, [onCaptureFramePreviewChange])
      return <div data-testid="effect-preview" data-scene={JSON.stringify(sceneBlob)} />
    },
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

function savedEffectsScene(): SceneData {
  const sceneData = createDefaultSceneData()
  const model = getSceneEditorModel(sceneData)
  return {
    ...sceneData,
    fx: {
      ...model.fx,
      passOrder: ['bloom', 'copyShader', 'toonShader', 'bleachBypassShader', 'outputPass'],
      passes: { ...model.fx.passes, toon: true, bleachBypass: true },
    },
  }
}

function effectToggle(label: string) {
  const card = screen.getByRole('heading', { name: label }).closest('.effect-card-group')
  if (!(card instanceof HTMLElement)) throw new Error(`Missing ${label} effect card`)
  return within(card).getByRole('checkbox')
}

function passRow(label: string) {
  const row = screen.getByText(label, { exact: true }).closest('li')
  if (!(row instanceof HTMLElement)) throw new Error(`Missing ${label} pass row`)
  return within(row)
}

function draftScene() {
  expect(screen.getByTestId('effect-preview')).toBeInTheDocument()
  const currentSection = document.querySelector('[aria-current="step"]')?.getAttribute('aria-label') ?? 'Details'
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  const open = screen.queryByRole('button', { name: 'Show Raw JSON' })
  if (open) fireEvent.click(open)
  const sceneDocument = JSON.parse((screen.getByLabelText('Scene Data JSON') as HTMLTextAreaElement).value)
  expect(sceneDocument).toMatchObject({ schemaVersion: 1, kind: 'custom' })
  const source = sceneDocument.scene as SceneData
  if (open) fireEvent.click(screen.getByRole('button', { name: 'Hide Raw JSON' }))
  fireEvent.click(screen.getByRole('button', { name: currentSection }))
  return source
}

describe('editor effect persistence', () => {
  it('defaults both optional effects off in new and older scenes', () => {
    for (const scene of [createDefaultSceneData(), { visualizer: { shader: 'sphere(1);' } }]) {
      expect(getSceneEditorModel(scene).fx.passes).toMatchObject({ toon: false, bleachBypass: false })
      expect(getSceneEditorModel(sanitizeSceneData(scene)).fx.passes).toMatchObject({ toon: false, bleachBypass: false })
    }
  })

  it.each([[true, true], [true, false], [false, true], [false, false]])(
    'round-trips Toon=%s and Bleach Bypass=%s while retaining pass order',
    (toon, bleachBypass) => {
      const saved = savedEffectsScene()
      const model = getSceneEditorModel(saved)
      const edited = mergeSceneEditorBranch(saved, 'fx', {
        ...model.fx,
        passes: { ...model.fx.passes, toon, bleachBypass },
      })
      const roundTrip = parseSceneDataJson(prettyPrintSceneData(sanitizeSceneData(edited)))
      expect(getSceneEditorModel(roundTrip).fx.passes).toMatchObject({ toon, bleachBypass })
      expect(roundTrip).toMatchObject({ fx: {
        passes: { toon, bleachBypass },
      } })
      const order = getSceneEditorModel(roundTrip).fx.passOrder
      expect(order).toContain('copyShader')
      expect(order.at(-1)).toBe('outputPass')
    },
  )

  it('reports persisted Toon and Bleach Bypass states rather than unsupported-pass placeholders', () => {
    const disabled = getSceneEditorModel(createDefaultSceneData())
    const enabled = getSceneEditorModel(savedEffectsScene())
    for (const id of ['toonShader', 'bleachBypassShader'] as const) {
      expect(describePassState(id, disabled)).toBe('Disabled')
      expect(describePassState(id, enabled)).toBe('Enabled')
    }
  })

  it('moves adjacent active passes without disturbing hidden passes or Output', () => {
    const order: ScenePassId[] = ['bloom', 'copyShader', 'toonShader', 'bleachBypassShader', 'outputPass']
    const fx = getSceneEditorModel(savedEffectsScene()).fx
    expect(getActivePassOrder(order, fx)).toEqual(['toonShader', 'bleachBypassShader', 'outputPass'])
    const moved = moveActivePass(order, fx, 'bleachBypassShader', -1)
    expect(moved).toEqual(['bloom', 'copyShader', 'bleachBypassShader', 'toonShader', 'outputPass'])
    expect(moveActivePass(moved, fx, 'bleachBypassShader', 1)).toEqual(order)
    expect(moveActivePass(order, fx, 'bloom', -1)).toEqual(order)
    expect(moveActivePass(order, fx, 'toonShader', -1)).toEqual(order)
    expect(moveActivePass(order, fx, 'outputPass', -1)).toEqual(order)
    expect(moveActivePass(order, fx, 'copyShader', -1)).toEqual(order)
    expect(order).toEqual(['bloom', 'copyShader', 'toonShader', 'bleachBypassShader', 'outputPass'])

    const dragged = moveActivePassTo(order, fx, 'toonShader', 'bleachBypassShader')
    expect(dragged).toEqual(['bloom', 'copyShader', 'bleachBypassShader', 'toonShader', 'outputPass'])
    expect(moveActivePassTo(order, fx, 'outputPass', 'toonShader')).toEqual(order)
    expect(moveActivePassTo(order, fx, 'toonShader', 'outputPass')).toEqual(order)

    const reenabledFx = { ...fx, bloom: { ...fx.bloom, enabled: true } }
    expect(getActivePassOrder(moved, reenabledFx)).toEqual(['bloom', 'bleachBypassShader', 'toonShader', 'outputPass'])
    expect(getActivePassOrder(order, { ...fx, passes: { ...fx.passes, outputPass: false, toon: false, bleachBypass: false } })).toEqual([])
  })
})

describe('editor Toon and Bleach Bypass controls', () => {
  it.each(['mage-pulse', 'classic-facebook'] as const)(
    'excludes Output from the optional-effect budget and restores its saved controls in %s', async (theme) => {
      storeSceneEditorSession()
      mockCreateScenePageFetch(input => input === buildApiUrl('/scenes/12')
        ? jsonResponse(buildSceneEditorApiScene({ sceneData: createDefaultSceneData(), tags: [] })) : undefined)
      const user = userEvent.setup()
      renderEditScenePage(undefined, theme)
      await screen.findByLabelText(/scene name/i)
      await user.click(screen.getByRole('button', { name: 'Effects' }))

      const output = effectToggle('Output Pass')
      expect(output).toBeChecked()
      expect(screen.getByText('0/4 enabled')).toBeInTheDocument()
      await user.selectOptions(screen.getByLabelText('Tone Mapping'), '2')
      fireEvent.change(screen.getByLabelText('Exposure numeric value'), { target: { value: '2.4' } })
      await user.click(output)
      expect(screen.queryByLabelText('Tone Mapping')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Exposure numeric value')).not.toBeInTheDocument()
      expect(screen.getByText('0/4 enabled')).toBeInTheDocument()

      for (const label of ['Bloom', 'Toon', 'Bleach Bypass', 'RGB Shift']) await user.click(effectToggle(label))
      expect(screen.getByText('4/4 enabled')).toBeInTheDocument()
      expect(output).toBeEnabled()
      await user.click(output)
      expect(screen.getByLabelText('Tone Mapping')).toHaveValue('2')
      expect(screen.getByLabelText('Exposure numeric value')).toHaveValue(2.4)
      expect(screen.getByText('4/4 enabled')).toBeInTheDocument()
    },
  )

  it('updates custom source, pass status, and confirmation without playback when either card changes', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch(input => input === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: createDefaultSceneData(), tags: [] })) : undefined)
    const user = userEvent.setup()
    renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Effects' }))
    expect(effectToggle('Toon')).not.toBeChecked()
    expect(effectToggle('Bleach Bypass')).not.toBeChecked()
    expect(screen.queryByText('Copy Shader', { exact: true })).not.toBeInTheDocument()

    await user.click(effectToggle('Toon'))
    await user.click(effectToggle('Bleach Bypass'))
    expect(getSceneEditorModel(draftScene()).fx.passes).toMatchObject({ toon: true, bleachBypass: true })
    await user.click(screen.getByRole('button', { name: 'Pass Order' }))
    expect(passRow('Toon').getByText('Enabled')).toBeInTheDocument()
    expect(passRow('Bleach Bypass').getByText('Enabled')).toBeInTheDocument()
    expect(screen.queryByText('Copy Shader', { exact: true })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Effects' }))
    await user.click(effectToggle('Toon'))
    expect(getSceneEditorModel(draftScene()).fx.passes).toMatchObject({ toon: false, bleachBypass: true })
    await user.click(screen.getByRole('button', { name: 'Pass Order' }))
    expect(screen.queryByText('Toon', { exact: true })).not.toBeInTheDocument()
    expect(passRow('Bleach Bypass').getByText('Enabled')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(within(screen.getByRole('region', { name: 'Scene review' })).getByRole('button', { name: /5 Effects/i }))
    expect(screen.getByText('Bleach Bypass', { exact: true })).toBeInTheDocument()
    expect(screen.queryByText('Toon', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText('Copy Shader', { exact: true })).not.toBeInTheDocument()
  }, 60_000)

  it('shows Output as the only default pass and a clear empty state when Output is disabled', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch(input => input === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: createDefaultSceneData(), tags: [] })) : undefined)
    const user = userEvent.setup()
    renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Pass Order' }))
    expect(screen.getByText('1 active pass')).toBeInTheDocument()
    expect(passRow('Output').getByText(/always last/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /move output/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Bloom', { exact: true })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Effects' }))
    await user.click(effectToggle('Output Pass'))
    await user.click(screen.getByRole('button', { name: 'Pass Order' }))
    expect(screen.getByText('0 active passes')).toBeInTheDocument()
    expect(screen.getByText('No active passes')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Active effect pass order' })).not.toBeInTheDocument()
  })

  it('includes both enabled flags in the custom repair update request', async () => {
    storeSceneEditorSession()
    let created: unknown
    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/scenes/12') && init?.method === 'PUT') {
        created = JSON.parse(String(init.body))
        return jsonResponse(buildSceneEditorApiScene({ sceneData: createDefaultSceneData(), tags: [] }))
      }
      if (input === buildApiUrl('/scenes/12')) return jsonResponse(buildSceneEditorApiScene({ sceneData: createDefaultSceneData(), tags: [] }))
    })
    const user = userEvent.setup()
    renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByLabelText(/scene name/i)
    fireEvent.change(screen.getByLabelText(/scene name/i), { target: { value: 'Ink and Silver' } })
    await user.click(screen.getByRole('button', { name: 'Effects' }))
    await user.click(effectToggle('Toon'))
    await user.click(effectToggle('Bleach Bypass'))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^update scene$/i }))
    await waitFor(() => expect(created).toMatchObject({
      name: 'Ink and Silver',
      tagIds: [],
      sceneData: { schemaVersion: 1, kind: 'custom', scene: { fx: { passes: { toon: true, bleachBypass: true } } } },
    }))
    expect(await screen.findByText('My Scenes')).toBeInTheDocument()
  })

  it('loads saved flags, reorders active neighbors across hidden passes, and saves changed flags', async () => {
    storeSceneEditorSession()
    const scene = buildSceneEditorApiScene({ sceneData: savedEffectsScene(), tags: [] })
    let updated: unknown
    mockCreateScenePageFetch((input, init) => {
      if (input !== buildApiUrl('/scenes/12')) return
      if (!init?.method || init.method === 'GET') return jsonResponse(scene)
      if (init.method === 'PUT') {
        updated = JSON.parse(String(init.body))
        return jsonResponse(scene)
      }
    })
    const user = userEvent.setup()
    renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Effects' }))
    expect(effectToggle('Toon')).toBeChecked()
    expect(effectToggle('Bleach Bypass')).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Pass Order' }))
    expect(screen.queryByText('Copy Shader', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Drag Toon to reorder')).toHaveAttribute('title', 'Drag to reorder')
    expect(screen.getByLabelText('Drag Bleach Bypass to reorder')).toHaveAttribute('title', 'Drag to reorder')
    expect(screen.queryByText('Output is pinned to the end of the stack and cannot be moved.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Move Bleach Bypass up' }))
    const preview = getSceneEditorModel(draftScene())
    expect(preview.fx.passOrder.slice(0, 4)).toEqual(['bloom', 'copyShader', 'bleachBypassShader', 'toonShader'])
    expect(preview.fx.passOrder.at(-1)).toBe('outputPass')
    expect(screen.getByRole('button', { name: 'Move Bleach Bypass up' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Move Output up' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move Output down' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Effects' }))
    await user.click(effectToggle('Toon'))
    await user.click(screen.getByRole('button', { name: 'Pass Order' }))
    expect(screen.queryByText('Toon', { exact: true })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^update scene$/i }))
    await waitFor(() => expect(updated).toMatchObject({ tagIds: [], sceneData: { schemaVersion: 1, kind: 'custom', scene: { fx: {
      passes: { toon: false, bleachBypass: true },
    } } } }))
    expect(await screen.findByText('My Scenes')).toBeInTheDocument()
  })
})

// These editor workflows exercise fields/submission with explicit playback permission.
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})
