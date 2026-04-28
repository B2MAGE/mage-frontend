import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { joinClassNames } from '@shared/lib'

type ScrollableTagBarProps = {
  ariaLabel: string
  barClassName?: string
  children: ReactNode
  role?: string
}

const SCROLL_EPSILON = 2

export function ScrollableTagBar({
  ariaLabel,
  barClassName,
  children,
  role,
}: ScrollableTagBarProps) {
  const barRef = useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  function updateScrollState() {
    const barElement = barRef.current

    if (!barElement) {
      return
    }

    const maxScrollLeft = Math.max(barElement.scrollWidth - barElement.clientWidth, 0)
    setCanScrollLeft(barElement.scrollLeft > SCROLL_EPSILON)
    setCanScrollRight(maxScrollLeft - barElement.scrollLeft > SCROLL_EPSILON)
  }

  useLayoutEffect(() => {
    updateScrollState()
  })

  useEffect(() => {
    const barElement = barRef.current

    if (!barElement) {
      return
    }

    function handleScrollStateChange() {
      updateScrollState()
    }

    barElement.addEventListener('scroll', handleScrollStateChange, { passive: true })
    window.addEventListener('resize', handleScrollStateChange)

    const ResizeObserverClass = window.ResizeObserver
    const resizeObserver =
      ResizeObserverClass === undefined
        ? null
        : new ResizeObserverClass(() => {
            handleScrollStateChange()
          })

    resizeObserver?.observe(barElement)
    handleScrollStateChange()

    return () => {
      barElement.removeEventListener('scroll', handleScrollStateChange)
      window.removeEventListener('resize', handleScrollStateChange)
      resizeObserver?.disconnect()
    }
  }, [])

  function scrollBar(direction: 'left' | 'right') {
    const barElement = barRef.current

    if (!barElement) {
      return
    }

    const scrollDistance = Math.max(Math.floor(barElement.clientWidth * 0.75), 160)
    const nextScrollLeft =
      direction === 'left'
        ? Math.max(barElement.scrollLeft - scrollDistance, 0)
        : Math.min(barElement.scrollLeft + scrollDistance, barElement.scrollWidth)

    if (typeof barElement.scrollTo === 'function') {
      barElement.scrollTo({
        left: nextScrollLeft,
        behavior: 'smooth',
      })
    } else {
      barElement.scrollLeft = nextScrollLeft
    }

    updateScrollState()
  }

  return (
    <div className="tag-filter-scroller">
      {canScrollLeft ? (
        <button
          aria-label="Scroll tags left"
          className="tag-filter-scroller__arrow tag-filter-scroller__arrow--left"
          onClick={() => {
            scrollBar('left')
          }}
          type="button"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M9.75 3.5 5.25 8l4.5 4.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            />
          </svg>
        </button>
      ) : null}

      <div
        ref={barRef}
        className={joinClassNames('tag-filter-bar', barClassName)}
        role={role}
        aria-label={ariaLabel}
      >
        {children}
      </div>

      {canScrollRight ? (
        <button
          aria-label="Scroll tags right"
          className="tag-filter-scroller__arrow tag-filter-scroller__arrow--right"
          onClick={() => {
            scrollBar('right')
          }}
          type="button"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M6.25 3.5 10.75 8l-4.5 4.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            />
          </svg>
        </button>
      ) : null}
    </div>
  )
}
