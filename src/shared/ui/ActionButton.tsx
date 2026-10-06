import type { ButtonHTMLAttributes } from 'react'
import { joinClassNames } from '@shared/lib'

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: 'normal' | 'compact'
  tone?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

export function ActionButton({
  className,
  size = 'normal',
  tone = 'secondary',
  type = 'button',
  ...props
}: ActionButtonProps) {
  return (
    <button
      {...props}
      className={joinClassNames(
        'ui-button',
        `ui-button--${tone}`,
        `ui-button--${size}`,
        className,
      )}
      type={type}
    />
  )
}
