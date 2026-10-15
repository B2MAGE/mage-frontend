import { useId, useMemo, useState, useSyncExternalStore } from 'react'
import { AUDIO_INSPECTOR_BANDS, validateBuilderDriverExpression, type AudioInspectorSnapshot, type BuilderBinding, type BuilderSceneDocument } from '@modules/player'
import type { AudioResponseTarget } from '@shared/lib'
import type { AudioInspectorStore } from '../audioInspectorStore'
import { BUILDER_BINDING_SOURCE_LABELS, BUILDER_BINDING_TARGET_LABELS, builderBindingResultRange } from '../builderBindings'
import { builderParent } from '../builderGroups'
import { SelectField } from './SceneEditorControls'
import './audio-inspector.css'

type Props = {
  document: BuilderSceneDocument | null
  selectedObjectId: string | null
  onSelectObject: (id: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  store: AudioInspectorStore
}

const BAND_LABELS = { bass: 'Bass', mid: 'Mid', treble: 'Treble', overall: 'Whole mix' }
const SCENE_TARGET_LABELS: Record<AudioResponseTarget, string> = {
  size: 'Size', bass: 'Bass response', mid: 'Mid response', treble: 'Treble response',
  audioLevel: 'Overall response', audioHit: 'Hit response',
}
const number = (value: number | undefined) => value !== undefined && Number.isFinite(value) ? value.toFixed(3) : '—'

function IncomingSignals({ snapshot }: { snapshot: AudioInspectorSnapshot | null }) {
  return <section aria-label="Incoming audio" className="audio-inspector__section">
    <h5>Incoming audio</h5>
    <div className="audio-inspector__band-head" aria-hidden="true"><span>Band</span><span>Level</span><span>Hit</span></div>
    {AUDIO_INSPECTOR_BANDS.map(band => {
      const level = snapshot?.levels?.[band]
      const hit = snapshot?.hits[band]
      return <div className="audio-inspector__band" key={band}>
        <span>{BAND_LABELS[band]}</span>
        <span className="audio-inspector__level">
          {level === undefined ? <span className="audio-inspector__empty-meter" aria-hidden="true" />
            : <meter min={0} max={1} value={level} aria-label={`${BAND_LABELS[band]} level`} />}
          <span aria-label={`${BAND_LABELS[band]} level value`}>{number(level)}</span>
        </span>
        <span className="audio-inspector__hit" aria-label={`${BAND_LABELS[band]} hit value`}>
          <span className={`audio-inspector__hit-dot${hit && hit > .01 ? ' is-active' : ''}`} aria-hidden="true" />{number(hit)}
        </span>
      </div>
    })}
    {!snapshot ? <p>Keep the scene in view while the preview loads.</p>
      : !snapshot.playing ? <p>Resume preview playback to see current values.</p>
        : snapshot.source === 'none' ? snapshot.audioLoaded
          ? <p>Play or restart the track in Live Preview, or use Simulate beat in Motion.</p>
          : <p>Add a track in Live Preview, or use Simulate beat in Motion.</p>
          : !snapshot.levels ? <p>No current band measurement.</p> : null}
  </section>
}

function InspectorReadings({ document, selectedObjectId, onSelectObject, store }: Omit<Props, 'open' | 'onOpenChange'>) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [preferredTarget, setPreferredTarget] = useState<BuilderBinding['target'] | null>(null)
  const [preferredAnimationInput, setPreferredAnimationInput] = useState<BuilderBinding['source'] | null>(null)
  const id = useId()
  const object = document?.objects.find(item => item.id === selectedObjectId)
  const animationInputs = useMemo(() => {
    const inputs = new Set<BuilderBinding['source']>()
    for (const driver of object?.drivers ?? []) {
      try {
        validateBuilderDriverExpression(driver.expression).signals.forEach(source => {
          if (Object.hasOwn(BUILDER_BINDING_SOURCE_LABELS, source)) inputs.add(source as BuilderBinding['source'])
        })
      } catch { /* Incomplete draft expressions do not have a current measured input. */ }
    }
    return [...inputs]
  }, [object])
  const animationInput = animationInputs.find(source => source === preferredAnimationInput) ?? animationInputs[0]
  const animationSignal = snapshot?.driverSignals.find(signal => signal.source === animationInput)
  const binding = object?.bindings.find(item => item.target === preferredTarget) ?? object?.bindings[0]
  const output = binding && snapshot?.bindings.find(item => item.objectId === object?.id && item.target === binding.target && item.source === binding.source)
  const range = object && binding ? builderBindingResultRange(object, binding) : null
  let materialOwner: string | undefined
  if (document && object && binding?.target.startsWith('material.')) {
    let parent = builderParent(document, object.id)
    while (parent) {
      if (parent.material) materialOwner = parent.name
      parent = builderParent(document, parent.id)
    }
  }
  const hasAnimation = object?.drivers?.some(driver => driver.target === binding?.target || (driver.target === 'scale' && binding?.target.startsWith('scale.')))
  const sceneOutputs = Object.entries(snapshot?.sceneOutputs ?? {}) as [AudioResponseTarget, number][]
  return <div className="builder-inspector-section__content audio-inspector__content">
    <div className="audio-inspector__status">
      <strong>{!snapshot ? 'Waiting for preview' : !snapshot.playing ? 'Preview paused'
        : snapshot.source === 'audio' ? 'Real audio' : snapshot.source === 'synthetic' ? 'Simulated beat'
          : snapshot.audioLoaded ? 'Track paused or ended' : 'No audio input'}</strong>
      {snapshot ? <span>Scene response: {snapshot.mode === 'legacy' ? 'Original' : 'Selective'}</span> : null}
    </div>
    <IncomingSignals snapshot={snapshot} />
    {document ? <section aria-label="Builder response" className="audio-inspector__section">
      <h5>Builder response</h5>
      <SelectField id={`${id}-object`} label="Inspect object" value={object?.id ?? ''} onChange={onSelectObject}
        options={[...(!object ? [{ value: '', label: 'Select an object', disabled: true }] : []), ...document.objects.map(item => ({ value: item.id, label: item.name }))]} />
      {object && binding ? <>
        <SelectField id={`${id}-property`} label="Inspect property" value={binding.target} onChange={value => setPreferredTarget(value as BuilderBinding['target'])}
          options={object.bindings.map(item => ({ value: item.target, label: BUILDER_BINDING_TARGET_LABELS[item.target] }))} />
        <dl className="audio-inspector__settings" aria-label="Response settings">
          <div><dt>Source</dt><dd>{BUILDER_BINDING_SOURCE_LABELS[binding.source]}</dd></div>
          <div><dt>Apply</dt><dd>{binding.mode === 'add' ? 'Add to current value' : 'Set the value'}</dd></div>
          <div><dt>Strength / offset</dt><dd>{number(binding.amount)} / {number(binding.offset)}</dd></div>
          <div><dt>Rise / fall</dt><dd>{number(binding.attack)}s / {number(binding.release)}s</dd></div>
        </dl>
        <dl className="audio-inspector__settings audio-inspector__result" aria-label="Measured response">
          <div><dt>Input after smoothing</dt><dd>{number(output?.signal)}</dd></div>
          <div><dt>Music & pointer response</dt><dd>{number(output?.value)}{range?.unit ? ` ${range.unit}` : ''}</dd></div>
        </dl>
        <p>Response before Animation.{hasAnimation ? ' Animation also changes this property; its final appearance can differ.' : ''}</p>
        {materialOwner ? <p>{materialOwner} supplies the visible material, so this object's material response is hidden.</p> : null}
      </> : <p>{object ? 'This object has no Music & pointer responses. Add one in the Builder to inspect its result.' : 'Select an object to inspect its Music & pointer responses.'}</p>}
      {object?.drivers?.length ? <p>Animation can combine inputs and vary across the surface. It does not always have one final numeric value.</p> : null}
      {animationInput ? <>
        <SelectField id={`${id}-animation-input`} label="Inspect Animation input" value={animationInput}
          onChange={value => setPreferredAnimationInput(value as BuilderBinding['source'])}
          options={animationInputs.map(source => ({ value: source, label: BUILDER_BINDING_SOURCE_LABELS[source] }))} />
        <dl className="audio-inspector__settings audio-inspector__result" aria-label="Animation input value">
          <div><dt>Input supplied to Animation</dt><dd>{number(animationSignal?.value)}</dd></div>
        </dl>
        <p>This is the input before the animation's amount, offset and combined inputs are applied.</p>
      </> : null}
    </section> : null}
    {sceneOutputs.length ? <section aria-label="Scene-wide response" className="audio-inspector__section">
      <h5>Scene-wide response</h5>
      <dl className="audio-inspector__settings">{sceneOutputs.map(([target, value]) => <div key={target}><dt>{SCENE_TARGET_LABELS[target]}</dt><dd>{number(value)}</dd></div>)}</dl>
      <p>Values supplied by the Motion section. Each template decides how to use them.</p>
    </section> : null}
  </div>
}

export function AudioInspectorPanel({ open, onOpenChange, ...props }: Props) {
  return <details className="builder-inspector-section audio-inspector" open={open}
    onToggle={event => { if (event.currentTarget.open !== open) onOpenChange(event.currentTarget.open) }}>
    <summary>
      <span className="builder-inspector-section__title"><h4 className="builder-object-editor__subheading">Audio inspector</h4><span>See incoming sound and response values</span></span>
      <span className="builder-inspector-section__chevron" aria-hidden="true" />
    </summary>
    {open ? <InspectorReadings {...props} /> : null}
  </details>
}
