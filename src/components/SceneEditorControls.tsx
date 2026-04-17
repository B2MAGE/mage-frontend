import type { ChangeEvent, PropsWithChildren, ReactNode } from 'react'
import type { Vector3Value } from '../lib/sceneEditor'

type SectionProps = PropsWithChildren<{
  className?: string
  description: string
  title: string
}>

type SelectFieldProps = {
  description?: string
  id: string
  label: string
  onChange: (value: string) => void
  options: Array<{
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
}

type ToggleFieldProps = {
  compact?: boolean
  description?: string
  id: string
  label: string
  onChange: (checked: boolean) => void
  checked: boolean
}

type Vector3FieldProps = {
  description?: string
  id: string
  label: string
  onChange: (nextValue: Vector3Value) => void
  step?: number
  value: Vector3Value
}

type EffectCardProps = PropsWithChildren<{
  description: string
  enabled?: boolean
  footer?: ReactNode
  onToggle?: (enabled: boolean) => void
  title: string
}>

function buildClassName(...classNames: Array<string | undefined | false>) {
  return classNames.filter(Boolean).join(' ')
}

function FieldShell({
  children,
  description,
  htmlFor,
  label,
}: PropsWithChildren<{
  description?: string
  htmlFor?: string
  label: string
}>) {
  return (
    <div className="scene-field">
      <div className="scene-field__shell">
        <div className="scene-field__top">
          <div className="scene-field__copy">
            <div className="scene-field__label-row">
              <label className="scene-field__label" htmlFor={htmlFor}>
                {label}
              </label>
            </div>
            {description ? <p className="scene-field__description">{description}</p> : null}
          </div>
        </div>
        <div className="scene-field__control">{children}</div>
      </div>
    </div>
  )
}

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
  return (
    <section className={buildClassName('scene-editor-section', className)}>
      <div className="scene-editor-section__header">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="scene-editor-section__content">{children}</div>
    </section>
  )
}

export function SelectField({
  description,
  id,
  label,
  onChange,
  options,
  value,
}: SelectFieldProps) {
  return (
    <FieldShell description={description} htmlFor={id} label={label}>
      <select
        className="scene-select"
        id={id}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
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
    <FieldShell description={description} htmlFor={id} label={label}>
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
    </FieldShell>
  )
}

export function SliderField({
  description,
  formatValue,
  id,
  label,
  max,
  min,
  onChange,
  step = 0.01,
  value,
}: SliderFieldProps) {
  return (
    <div className="scene-field scene-field--slider">
      <div className="scene-slider">
        <div className="scene-slider__top">
          <div className="scene-slider__copy">
            <div className="scene-field__label-row">
              <label className="scene-field__label" htmlFor={id}>
                {label}
              </label>
            </div>
            {description ? <p className="scene-field__description">{description}</p> : null}
          </div>
          <output className="scene-slider__value" htmlFor={id}>
            {formatSliderValue(value, formatValue)}
          </output>
        </div>
        <div className="scene-slider__controls">
          <input
            className="scene-slider__range"
            id={id}
            max={max}
            min={min}
            onChange={(event) => forwardNumericValue(event, onChange)}
            step={step}
            type="range"
            value={value}
          />
          <input
            aria-label="Numeric value"
            className="scene-slider__number"
            max={max}
            min={min}
            onChange={(event) => forwardNumericValue(event, onChange)}
            step={step}
            type="number"
            value={Number.isFinite(value) ? value : ''}
          />
        </div>
      </div>
    </div>
  )
}

export function ToggleField({
  checked,
  compact = false,
  description,
  id,
  label,
  onChange,
}: ToggleFieldProps) {
  return (
    <div className={buildClassName('scene-toggle-field', compact && 'scene-toggle-field--compact')}>
      <div className={buildClassName('scene-toggle', compact && 'scene-toggle--compact')}>
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
              checked={checked}
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
    <FieldShell description={description} htmlFor={id} label={label}>
      <div className="scene-vector-field" id={id}>
        {(['x', 'y', 'z'] as Array<keyof Vector3Value>).map((axis) => (
          <label className="scene-vector-field__axis" key={axis}>
            <span>{axis.toUpperCase()}</span>
            <input
              className="scene-number-input"
              onChange={(event) => forwardNumericValue(event, (nextValue) => handleAxisChange(axis, nextValue))}
              step={step}
              type="number"
              value={Number.isFinite(value[axis]) ? value[axis] : ''}
            />
          </label>
        ))}
      </div>
    </FieldShell>
  )
}

export function EffectCard({
  children,
  description,
  enabled,
  footer,
  onToggle,
  title,
}: EffectCardProps) {
  const isEnabled = enabled ?? true
  const hasContent = children !== undefined && children !== null
  const toggleId = `${title.toLowerCase().replace(/\s+/g, '-')}-toggle`

  return (
    <section className={buildClassName('effect-card-group', !isEnabled && 'is-disabled')}>
      <div className="surface surface--nested effect-card">
        <div className="effect-card__header">
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          {onToggle ? (
            <ToggleField
              checked={isEnabled}
              compact
              id={toggleId}
              label={isEnabled ? 'On' : 'Off'}
              onChange={onToggle}
            />
          ) : null}
        </div>
      </div>
      {isEnabled && (hasContent || footer) ? (
        <div className="effect-card__details">
          {hasContent ? <div className="effect-card__content">{children}</div> : null}
          {footer ? <div className="effect-card__footer">{footer}</div> : null}
        </div>
      ) : null}
    </section>
  )
}
