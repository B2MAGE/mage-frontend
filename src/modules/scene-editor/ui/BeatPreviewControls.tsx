import { EffectCard, SliderField } from './SceneEditorControls'

export function BeatPreviewControls({ enabled, bpm, onEnabledChange, onBpmChange }: {
  enabled: boolean
  bpm: number
  onEnabledChange: (enabled: boolean) => void
  onBpmChange: (bpm: number) => void
}) {
  return (
    <div className="scene-editor-beat-preview">
      <EffectCard title="Simulate beat" toggleLabel="Simulate beat" enabled={enabled}
        description="Preview only; not saved with the scene. Playing music takes priority."
        onToggle={onEnabledChange}>
        <SliderField
          id="preview-tempo" label="Tempo" numericLabel="Tempo numeric value" min={60} max={180} step={1} value={bpm}
          formatValue={(value) => `${value} BPM`}
          description="Set the pace of the simulated beat."
          onChange={(value) => onBpmChange(Math.max(60, Math.min(180, Math.round(value))))}
        />
      </EffectCard>
    </div>
  )
}
