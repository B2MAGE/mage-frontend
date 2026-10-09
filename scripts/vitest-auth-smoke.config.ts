import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

if (!process.env.VITE_API_BASE_URL) throw new Error('Use npm run auth:verify -- <API origin>.')

export default defineConfig({
  resolve: { alias: { '@shared': fileURLToPath(new URL('../src/shared', import.meta.url)) } },
  test: { include: ['scripts/auth-smoke.flow.ts'], environment: 'node', testTimeout: 60_000 },
})
