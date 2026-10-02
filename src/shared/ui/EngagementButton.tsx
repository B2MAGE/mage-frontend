import type { MouseEventHandler } from 'react'
import { joinClassNames } from '@shared/lib'
import './EngagementButton.css'

export type EngagementButtonKind = 'upvote' | 'downvote' | 'save'

export type EngagementButtonProps = {
  ariaLabel: string
  className?: string
  count: string | number
  disabled?: boolean
  isBusy?: boolean
  isSelected?: boolean
  kind: EngagementButtonKind
  onClick?: MouseEventHandler<HTMLButtonElement>
}

const arrowPath =
  'M12 3.8a1 1 0 0 1 .8.4l5.7 7.2a1 1 0 0 1-.8 1.6h-3.3V19a1.2 1.2 0 0 1-1.2 1.2h-2.4A1.2 1.2 0 0 1 9.6 19V13H6.3a1 1 0 0 1-.8-1.6l5.7-7.2a1 1 0 0 1 .8-.4Z'

const heartPath =
  'M12 20.25S4.5 15.76 4.5 9.73A4.23 4.23 0 0 1 12 7.04a4.23 4.23 0 0 1 7.5 2.69c0 6.03-7.5 10.52-7.5 10.52Z'

function EngagementIcon({
  isSelected,
  kind,
}: {
  isSelected: boolean
  kind: EngagementButtonKind
}) {
  if (kind === 'save') {
    return (
      <svg
        className="engagement-button__svg"
        data-icon="save"
        viewBox="0 0 24 24"
      >
        <path
          d={heartPath}
          fill={isSelected ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    )
  }

  return (
    <svg
      className="engagement-button__svg"
      data-icon={kind}
      viewBox="0 0 24 24"
    >
      <path
        d={arrowPath}
        fill="currentColor"
        transform={kind === 'downvote' ? 'rotate(180 12 12)' : undefined}
      />
    </svg>
  )
}

export function EngagementButton({
  ariaLabel,
  className,
  count,
  disabled = false,
  isBusy = false,
  isSelected = false,
  kind,
  onClick,
}: EngagementButtonProps) {
  return (
    <button
      aria-busy={isBusy}
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      className={joinClassNames(
        'engagement-button',
        className,
        isSelected && 'is-selected',
      )}
      data-busy={isBusy}
      data-kind={kind}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span
        aria-hidden="true"
        className="engagement-button__content"
      >
        <span className="engagement-button__icon">
          <span className="engagement-button__icon-visual" data-visible={!isBusy}>
            <EngagementIcon isSelected={isSelected} kind={kind} />
          </span>
          <span
            className="engagement-button__spinner"
            data-visible={isBusy}
          />
        </span>
        <span className="engagement-button__count">{count}</span>
      </span>
    </button>
  )
}
