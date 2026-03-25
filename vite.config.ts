import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))
const mageEngineEntry = fileURLToPath(new URL('../mage-engine/mage-engine.mjs', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mage-engine': mageEngineEntry,
    },
  },
  server: {
    fs: {
      allow: [workspaceRoot],
    },
  },
})
