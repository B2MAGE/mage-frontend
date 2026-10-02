import { useId, useState } from 'react'
import type {
  AudioResponseConfig,
  AudioResponseMapping,
  AudioResponseSignal,
  AudioResponseTarget,
  SceneAudioResponseMode,
} from '@shared/lib'
import { SelectField, SliderField, ToggleField } from './SceneEditorControls'
import './music-response-controls.css'

export type MusicResponseControlsProps = {
  mode: SceneAudioResponseMode
  config: AudioResponseConfig
  supportedTargets: AudioResponseTarget[] | null
  onModeChange: (mode: SceneAudioResponseMode) => void
  onConfigChange: (config: AudioResponseConfig) => void
  onReset: () => void
  canReset: boolean
  disabledMappingDrafts?: Partial<Record<AudioResponseTarget, AudioResponseMapping>>
  onDisabledMappingDraftsChange?: (drafts: Partial<Record<AudioResponseTarget, AudioResponseMapping>>) => void
}

const TARGET_LABELS: Record<AudioResponseTarget, string> = {
  size: 'Size', bass: 'Bass response', mid: 'Mid response', treble: 'Treble response',
  audioLevel: 'Overall response', audioHit: 'Hit response',
}
const DEFAULT_SOURCES: Record<AudioResponseTarget, AudioResponseSignal> = {
  size: 'overall-hit', bass: 'bass-level', mid: 'mid-level', treble: 'treble-level',
  audioLevel: 'overall-level', audioHit: 'overall-hit',
}
const RESPONSE_PRESETS = {
  quick: { attack: 0.01, release: 0.12 },
  balanced: { attack: 0.04, release: 0.35 },
  flowing: { attack: 0.2, release: 1 },
} as const

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function MusicResponseControls({
  mode, config, supportedTargets, onModeChange, onConfigChange, onReset, canReset,
  disabledMappingDrafts, onDisabledMappingDraftsChange,
}: MusicResponseControlsProps) {
  const id = useId()
  const [preferredTarget, setPreferredTarget] = useState<AudioResponseTarget>('size')
  const [fineTuningOpen, setFineTuningOpen] = useState(false)
  const [internalDisabledMappings, setInternalDisabledMappings] = useState<Partial<Record<AudioResponseTarget, AudioResponseMapping>>>({})
  const disabledMappings = disabledMappingDrafts ?? internalDisabledMappings
  const [customTiming, setCustomTiming] = useState<{ target: AudioResponseTarget; attack: number; release: number } | null>(null)
  const targets = [...new Set(supportedTargets ?? [])]
  const target = targets.includes(preferredTarget) ? preferredTarget : targets[0]
  const savedMapping = config.mappings.find((mapping) => mapping.target === target)
  const mapping: AudioResponseMapping | null = target ? savedMapping ?? disabledMappings[target] ?? {
    target, source: DEFAULT_SOURCES[target], amount: 1, ...RESPONSE_PRESETS.balanced,
  } : null
  const frequency = mapping?.source.split('-')[0] ?? 'overall'
  const follow = mapping?.source.endsWith('-hit') ? 'hit' : 'level'
  const matchingPreset = mapping && Object.entries(RESPONSE_PRESETS)
    .find(([, preset]) => preset.attack === mapping.attack && preset.release === mapping.release)?.[0]
  const explicitlyCustom = mapping && customTiming?.target === target
    && customTiming.attack === mapping.attack && customTiming.release === mapping.release
  const responsePreset = explicitlyCustom ? 'custom' : matchingPreset ?? 'custom'

  function updateMapping(changes: Partial<Omit<AudioResponseMapping, 'target'>>) {
    if (!savedMapping) return
    onConfigChange({
      ...config,
      mappings: config.mappings.map((current) => current.target === target ? { ...current, ...changes } : current),
    })
  }

  function toggleMapping(enabled: boolean) {
    if (!mapping) return
    if (!enabled && savedMapping) {
      updateDisabledMappings({ ...disabledMappings, [savedMapping.target]: { ...savedMapping } })
    }
    onConfigChange({
      ...config,
      mappings: enabled ? [...config.mappings, { ...mapping }]
        : config.mappings.filter((current) => current.target !== target),
    })
  }

  function updateDisabledMappings(drafts: Partial<Record<AudioResponseTarget, AudioResponseMapping>>) {
    if (disabledMappingDrafts === undefined) setInternalDisabledMappings(drafts)
    onDisabledMappingDraftsChange?.(drafts)
  }

  function changeResponse(value: string) {
    if (!mapping) return
    if (value === 'custom') {
      setCustomTiming({ target: mapping.target, attack: mapping.attack, release: mapping.release })
      setFineTuningOpen(true)
      return
    }
    const preset = RESPONSE_PRESETS[value as keyof typeof RESPONSE_PRESETS]
    if (preset) {
      setCustomTiming(null)
      updateMapping(preset)
    }
  }

  function changeTiming(key: 'attack' | 'release', value: number) {
    if (!mapping) return
    const nextValue = clamp(value, 0, key === 'attack' ? 2 : 5)
    setCustomTiming({ target: mapping.target, attack: mapping.attack, release: mapping.release, [key]: nextValue })
    updateMapping({ [key]: nextValue })
  }

  return (
    <section className="music-response-controls" aria-labelledby={`${id}-title`}>
      <div className="music-response-controls__heading">
        <h3 id={`${id}-title`}>Music response</h3>
        <p>Choose what this scene follows in the music.</p>
      </div>
      <SelectField
        id={`${id}-mode`} label="Response mode" value={mode}
        options={[
          { value: 'legacy', label: 'Classic' },
          { value: 'transient-v1', label: 'Automatic beats' },
          { value: 'mapped-v1', label: 'Custom music response' },
        ]}
        onChange={(value) => onModeChange(value as SceneAudioResponseMode)}
      />
      {mode !== 'mapped-v1' ? (
        <p className="music-response-controls__message">
          {mode === 'legacy'
            ? 'Classic uses the scene’s original audio response. Adjust its audio controls below.'
            : 'Automatic beats follows detected sound attacks with an automatic rise and fade.'}
        </p>
      ) : supportedTargets === null ? (
        <p className="music-response-controls__message" role="status">Waiting for the preview to show which movements can react to music.</p>
      ) : !mapping ? (
        <p className="music-response-controls__message" role="status">This scene has no movements available for custom music response. Choose another scene or response mode.</p>
      ) : (
        <>
          <SliderField
            id={`${id}-sensitivity`} label="Sensitivity" numericLabel="Sensitivity numeric value"
            description="How easily sharp hits trigger a response. Has no effect on Sustained sound. Does not change music volume or movement strength."
            min={0.1} max={4} step={0.05} value={config.sensitivity}
            onChange={(value) => onConfigChange({ ...config, sensitivity: clamp(value, 0.1, 4) })}
          />
          {targets.length > 1 ? (
            <SelectField
              id={`${id}-target`} label="Movement" value={mapping.target}
              options={targets.map((value) => ({ value, label: TARGET_LABELS[value] }))}
              onChange={(value) => setPreferredTarget(value as AudioResponseTarget)}
            />
          ) : <h4 className="music-response-controls__target">{TARGET_LABELS[mapping.target]}</h4>}
          <ToggleField
            id={`${id}-enabled`} label="React to music" checked={Boolean(savedMapping)}
            description={`Let ${TARGET_LABELS[mapping.target].toLowerCase()} follow the selected sound.`}
            onChange={toggleMapping}
          />
          <fieldset className="music-response-controls__mapping" disabled={!savedMapping} aria-label={`${TARGET_LABELS[mapping.target]} music settings`}>
            <div className="music-response-controls__grid">
              <SelectField
                id={`${id}-frequency`} label="Frequency focus" value={frequency}
                description="Choose a frequency range in the mix."
                options={[
                  { value: 'overall', label: 'Whole mix' }, { value: 'bass', label: 'Bass' },
                  { value: 'mid', label: 'Mids' }, { value: 'treble', label: 'Treble' },
                ]}
                onChange={(value) => updateMapping({ source: `${value}-${follow}` as AudioResponseSignal })}
              />
              <SelectField
                id={`${id}-follow`} label="Follow" value={follow}
                options={[{ value: 'level', label: 'Sustained sound' }, { value: 'hit', label: 'Sharp hits' }]}
                onChange={(value) => updateMapping({ source: `${frequency}-${value}` as AudioResponseSignal })}
              />
              <SliderField
                id={`${id}-amount`} label="Amount" numericLabel="Amount numeric value"
                description="How strongly this movement reacts."
                min={0} max={4} step={0.05} value={mapping.amount}
                onChange={(value) => updateMapping({ amount: clamp(value, 0, 4) })}
              />
              <SelectField
                id={`${id}-response`} label="Response" value={responsePreset}
                description="Choose a quick pulse or a slower, smoother response."
                options={[
                  { value: 'quick', label: 'Quick' }, { value: 'balanced', label: 'Balanced' },
                  { value: 'flowing', label: 'Flowing' }, { value: 'custom', label: 'Custom' },
                ]}
                onChange={changeResponse}
              />
            </div>
            <details className="music-response-controls__timing" open={fineTuningOpen} onToggle={(event) => setFineTuningOpen(event.currentTarget.open)}>
              <summary>Fine-tune response</summary>
              <div className="music-response-controls__grid">
                <SliderField
                  id={`${id}-attack`} label="Rise time" numericLabel="Rise time numeric value (seconds)"
                  description="How long the response takes to rise, in seconds."
                  min={0} max={2} step={0.01} value={mapping.attack} formatValue={(value) => `${value} s`}
                  onChange={(value) => changeTiming('attack', value)}
                />
                <SliderField
                  id={`${id}-release`} label="Fade time" numericLabel="Fade time numeric value (seconds)"
                  description="How long the response takes to fade, in seconds."
                  min={0} max={5} step={0.01} value={mapping.release} formatValue={(value) => `${value} s`}
                  onChange={(value) => changeTiming('release', value)}
                />
              </div>
            </details>
          </fieldset>
        </>
      )}
      <div className="music-response-controls__reset">
        <button
          className="scene-secondary-button" type="button" disabled={!canReset} aria-describedby={`${id}-reset-description`}
          onClick={() => { updateDisabledMappings({}); setCustomTiming(null); setFineTuningOpen(false); onReset() }}
        >Reset to scene defaults</button>
        <p id={`${id}-reset-description`}>Restore the music settings this scene started with.</p>
      </div>
    </section>
  )
}
