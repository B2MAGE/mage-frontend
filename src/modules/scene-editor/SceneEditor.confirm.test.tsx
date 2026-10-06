import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { addBuilderObject, createBuilderScene } from './builderEditor'
import { createDefaultSceneData, getSceneEditorModel, mergeSceneEditorBranch } from './sceneEditor'
import {
  buildSceneEditorApiScene,
  mockCreateScenePageFetch,
  renderEditScenePage,
  storeSceneEditorSession,
} from './test-fixtures'

vi.mock('@modules/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modules/player')>()
  return {
    ...actual,
    MagePlayer: ({ sceneBlob }: { sceneBlob: unknown }) => (
      <div data-scene={JSON.stringify(sceneBlob)} data-testid="confirm-preview" />
    ),
  }
})

vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})

beforeEach(() => storeSceneEditorSession())
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

function valueFor(label: string) {
  const term = screen.getByText(label, { selector: 'dt', exact: true })
  return term.nextElementSibling
}

describe('live Confirm review', () => {
  it('shows six accessible accordions and sends Edit actions back to a focused field', async () => {
    mockCreateScenePageFetch((input) => input === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: createDefaultSceneData(), tags: [] }))
      : undefined)
    const user = userEvent.setup()
    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    const review = within(screen.getByRole('region', { name: 'Scene review' }))
    const sectionButtons = [1, 2, 3, 4, 5, 6].map((step) => review.getByRole('button', { name: new RegExp(`^${step} `) }))
    expect(sectionButtons).toHaveLength(6)
    expect(sectionButtons[0]).toHaveAttribute('aria-expanded', 'false')
    await user.click(sectionButtons[2])
    expect(sectionButtons[0]).toHaveAttribute('aria-expanded', 'false')
    expect(sectionButtons[2]).toHaveAttribute('aria-expanded', 'true')
    await user.click(review.getByRole('button', { name: 'Edit Camera' }))
    expect(screen.getByRole('heading', { name: 'Frame the scene.' })).toBeInTheDocument()
    expect(screen.getByLabelText('Camera Position X')).toHaveFocus()
  })

  it('reports Builder as the source and keeps complete object details behind a disclosure', async () => {
    const builder = addBuilderObject(createBuilderScene(), 'box')
    mockCreateScenePageFetch((input) => input === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: builder, tags: [] }))
      : undefined)
    const user = userEvent.setup()
    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    const review = within(screen.getByRole('region', { name: 'Scene review' }))
    await user.click(review.getByRole('button', { name: /^2 Scene/ }))

    expect(valueFor('Creation mode')).toHaveTextContent('Builder')
    expect(valueFor('Source')).toHaveTextContent('Builder Shader')
    expect(valueFor('Builder objects')).toHaveTextContent('2 objects')
    expect(screen.queryByText(/inactive while builder/i)).not.toBeInTheDocument()
    const objectDetails = screen.getByRole('button', { name: 'Show saved object details' })
    expect(objectDetails).toHaveAttribute('aria-expanded', 'false')
    await user.click(objectDetails)
    expect(objectDetails).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByText(/Appearance:/)).toHaveLength(2)
  })

  it('reviews enabled effects and active order alongside the complete JSON', async () => {
    const source = createDefaultSceneData()
    const model = getSceneEditorModel(source)
    const saved = mergeSceneEditorBranch(source, 'fx', {
      ...model.fx,
      bloom: { ...model.fx.bloom, enabled: true },
      passes: { ...model.fx.passes, rgbShift: true, toon: false },
    })
    mockCreateScenePageFetch((input) => input === buildApiUrl('/scenes/12')
      ? jsonResponse(buildSceneEditorApiScene({ sceneData: saved, tags: [] }))
      : undefined)
    const user = userEvent.setup()
    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    const review = within(screen.getByRole('region', { name: 'Scene review' }))

    await user.click(review.getByRole('button', { name: /^5 Effects/ }))
    expect(valueFor('Optional effects')).toHaveTextContent('Bloom')
    expect(valueFor('Optional effects')).toHaveTextContent('RGB Shift')
    expect(valueFor('Optional effects')).not.toHaveTextContent('Toon')
    expect(valueFor('Tone Mapping')).toHaveTextContent('NoTone')

    await user.click(review.getByRole('button', { name: /^6 Pass Order/ }))
    expect(valueFor('Active pass order')).toHaveTextContent(/Bloom.*RGB Shift.*Output/)
    expect(screen.queryByText('Saved stack')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show Raw JSON' }))
    const raw = screen.getByLabelText('Scene Data JSON') as HTMLTextAreaElement
    expect(JSON.parse(raw.value)).toEqual(saved)
    fireEvent.change(raw, { target: { value: '{bad json' } })
    expect(screen.getByRole('button', { name: 'Update scene' })).toBeDisabled()
  })
})
