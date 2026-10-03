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
import { describePassState, getVisiblePassOrder, moveVisiblePass } from './utils'
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
  const source = JSON.parse((screen.getByLabelText('Scene Data JSON') as HTMLTextAreaElement).value) as SceneData
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

  it('moves adjacent visible passes across hidden Copy without moving Copy or Output', () => {
    const order: ScenePassId[] = ['bloom', 'copyShader', 'toonShader', 'bleachBypassShader', 'outputPass']
    expect(getVisiblePassOrder(order)).toEqual(['bloom', 'toonShader', 'bleachBypassShader', 'outputPass'])
    const moved = moveVisiblePass(order, 'toonShader', -1)
    expect(moved).toEqual(['toonShader', 'copyShader', 'bloom', 'bleachBypassShader', 'outputPass'])
    expect(moveVisiblePass(moved, 'toonShader', 1)).toEqual(order)
    expect(moveVisiblePass(order, 'bloom', -1)).toEqual(order)
    expect(moveVisiblePass(order, 'bleachBypassShader', 1)).toEqual(order)
    expect(moveVisiblePass(order, 'outputPass', -1)).toEqual(order)
    expect(moveVisiblePass(order, 'copyShader', -1)).toEqual(order)
    expect(order).toEqual(['bloom', 'copyShader', 'toonShader', 'bleachBypassShader', 'outputPass'])
  })
})

describe('editor Toon and Bleach Bypass controls', () => {
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
    expect(passRow('Toon').getByText('Disabled')).toBeInTheDocument()
    expect(passRow('Bleach Bypass').getByText('Enabled')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(screen.getByText('Bleach Bypass', { exact: true })).toBeInTheDocument()
    expect(screen.queryByText('Toon', { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText('Copy Shader', { exact: true })).not.toBeInTheDocument()
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
      if (input === buildApiUrl('/scenes/12/tags')) return jsonResponse([])
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
      sceneData: { schemaVersion: 1, kind: 'custom', scene: { fx: { passes: { toon: true, bleachBypass: true } } } },
    }))
    expect(await screen.findByText('My Scenes')).toBeInTheDocument()
  })

  it('loads saved flags, reorders across hidden Copy, and saves changed flags', async () => {
    storeSceneEditorSession()
    const scene = buildSceneEditorApiScene({ sceneData: savedEffectsScene(), tags: [] })
    let updated: unknown
    mockCreateScenePageFetch((input, init) => {
      if (input === buildApiUrl('/scenes/12/tags') && init?.method === 'PUT') return jsonResponse([])
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
    await user.click(effectToggle('Toon'))
    await user.click(screen.getByRole('button', { name: 'Pass Order' }))
    expect(screen.queryByText('Copy Shader', { exact: true })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Move Toon up' }))
    const preview = getSceneEditorModel(draftScene())
    expect(preview.fx.passOrder.slice(0, 4)).toEqual(['toonShader', 'copyShader', 'bloom', 'bleachBypassShader'])
    expect(preview.fx.passOrder.at(-1)).toBe('outputPass')
    expect(screen.getByRole('button', { name: 'Move Toon up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Output up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Output down' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^update scene$/i }))
    await waitFor(() => expect(updated).toMatchObject({ sceneData: { schemaVersion: 1, kind: 'custom', scene: { fx: {
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
