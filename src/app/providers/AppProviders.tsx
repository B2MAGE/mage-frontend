import type { PropsWithChildren } from 'react'
import { AuthProvider } from '@auth'
import { ThemeProvider } from '@theme'

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  )
}
