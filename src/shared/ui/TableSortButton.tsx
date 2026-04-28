import type { ButtonHTMLAttributes } from 'react'

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
      <svg viewBox="0 0 16 16" fill="none">
        <path
          d="M8 3.5 5.25 6.25h5.5L8 3.5Z"
          fill="currentColor"
          opacity={active && direction === 'asc' ? '1' : '0.45'}
        />
        <path
          d="m8 12.5 2.75-2.75h-5.5L8 12.5Z"
          fill="currentColor"
          opacity={active && direction === 'desc' ? '1' : '0.45'}
        />
      </svg>
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
