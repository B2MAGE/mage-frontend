import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--output')) {
  throw new Error('Usage: node scripts/report-shader-workload.mjs [--output path]')
}
const output = resolve(root, args[1] ?? 'docs/pl03-workload.v1.report.json')
mkdirSync(dirname(output), { recursive: true })
// A workspace temp directory also avoids Windows sandbox cache rename failures.
const temp = resolve(root, 'node_modules/.cache/pl03-workload')
mkdirSync(temp, { recursive: true })
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'),
  'run', 'src/modules/player/templates/shaderWorkloadCorpus.test.ts', '--maxWorkers=1'], {
  cwd: root,
  env: { ...process.env, PL03_WORKLOAD_REPORT: output, TEMP: temp, TMP: temp },
  stdio: 'inherit',
})
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
console.log(`Workload compatibility and validator timing report: ${output}`)
