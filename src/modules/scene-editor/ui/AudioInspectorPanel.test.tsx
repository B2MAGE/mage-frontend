import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyInspectorBands, type AudioInspectorSnapshot, type BuilderSceneDocument } from '@modules/player'
import { createAudioInspectorStore } from '../audioInspectorStore'
import { createBuilderObject, createBuilderScene } from '../builderEditor'
import { createBuilderRecipe } from '../builderRecipes'
import { AudioInspectorContents } from './AudioInspectorPanel'

function documentWithBindings() {
  const document = createBuilderScene()
  document.objects[0].bindings = [
    { target: 'scale.x', source: 'bass-level', mode: 'add', amount: 2, offset: -.2, attack: .1, release: .3 },
    { target: 'rotation.y', source: 'pointer-x', mode: 'replace', amount: 3, offset: 0, attack: 0, release: 0 },
  ]
  const second = createBuilderObject('box', document.objects)
  second.bindings = [{ ...document.objects[0].bindings[0], source: 'treble-hit' }]
  document.objects.push(second)
  return document
}

function sample(document = documentWithBindings()): AudioInspectorSnapshot {
  return {
    mode: 'legacy', source: 'audio', playing: true, audioLoaded: true,
    levels: { bass: .3, mid: .2, treble: .1, overall: .22 }, hits: { bass: .8, mid: 0, treble: .1, overall: .5 },
    bindings: [
      { objectId: document.objects[0].id, target: 'scale.x', source: 'bass-level', signal: .25, value: 1.3 },
      { objectId: document.objects[0].id, target: 'rotation.y', source: 'pointer-x', signal: -.4, value: -1.2 },
      { objectId: document.objects[1].id, target: 'scale.x', source: 'treble-hit', signal: .15, value: 1.1 },
    ],
    driverSignals: [], sceneOutputs: { size: .8 },
    spectrum: { time: 4, minHz: 40, maxHz: 8000, values: [0, .25, .5, 1] },
  }
}

function setup(document: BuilderSceneDocument | null = documentWithBindings(), selectedObjectId: string | null = document?.objects[0].id ?? null) {
  const store = createAudioInspectorStore()
  const onSelectObject = vi.fn()
  const props = { document, selectedObjectId, onSelectObject, store }
  return { ...render(<AudioInspectorContents {...props} />), store, onSelectObject, props }
}

