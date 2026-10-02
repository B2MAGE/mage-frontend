import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

export function RouteScrollReset() {
  const { pathname, hash } = useLocation()
  const navigationType = useNavigationType()
  const previousPathname = useRef(pathname)

  useLayoutEffect(() => {
    const pageChanged = previousPathname.current !== pathname
    previousPathname.current = pathname

    // Leave history restoration, in-page anchors, and filter changes to the browser/page.
    if (!pageChanged || navigationType === 'POP' || hash) return

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash, navigationType])

  return null
}
