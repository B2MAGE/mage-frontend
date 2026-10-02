import type { ReactNode } from 'react'

type PendingButtonLabelProps = {
  children: ReactNode
  pending: boolean
  pendingLabel: ReactNode
}

export function PendingButtonLabel({
  children,
  pending,
  pendingLabel,
}: PendingButtonLabelProps) {
  return (
    <span className="pending-button-label">
      <span
        aria-hidden={pending}
        className="pending-button-label__content"
        data-visible={!pending}
      >
        {children}
      </span>
      <span
        aria-hidden={!pending}
        className="pending-button-label__content pending-button-label__content--pending"
        data-visible={pending}
      >
        <span aria-hidden="true" className="pending-button-label__spinner" />
        {pendingLabel}
      </span>
    </span>
  )
}
