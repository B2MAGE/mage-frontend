import { readFileSync } from 'node:fs'
import { defineConfig, mergeConfig } from 'vite'
import appConfig from '../../vite.config.ts'

const certPath = process.env.MAGE_PARENT_TLS_CERT
const keyPath = process.env.MAGE_PARENT_TLS_KEY
if (!certPath || !keyPath) throw new Error('Set MAGE_PARENT_TLS_CERT and MAGE_PARENT_TLS_KEY to a locally trusted development certificate.')

export default mergeConfig(appConfig, defineConfig({
  server: { host: '127.0.0.1', port: 5178, strictPort: true, https: { cert: readFileSync(certPath), key: readFileSync(keyPath) } },
  plugins: [{
    name: 'isolated-renderer-https-check-headers',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] === '/scripts/isolated-renderer-check.html') {
          response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' wss://127.0.0.1:5178 wss://localhost:5178; frame-src https://localhost:5181; object-src 'none'; base-uri 'none'; form-action 'none'")
          response.setHeader('Referrer-Policy', 'no-referrer')
        }
        next()
      })
    },
  }],
}))
