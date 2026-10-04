import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['scripts/worker-check*.test.ts'], maxWorkers: 1 } })
