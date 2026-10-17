import { useLayoutEffect } from 'react'

/** Layout only: the studio, player and their state keep the same owners. */
export function useStudioFocusMode(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return

    const { scrollX, scrollY } = window
    const viewport = window.visualViewport
    const root = document.documentElement
    const updateViewport = () => {
      // Pinch zoom should remain browser-controlled, rather than resize the studio.
      if (viewport && viewport.scale !== 1) return
      root.style.setProperty('--studio-focus-height', `${viewport?.height ?? window.innerHeight}px`)
      root.style.setProperty('--studio-focus-top', `${viewport?.offsetTop ?? 0}px`)
    }

    updateViewport()
    document.body.classList.add('scene-studio-focused')
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)

    return () => {
      viewport?.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
      document.body.classList.remove('scene-studio-focused')
      root.style.removeProperty('--studio-focus-height')
      root.style.removeProperty('--studio-focus-top')
      window.scrollTo(scrollX, scrollY)
    }
  }, [active])
}
