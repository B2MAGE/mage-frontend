import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startRendererServer } from './serve-isolated-renderer.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
await startRendererServer({ directory: resolve(root, '.local/worker-check-renderer'), port: 5182 })
console.log('Fixed worker child: http://localhost:5182/index.html (loopback only). Open http://127.0.0.1:5178/scripts/isolated-worker-check.html in the local Vite server.')
