import { useEffect, useRef, useState } from 'react'

export function useSceneEditorActionBarState() {
  const [isActionBarStuck, setIsActionBarStuck] = useState(false)
  const actionBarSentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const sentinel = actionBarSentinelRef.current

    if (!sentinel || typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsActionBarStuck(entry.intersectionRatio < 1)
      },
      {
        threshold: 1,
      },
    )

    observer.observe(sentinel)

    return () => {
      observer.disconnect()
    }
  }, [])

  return {
    actionBarSentinelRef,
    isActionBarStuck,
  }
}
