import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import { fileURLToPath, URL } from 'node:url'

const backendProxyTarget = 'http://localhost:8080'
const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'isolated-renderer-check-headers',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] === '/scripts/isolated-renderer-check.html') {
          // Developer fixture only; never relax the application's custom-code policy.
          response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:5178 ws://localhost:5178; frame-src http://localhost:5181; object-src 'none'; base-uri 'none'; form-action 'none'")
          response.setHeader('Referrer-Policy', 'no-referrer')
        }
        if (request.url?.split('?')[0] === '/scripts/isolated-playback-check.html') {
          response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'; connect-src 'self' blob: ws://127.0.0.1:5178 ws://localhost:5178; img-src 'self' blob:; media-src blob:; frame-src http://localhost:5181; object-src 'none'; base-uri 'none'; form-action 'none'")
          response.setHeader('Referrer-Policy', 'no-referrer')
        }
        next()
      })
    },
  }],
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@auth': fileURLToPath(new URL('./src/modules/auth', import.meta.url)),
      '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@theme': fileURLToPath(new URL('./src/theme', import.meta.url)),
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
    // Local browser profiles can contain third-party extension test files.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    maxWorkers: 4,
    css: true,
    environment: 'jsdom',
    setupFiles: './src/shared/test/setup.ts',
  },
})
