import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ActionButton } from './ActionButton'
import { PageFrame } from './PageFrame'
import { PageHeader } from './PageHeader'
import { PagePanel } from './PagePanel'
import { PageState } from './PageState'
import { SectionHeader } from './SectionHeader'
import { StatusBadge } from './StatusBadge'

describe('shared page primitives', () => {
  it('builds a semantic page frame with compactable headings and surfaces', () => {
    render(
      <PageFrame aria-label="Scene library" width="form">
        <PageHeader
          actions={<ActionButton tone="primary">Create</ActionButton>}
          description="Manage the scenes that belong to you."
          eyebrow="Library"
          title="My scenes"
          titleId="my-scenes-heading"
        />
        <PagePanel aria-label="Published scenes" interactive tone="nested">
          <SectionHeader description="Ready to share" title="Published" titleId="published-heading" />
          <StatusBadge tone="success">Public</StatusBadge>
        </PagePanel>
      </PageFrame>,
    )

    const main = screen.getByRole('main', { name: 'Scene library' })
    expect(main).toHaveClass('ui-page-frame', 'ui-page-frame--form')
    expect(screen.getByRole('heading', { level: 1, name: 'My scenes' })).toHaveClass('ui-page-title')
    expect(screen.getByRole('heading', { level: 1, name: 'My scenes' })).toHaveAttribute('id', 'my-scenes-heading')
    expect(screen.getByRole('heading', { level: 2, name: 'Published' })).toHaveClass('ui-section-title')
    expect(screen.getByRole('heading', { level: 2, name: 'Published' })).toHaveAttribute('id', 'published-heading')
    expect(screen.getByRole('region', { name: 'Published scenes' })).toHaveAttribute('data-interactive', 'true')
    expect(screen.getByRole('button', { name: 'Create' })).toHaveClass('ui-button--primary')
    expect(screen.getByText('Public')).toHaveClass('ui-status--success')
  })

  it('gives empty and error states distinct live-region semantics', () => {
    const { rerender } = render(
      <PageState description="Try changing the current filters." title="No scenes found" />,
    )

    expect(screen.getByRole('status')).toHaveClass('ui-page-state--empty')
    expect(screen.getByRole('heading', { name: 'No scenes found' })).toBeVisible()

    rerender(
      <PageState
        description="The scenes could not be loaded."
        kind="error"
        title="Something went wrong"
      />,
    )

    expect(screen.getByRole('alert')).toHaveClass('ui-page-state--error')
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeVisible()
  })
})
