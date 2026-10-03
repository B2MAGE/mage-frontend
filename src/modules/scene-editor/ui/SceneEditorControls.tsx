import type { ChangeEvent, PropsWithChildren, ReactNode } from 'react'
import type { Vector3Value } from '../sceneEditor'
import { joinClassNames } from '@shared/lib'
import { EditorFieldShell, SliderFieldShell, SurfaceCard } from '@shared/ui'

type SectionProps = PropsWithChildren<{
  className?: string
  description: string
  title: string
}>

type SelectFieldProps = {
  description?: string
  fieldClassName?: string
  id: string
  label: string
  onChange: (value: string) => void
  options: Array<{
    disabled?: boolean
    label: string
    value: string
  }>
  value: string
}

type NumberFieldProps = {
  description?: string
  id: string
  label: string
  max?: number
  min?: number
  onChange: (value: number) => void
  placeholder?: string
  step?: number
  value: number
}

type SliderFieldProps = NumberFieldProps & {
  formatValue?: (value: number) => string
  numericLabel?: string
  numericStep?: number | 'any'
  rangeScale?: {
    min: number
    max: number
    step: number
    toRange: (value: number) => number
    fromRange: (value: number) => number
  }
}

type ToggleFieldProps = {
  disabled?: boolean
  ariaLabel?: string
  compact?: boolean
  description?: string
  id: string
  label: string
  onChange: (checked: boolean) => void
  checked: boolean
}

type Vector3FieldProps = {
  min?: number
  max?: number
  description?: string
  id: string
  label: string
  onChange: (nextValue: Vector3Value) => void
  step?: number
  value: Vector3Value
}

type EffectCardProps = PropsWithChildren<{
  toggleDisabled?: boolean
  description: string
  enabled?: boolean
  footer?: ReactNode
  onToggle?: (enabled: boolean) => void
  title: string
  toggleLabel?: string
}>

function readNumericValue(event: ChangeEvent<HTMLInputElement>) {
  return event.currentTarget.valueAsNumber
}

function forwardNumericValue(event: ChangeEvent<HTMLInputElement>, onChange: (value: number) => void) {
  const nextValue = readNumericValue(event)

  if (Number.isFinite(nextValue)) {
    onChange(nextValue)
  }
}

function formatSliderValue(value: number, formatValue?: (value: number) => string) {
  if (formatValue) {
    return formatValue(value)
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

export function SceneSection({ children, className, description, title }: SectionProps) {
  const headings: Record<string, { number: number; title: string }> = {
    Details: { number: 1, title: 'Start with the basics.' },
    Scene: { number: 2, title: 'Choose the visual foundation.' },
    Camera: { number: 3, title: 'Frame the scene.' },
    Motion: { number: 4, title: 'Tune how it moves.' },
    Effects: { number: 5, title: 'Finish the look.' },
    'Pass Order': { number: 6, title: 'Control the effect stack.' },
    Confirm: { number: 7, title: 'Review before publishing.' },
  }
  const heading = headings[title]

  return (
    <section className={joinClassNames('scene-editor-section', className)} data-section={title}>
      <div className="scene-editor-section__header">
        {heading ? <span className="scene-editor-section__eyebrow">{heading.number} · {title}</span> : null}
        <h2>{heading?.title ?? title}</h2>
        <p>{description}</p>
      </div>
      <div className="scene-editor-section__content">{children}</div>
    </section>
  )
}

export function SelectField({
  description,
  fieldClassName,
  id,
  label,
  onChange,
  options,
  value,
}: SelectFieldProps) {
  return (
    <EditorFieldShell description={description} fieldClassName={fieldClassName} htmlFor={id} label={label}>
      <select
        className="mage-select"
        id={id}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option disabled={option.disabled} key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </EditorFieldShell>
  )
}

export function NumberField({
  description,
  id,
  label,
  max,
  min,
  onChange,
  placeholder,
  step = 0.01,
  value,
}: NumberFieldProps) {
  return (
    <EditorFieldShell description={description} htmlFor={id} label={label}>
      <input
        className="scene-number-input"
        id={id}
        max={max}
        min={min}
        onChange={(event) => forwardNumericValue(event, onChange)}
        placeholder={placeholder}
        step={step}
        type="number"
        value={Number.isFinite(value) ? value : ''}
      />
    </EditorFieldShell>
  )
}

export function SliderField({
  description,
  formatValue,
  id,
  label,
  max,
  min,
  numericLabel = 'Numeric value',
  numericStep,
  onChange,
  rangeScale,
  step = 0.01,
  value,
}: SliderFieldProps) {
  return (
    <SliderFieldShell
      description={description}
      htmlFor={id}
      label={label}
      valueLabel={formatSliderValue(value, formatValue)}
    >
      <input
        aria-valuetext={rangeScale ? String(value) : undefined}
        className="scene-slider__range"
        id={id}
        max={rangeScale?.max ?? max}
        min={rangeScale?.min ?? min}
        onChange={(event) => forwardNumericValue(event, (next) => onChange(rangeScale ? rangeScale.fromRange(next) : next))}
        step={rangeScale?.step ?? step}
        type="range"
        value={rangeScale ? rangeScale.toRange(value) : value}
      />
      <input
        aria-label={numericLabel}
        className="scene-slider__number"
        max={max}
        min={min}
        onChange={(event) => forwardNumericValue(event, onChange)}
        onKeyDown={numericStep === 'any' ? (event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          event.preventDefault()
          const next = Number((value + (event.key === 'ArrowUp' ? step : -step)).toPrecision(15))
          onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next)))
        } : undefined}
        step={numericStep ?? step}
        type="number"
        value={Number.isFinite(value) ? value : ''}
      />
    </SliderFieldShell>
  )
}

