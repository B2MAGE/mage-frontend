import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SettingsLoadingState } from './SettingsLoadingState'

describe('SettingsLoadingState', () => {
  function renderLoading(path = '/settings') {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <SettingsLoadingState />
      </MemoryRouter>,
    )
  }

  it('announces one busy Settings region and renders the destination layout', () => {
    const { container } = renderLoading()

    const status = screen.getByRole('status')
    const main = status.closest('main')

    expect(status).toHaveTextContent('Loading account settings')
    expect(main).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
    expect(container.querySelector('.settings-title')).toHaveTextContent('Settings')
    expect(container.querySelectorAll('.settings-loading__nav-line')).toHaveLength(3)
    expect(container.querySelectorAll('.settings-loading__theme-card')).toHaveLength(2)
    expect(container.querySelectorAll('.settings-loading__field-input')).toHaveLength(9)
    expect(container.querySelectorAll('.settings-loading__gradient')).toHaveLength(1)
    expect(container.querySelector('.settings-loading__identity')?.nextElementSibling).toHaveClass('settings-loading__gradient', 'skeleton--block')
    expect(container.querySelector('.settings-loading__security-note')).toBeInTheDocument()
    expect(container.querySelectorAll('.settings-section-view:not([hidden])')).toHaveLength(1)
    expect(container.querySelector('.settings-section--appearance')?.parentElement).not.toHaveAttribute('hidden')
  })

  it('shows the requested section while a deep link is loading', () => {
    const { container } = renderLoading('/settings#profile')

    expect(container.querySelector('.settings-section--profile')?.parentElement).not.toHaveAttribute('hidden')
    expect(container.querySelector('.settings-section--appearance')?.parentElement).toHaveAttribute('hidden')
    expect(container.querySelector('.settings-section--security')?.parentElement).toHaveAttribute('hidden')
  })

  it('uses line skeletons for section navigation instead of loading pills', () => {
    const { container } = renderLoading()

    const navLines = Array.from(
      container.querySelectorAll('.settings-loading__nav-line'),
    )

    expect(navLines).toHaveLength(3)
    navLines.forEach((line) => {
      expect(line).toHaveClass('skeleton--line')
    })
    expect(container.querySelector('.nav-status-pill')).not.toBeInTheDocument()
    expect(container.querySelector('.tag-pill--skeleton')).not.toBeInTheDocument()
  })
})
