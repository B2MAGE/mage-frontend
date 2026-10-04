import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileShader } from '@notrac/mage/compiler'
import { normalizeCompiledShader } from '@notrac/mage/compiled-shader'

test('patched compiler runs without browser globals and returns cloneable data with the requested ceiling', () => {
  assert.equal(typeof window, 'undefined')
  assert.equal(typeof document, 'undefined')
  const artifact = compileShader('let bass=input(0.2,0,1); setMaxIterations(999); sphere(0.5+bass);', { maxRaymarchIterations: 48 })
  assert.deepEqual(Object.keys(artifact), ['version', 'uniforms', 'frag', 'vert', 'geoGLSL', 'colorGLSL'])
  assert.deepEqual(structuredClone(artifact), artifact)
  assert.deepEqual(JSON.parse(JSON.stringify(artifact)), artifact)
  assert.match(artifact.frag, /const int MAX_ITERATIONS = 48;/)
  assert.deepEqual(artifact.uniforms.find(uniform => uniform.name === 'bass'), { name: 'bass', type: 'float', value: 0.2, min: 0, max: 1 })
  assert.deepEqual(artifact.uniforms.find(uniform => uniform.name === 'mouse').value, { x: 0.5, y: 0.5, z: 0.5 })
  assert.throws(() => compileShader('throw new Error("fixed compiler failure");'), /fixed compiler failure/)
  assert.throws(() => compileShader('sphere(1);', { maxRaymarchIterations: Infinity }), /budget/)
})

test('compiler entry is derived from the patched module without importing the DOM engine', () => {
  const generated = readFileSync(new URL('../node_modules/@notrac/mage/dist/shader-park-compiler.generated.js', import.meta.url), 'utf8')
  assert(generated.includes('function sculptToGLSL(userProvidedSrc, requestedMaxIterations = 200)'))
  assert(generated.includes('src.maxIterations = Number.isFinite(src.maxIterations)'))
  assert(!generated.includes('var MAGEVisualizer ='))
  assert(!generated.includes('var MAGEEngine ='))
  const entry = readFileSync(new URL('../node_modules/@notrac/mage/dist/compiler.js', import.meta.url), 'utf8')
  assert(!entry.includes("from './mage-engine.js'"))
})

test('compilation completion does not execute or transport delayed user callbacks', () => {
  const scheduled = []
  const previousTimer = globalThis.setTimeout
  try {
    globalThis.setTimeout = (callback, milliseconds) => { scheduled.push({ callback, milliseconds }); return 1 }
    const artifact = compileShader('sphere(0.5); setTimeout(function(){ throw new Error("late callback"); },150);')
    assert.equal(scheduled.length, 1)
    assert.equal(scheduled[0].milliseconds, 150)
    assert.equal(typeof scheduled[0].callback, 'function')
    assert.doesNotThrow(() => structuredClone(artifact))
    assert(!JSON.stringify(artifact).includes('late callback'))
  } finally { globalThis.setTimeout = previousTimer }
})

test('normalizer rejects malformed output and independently clamps supplied compiled fragments', () => {
  const artifact = compileShader('sphere(0.5);')
  const result = normalizeCompiledShader(artifact, { maxRaymarchIterations: 32 })
  assert.match(result.frag, /const int MAX_ITERATIONS = 32;/)
  assert.match(artifact.frag, /const int MAX_ITERATIONS = 200;/)
  result.uniforms[0].value = 123
  assert.equal(artifact.uniforms[0].value, 0)
  const invalid = [null, { ...artifact, version: 2 }, { ...artifact, callback() {} },
    { ...artifact, uniforms: artifact.uniforms.map((uniform, index) => index ? uniform : { ...uniform, value: Infinity }) },
    { ...artifact, uniforms: [...artifact.uniforms, artifact.uniforms[0]] },
    { ...artifact, uniforms: [{ name: 'unsafe', type: 'float', value() {} }] },
    { ...artifact, frag: artifact.frag.replace('MAX_ITERATIONS = 200', 'MAX_ITERATIONS = limit') },
    { ...artifact, frag: artifact.frag + '\nconst int MAX_ITERATIONS = 999;' },
    { ...artifact, vert: 'x'.repeat(65537) },
    { ...artifact, uniforms: Array(65).fill(artifact.uniforms[0]) },
  ]
  for (const value of invalid) assert.throws(() => normalizeCompiledShader(value), /Invalid compiled/)
  let reads = 0
  assert.throws(() => normalizeCompiledShader({ ...artifact, get frag() { reads++; return artifact.frag } }), /Invalid compiled/)
  assert.equal(reads, 0)
})
