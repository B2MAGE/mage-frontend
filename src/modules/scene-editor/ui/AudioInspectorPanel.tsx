import { useId, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { AUDIO_INSPECTOR_BANDS, type AudioInspectorSnapshot, type BuilderDriverSource, type BuilderObject, type BuilderSceneDocument } from '@modules/player'
import type { AudioResponseConfig, AudioResponseMapping, AudioResponseSignal, AudioResponseTarget } from '@shared/lib'
import { AppIcon } from '@shared/ui'
import type { AudioInspectorStore } from '../audioInspectorStore'
import { BUILDER_BINDING_SOURCE_LABELS, BUILDER_BINDING_TARGET_LABELS, builderBindingResultRange } from '../builderBindings'
import { builderParent } from '../builderGroups'
import { BUILDER_INPUTS } from '../builderInputDefinitions'
import { builderInspectorInputs, isMeasuredAnimationInput, type InspectorAnimationOwner } from '../builderInspectorInputs'
import './audio-inspector.css'

type Props = {
  document: BuilderSceneDocument | null
  selectedObjectId: string | null
  onSelectObject: (id: string | null) => void
  store: AudioInspectorStore
  audioResponseConfig?: AudioResponseConfig | null
}

const BAND_LABELS = { bass: 'Bass', mid: 'Mid', treble: 'Treble', overall: 'Whole mix' }
const SCENE_TARGET_LABELS: Record<AudioResponseTarget, string> = {
  size: 'Size', bass: 'Bass response', mid: 'Mid response', treble: 'Treble response',
  audioLevel: 'Overall response', audioHit: 'Hit response',
}
const number = (value: number | undefined) => value !== undefined && Number.isFinite(value) ? value.toFixed(3) : '—'
/** A fixed amplitude scale makes quiet frequencies readable without amplifying each frame. */
const spectrumScale = (value: number) => value > 0 && Number.isFinite(value)
  ? Math.round(Math.max(0, Math.min(100, (20 * Math.log10(value) + 60) / 60 * 100)) * 100) / 10000 : 0

function sourceLabel(snapshot: AudioInspectorSnapshot | null) {
  if (!snapshot) return 'Waiting for preview'
  if (!snapshot.playing) return 'Preview paused'
  if (snapshot.source === 'audio') return 'Track audio'
  if (snapshot.source === 'synthetic') return 'Simulated beat'
  return snapshot.audioLoaded ? 'Track paused or ended' : 'No audio input'
}

function Spectrum({ snapshot }: { snapshot: AudioInspectorSnapshot | null }) {
  const spectrum = snapshot?.playing && snapshot.source === 'audio' ? snapshot.spectrum : null
  const frequency = (hz: number) => hz >= 1000 ? `${Number((hz / 1000).toFixed(1))} kHz` : `${Math.round(hz)} Hz`
  return <div className="audio-inspector__spectrum-block">
    {spectrum?.values.length ? <>
      <div className="audio-inspector__spectrum" role="img" aria-label={`Live frequency spectrum, ${frequency(spectrum.minHz)} to ${frequency(spectrum.maxHz)}`}>
        {spectrum.values.map((value, index) => <i key={index} aria-hidden="true" style={{ transform: `scaleY(${spectrumScale(value)})` }} />)}
      </div>
      <div className="audio-inspector__frequencies" aria-hidden="true"><span>{frequency(spectrum.minHz)} · Low</span><span>Mid</span><span>High · {frequency(spectrum.maxHz)}</span></div>
    </> : <div className="audio-inspector__spectrum audio-inspector__spectrum--empty">
      <span>{snapshot?.source === 'synthetic' ? 'Simulated beat has no frequency spectrum.'
        : !snapshot?.playing ? 'Play audio to see its spectrum.'
          : snapshot.source === 'audio' ? 'Waiting for frequency data.' : 'Play a track to see its spectrum.'}</span>
    </div>}
  </div>
}

function IncomingSound({ snapshot }: { snapshot: AudioInspectorSnapshot | null }) {
  return <section aria-label="Incoming sound" className="audio-inspector__section">
    <div className="audio-inspector__section-head"><h3>Incoming sound</h3>
      <span className={`audio-inspector__status${snapshot?.playing && snapshot.source !== 'none' ? ' is-active' : ''}`}>{sourceLabel(snapshot)}</span>
    </div>
    <p className="audio-inspector__subheading">Spectrum & band activity</p>
    <Spectrum snapshot={snapshot} />
    <div className="audio-inspector__meters">{AUDIO_INSPECTOR_BANDS.map(band => {
      const value = snapshot?.levels?.[band]
      return <div className="audio-inspector__band" key={band}>
        <strong>{BAND_LABELS[band]}</strong>
        {value === undefined ? <span className="audio-inspector__empty-meter" aria-hidden="true" />
          : <span className="audio-inspector__meter">
            <meter className="audio-inspector__sr-only" min={0} max={1} value={value} aria-label={`${BAND_LABELS[band]} level`} />
            <span className="audio-inspector__meter-fill" aria-hidden="true" style={{ transform: `scaleX(${value})` }} />
          </span>}
        <span className="audio-inspector__number" aria-label={`${BAND_LABELS[band]} level value`}>{number(value)}</span>
      </div>
    })}</div>
    <div className="audio-inspector__hits" aria-label="Recent hits">{AUDIO_INSPECTOR_BANDS.map(band => <span key={band}
      className={snapshot && snapshot.hits[band] > .01 ? 'is-active' : ''}>
      <i aria-hidden="true" />{BAND_LABELS[band]} hit<span className="audio-inspector__sr-only">: {number(snapshot?.hits[band])}</span>
    </span>)}</div>
    {!snapshot ? <p className="audio-inspector__hint">Keep the scene in view while the preview loads.</p>
      : !snapshot.playing ? <p className="audio-inspector__hint">Resume preview playback to see current values.</p>
        : snapshot.source === 'none' ? <p className="audio-inspector__hint">{snapshot.audioLoaded ? 'Play or restart the track' : 'Add a track'} in Live Preview, or use Simulate beat in Motion.</p> : null}
  </section>
}

function ResponseCard({ label, source, sourceDetail, target, result, children }: {
  label: string; source: string; sourceDetail?: ReactNode; target: string; result: ReactNode; children?: ReactNode
}) {
  return <article className="audio-inspector__response" aria-label={label}>
    <div className="audio-inspector__response-flow">
      <div><strong>{source}</strong>{sourceDetail ? <small>{sourceDetail}</small> : null}</div>
      <AppIcon name="arrow-right" size={15} aria-hidden="true" />
      <div><strong>{target}</strong><small>{result}</small></div>
    </div>
    {children ? <div className="audio-inspector__response-note">{children}</div> : null}
  </article>
}

function inputValue(snapshot: AudioInspectorSnapshot | null, source: BuilderDriverSource) {
  return source === 'scene-size' ? snapshot?.sceneOutputs.size : snapshot?.driverSignals.find(signal => signal.source === source)?.value
}

function incomingValue(snapshot: AudioInspectorSnapshot | null, source: AudioResponseSignal) {
  const band = source.split('-')[0] as typeof AUDIO_INSPECTOR_BANDS[number]
  return source.endsWith('-hit') ? snapshot?.hits[band] : snapshot?.levels?.[band]
}

function SceneResponseCard({ target, value, snapshot, config }: {
  target: AudioResponseTarget; value: number; snapshot: AudioInspectorSnapshot; config?: AudioResponseConfig | null
}) {
  const selective = snapshot.mode === 'mapped-v1'
  const mapping: AudioResponseMapping | undefined = selective ? config?.mappings.find(item => item.target === target) : undefined
  const source = mapping ? BUILDER_BINDING_SOURCE_LABELS[mapping.source]
    : selective ? config ? 'No assigned input' : 'Selective response'
      : target === 'size' ? 'Bass-driven input' : 'Original response'
  const detail = mapping ? `Incoming · ${number(incomingValue(snapshot, mapping.source))}`
    : selective ? config ? 'No mapping for this target' : 'Mapping details unavailable'
      : target === 'size' ? 'Original + Motion settings' : 'From Motion'
  return <ResponseCard label={`${SCENE_TARGET_LABELS[target]} scene response`} source={source} sourceDetail={detail}
    target={SCENE_TARGET_LABELS[target]} result={`${number(value)} · Measured`}>
    {mapping ? <details className="audio-inspector__mapping-details"><summary>Response settings</summary>
      <dl><div><dt>Strength</dt><dd>{number(mapping.amount)}</dd></div>
        <div><dt>Rise / fall</dt><dd>{number(mapping.attack)}s / {number(mapping.release)}s</dd></div>
        <div><dt>Sensitivity</dt><dd>{number(config?.sensitivity)}</dd></div></dl>
    </details> : null}
  </ResponseCard>
}

function ObjectResponses({ object, document, owners, snapshot }: {
  object: BuilderObject; document: BuilderSceneDocument; owners: InspectorAnimationOwner[]; snapshot: AudioInspectorSnapshot | null
}) {
  let materialOwner: string | undefined
  let parent = builderParent(document, object.id)
  while (parent) {
    if (parent.material) materialOwner = parent.name
    parent = builderParent(document, parent.id)
  }
  return <div className="audio-inspector__response-list">
    {object.bindings.map(binding => {
      const measured = snapshot?.bindings.find(item => item.objectId === object.id && item.target === binding.target && item.source === binding.source)
      const unit = builderBindingResultRange(object, binding).unit
      const property = BUILDER_BINDING_TARGET_LABELS[binding.target]
      return <ResponseCard key={binding.target} label={`${property} measured response`} source={BUILDER_BINDING_SOURCE_LABELS[binding.source]}
        sourceDetail={`Smoothed input · ${number(measured?.signal)}`} target={property}
        result={`${number(measured?.value)}${unit ? ` ${unit}` : ''} · ${measured ? 'Measured' : 'Waiting for preview'}`}>
        Before Animation{binding.target.startsWith('material.') && materialOwner ? ` · Visible material comes from ${materialOwner}` : ''}
        <details className="audio-inspector__mapping-details"><summary>Response settings</summary>
          <dl><div><dt>Apply</dt><dd>{binding.mode === 'add' ? 'Add to current value' : 'Set the value'}</dd></div>
            <div><dt>Strength / offset</dt><dd>{number(binding.amount)} / {number(binding.offset)}</dd></div>
            <div><dt>Rise / fall</dt><dd>{number(binding.attack)}s / {number(binding.release)}s</dd></div></dl>
        </details>
      </ResponseCard>
    })}
    {owners.flatMap(owner => owner.responses.map((response, index) => {
      const combined = response.inputs.length > 1
      const source = combined ? 'Combined inputs' : BUILDER_INPUTS[response.inputs[0]].label
      const sourceDetail = combined ? response.inputs.map(input => `${BUILDER_INPUTS[input].label}${isMeasuredAnimationInput(input) ? ` (${number(inputValue(snapshot, input))})` : ''}`).join(' + ')
        : isMeasuredAnimationInput(response.inputs[0]) ? `Input · ${number(inputValue(snapshot, response.inputs[0]))}` : 'Input value not measured here'
      return <ResponseCard key={`${owner.id}-${index}`} label={`${owner.name} animation: ${response.targets.join(', ')}`}
        source={source} sourceDetail={sourceDetail} target={response.targets.join(', ')} result="Configured Animation">
        {owner.inherited ? `Parent group: ${owner.name}` : owner.name}
      </ResponseCard>
    }))}
    {!object.bindings.length && !owners.length ? <p className="audio-inspector__empty">No object responses are configured. Scene settings can still affect its appearance.</p> : null}
    {owners.length ? <p className="audio-inspector__hint">Animation cards show configured connections. Combined and surface inputs may not have one final numeric value.</p> : null}
  </div>
}

function SignalDetails({ snapshot, owners }: { snapshot: AudioInspectorSnapshot | null; owners: InspectorAnimationOwner[] }) {
  const sources = [...new Set(owners.flatMap(owner => owner.inputs))]
  return <details className="audio-inspector__details">
    <summary>Signal details · levels and hit strengths</summary>
    <div>
      <p>Band levels are normalized from 0 to 1. Hits show recent transient strength. Spectrum bars use a fixed −60 to 0 dB scale relative to the analyzer's normalized maximum, without resizing each frame to its loudest frequency.</p>
      <table><caption className="audio-inspector__sr-only">Audio levels and hits</caption><thead><tr><th>Band</th><th>Level</th><th>Hit</th></tr></thead>
        <tbody>{AUDIO_INSPECTOR_BANDS.map(band => <tr key={band}><th>{BAND_LABELS[band]}</th><td>{number(snapshot?.levels?.[band])}</td><td>{number(snapshot?.hits[band])}</td></tr>)}</tbody></table>
      {sources.length ? <>
        <h4>Animation inputs</h4>
        <dl className="audio-inspector__input-details">{sources.map(source => <div key={source}>
          <dt>{BUILDER_INPUTS[source].label}</dt>
          <dd>{isMeasuredAnimationInput(source) ? number(inputValue(snapshot, source)) : source === 'scene-pointer' || source === 'scene-pointer-down'
            ? 'Movement, touch or press · not measured here' : 'Not measured here'}</dd>
        </div>)}</dl>
        <p>Values are inputs before the animation's amount, offset and combined inputs.{sources.includes('scene-size') ? ' Scene size response comes from Motion, including its music response.' : ''}</p>
      </> : null}
    </div>
  </details>
}

/** Read-only contents; mounting is controlled by the drawer so a closed inspector has no subscribers. */
export function AudioInspectorContents({ document, selectedObjectId, onSelectObject, store, audioResponseConfig }: Props) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const id = useId()
  const object = document?.objects.find(item => item.id === selectedObjectId)
  // The Builder also selects groups. Until group inspection is offered, show the
  // scene overview without clearing that editor selection or changing the draft.
  const selection = !document || document.composition?.groups.some(group => group.id === selectedObjectId) ? null : selectedObjectId
  const owners = useMemo(() => builderInspectorInputs(document, object?.id ?? null), [document, object?.id])
  const outputs = Object.entries(snapshot?.sceneOutputs ?? {}) as [AudioResponseTarget, number][]
  const mode = snapshot ? snapshot.mode === 'legacy' ? 'Original' : 'Selective' : null
  return <div className="audio-inspector__content">
    <IncomingSound snapshot={snapshot} />
    <section aria-label="Visual response" className="audio-inspector__section audio-inspector__visual-response">
      <div className="audio-inspector__section-head"><h3>Visual response</h3>{mode ? <span className="audio-inspector__mode">{mode}</span> : null}</div>
      <p className="audio-inspector__subheading">Trace the signal that changes an object.</p>
      <label className="audio-inspector__object-label" htmlFor={`${id}-object`}>Inspect object
        <select id={`${id}-object`} value={selection ?? ''} onChange={event => onSelectObject(event.currentTarget.value || null)}>
          <option value="">Whole scene</option>
          {selection && !object ? <option value={selection} disabled>Object unavailable</option> : null}
          {document?.objects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {object && document ? <ObjectResponses object={object} document={document} owners={owners} snapshot={snapshot} />
        : selection ? <p className="audio-inspector__empty">Select an available object or Whole scene to inspect its responses.</p>
          : <div className="audio-inspector__response-list">
            {snapshot ? outputs.map(([target, value]) => <SceneResponseCard key={target} target={target} value={value}
              snapshot={snapshot} config={audioResponseConfig} />) : null}
            {!outputs.length ? <p className="audio-inspector__empty">Scene response values will appear when the preview is ready.</p> : null}
            {document ? <p className="audio-inspector__hint">Choose an object to trace its individual responses and parent groups.</p> : null}
          </div>}
    </section>
    <SignalDetails snapshot={snapshot} owners={owners} />
  </div>
}