export function ToggleField({
  disabled,
  ariaLabel,
  checked,
  compact = false,
  description,
  id,
  label,
  onChange,
}: ToggleFieldProps) {
  return (
    <div className={joinClassNames('scene-toggle-field', compact && 'scene-toggle-field--compact')}>
      <div className={joinClassNames('scene-toggle', compact && 'scene-toggle--compact')}>
        <div className="scene-toggle__top">
          <div className="scene-toggle__copy">
            <div className="scene-toggle__label-row">
              <label className="scene-toggle__label" htmlFor={id}>
                {label}
              </label>
            </div>
            {description ? <p className="scene-field__description">{description}</p> : null}
          </div>
          <span className="scene-toggle__control">
            <input
              aria-label={ariaLabel}
              checked={checked}
              disabled={disabled}
              className="scene-toggle__input"
              id={id}
              onChange={(event) => onChange(event.currentTarget.checked)}
              type="checkbox"
            />
            <label className="scene-toggle__switch" htmlFor={id}>
              <span className="scene-toggle__track" aria-hidden="true" />
            </label>
          </span>
        </div>
      </div>
    </div>
  )
}

export function Vector3Field({
  min,
  max,
  description,
  id,
  label,
  onChange,
  step = 0.1,
  value,
}: Vector3FieldProps) {
  function handleAxisChange(axis: keyof Vector3Value, nextValue: number) {
    onChange({
      ...value,
      [axis]: nextValue,
    })
  }

  return (
    <EditorFieldShell description={description} htmlFor={id} label={label}>
      <div className="scene-vector-field" id={id}>
        {(['x', 'y', 'z'] as Array<keyof Vector3Value>).map((axis) => (
          <label className="scene-vector-field__axis" key={axis}>
            <span>{axis.toUpperCase()}</span>
            <input
              className="scene-number-input"
              min={min}
              max={max}
              aria-label={`${label} ${axis.toUpperCase()}`}
              onChange={(event) => forwardNumericValue(event, (nextValue) => handleAxisChange(axis, nextValue))}
              step={step}
              type="number"
              value={Number.isFinite(value[axis]) ? value[axis] : ''}
            />
          </label>
        ))}
      </div>
    </EditorFieldShell>
  )
}

export function EffectCard({
  toggleDisabled,
  children,
  description,
  enabled,
  footer,
  onToggle,
  title,
  toggleLabel,
}: EffectCardProps) {
  const isEnabled = enabled ?? true
  const hasContent = children !== undefined && children !== null
  const toggleId = `${title.toLowerCase().replace(/\s+/g, '-')}-toggle`

  return (
    <section className={joinClassNames('effect-card-group', !isEnabled && 'is-disabled')}>
      <SurfaceCard as="div" className="effect-card" tone="nested">
        <div className="effect-card__header">
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          {onToggle ? (
            <ToggleField
              ariaLabel={toggleLabel}
              checked={isEnabled}
              disabled={toggleDisabled}
              compact
              id={toggleId}
              label={isEnabled ? 'On' : 'Off'}
              onChange={onToggle}
            />
          ) : null}
        </div>
      </SurfaceCard>
      {isEnabled && (hasContent || footer) ? (
        <div className="effect-card__details">
          {hasContent ? <div className="effect-card__content">{children}</div> : null}
          {footer ? <div className="effect-card__footer">{footer}</div> : null}
        </div>
      ) : null}
    </section>
  )
}
