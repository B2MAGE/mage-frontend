import type { ButtonHTMLAttributes } from 'react'
import { AppIcon } from './AppIcon'

type TableSortButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> & {
  active: boolean
  direction: 'asc' | 'desc'
  label: string
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean
  direction: 'asc' | 'desc'
}) {
  return (
    <span className="my-scenes-table__sort-indicator" aria-hidden="true">
      <AppIcon name={!active ? 'arrow-up-down' : direction === 'asc' ? 'arrow-up' : 'arrow-down'} size={16} />
    </span>
  )
}

export function TableSortButton({
  active,
  className,
  direction,
  label,
  ...buttonProps
}: TableSortButtonProps) {
  return (
    <button {...buttonProps} className={className} data-active={active} type="button">
      {label}
      <SortIndicator active={active} direction={direction} />
    </button>
  )
}
