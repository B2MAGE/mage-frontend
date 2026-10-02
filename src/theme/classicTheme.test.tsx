import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UserAvatar } from '@shared/ui'
import { APP_THEME_STORAGE_KEY, ThemeProvider, useTheme } from './index'

function ThemeProbe({ start = '#ab6645', end = '#663d54' }: { start?: string; end?: string }) {
  const { theme, setTheme } = useTheme()
  return (
    <>
      <output aria-label="Current theme">{theme.label}</output>
      <button onClick={() => setTheme('classic-facebook')}>Use Classic Blue</button>
      <button onClick={() => setTheme('mage-pulse')}>Use MAGE Pulse</button>
      <UserAvatar initials="AR" gradientStart={start} gradientEnd={end} />
    </>
  )
}

describe('shared Classic Blue theme behavior', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => {
    delete document.documentElement.dataset.theme
    document.documentElement.style.removeProperty('color-scheme')
  })

  it('restores Classic Blue and applies the light browser-control scheme', () => {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, 'classic-facebook')
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)

    expect(screen.getByLabelText('Current theme')).toHaveTextContent('Classic Blue')
    expect(document.documentElement).toHaveAttribute('data-theme', 'classic-facebook')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe('classic-facebook')
  })

  it.each([null, '', 'retired-theme'])('uses the default theme for an unavailable preference (%s)', (saved) => {
    if (saved !== null) window.localStorage.setItem(APP_THEME_STORAGE_KEY, saved)
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)

    expect(screen.getByLabelText('Current theme')).toHaveTextContent('MAGE Pulse')
    expect(document.documentElement).toHaveAttribute('data-theme', 'mage-pulse')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('persists a theme switch without replacing the signed-in session', () => {
    const session = JSON.stringify({ accessToken: 'fixture-only', user: { id: 1, displayName: 'Ari Rivera' } })
    window.localStorage.setItem('mage.auth.session', session)
    const view = render(<ThemeProvider><ThemeProbe /></ThemeProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Use Classic Blue' }))
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe('classic-facebook')
    expect(window.localStorage.getItem('mage.auth.session')).toBe(session)
    view.unmount()
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)
    expect(screen.getByLabelText('Current theme')).toHaveTextContent('Classic Blue')

    fireEvent.click(screen.getByRole('button', { name: 'Use MAGE Pulse' }))
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe('mage-pulse')
    expect(window.localStorage.getItem('mage.auth.session')).toBe(session)
  })

  it.each([
    { start: '#ab6645', end: '#663d54', textColor: '#f4f5f7' },
    { start: '#ffffff', end: '#e6f0ff', textColor: '#111318' },
  ])('keeps the user gradient and readable initials while switching themes ($start)', ({ start, end, textColor }) => {
    const { container } = render(<ThemeProvider><ThemeProbe start={start} end={end} /></ThemeProvider>)
    const avatar = container.querySelector('.user-avatar')!
    const expectedStyle = { backgroundImage: `linear-gradient(145deg, ${start}, ${end})`, color: textColor }
    expect(avatar).toHaveStyle(expectedStyle)

    fireEvent.click(screen.getByRole('button', { name: 'Use Classic Blue' }))
    expect(container.querySelector('.user-avatar')).toBe(avatar)
    expect(avatar).toHaveStyle(expectedStyle)
    fireEvent.click(screen.getByRole('button', { name: 'Use MAGE Pulse' }))
    expect(container.querySelector('.user-avatar')).toBe(avatar)
    expect(avatar).toHaveStyle(expectedStyle)
  })
})
