import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const frontendRoot = fileURLToPath(new URL('..', import.meta.url))
export const contractFiles = [
  ['scene-v1.schema.json', 'src/main/resources/contracts/scenes/scene-v1.schema.json'],
  ['builder-rendering.v1.json', 'src/main/resources/contracts/scenes/builder-rendering.v1.json'],
  ['template-catalog.v1.json', 'src/main/resources/contracts/scenes/template-catalog.v1.json'],
  ['scene-limits.v1.json', 'src/main/resources/scene-limits.v1.json'],
  ['fixtures.json', 'src/test/resources/contracts/scenes/fixtures.json'],
  ['current-round-trips.json', 'src/test/resources/contracts/scenes/current-round-trips.json'],
]

/** Compare checked-in copies without writing either repository or changing JSON. */
export async function checkSceneContracts(backendRoot, appRoot = frontendRoot) {
  const failures = []
  for (const [name, backendPath] of contractFiles) {
    try {
      const [frontend, backend] = await Promise.all([
        readFile(resolve(appRoot, 'contracts/scenes', name), 'utf8'),
        readFile(resolve(backendRoot, backendPath), 'utf8'),
      ])
      if (frontend.replaceAll('\r\n', '\n').trimEnd() !== backend.replaceAll('\r\n', '\n').trimEnd()) {
        failures.push(`${name}: frontend and backend differ`)
      }
    } catch (error) {
      failures.push(`${name}: could not read both copies (${error.code ?? 'read error'})`)
    }
  }
  return failures
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/check-scene-contracts.mjs <backend-checkout>')
    process.exitCode = 1
  } else {
    const failures = await checkSceneContracts(resolve(process.argv[2]))
    if (failures.length) {
      console.error(failures.join('\n'))
      process.exitCode = 1
    } else console.log(`All ${contractFiles.length} scene contract files match the backend checkout.`)
  }
}
