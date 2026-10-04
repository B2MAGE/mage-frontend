import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import { fileURLToPath, URL } from 'node:url'
import { isolatedSecurityCanaryPlugin } from './scripts/isolated-security-server.mjs'

const backendProxyTarget = 'http://localhost:8080'
const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), isolatedSecurityCanaryPlugin(), {
    name: 'isolated-renderer-check-headers',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const rendererUrl = request.headers.host === 'localhost:5178' ? 'http://127.0.0.1:5181/index.html' : 'http://localhost:5181/index.html'
        response.setHeader('Content-Security-Policy', `frame-src ${rendererUrl}; object-src 'none'; base-uri 'self'`)
        if (request.url?.split('?')[0] === '/scripts/isolated-renderer-check.html') {
          // Developer fixture only; never relax the application's custom-code policy.
          response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:5178 ws://localhost:5178; frame-src http://localhost:5181; object-src 'none'; base-uri 'none'; form-action 'none'")
          response.setHeader('Referrer-Policy', 'no-referrer')
        }
        if (request.url?.split('?')[0] === '/scripts/isolated-playback-check.html') {
          response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'; connect-src 'self' blob: ws://127.0.0.1:5178 ws://localhost:5178; img-src 'self' blob:; media-src blob:; frame-src http://localhost:5181; object-src 'none'; base-uri 'none'; form-action 'none'")
          response.setHeader('Referrer-Policy', 'no-referrer')
        }
        if (request.url?.split('?')[0] === '/scripts/isolated-security-check.html') {
          response.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline' blob:; worker-src blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob: ws://127.0.0.1:5178 ws://localhost:5178; img-src 'self' blob:; media-src blob:; frame-src ${rendererUrl}; object-src 'none'; base-uri 'none'; form-action 'none'`)
          response.setHeader('Referrer-Policy', 'no-referrer')
          response.setHeader('Cache-Control', 'no-store')
        }
        if (request.url?.split('?')[0] === '/scripts/isolated-worker-check.html') {
          response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; connect-src 'self' ws://127.0.0.1:5178 ws://localhost:5178; frame-src http://localhost:5182/index.html; object-src 'none'; base-uri 'none'; form-action 'none'")
          response.setHeader('Referrer-Policy', 'no-referrer')
          response.setHeader('Cache-Control', 'no-store')
        }
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
    css: true,
    environment: 'jsdom',
    setupFiles: './src/shared/test/setup.ts',
  },
})
