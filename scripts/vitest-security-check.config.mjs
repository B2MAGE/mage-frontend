import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { environment: 'node', include: ['scripts/isolated-security-ui.test.ts'], maxWorkers: 1 } })
