import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import { fileURLToPath, URL } from 'node:url'

const backendProxyTarget = 'http://localhost:8080'
const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))
const mageEngineEntry = fileURLToPath(new URL('../mage-engine/mage-engine.mjs', import.meta.url))

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
      '/auth': {
        target: backendProxyTarget,
        changeOrigin: true,
      },
      '/users': {
        target: backendProxyTarget,
        changeOrigin: true,
      },
      '/presets': {
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
