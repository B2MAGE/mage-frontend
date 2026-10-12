import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseSceneDocument, type BuilderSceneDocument } from '@modules/player'
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
    return <div data-testid="combined-preview" data-scene={JSON.stringify(sceneBlob)} />
  } }
})
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})

beforeEach(() => { capture.mockClear(); storeSceneEditorSession() })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })
const preview = (): BuilderSceneDocument => JSON.parse(screen.getByTestId('combined-preview').getAttribute('data-scene')!)
const formula = () => screen.getByText('Combined inputs', { selector: 'summary > strong' }).closest('details')!

// Identical labels recur in a formula. Resolve only the field/value owned by this node.
function field(node: HTMLDetailsElement, label: string) {
  const matches = within(node).getAllByLabelText(label).filter(control => control.closest('details') === node)
  expect(matches).toHaveLength(1)
  return matches[0]
}

async function openValue(user: ReturnType<typeof userEvent.setup>, parent: HTMLDetailsElement, label: string) {
  const matches = within(parent).getAllByText(label, { selector: 'summary > strong' })
    .map(heading => heading.closest('details')!)
    .filter(node => node.parentElement?.closest('details') === parent)
  expect(matches).toHaveLength(1)
  const node = matches[0]
  if (!node.open) await user.click(node.querySelector('summary')!)
  return node
}

async function openNewAnimation(user: ReturnType<typeof userEvent.setup>) {
  const view = renderCreateScenePage()
  fireEvent.change(await screen.findByLabelText(/scene name/i), { target: { value: 'Combined motion' } })
  await user.click(screen.getByRole('button', { name: 'Scene' }))
  await user.click(screen.getByRole('button', { name: 'Add new template' }))
  await user.click(screen.getByRole('heading', { name: 'Animation', level: 4 }).closest('summary')!)
  await user.click(screen.getByRole('button', { name: 'Add combined inputs' }))
  await waitFor(() => expect(preview().objects[0].drivers).toHaveLength(1))
  return view
}

