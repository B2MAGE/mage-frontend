import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import { fileURLToPath, URL } from 'node:url'
import { retiredTestSurfacesPlugin } from './scripts/manual-check-routes.mjs'

const backendProxyTarget = 'http://localhost:8080'
const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), retiredTestSurfacesPlugin(), {
    name: 'app-renderer-frame-policy',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const rendererUrl = request.headers.host === 'localhost:5178' ? 'http://127.0.0.1:5181/index.html' : 'http://localhost:5181/index.html'
        response.setHeader('Content-Security-Policy', `frame-src ${rendererUrl}; object-src 'none'; base-uri 'self'`)
        next()
      })
    },
  }],
  preview: {
    headers: {
      'Content-Security-Policy': "frame-src https://d2wwpgc7sgvmnm.cloudfront.net/index.html; object-src 'none'; base-uri 'self'",
    },
  },
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
    // Themed editor accessibility queries and userEvent flows exceed the old limits even on baseline.
    testTimeout: 30_000,
    css: true,
    environment: 'jsdom',
    setupFiles: './src/shared/test/setup.ts',
  },
})
