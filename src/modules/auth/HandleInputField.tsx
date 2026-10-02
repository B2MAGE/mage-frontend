import type { ComponentProps } from 'react'
import { TextInputField } from '@shared/ui'
import { HANDLE_INPUT_MAX_LENGTH } from './handle'

type HandleInputFieldProps = Omit<
  ComponentProps<typeof TextInputField>,
  'inputPrefix' | 'maxLength' | 'onChange' | 'onPaste' | 'type' | 'value'
> & {
  onValueChange: (value: string) => void
  value: string
}

export function HandleInputField({
  autoCapitalize = 'none',
  autoComplete = 'username',
  name = 'handle',
  onValueChange,
  spellCheck = false,
  value,
  ...inputProps
}: HandleInputFieldProps) {
  return (
    <TextInputField
      {...inputProps}
      autoCapitalize={autoCapitalize}
      autoComplete={autoComplete}
      inputPrefix="@"
      maxLength={HANDLE_INPUT_MAX_LENGTH - 1}
      name={name}
      onChange={(event) => onValueChange(event.target.value.replace(/^\s*@*/, ''))}
      onPaste={(event) => {
        const pastedHandle = event.clipboardData.getData('text').trim()
        if (!pastedHandle.startsWith('@')) return
        event.preventDefault()
        const input = event.currentTarget
        const start = input.selectionStart ?? 0
        const end = input.selectionEnd ?? start
        const nextHandle = input.value.slice(0, start) + pastedHandle.replace(/^@+/, '') + input.value.slice(end)
        onValueChange(nextHandle.slice(0, HANDLE_INPUT_MAX_LENGTH - 1))
      }}
      spellCheck={spellCheck}
      type="text"
      value={value}
    />
  )
}