describe('combined-input authoring', () => {
  it('edits a nested Alloy coefficient without changing sibling expressions and restores the exact tree with undo/redo', async () => {
    mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.selectOptions(screen.getByLabelText('Template'), 'embedded-scene-5')
    await screen.findByRole('heading', { name: 'Selected group' })
    await waitFor(() => expect(preview().kind).toBe('builder'))
    const original = preview()
    await user.click(screen.getByRole('heading', { name: 'Animation', level: 4 }).closest('summary')!)
    await user.click(screen.getByRole('button', { name: 'Expand Combined inputs influence 1' }))
    const clock = await openValue(user, formula(), 'First value')
    const coefficient = await openValue(user, clock, 'Second value')
    expect(field(coefficient, 'Value')).toHaveValue(.1)
    fireEvent.change(field(coefficient, 'Value'), { target: { value: '.35' } })

    const changed = structuredClone(original)
    const expression = changed.composition!.groups[0].drivers![0].expression
    if (expression.type !== 'add' || expression.left.type !== 'multiply') throw new Error('Expected the authored Alloy clock branch')
    expression.left.right = { type: 'constant', value: .35 }
    await waitFor(() => expect(preview()).toEqual(changed))
    expect(screen.getByLabelText('Template')).toHaveDisplayValue('Alloy Capsule Adaptation')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview()).toEqual(original))
    expect(screen.getByLabelText('Template')).toHaveDisplayValue('Alloy Capsule')
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    await waitFor(() => expect(preview()).toEqual(changed))
  }, 30_000)

  it('authors a time-by-scene-size wave from scratch, saves it, and reopens the exact combined expression', async () => {
    let submitted: Record<string, unknown> | undefined
    mockCreateScenePageFetch((url, init) => {
      if (url === buildApiUrl('/scenes') && init?.method === 'POST') {
        submitted = JSON.parse(String(init.body))
        return jsonResponse({ sceneId: 12, revision: 0 })
      }
      if (url === buildApiUrl('/scenes/12')) return jsonResponse(buildSceneEditorApiScene({ sceneData: submitted?.sceneData }))
    })
    const user = userEvent.setup()
    const view = await openNewAnimation(user)
    await user.selectOptions(screen.getByLabelText('Property'), 'rotation.z')
    await user.selectOptions(screen.getByLabelText('Apply influence'), 'replace')
    await user.selectOptions(field(formula(), 'Calculation'), 'input')
    expect(field(formula(), 'Input')).toHaveValue('time')
    await user.selectOptions(field(formula(), 'Calculation'), 'multiply')
    const second = await openValue(user, formula(), 'Second value')
    await user.selectOptions(field(second, 'Calculation'), 'input')
    await user.selectOptions(field(second, 'Input'), 'scene-size')
    await user.selectOptions(field(formula(), 'Calculation'), 'sin')

    const expression = { type: 'sin', input: { type: 'multiply', left: { type: 'input', source: 'time' }, right: { type: 'input', source: 'scene-size' } } }
    await waitFor(() => expect(preview().objects[0].drivers).toEqual([{ target: 'rotation.z', mode: 'replace', expression }]))
    const expected = preview()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^create scene$/i }))
    await screen.findByText('My Scenes')
    expect(parseSceneDocument(submitted?.sceneData)).toEqual(expected)
    expect(capture).toHaveBeenCalledTimes(1)
    expect(submitted?.sceneData).not.toHaveProperty('templateSourceId')
    view.unmount()

    renderEditScenePage()
    await screen.findByLabelText(/scene name/i)
    await waitFor(() => expect(preview()).toEqual(expected))
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    await user.click(screen.getByRole('heading', { name: 'Animation', level: 4 }).closest('summary')!)
    await user.click(screen.getByRole('button', { name: 'Expand Combined inputs influence 1' }))
    expect(field(formula(), 'Calculation')).toHaveValue('sin')
    const incoming = await openValue(user, formula(), 'Incoming value')
    expect(field(incoming, 'Calculation')).toHaveValue('multiply')
    const reopenedSecond = await openValue(user, incoming, 'Second value')
    expect(field(reopenedSecond, 'Input')).toHaveValue('scene-size')
  }, 30_000)

  it('retains a repairable nested clamp error without previewing or submitting it', async () => {
    const submit = vi.fn()
    mockCreateScenePageFetch((url, init) => {
      if (url === buildApiUrl('/scenes') && init?.method === 'POST') submit()
      return undefined
    })
    const user = userEvent.setup()
    await openNewAnimation(user)
    const second = await openValue(user, formula(), 'Second value')
    await user.selectOptions(field(second, 'Calculation'), 'clamp')
    await waitFor(() => expect(preview().objects[0].drivers![0].expression).toMatchObject({
      type: 'add', right: { type: 'clamp', min: -1, max: 1 },
    }))
    const valid = preview()
    fireEvent.change(field(second, 'Minimum'), { target: { value: '2' } })
    expect(field(second, 'Minimum')).toHaveValue(2)
    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent(/minimum|clamp|range/i)
    const expressionFields = document.getElementById('builder-driver-0-expression')!
    expect(expressionFields).toHaveAttribute('aria-invalid', 'true')
    expect(expressionFields).toHaveAttribute('aria-describedby', error.id)
    expect(preview()).toEqual(valid)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^create scene$/i }))
    expect(submit).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
    expect(preview()).toEqual(valid)

    await user.click(screen.getByRole('button', { name: 'Scene' }))
    const repairedSecond = await openValue(user, formula(), 'Second value')
    fireEvent.change(field(repairedSecond, 'Maximum'), { target: { value: '3' } })
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    const repaired = structuredClone(valid)
    const expression = repaired.objects[0].drivers![0].expression
    if (expression.type !== 'add' || expression.right.type !== 'clamp') throw new Error('Expected the nested clamp')
    expression.right.min = 2
    expression.right.max = 3
    await waitFor(() => expect(preview()).toEqual(repaired))
  }, 30_000)
})
