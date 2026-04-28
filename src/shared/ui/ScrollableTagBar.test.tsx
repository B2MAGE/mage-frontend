import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ScrollableTagBar } from './ScrollableTagBar'

function setScrollableDimensions(
  element: HTMLElement,
  {
    clientWidth,
    scrollWidth,
    scrollLeft,
  }: {
    clientWidth: number
    scrollWidth: number
    scrollLeft?: number
  },
) {
  let currentScrollLeft = scrollLeft ?? 0

  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    get: () => clientWidth,
  })

  Object.defineProperty(element, 'scrollWidth', {
    configurable: true,
    get: () => scrollWidth,
  })

  Object.defineProperty(element, 'scrollLeft', {
    configurable: true,
    get: () => currentScrollLeft,
    set: (value: number) => {
      currentScrollLeft = value
    },
  })

  Object.defineProperty(element, 'scrollTo', {
    configurable: true,
    value: ({ left }: { left?: number }) => {
      currentScrollLeft = left ?? currentScrollLeft
      fireEvent.scroll(element)
    },
  })
}

describe('ScrollableTagBar', () => {
  it('hides arrows when the tags fit without horizontal scrolling', async () => {
    render(
      <ScrollableTagBar ariaLabel="Demo tags" role="toolbar">
        <button className="tag-pill" type="button">
          All
        </button>
        <button className="tag-pill" type="button">
          ambient
        </button>
      </ScrollableTagBar>,
    )

    const toolbar = screen.getByRole('toolbar', { name: 'Demo tags' })
    setScrollableDimensions(toolbar, {
      clientWidth: 320,
      scrollWidth: 320,
    })

    fireEvent(window, new Event('resize'))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /scroll tags left/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /scroll tags right/i })).not.toBeInTheDocument()
    })
  })

  it('shows only the arrows for directions that can still scroll', async () => {
    const user = userEvent.setup()

    render(
      <ScrollableTagBar ariaLabel="Scrollable tags" role="toolbar">
        <button className="tag-pill" type="button">
          All
        </button>
        <button className="tag-pill" type="button">
          ambient
        </button>
        <button className="tag-pill" type="button">
          focus
        </button>
        <button className="tag-pill" type="button">
          house
        </button>
        <button className="tag-pill" type="button">
          drift
        </button>
      </ScrollableTagBar>,
    )

    const toolbar = screen.getByRole('toolbar', { name: 'Scrollable tags' })
    setScrollableDimensions(toolbar, {
      clientWidth: 220,
      scrollWidth: 520,
    })

    fireEvent(window, new Event('resize'))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /scroll tags left/i })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /scroll tags right/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /scroll tags right/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /scroll tags left/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /scroll tags right/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /scroll tags right/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /scroll tags left/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /scroll tags right/i })).not.toBeInTheDocument()
    })
  })
})
