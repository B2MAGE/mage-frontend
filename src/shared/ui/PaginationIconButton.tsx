import type { ButtonHTMLAttributes } from 'react'
import { joinClassNames } from '@shared/lib'
import { AppIcon } from './AppIcon'

type PaginationIconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children' | 'type'> & {
  direction: 'left' | 'right'
  double?: boolean
  label: string
}

function PaginationChevronIcon({
  direction,
  double = false,
}: {
  direction: 'left' | 'right'
  double?: boolean
}) {
  const isLeft = direction === 'left'

  return (
    <span className="ui-pagination-button__icon" aria-hidden="true">
      <AppIcon
        name={double ? (isLeft ? 'chevrons-left' : 'chevrons-right') : (isLeft ? 'chevron-left' : 'chevron-right')}
        size={16}
      />
    </span>
  )
}

export function PaginationIconButton({
  className,
  direction,
  double = false,
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
      <PaginationChevronIcon direction={direction} double={double} />
    </button>
  )
}
