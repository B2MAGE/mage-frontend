import { EngagementButton } from '@shared/ui'

export function VoteButton({
  className,
  count,
  disabled = false,
  direction,
  isBusy = false,
  isSelected = false,
  onClick,
}: {
  className: string
  count: string
  disabled?: boolean
  direction: 'up' | 'down'
  isBusy?: boolean
  isSelected?: boolean
  onClick?: () => void
}) {
  const label = direction === 'up' ? 'Upvote' : 'Downvote'

  return (
    <EngagementButton
      ariaLabel={label + ' ' + count}
      className={className}
      count={count}
      disabled={disabled}
      isBusy={isBusy}
      isSelected={isSelected}
      kind={direction === 'up' ? 'upvote' : 'downvote'}
      onClick={onClick}
    />
  )
}
