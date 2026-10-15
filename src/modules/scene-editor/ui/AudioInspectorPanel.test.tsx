import { useState } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyInspectorBands, type AudioInspectorSnapshot, type BuilderSceneDocument } from '@modules/player'
import { createAudioInspectorStore } from '../audioInspectorStore'
import { createBuilderObject, createBuilderScene } from '../builderEditor'
import { AudioInspectorPanel } from './AudioInspectorPanel'

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

function sample(document: BuilderSceneDocument): AudioInspectorSnapshot {
  return {
    mode: 'legacy', source: 'audio', playing: true, audioLoaded: true,
    levels: { bass: .3, mid: .2, treble: .1, overall: .22 }, hits: { bass: .8, mid: 0, treble: .1, overall: .5 },
    bindings: [
      { objectId: document.objects[0].id, target: 'scale.x', source: 'bass-level', signal: .25, value: 1.3 },
      { objectId: document.objects[0].id, target: 'rotation.y', source: 'pointer-x', signal: -.4, value: -1.2 },
      { objectId: document.objects[1].id, target: 'scale.x', source: 'treble-hit', signal: .15, value: 1.1 },
    ],
    driverSignals: [], sceneOutputs: { size: .8 },
  }
}

describe('Audio inspector', () => {
  it('subscribes only while expanded and leaves the draft untouched', async () => {
    const document = documentWithBindings()
    const unchanged = structuredClone(document)
    const store = createAudioInspectorStore()
    store.publish(sample(document))
    const subscribe = vi.spyOn(store, 'subscribe')
    function Harness() {
      const [open, setOpen] = useState(false)
      return <AudioInspectorPanel document={document} selectedObjectId={document.objects[0].id}
        onSelectObject={vi.fn()} open={open} onOpenChange={setOpen} store={store} />
    }
    render(<Harness />)
    expect(screen.queryByRole('region', { name: 'Incoming audio' })).not.toBeInTheDocument()
    expect(subscribe).not.toHaveBeenCalled()
    const user = userEvent.setup()
    await user.click(screen.getByText('Audio inspector'))
    expect(await screen.findByRole('region', { name: 'Incoming audio' })).toBeInTheDocument()
    expect(subscribe).toHaveBeenCalledOnce()
    await user.click(screen.getByText('Audio inspector'))
    expect(screen.queryByRole('region', { name: 'Incoming audio' })).not.toBeInTheDocument()
    act(() => store.publish({ ...sample(document), levels: emptyInspectorBands() }))
    expect(document).toEqual(unchanged)
  })

  it('shows measured incoming, smoothed and response values separately, before Animation', () => {
    const document = documentWithBindings()
    document.objects[0].drivers = [{ target: 'scale.x', mode: 'add', expression: { type: 'input', source: 'time' } }]
    const store = createAudioInspectorStore()
    store.publish(sample(document))
    render(<AudioInspectorPanel document={document} selectedObjectId={document.objects[0].id}
      onSelectObject={vi.fn()} open onOpenChange={vi.fn()} store={store} />)
    expect(screen.getByText('Real audio')).toBeInTheDocument()
    expect(screen.getByText('Scene response: Original')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Bass level' })).toHaveAttribute('value', '0.3')
    expect(screen.getByLabelText('Bass hit value')).toHaveTextContent('0.800')
    expect(screen.getByLabelText('Response settings')).toHaveTextContent('Bass level')
    const output = screen.getByLabelText('Measured response')
    expect(output).toHaveTextContent('Input after smoothing0.250')
    expect(output).toHaveTextContent('Music & pointer response1.300 ×')
    expect(screen.getByText(/Animation also changes this property/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Scene-wide response' })).toHaveTextContent('Size0.800')
  })

  it('labels simulated input, silence, pause, no input and missing measurements without inventing values', () => {
    const document = documentWithBindings()
    const store = createAudioInspectorStore()
    render(<AudioInspectorPanel document={document} selectedObjectId={null}
      onSelectObject={vi.fn()} open onOpenChange={vi.fn()} store={store} />)
    expect(screen.getByText('Waiting for preview')).toBeInTheDocument()
    expect(screen.getByLabelText('Bass level value')).toHaveTextContent('—')
    act(() => store.publish({ ...sample(document), mode: 'mapped-v1', source: 'synthetic' }))
    expect(screen.getByText('Simulated beat')).toBeInTheDocument()
    expect(screen.getByText('Scene response: Selective')).toBeInTheDocument()
    act(() => store.publish({ ...sample(document), levels: emptyInspectorBands(), hits: emptyInspectorBands() }))
    expect(screen.getByLabelText('Bass level value')).toHaveTextContent('0.000')
    expect(screen.getByLabelText('Bass hit value')).toHaveTextContent('0.000')
    act(() => store.publish({ ...sample(document), playing: false, levels: null, hits: emptyInspectorBands() }))
    expect(screen.getByText('Preview paused')).toBeInTheDocument()
    expect(screen.getByText('Resume preview playback to see current values.')).toBeInTheDocument()
    act(() => store.publish({ ...sample(document), source: 'none', levels: null }))
    expect(screen.getByText('Track paused or ended')).toBeInTheDocument()
    expect(screen.getByText(/Play or restart the track/)).toBeInTheDocument()
    act(() => store.publish({ ...sample(document), source: 'none', levels: null, audioLoaded: false }))
    expect(screen.getByText('No audio input')).toBeInTheDocument()
    expect(screen.getByLabelText('Bass level value')).toHaveTextContent('—')
    expect(screen.getByText(/Add a track in Live Preview/)).toBeInTheDocument()
    act(() => store.publish(null))
    expect(screen.queryByRole('region', { name: 'Scene-wide response' })).not.toBeInTheDocument()
  })

  it('tracks object identities and property targets through reorder, selection and deletion', () => {
    let document = documentWithBindings()
    const first = document.objects[0].id
    const second = document.objects[1].id
    const select = vi.fn()
    const store = createAudioInspectorStore()
    store.publish(sample(document))
    const props = { selectedObjectId: first, onSelectObject: select, open: true, onOpenChange: vi.fn(), store }
    const { rerender } = render(<AudioInspectorPanel {...props} document={document} />)
    fireEvent.change(screen.getByLabelText('Inspect property'), { target: { value: 'rotation.y' } })
    expect(screen.getByLabelText('Measured response')).toHaveTextContent('-1.200 rad')
    document = { ...document, objects: [...document.objects].reverse() }
    rerender(<AudioInspectorPanel {...props} document={document} />)
    expect(screen.getByLabelText('Inspect object')).toHaveValue(first)
    expect(screen.getByLabelText('Inspect property')).toHaveValue('rotation.y')
    expect(screen.getByLabelText('Measured response')).toHaveTextContent('-1.200 rad')
    fireEvent.change(screen.getByLabelText('Inspect object'), { target: { value: second } })
    expect(select).toHaveBeenCalledWith(second)
    rerender(<AudioInspectorPanel {...props} document={document} selectedObjectId={second} />)
    expect(screen.getByLabelText('Inspect property')).toHaveValue('scale.x')
    expect(screen.getByLabelText('Measured response')).toHaveTextContent('1.100 ×')
    document = { ...document, objects: document.objects.filter(object => object.id !== second) }
    rerender(<AudioInspectorPanel {...props} document={document} selectedObjectId={second} />)
    expect(screen.getByLabelText('Inspect object')).toHaveValue('')
    expect(screen.queryByLabelText('Measured response')).not.toBeInTheDocument()
    expect(screen.getByText(/Select an object to inspect/)).toBeInTheDocument()
  })

  it('does not show the previous source result after replacing or removing a binding', () => {
    const document = documentWithBindings()
    const store = createAudioInspectorStore()
    store.publish(sample(document))
    const props = { selectedObjectId: document.objects[0].id, onSelectObject: vi.fn(), open: true, onOpenChange: vi.fn(), store }
    const { rerender } = render(<AudioInspectorPanel {...props} document={document} />)
    const changed = structuredClone(document)
    changed.objects[0].bindings = [{ ...changed.objects[0].bindings[0], source: 'mid-hit' }]
    rerender(<AudioInspectorPanel {...props} document={changed} />)
    expect(screen.getByLabelText('Measured response')).toHaveTextContent('Music & pointer response— ×')
    changed.objects[0].bindings = []
    rerender(<AudioInspectorPanel {...props} document={changed} />)
    expect(screen.queryByLabelText('Measured response')).not.toBeInTheDocument()
    expect(screen.getByText(/This object has no Music & pointer responses/)).toBeInTheDocument()
  })

  it('supports scene-wide readings without a Builder document', () => {
    const store = createAudioInspectorStore()
    store.publish(sample(documentWithBindings()))
    render(<AudioInspectorPanel document={null} selectedObjectId={null} onSelectObject={vi.fn()}
      open onOpenChange={vi.fn()} store={store} />)
    expect(screen.queryByRole('region', { name: 'Builder response' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Scene-wide response' })).getByText('Size')).toBeInTheDocument()
  })

  it('inspects an Animation-only object input without claiming it is a final property value', () => {
    const document = documentWithBindings()
    document.objects[0].bindings = []
    document.objects[0].drivers = [{ target: 'scale.x', mode: 'add', expression: {
      type: 'multiply', left: { type: 'input', source: 'bass-hit' }, right: { type: 'input', source: 'pointer-x' },
    } }]
    const store = createAudioInspectorStore()
    store.publish({ ...sample(document), driverSignals: [{ source: 'bass-hit', value: .65 }, { source: 'pointer-x', value: -.25 }] })
    const props = { selectedObjectId: document.objects[0].id, onSelectObject: vi.fn(), open: true, onOpenChange: vi.fn(), store }
    const { rerender } = render(<AudioInspectorPanel {...props} document={document} />)
    expect(screen.queryByLabelText('Measured response')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Animation input value')).toHaveTextContent('0.650')
    fireEvent.change(screen.getByLabelText('Inspect Animation input'), { target: { value: 'pointer-x' } })
    expect(screen.getByLabelText('Animation input value')).toHaveTextContent('-0.250')
    expect(screen.getByText(/before the animation's amount/)).toBeInTheDocument()
    rerender(<AudioInspectorPanel {...props} document={document} selectedObjectId={document.objects[1].id} />)
    expect(screen.queryByLabelText('Animation input value')).not.toBeInTheDocument()
  })
})

describe('audio inspector store', () => {
  it('notifies subscribed readers once per new sample and releases them on cleanup', () => {
    const store = createAudioInspectorStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    const snapshot = sample(documentWithBindings())
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
