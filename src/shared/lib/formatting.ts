export function formatCompactCount(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`
  }

  return String(value)
}

export function formatMetricLabel(
  value: number,
  singularLabel: string,
  pluralLabel = `${singularLabel}s`,
) {
  const label = value === 1 ? singularLabel : pluralLabel
  return `${formatCompactCount(value)} ${label}`
}

export function formatCalendarDate(
  value: string | null | undefined,
  fallbackLabel = 'Recently',
) {
  if (!value) {
    return fallbackLabel
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsedDate)
}

export function formatRelativeTime(value: string, nowMs = Date.now()) {
  const thenMs = new Date(value).getTime()

  if (Number.isNaN(thenMs)) {
    return value
  }

  const diffMs = Math.max(nowMs - thenMs, 0)
  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)

  if (months > 0) return `${months} month${months === 1 ? '' : 's'} ago`
  if (weeks > 0) return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  if (seconds > 20) return `${seconds} seconds ago`
  return 'Just now'
}
