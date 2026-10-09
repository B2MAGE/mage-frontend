import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MagePlayerProps } from '@modules/player'
import { buildApiUrl, normalizeAudioResponseConfig, type AudioResponseTarget } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { createDefaultSceneData, type SceneData } from './sceneEditor'
import { createTemplateScene } from './templateEditor'
import { readEditableSceneData } from './utils'
import { buildSceneEditorApiScene, mockCreateScenePageFetch, renderEditScenePage, storeSceneEditorSession } from './test-fixtures'

const playerRender = vi.fn<(props: MagePlayerProps) => void>()
const playerMount = vi.fn()
vi.mock('@modules/player', async original => {
  const actual = await original<typeof import('@modules/player')>()
  const React = await import('react')
  return { ...actual, MagePlayer: (props: MagePlayerProps) => {
    playerRender(props)
    React.useEffect(() => { playerMount() }, [])
    return <div data-testid="capabilities-preview" />
  } }
})
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})

const savedConfig = normalizeAudioResponseConfig({ version: 1, sensitivity: 1.7, mappings: [
  { target: 'size', source: 'bass-hit', amount: 1.1, attack: 0.13, release: 0.71 },
  { target: 'bass', source: 'mid-level', amount: 2.3, attack: 0.23, release: 0.83 },
  { target: 'audioHit', source: 'treble-hit', amount: 0.9, attack: 0.19, release: 0.49 },
] }).config
function customScene(): SceneData {
  const defaults = createDefaultSceneData()
  return { ...defaults, visualizer: { ...(defaults.visualizer as object), shader: 'sphere(0.7)' },
    audioResponse: 'mapped-v1', audioResponseConfig: structuredClone(savedConfig) }
}
function latestPlayer() { return playerRender.mock.lastCall![0] }
function publish(targets: AudioResponseTarget[] | null, source = latestPlayer().sceneBlob) {
  act(() => latestPlayer().onAudioResponseCapabilitiesChange?.(targets && source ? {
    sceneBlob: source,
    capabilities: { mode: 'mapped-v1', signals: ['bass-hit', 'mid-level'], targets,
      supportedTargets: targets, unsupportedTargets: [], warnings: [] },
  } : null))
}
function section(name: string) { fireEvent.click(screen.getByRole('button', { name })) }
function exportedScene() {
  section('Confirm')
  const show = screen.queryByRole('button', { name: 'Show Raw JSON' })
  if (show) fireEvent.click(show)
  return readEditableSceneData(JSON.parse((screen.getByLabelText('Scene Data JSON') as HTMLTextAreaElement).value))
}
async function editor(scene: SceneData = customScene()) {
  let stored = scene
  let submitted: SceneData | undefined
  mockCreateScenePageFetch((input, init) => {
    if (input !== buildApiUrl('/scenes/12')) return
    if (init?.method === 'PUT') {
      submitted = JSON.parse(String(init.body)).sceneData
      stored = submitted!
    }
    return jsonResponse(buildSceneEditorApiScene({ sceneData: stored, tags: [] }))
  })
  const view = renderEditScenePage(undefined, 'mage-pulse')
  await screen.findByLabelText(/scene name/i)
  section('Motion')
  return { ...view, submission: () => submitted }
}

beforeEach(() => { playerRender.mockClear(); playerMount.mockClear(); storeSceneEditorSession() })
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