describe('Audio inspector contents', () => {
  it('uses actual spectrum samples with a fixed scale, and separates incoming levels from measured responses', () => {
    const document = documentWithBindings()
    const { store } = setup(document)
    act(() => store.publish(sample(document)))
    expect(screen.getByText('Track audio')).toBeInTheDocument()
    expect(screen.getByText('Original')).toBeInTheDocument()
    const bars = screen.getByRole('img', { name: 'Live frequency spectrum, 40 Hz to 8 kHz' }).children
    expect([...bars].map(bar => (bar as HTMLElement).style.transform)).toEqual(['scaleY(0)', 'scaleY(0.7993)', 'scaleY(0.8997)', 'scaleY(1)'])
    expect(screen.getByRole('meter', { name: 'Bass level' })).toHaveAttribute('value', '0.3')
    expect(screen.getByLabelText('Recent hits')).toHaveTextContent('Bass hit: 0.800')
    const response = screen.getByRole('article', { name: 'Width (scale X) measured response' })
    expect(response).toHaveTextContent('Bass levelSmoothed input · 0.250')
    expect(response).toHaveTextContent('1.300 × · Measured')
    expect(response).toHaveTextContent('Before Animation')
    expect(screen.getByRole('article', { name: 'Rotation Y measured response' })).toHaveTextContent('-1.200 rad · Measured')
    act(() => store.publish({ ...sample(document), spectrum: { time: 5, minHz: 40, maxHz: 8000, values: [.01, .1, 0] } }))
    expect([...screen.getByRole('img').children].map(bar => (bar as HTMLElement).style.transform)).toEqual(['scaleY(0.3333)', 'scaleY(0.6667)', 'scaleY(0)'])
    expect(screen.getByLabelText('Bass level value')).toHaveTextContent('0.300')
  })

  it('shows no fabricated spectrum for simulation, pause, no input or unavailable samples', () => {
    const { store } = setup()
    expect(screen.getByText('Waiting for preview')).toBeInTheDocument()
    expect(screen.getByLabelText('Bass level value')).toHaveTextContent('—')
    act(() => store.publish({ ...sample(), mode: 'mapped-v1', source: 'synthetic' }))
    expect(screen.getByText('Simulated beat')).toBeInTheDocument()
    expect(screen.getByText('Selective')).toBeInTheDocument()
    expect(screen.getByText('Simulated beat has no frequency spectrum.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    act(() => store.publish({ ...sample(), playing: false, levels: null }))
    expect(screen.getByText('Preview paused')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    act(() => store.publish({ ...sample(), source: 'none', levels: null }))
    expect(screen.getByText('Track paused or ended')).toBeInTheDocument()
    expect(screen.getByText(/Play or restart the track/)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    act(() => store.publish({ ...sample(), source: 'none', levels: null, audioLoaded: false }))
    expect(screen.getByText('No audio input')).toBeInTheDocument()
    expect(screen.getByText(/Add a track in Live Preview/)).toBeInTheDocument()
  })

  it('shows genuine silence as zero while missing data remains unknown', async () => {
    const { store } = setup()
    act(() => store.publish({ ...sample(), levels: emptyInspectorBands(), hits: emptyInspectorBands(), spectrum: { time: 4, minHz: 40, maxHz: 8000, values: [0, 0] } }))
    expect(screen.getByLabelText('Bass level value')).toHaveTextContent('0.000')
    expect(screen.getByLabelText('Recent hits').querySelector('.is-active')).toBeNull()
    await userEvent.setup().click(screen.getByText('Signal details · levels and hit strengths'))
    expect(within(screen.getByRole('table', { name: 'Audio levels and hits' })).getByRole('row', { name: 'Bass 0.000 0.000' })).toBeInTheDocument()
    act(() => store.publish(null))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Bass level value')).toHaveTextContent('—')
  })

  it('shows whole-scene measurements and changes selection without editing configuration', () => {
    const document = documentWithBindings()
    const unchanged = structuredClone(document)
    const { store, onSelectObject, props, rerender } = setup(document, null)
    act(() => store.publish(sample(document)))
    expect(screen.getByLabelText('Inspect object')).toHaveValue('')
    expect(screen.getByRole('article', { name: 'Size scene response' })).toHaveTextContent('Bass-driven inputOriginal + Motion settingsSize0.800 · Measured')
    expect(screen.queryByRole('article', { name: /measured response/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Inspect object'), { target: { value: document.objects[1].id } })
    expect(onSelectObject).toHaveBeenCalledWith(document.objects[1].id)
    rerender(<AudioInspectorContents {...props} selectedObjectId={document.objects[1].id} />)
    expect(screen.getByRole('article', { name: 'Width (scale X) measured response' })).toHaveTextContent('Treble hitsSmoothed input · 0.150')
    fireEvent.change(screen.getByLabelText('Inspect object'), { target: { value: '' } })
    expect(onSelectObject).toHaveBeenLastCalledWith(null)
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(document).toEqual(unchanged)
  })

  it('keeps selection on reorder and drops readings for a deleted object', () => {
    const document = documentWithBindings()
    const { store, props, rerender } = setup(document)
    act(() => store.publish(sample(document)))
    rerender(<AudioInspectorContents {...props} document={{ ...document, objects: [...document.objects].reverse() }} />)
    expect(screen.getByLabelText('Inspect object')).toHaveValue(document.objects[0].id)
    expect(screen.getByRole('article', { name: 'Width (scale X) measured response' })).toHaveTextContent('1.300 ×')
    rerender(<AudioInspectorContents {...props} document={{ ...document, objects: document.objects.slice(1) }} />)
    expect(screen.getByText('Object unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('shows Whole scene for a valid Builder group without changing the editor selection', () => {
    const document = createBuilderRecipe('embedded-scene-0')
    const unchanged = structuredClone(document)
    const groupId = document.composition!.groups[0].id
    const { store, onSelectObject } = setup(document, groupId)
    act(() => store.publish(sample(document)))
    expect(screen.getByLabelText('Inspect object')).toHaveValue('')
    expect(screen.queryByText('Object unavailable')).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Size scene response' })).toBeInTheDocument()
    expect(onSelectObject).not.toHaveBeenCalled()
    expect(document).toEqual(unchanged)
  })

  it('does not show a stale binding result after its source changes or it is removed', () => {
    const document = documentWithBindings()
    const { store, props, rerender } = setup(document)
    act(() => store.publish(sample(document)))
    const changed = structuredClone(document)
    changed.objects[0].bindings = [{ ...changed.objects[0].bindings[0], source: 'mid-hit' }]
    rerender(<AudioInspectorContents {...props} document={changed} />)
    expect(screen.getByRole('article')).toHaveTextContent('— × · Waiting for preview')
    changed.objects[0].bindings = []
    rerender(<AudioInspectorContents {...props} document={changed} />)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByText(/No object responses are configured/)).toBeInTheDocument()
  })

  it('traces real Prism Core source-to-property connections and their parent owners, without invented outputs', async () => {
    const document = createBuilderRecipe('embedded-scene-0')
    const unchanged = structuredClone(document)
    const object = document.objects.find(item => item.name === 'Outer prism frame')!
    const { store, props, rerender } = setup(document, object.id)
    act(() => store.publish({ ...sample(document), bindings: [], driverSignals: [], sceneOutputs: { size: .084 } }))
    const ownCards = screen.getAllByRole('article', { name: /^Outer prism frame animation:/ })
    expect(ownCards.some(card => card.textContent?.includes('Scene size response'))).toBe(true)
    expect(ownCards.every(card => card.textContent?.includes('Configured Animation'))).toBe(true)
    expect(screen.getAllByText('Parent group: Pointer motion')).not.toHaveLength(0)
    expect(screen.getByText('Parent group: Frame and sphere join')).toBeInTheDocument()
    expect(screen.queryByText('Glow')).not.toBeInTheDocument()
    expect(screen.queryByText('Opacity')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByText('Signal details · levels and hit strengths'))
    const details = screen.getByRole('heading', { name: 'Animation inputs' }).parentElement!
    expect(details).toHaveTextContent('Scene size response0.084')
    expect(details).toHaveTextContent('Scene pointerMovement, touch or press · not measured here')
    expect(details).not.toHaveTextContent('Scene pointer press')
    const detached = structuredClone(document)
    detached.composition!.groups.find(group => group.children.includes(object.id))!.children = []
    rerender(<AudioInspectorContents {...props} document={detached} />)
    expect(screen.queryByText('Parent group: Pointer motion')).not.toBeInTheDocument()
    expect(screen.queryByText('Parent group: Frame and sphere join')).not.toBeInTheDocument()
    expect(document).toEqual(unchanged)
  })

  it('shows supported parent Animation input values and clears them when the snapshot disappears', async () => {
    const document = createBuilderRecipe('embedded-scene-0')
    const object = document.objects[0]
    object.drivers = []
    const parent = document.composition!.groups.find(group => group.name === 'Pointer motion')!
    parent.drivers = [{ target: 'rotation.x', mode: 'add', expression: { type: 'input', source: 'pointer-x' } }]
    const { store } = setup(document, object.id)
    act(() => store.publish({ ...sample(document), driverSignals: [{ source: 'pointer-x', value: -.4 }] }))
    const card = screen.getByRole('article', { name: 'Pointer motion animation: Rotation X' })
    expect(card).toHaveTextContent('Pointer horizontalInput · -0.400Rotation XConfigured Animation')
    expect(card).not.toHaveTextContent('Measured')
    await userEvent.setup().click(screen.getByText('Signal details · levels and hit strengths'))
    act(() => store.publish(null))
    expect(card).toHaveTextContent('Input · —')
  })

  it('works without a Builder document and unsubscribes when the drawer unmounts its contents', () => {
    const store = createAudioInspectorStore()
    const cleanup = vi.fn()
    const subscribe = store.subscribe
    vi.spyOn(store, 'subscribe').mockImplementation(listener => {
      const unsubscribe = subscribe(listener)
      return () => { cleanup(); unsubscribe() }
    })
    const { unmount } = render(<AudioInspectorContents document={null} selectedObjectId={null} onSelectObject={vi.fn()} store={store} />)
    act(() => store.publish(sample()))
    expect(screen.getByRole('article', { name: 'Size scene response' })).toBeInTheDocument()
    unmount()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('traces the effective Selective mapping for a whole scene, including linked sources and unassigned targets', async () => {
    const { store, props, rerender } = setup(null)
    const config = { version: 1 as const, sensitivity: 1.5, mappings: [
      { target: 'size' as const, source: 'treble-hit' as const, amount: 2, attack: .02, release: .3 },
      { target: 'bass' as const, source: 'treble-hit' as const, amount: .8, attack: .01, release: .2 },
    ] }
    rerender(<AudioInspectorContents {...props} audioResponseConfig={config} />)
    act(() => store.publish({ ...sample(), mode: 'mapped-v1', sceneOutputs: { size: .62, bass: .17, mid: 0 } }))
    const size = screen.getByRole('article', { name: 'Size scene response' })
    const bass = screen.getByRole('article', { name: 'Bass response scene response' })
    expect(size).toHaveTextContent('Treble hitsIncoming · 0.100Size0.620 · Measured')
    expect(bass).toHaveTextContent('Treble hitsIncoming · 0.100Bass response0.170 · Measured')
    expect(screen.getByRole('article', { name: 'Mid response scene response' })).toHaveTextContent('No assigned inputNo mapping for this targetMid response0.000 · Measured')
    await userEvent.setup().click(within(size).getByText('Response settings'))
    expect(size).toHaveTextContent('Strength2.000Rise / fall0.020s / 0.300sSensitivity1.500')
    rerender(<AudioInspectorContents {...props} />)
    expect(screen.getByRole('article', { name: 'Size scene response' })).toHaveTextContent('Selective responseMapping details unavailable')
  })
})

describe('audio inspector store', () => {
  it('notifies once per new sample and releases subscribers on cleanup', () => {
    const store = createAudioInspectorStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    const snapshot = sample()
    store.publish(snapshot)
    store.publish(snapshot)
    expect(listener).toHaveBeenCalledOnce()
    expect(store.getSnapshot()).toBe(snapshot)
    unsubscribe()
    store.publish(null)
    expect(listener).toHaveBeenCalledOnce()
    expect(store.getSnapshot()).toBeNull()
  })
})
