import { defineConfig } from 'vite'
import appConfig from '../vite.config.ts'
import { isolatedSecurityCanaryPlugin } from './isolated-security-server.mjs'
import { localManualChecksPlugin } from './manual-check-routes.mjs'

// Deliberate replacement for normal development, not another public app route.
// Fixed fixtures require port 5178: stop the normal dev server before using it.
export default defineConfig({
  ...appConfig,
  plugins: [
    ...appConfig.plugins.filter(plugin => plugin?.name !== 'retired-test-surfaces'),
    localManualChecksPlugin(),
    isolatedSecurityCanaryPlugin(),
  ],
  server: { ...appConfig.server, host: '127.0.0.1', port: 5178, strictPort: true,
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  },
})
