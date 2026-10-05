import { buildIsolatedRenderer } from './build-isolated-renderer.mjs'

if (process.argv.length > 2) throw new Error('The diagnostics build accepts no deployment or production options.')
await buildIsolatedRenderer({ diagnostics: true })
