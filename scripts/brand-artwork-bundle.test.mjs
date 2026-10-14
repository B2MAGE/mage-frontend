import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { build } from 'vite'
import { compileShader } from '@notrac/mage/compiler'

const root = fileURLToPath(new URL('..', import.meta.url))

test('production app build preserves the compiler DSL used by fixed brand artwork', async () => {
  // Exercise the app's actual Vite policy and the same compiler entry imported
  // by its dynamic engine chunk, including normal production minification.
  const result = await build({
    root,
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(new URL('../node_modules/@notrac/mage/dist/compiler.js', import.meta.url)),
        name: 'BrandArtworkCompiler',
        formats: ['iife'],
      },
    },
  })
  const chunks = [result].flat().flatMap(bundle => bundle.output).filter(output => output.type === 'chunk')
  assert.equal(chunks.length, 1)
  const context = vm.createContext({ TextEncoder, console: { log() {}, warn() {}, error() {} } })
  vm.runInContext(chunks[0].code, context)

  const artwork = readFileSync(new URL('../src/modules/player/templates/platformBrandScene.ts', import.meta.url), 'utf8')
  const source = artwork.match(/shader: `([\s\S]*?)`/)
  assert(source, 'Read the exact checked-in artwork shader')
  context.source = source[1]
  const compiled = vm.runInContext('BrandArtworkCompiler.compileShader(source)', context)
  assert.equal(compiled.version, 1)
  assert.match(compiled.frag, /const int MAX_ITERATIONS = 100;/)
  assert(compiled.geoGLSL.length > 0)
  assert(compiled.colorGLSL.length > 0)
  assert.deepEqual(JSON.parse(JSON.stringify(compiled)), compileShader(source[1]))
})
