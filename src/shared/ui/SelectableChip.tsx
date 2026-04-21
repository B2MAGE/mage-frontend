import type { ButtonHTMLAttributes } from 'react'
import { joinClassNames } from '@shared/lib'

type SelectableChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  active: boolean
  activeClassName?: string
}

export function SelectableChip({
  active,
  activeClassName,
  className,
  ...buttonProps
}: SelectableChipProps) {
  return (
    <button
      {...buttonProps}
      className={joinClassNames(className, active && activeClassName)}
      data-active={active}
      type="button"
    />
  )
}
