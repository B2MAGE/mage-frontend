import type { InputHTMLAttributes } from 'react'
import { joinClassNames } from '@shared/lib'

type TextInputFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> & {
  error?: string
  fieldClassName?: string
  hint?: string
  label: string
}

export function TextInputField({
  error,
  fieldClassName,
  hint,
  id,
  label,
  ...inputProps
}: TextInputFieldProps) {
  const hintId = hint && id ? `${id}-hint` : undefined
  const errorId = error && id ? `${id}-error` : undefined
  const describedByIds = [inputProps['aria-describedby'], hintId, errorId].filter(Boolean).join(' ')
  const isInvalid =
    Boolean(error) ||
    inputProps['aria-invalid'] === true ||
    inputProps['aria-invalid'] === 'true'

  return (
    <div className={joinClassNames('field-group', fieldClassName)}>
      <label htmlFor={id}>{label}</label>
      <input
        {...inputProps}
        aria-describedby={describedByIds || undefined}
        aria-invalid={isInvalid || undefined}
        id={id}
      />
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
