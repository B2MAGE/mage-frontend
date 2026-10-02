import { SliderField, ToggleField } from './SceneEditorControls'

export function BeatPreviewControls({ enabled, bpm, onEnabledChange, onBpmChange }: {
  enabled: boolean
  bpm: number
  onEnabledChange: (enabled: boolean) => void
  onBpmChange: (bpm: number) => void
}) {
  return (
    <div className="scene-editor-beat-preview">
      <ToggleField checked={enabled} id="simulate-beat" label="Simulate beat"
        description="A silent test rhythm. Playing music takes priority."
        onChange={onEnabledChange} />
      {enabled ? <SliderField
        id="preview-tempo" label="Tempo" numericLabel="Tempo numeric value" min={60} max={180} step={1} value={bpm}
        formatValue={(value) => `${value} BPM`}
        description="Preview only — this tempo is not saved with your scene."
        onChange={(value) => onBpmChange(Math.max(60, Math.min(180, Math.round(value))))}
      /> : null}
    </div>
  )
}
