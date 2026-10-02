import type { MouseEventHandler } from 'react'
import { joinClassNames } from '@shared/lib'
import { AppIcon } from './AppIcon'
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

function EngagementIcon({
  isSelected,
  kind,
}: {
  isSelected: boolean
  kind: EngagementButtonKind
}) {
  return (
    <AppIcon
      name={kind === 'save' ? 'heart' : kind === 'upvote' ? 'arrow-up' : 'arrow-down'}
      className="engagement-button__svg"
      data-icon={kind}
      fill={kind === 'save' && isSelected ? 'currentColor' : 'none'}
    />
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
