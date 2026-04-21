import type { ButtonHTMLAttributes } from 'react'

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
    <span className="my-scenes-pagination__icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none">
        {double ? (
          <>
            <path
              d={isLeft ? 'M9.5 4.5 6 8l3.5 3.5' : 'M6.5 4.5 10 8l-3.5 3.5'}
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={isLeft ? 'M13 4.5 9.5 8 13 11.5' : 'M3 4.5 6.5 8 3 11.5'}
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : (
          <path
            d={isLeft ? 'M10.5 4.5 7 8l3.5 3.5' : 'M5.5 4.5 9 8l-3.5 3.5'}
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
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
    <button {...buttonProps} aria-label={label} className={className} type="button">
      <PaginationChevronIcon direction={direction} double={double} />
    </button>
  )
}
