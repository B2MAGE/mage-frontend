import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { checkSceneContracts, contractFiles } from './check-scene-contracts.mjs'

test('the cross-repository check detects drift and missing files without changing either copy', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'mage-contract-check-'))
  const frontend = resolve(root, 'frontend')
  const backend = resolve(root, 'backend')
  try {
    for (const [name, backendPath] of contractFiles) {
      const source = resolve(frontend, 'contracts/scenes', name)
      const target = resolve(backend, backendPath)
      await mkdir(dirname(source), { recursive: true })
      await mkdir(dirname(target), { recursive: true })
      await writeFile(source, '{\n  "value": 1\n}\n')
      await writeFile(target, '{\r\n  "value": 1\r\n}\r\n')
    }
    assert.deepEqual(await checkSceneContracts(backend, frontend), [])
    const changed = resolve(backend, contractFiles[0][1])
    await writeFile(changed, '{"value":2}\n')
    await rm(resolve(backend, contractFiles[1][1]))
    const failures = await checkSceneContracts(backend, frontend)
    assert.equal(failures.length, 2)
    assert.equal(failures[0], 'scene-v1.schema.json: frontend and backend differ')
    assert.match(failures[1], /builder-rendering.v1.json: could not read both copies/)
    assert.equal(await readFile(changed, 'utf8'), '{"value":2}\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
