import { fileURLToPath } from 'node:url'
import { startRendererServer } from './serve-isolated-renderer.mjs'

if (process.argv.length > 2) throw new Error('Diagnostics are available only on the local renderer port.')
await startRendererServer({ directory: fileURLToPath(new URL('../.local/diagnostics-renderer', import.meta.url)) })
console.log('Local diagnostics renderer: http://localhost:5181/ (stop the normal local renderer before starting this harness).')
