import type { HTMLAttributes } from 'react'

type SkeletonProps = HTMLAttributes<HTMLSpanElement> & {
  shape?: 'block' | 'circle' | 'line'
}

export function Skeleton({
  className,
  shape = 'block',
  ...props
}: SkeletonProps) {
  return (
    <span
      {...props}
      aria-hidden="true"
      className={['skeleton', `skeleton--${shape}`, className].filter(Boolean).join(' ')}
    />
  )
}
