import type { PropsWithChildren } from 'react'
import { joinClassNames } from '@shared/lib'

type EditorFieldShellProps = PropsWithChildren<{
  description?: string
  fieldClassName?: string
  htmlFor?: string
  label: string
}>

type SliderFieldShellProps = PropsWithChildren<{
  description?: string
  htmlFor: string
  label: string
  valueLabel: string
}>

export function EditorFieldShell({
  children,
  description,
  fieldClassName,
  htmlFor,
  label,
}: EditorFieldShellProps) {
  return (
    <div className={joinClassNames('scene-field', fieldClassName)}>
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

export function SliderFieldShell({
  children,
  description,
  htmlFor,
  label,
  valueLabel,
}: SliderFieldShellProps) {
  return (
    <div className="scene-field scene-field--slider">
      <div className="scene-slider">
        <div className="scene-slider__top">
          <div className="scene-slider__copy">
            <div className="scene-field__label-row">
              <label className="scene-field__label" htmlFor={htmlFor}>
                {label}
              </label>
            </div>
            {description ? <p className="scene-field__description">{description}</p> : null}
          </div>
          <output className="scene-slider__value" htmlFor={htmlFor}>
            {valueLabel}
          </output>
        </div>
        <div className="scene-slider__controls">{children}</div>
      </div>
    </div>
  )
}
