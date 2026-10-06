import type { InputHTMLAttributes, ReactNode } from 'react'
import { joinClassNames } from '@shared/lib'
import './textInputField.css'

type TextInputFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> & {
  error?: string
  fieldClassName?: string
  hint?: string
  inputAction?: ReactNode
  inputPrefix?: string
  label: string
  labelSuffix?: ReactNode
}

export function TextInputField({
  error,
  fieldClassName,
  hint,
  id,
  inputAction,
  inputPrefix,
  label,
  labelSuffix,
  ...inputProps
}: TextInputFieldProps) {
  const hintId = hint && id ? `${id}-hint` : undefined
  const errorId = error && id ? `${id}-error` : undefined
  const describedByIds = [inputProps['aria-describedby'], hintId, errorId].filter(Boolean).join(' ')
  const isInvalid =
    Boolean(error) ||
    inputProps['aria-invalid'] === true ||
    inputProps['aria-invalid'] === 'true'

  const input = (
    <input
      {...inputProps}
      aria-describedby={describedByIds || undefined}
      aria-invalid={isInvalid || undefined}
      id={id}
    />
  )

  return (
    <div className={joinClassNames('field-group', 'ui-field', fieldClassName)}>
      <label htmlFor={id}>{label}{labelSuffix}</label>
      {inputPrefix || inputAction ? (
        <div className={joinClassNames(
          inputPrefix && 'text-input-control--prefixed',
          Boolean(inputAction) && 'text-input-control--action',
        )}>
          {inputPrefix ? <span className="text-input-prefix" aria-hidden="true">{inputPrefix}</span> : null}
          {input}
          {inputAction ? <span className="text-input-action">{inputAction}</span> : null}
        </div>
      ) : input}
      {hint ? (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
