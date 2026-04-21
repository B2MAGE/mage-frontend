import type { PropsWithChildren } from 'react'
import { joinClassNames } from '@shared/lib'

type FormNoticeProps = PropsWithChildren<{
  className?: string
  id?: string
  tone: 'error' | 'note'
}>

export function FormNotice({ children, className, id, tone }: FormNoticeProps) {
  return (
    <div
      className={joinClassNames(tone === 'error' ? 'form-alert' : 'form-note', className)}
      id={id}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  )
}
