import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { buildCompilerWorker } from './build-compiler-worker.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function compileWithBundledWorker(workerSource, source, sceneRevision) {
  let listener
  const messages = []
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    performance,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    postMessage(message) { messages.push(structuredClone(message)) },
    close() {},
    addEventListener(type, callback) { if (type === 'message') listener = callback },
    Worker: class Worker {},
    SharedWorker: class SharedWorker {},
  })
  vm.runInContext(workerSource, context)
  assert.equal(typeof listener, 'function')
  context.requestJson = JSON.stringify({
    protocol: 'mage-compiler', version: 2,
    jobId: '1'.repeat(32), channelId: '2'.repeat(32), sceneRevision,
    type: 'compile', source, maxRaymarchIterations: 200,
  })
  const request = vm.runInContext('JSON.parse(requestJson)', context)
  listener({ data: request })
  return messages
}

test('production compiler-worker bundle keeps eval-only DSL functions for every built-in scene', async () => {
  const { source: workerSource } = await buildCompilerWorker(root)
  const fixtures = JSON.parse(readFileSync(resolve(root, 'src/modules/player/policy/fixtures/builtin-presets.json'), 'utf8'))
  const catalog = JSON.parse(readFileSync(new URL('../contracts/scenes/template-catalog.v1.json', import.meta.url), 'utf8'))
  assert.deepEqual(fixtures.map(fixture => fixture.sceneId),
    catalog.templates.map(template => `template:${template.templateId}@${template.templateVersion}`))
  for (const [index, fixture] of fixtures.entries()) {
    const messages = compileWithBundledWorker(workerSource, fixture.sceneData.visualizer.shader, index + 1)
    assert.deepEqual(messages.map(message => message.type), ['started', 'compiled'], fixture.sceneId)
    assert.equal(messages[1].sceneRevision, index + 1, fixture.sceneId)
    assert.equal(messages[1].artifact.version, 1, fixture.sceneId)
  }
})
