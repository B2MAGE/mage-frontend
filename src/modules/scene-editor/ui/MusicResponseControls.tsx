import { useId, useState } from 'react'
import type {
  AudioResponseConfig,
  AudioResponseMapping,
  AudioResponseSignal,
  AudioResponseTarget,
  SceneAudioResponseMode,
} from '@shared/lib'
import { NumberField, SelectField, SliderField } from './SceneEditorControls'
import { CollapsibleEditorGroup } from './SceneEditorLayout'
import { formatMusicResponseAmount, musicResponseAmountScale } from './musicResponseAmountScale'
import './music-response-controls.css'
import { useSceneEditorFieldErrors } from './sceneEditorFieldErrors'

export type ClassicMusicResponseSettings = {
  inputGain: number
  peakEmphasis: number
  restingResponse: number
  smoothing: number
  responseOffset: number
}

export type MusicResponseTimingDrafts = Partial<Record<AudioResponseTarget, { attack: number; release: number }>>

export type MusicResponseControlsProps = {
  idPrefix?: string
  mode: SceneAudioResponseMode
  config: AudioResponseConfig
  supportedTargets: AudioResponseTarget[] | null
  onModeChange: (mode: SceneAudioResponseMode) => void
  onConfigChange: (config: AudioResponseConfig) => void
  onReset: () => void
  canReset: boolean
  isAdvancedOpen?: boolean
  onAdvancedToggle?: () => void
  classicSettings: ClassicMusicResponseSettings
  onClassicSettingChange: (key: keyof ClassicMusicResponseSettings, value: number) => void
  customTimingDrafts?: MusicResponseTimingDrafts
  onCustomTimingDraftsChange?: (drafts: MusicResponseTimingDrafts) => void
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
  classicSettings, onClassicSettingChange,
  customTimingDrafts, onCustomTimingDraftsChange, idPrefix,
  isAdvancedOpen: controlledAdvancedOpen, onAdvancedToggle,
}: MusicResponseControlsProps) {
  const generatedId = useId()
  const id = idPrefix ?? generatedId
  const errors = useSceneEditorFieldErrors()
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const advancedOpen = controlledAdvancedOpen ?? isAdvancedOpen
  const [preferredTarget, setPreferredTarget] = useState<AudioResponseTarget>('size')
  const [internalCustomTiming, setInternalCustomTiming] = useState<MusicResponseTimingDrafts>({})
  const invalidMappingPath = Object.values(errors).find(issue => issue.path.startsWith('settings.audioResponseConfig.mappings'))?.path
  const invalidMappingIndex = invalidMappingPath?.match(/mappings(?:\[(\d+)\]|\.(\d+))/)
  const invalidTarget = invalidMappingIndex ? config.mappings[Number(invalidMappingIndex[1] ?? invalidMappingIndex[2])]?.target : undefined
  const customTimings = customTimingDrafts ?? internalCustomTiming
  const targets = [...new Set(supportedTargets ?? [])]
  // Remember a confirmed fallback, but retain the choice while discovery is
  // unavailable so an audio-only edit does not move the controls unexpectedly.
  if (targets.length > 0 && !targets.includes(preferredTarget)) setPreferredTarget(targets[0])
  const requestedTarget = invalidTarget ?? preferredTarget
  const target = targets.includes(requestedTarget) ? requestedTarget : targets[0]
  const savedMapping = config.mappings.find((mapping) => mapping.target === target)
  const mapping: AudioResponseMapping | null = target ? savedMapping ?? {
    target, source: DEFAULT_SOURCES[target], amount: 0, ...RESPONSE_PRESETS.balanced,
  } : null
  const frequency = mapping?.source.split('-')[0] ?? 'overall'
  const follow = mapping?.source.endsWith('-hit') ? 'hit' : 'level'
  const matchingPreset = mapping && Object.entries(RESPONSE_PRESETS)
    .find(([, preset]) => preset.attack === mapping.attack && preset.release === mapping.release)?.[0]
  const customTiming = target ? customTimings[target] : undefined
  const explicitlyCustom = mapping && customTiming
    && customTiming.attack === mapping.attack && customTiming.release === mapping.release
  const responsePreset = explicitlyCustom ? 'custom' : matchingPreset ?? 'custom'

  function updateMapping(changes: Partial<Omit<AudioResponseMapping, 'target'>>) {
    if (!mapping) return
    const updatedMapping = { ...mapping, ...changes }
    onConfigChange({
      ...config,
      mappings: savedMapping
        ? config.mappings.map((current) => current.target === target ? updatedMapping : current)
        : [...config.mappings, updatedMapping],
    })
  }

  function changeResponse(value: string) {
    if (!mapping) return
    if (value === 'custom') {
      updateCustomTimings({ ...customTimings, [mapping.target]: { attack: mapping.attack, release: mapping.release } })
      return
    }
    const preset = RESPONSE_PRESETS[value as keyof typeof RESPONSE_PRESETS]
    if (preset) {
      const nextCustomTimings = { ...customTimings }
      delete nextCustomTimings[mapping.target]
      updateCustomTimings(nextCustomTimings)
      updateMapping(preset)
    }
  }

  function changeTiming(key: 'attack' | 'release', value: number) {
    if (!mapping) return
    const nextValue = clamp(value, 0, key === 'attack' ? 2 : 5)
    updateCustomTimings({ ...customTimings, [mapping.target]: { attack: mapping.attack, release: mapping.release, [key]: nextValue } })
    updateMapping({ [key]: nextValue })
  }

  function updateCustomTimings(drafts: MusicResponseTimingDrafts) {
    if (customTimingDrafts === undefined) setInternalCustomTiming(drafts)
    onCustomTimingDraftsChange?.(drafts)
  }

  function toggleAdvanced() {
    if (onAdvancedToggle) onAdvancedToggle()
    else setIsAdvancedOpen(open => !open)
  }

  return (
    <section className="music-response-controls" aria-labelledby={`${id}-title`}>
      <div className="motion-controls__group-heading">
        <h3 id={`${id}-title`}>Music response</h3>
      </div>
      <div className="music-response-controls__surface motion-controls__surface">
      <SelectField
        fieldClassName="scene-field--plain"
        id={`${id}-mode`} label="Response mode" value={mode}
        description={mode === 'transient-v1'
          ? 'This scene keeps its saved beat response until you choose a version.'
          : 'Choose which music-response system the scene uses.'}
        options={[
          ...(mode === 'transient-v1' ? [{ value: 'transient-v1', label: 'Saved beat response', disabled: true }] : []),
          { value: 'legacy', label: 'Version 1 — Original' },
          { value: 'mapped-v1', label: 'Version 2 — Selective' },
        ]}
        onChange={(value) => onModeChange(value as SceneAudioResponseMode)}
      />
      {mode === 'legacy' ? (
        <fieldset className="music-response-controls__group">
          <legend>Original response tuning</legend>
          <div className="music-response-controls__grid">
            <SliderField
              id={`${id}-gain`} label="Input gain" numericLabel="Input gain numeric value"
              description="How strongly the scene picks up music before shaping its response."
              min={0.01} max={2} step={0.01} value={classicSettings.inputGain}
              onChange={(value) => onClassicSettingChange('inputGain', value)}
            />
            <SliderField
              id={`${id}-peaks`} label="Peak emphasis" numericLabel="Peak emphasis numeric value"
              description="Higher values emphasize peaks over quieter sounds."
              min={1} max={10} step={0.1} value={classicSettings.peakEmphasis}
              onChange={(value) => onClassicSettingChange('peakEmphasis', value)}
            />
            <SliderField
              id={`${id}-resting`} label="Resting response" numericLabel="Resting response numeric value"
              description="Adds a baseline response, including during silence."
              min={0.01} max={0.9} step={0.01} value={classicSettings.restingResponse}
              onChange={(value) => onClassicSettingChange('restingResponse', value)}
            />
            <SliderField
              id={`${id}-smoothing`} label="Smoothing" numericLabel="Smoothing numeric value"
              description="Lower values react quickly; higher values ease into each change."
              min={0.01} max={0.9} step={0.01} value={classicSettings.smoothing}
              onChange={(value) => onClassicSettingChange('smoothing', value)}
            />
          </div>
          <CollapsibleEditorGroup
            id={`${id}-advanced`} isOpen={advancedOpen || Boolean(errors[`${id}-offset`])}
            showLabel="Show advanced music controls" hideLabel="Hide advanced music controls"
            onToggle={toggleAdvanced}
          >
            <NumberField
              id={`${id}-offset`} label="Response offset"
              min={0} max={10}
              description="Adds an offset to the visual size response. Does not change listening volume."
              value={classicSettings.responseOffset}
              onChange={(value) => onClassicSettingChange('responseOffset', value)}
            />
          </CollapsibleEditorGroup>
        </fieldset>
      ) : mode === 'transient-v1' ? null : supportedTargets === null ? (
        <p className="music-response-controls__message" role="status">Available inputs will appear when this preview can run.</p>
      ) : !mapping ? (
        <p className="music-response-controls__message" role="status">This shader has no supported music-response inputs.</p>
      ) : (
        <>
          {targets.length > 1 ? (
            <SelectField
              id={`${id}-target`} label="Response target" value={mapping.target}
              options={targets.map((value) => ({ value, label: TARGET_LABELS[value] }))}
              onChange={(value) => setPreferredTarget(value as AudioResponseTarget)}
            />
          ) : null}
          <div className="music-response-controls__mapping">
            <fieldset className="music-response-controls__group">
              <legend>What should it react to?</legend>
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
              </div>
            </fieldset>
            <fieldset className="music-response-controls__group">
              <legend>How strongly should it react?</legend>
              <div className="music-response-controls__grid">
              <SliderField
                id={`${id}-amount`} label="Amount" numericLabel="Amount numeric value"
                description="How strongly this response follows the music. Set to 0 to turn it off. Most of the slider fine-tunes gentle movement; the far right adds stronger motion."
                min={0} max={4} step={0.001} numericStep="any" value={mapping.amount}
                rangeScale={musicResponseAmountScale} formatValue={formatMusicResponseAmount}
                onChange={(value) => updateMapping({ amount: clamp(value, 0, 4) })}
              />
              {follow === 'hit' || errors[`${id}-sensitivity`] ? <SliderField
                id={`${id}-sensitivity`} label="Hit sensitivity" numericLabel="Hit sensitivity numeric value"
                description="How easily sharp hits trigger a response. Shared by all movements following Sharp hits; does not affect Sustained sound, music volume, or movement strength."
                min={0.1} max={4} step={0.01} value={config.sensitivity}
                onChange={(value) => onConfigChange({ ...config, sensitivity: clamp(value, 0.1, 4) })}
              /> : null}
              </div>
            </fieldset>
            <fieldset className="music-response-controls__group">
              <legend>How should it move?</legend>
              <SelectField
                id={`${id}-response`} label="Response style" value={responsePreset}
                description="Choose a quick pulse or a slower, smoother response."
                options={[
                  { value: 'quick', label: 'Quick' }, { value: 'balanced', label: 'Balanced' },
                  { value: 'flowing', label: 'Flowing' }, { value: 'custom', label: 'Custom' },
                ]}
                onChange={changeResponse}
              />
              {responsePreset === 'custom' || errors[`${id}-attack`] || errors[`${id}-release`] ? <div className="music-response-controls__grid music-response-controls__timing">
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
              </div> : null}
            </fieldset>
          </div>
        </>
      )}
      <div className="music-response-controls__reset">
        <button
          className="scene-secondary-button" type="button" disabled={!canReset} aria-describedby={`${id}-reset-description`}
          onClick={() => { updateCustomTimings({}); onReset() }}
        >Reset music settings</button>
        <p id={`${id}-reset-description`}>Restore the music settings this scene started with.</p>
      </div>
      </div>
    </section>
  )
}
