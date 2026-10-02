import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoadingRegion } from './LoadingRegion'
import { Skeleton } from './Skeleton'

describe('LoadingRegion', () => {
  it('keeps the landmark while exposing one polite loading announcement', () => {
    render(
      <LoadingRegion as="main" label="Loading the scene editor">
        <Skeleton className="demo-skeleton" />
      </LoadingRegion>,
    )

    const landmark = screen.getByRole('main')
    expect(landmark).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Loading the scene editor')
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1)
    expect(document.querySelector('.loading-region__visual')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps skeleton shapes decorative', () => {
    const { container } = render(<Skeleton shape="circle" />)

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstChild).toHaveClass('skeleton', 'skeleton--circle')
  })
})