describe('editor targets from compiled shader capabilities', () => {
  it.each([
    { targets: [] as AudioResponseTarget[] }, { targets: ['bass'] as AudioResponseTarget[] },
    { targets: ['size', 'audioHit'] as AudioResponseTarget[] },
  ])('shows only the compiled supported list $targets instead of saved mapping names', async ({ targets }) => {
    await editor()
    expect(screen.queryByRole('slider', { name: 'Amount' })).not.toBeInTheDocument()
    publish(targets)
    if (!targets.length) {
      expect(screen.getByText(/no supported music-response inputs/i)).toBeInTheDocument()
      expect(screen.queryByRole('slider', { name: 'Amount' })).not.toBeInTheDocument()
    } else {
      expect(screen.getByRole('slider', { name: 'Amount' })).toBeEnabled()
      if (targets.length === 1) {
        expect(screen.queryByRole('combobox', { name: 'Response target' })).not.toBeInTheDocument()
        expect(screen.getByRole('spinbutton', { name: 'Amount numeric value' })).toHaveValue(2.3)
      } else {
        const choices = within(screen.getByRole('combobox', { name: 'Response target' })).getAllByRole('option')
        expect(choices.map(option => option.textContent)).toEqual(['Size', 'Hit response'])
      }
    }
    expect(exportedScene().audioResponseConfig).toEqual(savedConfig)
  })

  it('rejects old source reports during replacement, including an invalid source retaining the last preview', async () => {
    await editor()
    const firstSource = latestPlayer().sceneBlob
    publish(['size', 'bass'])
    section('Scene')
    fireEvent.change(screen.getByLabelText('Custom Shader'), { target: { value: 'sphere(0.8)' } })
    await waitFor(() => expect(latestPlayer().sceneBlob).not.toEqual(firstSource))
    const secondSource = latestPlayer().sceneBlob
    section('Motion')
    publish(['size', 'bass'], firstSource)
    expect(screen.queryByRole('combobox', { name: 'Response target' })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Amount' })).not.toBeInTheDocument()
    publish(['audioHit'], secondSource)
    expect(screen.getByRole('spinbutton', { name: 'Amount numeric value' })).toHaveValue(0.9)
    section('Scene')
    fireEvent.change(screen.getByLabelText('Custom Shader'), { target: { value: '' } })
    section('Motion')
    publish(['audioHit'], secondSource)
    expect(screen.queryByRole('slider', { name: 'Amount' })).not.toBeInTheDocument()
    expect(screen.queryByText(/no supported music-response inputs/i)).not.toBeInTheDocument()
  })

  it('keeps a selected target and focused control through audio edits without a new capability report or player mount', async () => {
    await editor()
    publish(['size', 'bass'])
    fireEvent.change(screen.getByRole('combobox', { name: 'Response target' }), { target: { value: 'bass' } })
    const amount = screen.getByRole('spinbutton', { name: 'Amount numeric value' })
    amount.focus()
    fireEvent.change(amount, { target: { value: '1.6' } })
    expect(screen.getByRole('spinbutton', { name: 'Amount numeric value' })).toBe(amount)
    expect(amount).toHaveFocus()
    expect(amount).toHaveValue(1.6)
    expect(screen.getByRole('combobox', { name: 'Response target' })).toHaveValue('bass')
    expect(playerMount).toHaveBeenCalledOnce()
    const config = exportedScene().audioResponseConfig as typeof savedConfig
    expect(config).toEqual({ ...savedConfig, mappings: savedConfig.mappings.map(mapping =>
      mapping.target === 'bass' ? { ...mapping, amount: 1.6 } : mapping) })
  })

  it('preserves dormant targets and custom timing when saving and reopening with unavailable capabilities', async () => {
    const first = await editor()
    publish(['size'])
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount numeric value' }), { target: { value: '1.8' } })
    const expected = { ...savedConfig, mappings: savedConfig.mappings.map(mapping =>
      mapping.target === 'size' ? { ...mapping, amount: 1.8 } : mapping) }
    publish(null)
    expect(screen.queryByRole('slider', { name: 'Amount' })).not.toBeInTheDocument()
    expect(screen.queryByText(/no supported music-response inputs/i)).not.toBeInTheDocument()
    expect(exportedScene().audioResponseConfig).toEqual(expected)
    fireEvent.click(screen.getByRole('button', { name: /^update scene$/i }))
    await waitFor(() => expect(first.submission()).toBeDefined())
    expect(readEditableSceneData(first.submission()!).audioResponseConfig).toEqual(expected)
    first.unmount()
    renderEditScenePage(undefined, 'mage-pulse')
    await screen.findByLabelText(/scene name/i)
    section('Motion')
    publish(['bass'])
    expect(screen.getByRole('spinbutton', { name: 'Amount numeric value' })).toHaveValue(2.3)
    expect(screen.getByRole('slider', { name: 'Rise time' })).toHaveValue('0.23')
    expect(screen.getByRole('slider', { name: 'Fade time' })).toHaveValue('0.83')
    expect(exportedScene().audioResponseConfig).toEqual(expected)
  })

  it('keeps the existing single-target template controls and rejects a different template report', async () => {
    const scene = createTemplateScene('embedded-scene-0')
    scene.settings = { ...scene.settings, audioResponse: 'mapped-v1', audioResponseConfig: savedConfig }
    await editor(scene)
    publish(['size'])
    expect(screen.getByRole('spinbutton', { name: 'Amount numeric value' })).toHaveValue(1.1)
    expect(screen.queryByRole('combobox', { name: 'Response target' })).not.toBeInTheDocument()
    publish(['bass'], createTemplateScene('embedded-scene-1'))
    expect(screen.queryByRole('slider', { name: 'Amount' })).not.toBeInTheDocument()
  })
})
