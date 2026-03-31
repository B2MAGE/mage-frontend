import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'

const backendProxyTarget = 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
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
