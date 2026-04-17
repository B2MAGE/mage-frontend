import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import { fileURLToPath, URL } from 'node:url'

const backendProxyTarget = 'http://localhost:8080'
const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))
const mageEngineEntry = fileURLToPath(new URL('./node_modules/@notrac/mage/dist/mage-engine.js', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mage/engine': mageEngineEntry,
    },
  },
  server: {
    fs: {
      allow: [workspaceRoot],
    },
    proxy: {
      '/api': {
        target: backendProxyTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    css: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
