import type { ButtonHTMLAttributes } from 'react'
import { joinClassNames } from '@shared/lib'
import { AppIcon } from './AppIcon'

type PaginationIconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children' | 'type'> & {
  direction: 'left' | 'right'
  label: string
}

function PaginationChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  const isLeft = direction === 'left'

  return (
    <span className="ui-pagination-button__icon" aria-hidden="true">
      <AppIcon name={isLeft ? 'chevron-left' : 'chevron-right'} size={16} />
    </span>
  )
}

export function PaginationIconButton({
  className,
  direction,
  label,
  ...buttonProps
}: PaginationIconButtonProps) {
  return (
    <button
      {...buttonProps}
      aria-label={label}
      className={joinClassNames('ui-pagination-button', className)}
      type="button"
    >
      <PaginationChevronIcon direction={direction} />
    </button>
  )
}
