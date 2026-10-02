import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SceneCollectionState } from './SceneCollectionState'

describe('SceneCollectionState', () => {
  it.each(['empty', 'error'] as const)('keeps the %s state icon decorative and its action accessible', (kind) => {
    const { container } = render(
      <SceneCollectionState
        action={<button type="button">Continue</button>}
        description="Try browsing another collection."
        kind={kind}
        title="Scenes unavailable"
      />,
    )

    expect(screen.getByRole(kind === 'error' ? 'alert' : 'status', { name: 'Scenes unavailable' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    const icon = container.querySelector('.scene-collection-state__illustration .app-icon')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveAttribute('focusable', 'false')
    expect(icon).toHaveAttribute('width', '40')
    expect(icon).toHaveAttribute('height', '40')
    expect(icon).toHaveAttribute('stroke-width', '2')
  })
})
