import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'

const backendProxyTarget = 'http://localhost:8080'
const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))
const mageEngineSourceEnvKey = 'VITE_MAGE_ENGINE_SOURCE'

function resolveMageEngineEntry(mode: string) {
  const env = loadEnv(mode, process.cwd(), '')
  const entryUrl =
    env[mageEngineSourceEnvKey] === 'local'
      ? new URL('./node_modules/mage-local/dist/mage-engine.js', import.meta.url)
      : new URL('./node_modules/@notrac/mage/dist/mage-engine.js', import.meta.url)

  return fileURLToPath(entryUrl)
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@mage/engine': resolveMageEngineEntry(mode),
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
}))
