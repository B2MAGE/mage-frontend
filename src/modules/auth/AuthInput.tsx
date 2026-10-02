import { useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

type AuthInputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string
  hint?: string
  label: string
  children?: ReactNode
}

export function AuthInput({ children, error, hint, id, label, type, ...inputProps }: AuthInputProps) {
  const [visible, setVisible] = useState(false)
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [inputProps['aria-describedby'], hintId, errorId].filter(Boolean).join(' ')

  return (
    <div className="field-group auth-field">
      <div className="auth-field-label-row">
        <label htmlFor={id}>{label}</label>
        {error ? <span className="field-error" id={errorId} role="alert">{error}</span> : null}
      </div>
      <div className={type === 'password' ? 'auth-password-wrap' : undefined}>
        <input {...inputProps} aria-describedby={describedBy || undefined} aria-invalid={Boolean(error) || undefined} id={id} type={type === 'password' && visible ? 'text' : type} />
        {type === 'password' ? (
          <button className="auth-show-password" type="button" aria-controls={id} aria-pressed={visible} onClick={() => setVisible(!visible)}>
            {visible ? 'Hide' : 'Show'}
          </button>
        ) : null}
      </div>
      {hint ? <p className="field-hint" id={hintId}>{hint}</p> : null}
      {children}
    </div>
  )
}
