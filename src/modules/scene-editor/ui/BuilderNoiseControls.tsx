import { BUILDER_DRIVER_LIMITS, BUILDER_LIMITS } from '@modules/player'
import type { NoiseValues } from '../builderProcedural'
import { NumberField, SelectField } from './SceneEditorControls'

export function BuilderNoiseControls({ id, value, onChange }: { id: string; value: NoiseValues; onChange: (value: NoiseValues) => void }) {
  const bound = BUILDER_DRIVER_LIMITS.constantMagnitude
  return <>
    <SelectField id={`${id}-scope`} label="Coordinate space" value={value.scope}
      options={[{ value: 'local-position', label: 'Local position' }, { value: 'group-position', label: 'Group position' },
        { value: 'world-position', label: 'World position' }, { value: 'view-ray', label: 'View ray' }]}
      onChange={scope => onChange({ ...value, scope: scope as NoiseValues['scope'] })}
      description="Local patterns move with this object or group. World patterns stay in the scene. View ray follows the camera direction." />
    {value.scope === 'group-position' ? <SelectField id={`${id}-ancestor`} label="Coordinate group" value={String(value.ancestor)}
      options={Array.from({ length: BUILDER_LIMITS.groupDepth }, (_, index) => ({ value: String(index + 1), label: index === 0 ? 'Parent group' : `${index + 1} groups up` }))}
      onChange={ancestor => onChange({ ...value, ancestor: Number(ancestor) })}
      description="Use a shared ancestor's coordinates for the pattern. With fewer ancestors, World position is used." /> : null}
    <div className="scene-editor-grid scene-editor-grid--2">
      <NumberField id={`${id}-frequency`} label="Frequency" min={-bound} max={bound} step={.01} numericStep="any" value={value.frequency}
        onChange={frequency => onChange({ ...value, frequency })} description="Larger values make the pattern finer; zero samples one fixed value." />
      <NumberField id={`${id}-strength`} label="Strength" min={-bound} max={bound} step={.01} numericStep="any" value={value.strength}
        onChange={strength => onChange({ ...value, strength })} description="How far the surface moves. Negative values reverse the pattern." />
    </div>
    {(['offset', 'drift'] as const).map(kind => <div key={kind}>
      <p className="field-hint">{kind === 'offset' ? 'Pattern offset' : 'Pattern drift per second'}</p>
      <div className="scene-editor-grid scene-editor-grid--3">{(['x', 'y', 'z'] as const).map(axis => <NumberField key={axis}
        id={`${id}-${kind}-${axis}`} label={`${kind === 'offset' ? 'Offset' : 'Drift'} ${axis.toUpperCase()}`}
        min={-bound} max={bound} step={.01} numericStep="any" value={value[kind][axis]}
        onChange={next => onChange({ ...value, [kind]: { ...value[kind], [axis]: next } })} />)}</div>
    </div>)}
  </>
}
