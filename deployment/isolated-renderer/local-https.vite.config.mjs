import { readFileSync } from 'node:fs'
import { defineConfig, mergeConfig } from 'vite'
import manualChecksConfig from '../../scripts/manual-checks.vite.config.mjs'

const certPath = process.env.MAGE_PARENT_TLS_CERT
const keyPath = process.env.MAGE_PARENT_TLS_KEY
if (!certPath || !keyPath) throw new Error('Set MAGE_PARENT_TLS_CERT and MAGE_PARENT_TLS_KEY to a locally trusted development certificate.')

// Optional trusted-certificate version of the explicit local manual harness.
export default mergeConfig(manualChecksConfig, defineConfig({
  server: { host: '127.0.0.1', port: 5178, strictPort: true, https: { cert: readFileSync(certPath), key: readFileSync(keyPath) } },
}))
