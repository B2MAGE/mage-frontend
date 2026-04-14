function UpvoteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 3.8a1 1 0 0 1 .8.4l5.7 7.2a1 1 0 0 1-.8 1.6h-3.3V19a1.2 1.2 0 0 1-1.2 1.2h-2.4a1.2 1.2 0 0 1-1.2-1.2V13H6.3a1 1 0 0 1-.8-1.6l5.7-7.2a1 1 0 0 1 .8-.4Z"
        fill="currentColor"
      />
    </svg>
  )
}

function DownvoteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M11.2 20.2a1 1 0 0 1-.8-.4l-5.7-7.2a1 1 0 0 1 .8-1.6h3.3V5a1.2 1.2 0 0 1 1.2-1.2h2.4A1.2 1.2 0 0 1 13.6 5v6h3.3a1 1 0 0 1 .8 1.6l-5.7 7.2a1 1 0 0 1-.8.4Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function VoteButton({
  className,
  count,
  direction,
}: {
  className: string
  count: string
  direction: 'up' | 'down'
}) {
  const label = direction === 'up' ? 'Upvote' : 'Downvote'
  const Icon = direction === 'up' ? UpvoteIcon : DownvoteIcon

  return (
    <button aria-label={`${label} ${count}`} className={className} type="button">
      <span className="scene-detail-vote-button__icon" aria-hidden="true">
        <Icon />
      </span>
      <span>{count}</span>
    </button>
  )
}
