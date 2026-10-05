import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileShader } from '@notrac/mage/compiler'
import { COMPILED_SHADER_LIMITS, normalizeCompiledShader } from '@notrac/mage/compiled-shader'

const clone = value => structuredClone(value)
const bytes = text => Buffer.byteLength(text, 'utf8')
const base = () => compileShader('let bass=input(0.2,0,1); sphere(0.5+bass);')
function withSection(artifact, name, text) {
  assert(artifact.frag.includes(artifact[name]), `The fixture must contain its ${name} section`)
  return { ...artifact, [name]: text, frag: artifact.frag.replace(artifact[name], text) }
}
function padSection(artifact, name, targetBytes, character = 'x') {
  const available = targetBytes - bytes(artifact[name]) - 5 // /* */ and newline
  assert(available >= 0)
  const count = Math.floor(available / bytes(character))
  const padding = character.repeat(count) + ' '.repeat(available - count * bytes(character))
  const result = withSection(artifact, name, `/*${padding}*/\n${artifact[name]}`)
  assert.equal(bytes(result[name]), targetBytes)
  return result
}

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
    { ...artifact, uniforms: Array(81).fill(artifact.uniforms[0]) },
  ]
  for (const value of invalid) assert.throws(() => normalizeCompiledShader(value), /Invalid compiled/)
  let reads = 0
  assert.throws(() => normalizeCompiledShader({ ...artifact, get frag() { reads++; return artifact.frag } }), /Invalid compiled/)
  assert.equal(reads, 0)
})

test('all 16 immutable presets preserve supported output under both default and lower host ceilings', () => {
  const fixtures = JSON.parse(readFileSync(new URL('../src/modules/player/policy/fixtures/builtin-presets.json', import.meta.url), 'utf8'))
  assert.equal(fixtures.length, 16)
  for (const { sceneId, sceneData } of fixtures) {
    const source = sceneData.visualizer.shader
    const output = compileShader(source)
    assert.deepEqual(normalizeCompiledShader(output), output, sceneId)
    assert.deepEqual(structuredClone(output), output, sceneId)
    const authored = source.match(/setMaxIterations\((\d+)\)/)?.[1]
    assert.match(output.frag, new RegExp(`const int MAX_ITERATIONS = ${authored ?? 200};`), sceneId)
    assert.match(compileShader(source, { maxRaymarchIterations: 32 }).frag,
      new RegExp(`const int MAX_ITERATIONS = ${Math.min(Number(authored ?? 200), 32)};`), sceneId)
    assert.equal(source, sceneData.visualizer.shader)
  }
})

test('legal scalar/vector inputs, ShaderPark functions and finite JavaScript construction loops remain compatible', () => {
  const output = compileShader(`
    let bass = input(0.25, 0, 1);
    let pointerDown = input();
    let offset = input2D({x:0.25,y:0.5}, {x:0,y:0}, {x:1,y:1});
    setGeometryQuality(24); setMaxIterations(48);
    rotateY(time * 0.4); color(0.2, 0.4, 0.8);
    for (let i=0; i<3; i++) { rotateX(0.2); sphere(0.2+bass*0.1); }
    torus(0.7+offset.x*0.1, 0.1+pointerDown*0.05);
  `)
  assert.deepEqual(normalizeCompiledShader(output), output)
  assert.deepEqual(output.uniforms.find(uniform => uniform.name === 'offset'),
    { name: 'offset', type: 'vec2', value: { x: 0.25, y: 0.5 }, min: { x: 0, y: 0 }, max: { x: 1, y: 1 } })
  assert.match(output.frag, /const int MAX_ITERATIONS = 48;/)
  const copied = normalizeCompiledShader(output)
  copied.uniforms.find(uniform => uniform.name === 'offset').value.x = 0.75
  assert.equal(output.uniforms.find(uniform => uniform.name === 'offset').value.x, 0.25)
})

test('legal ShaderPark union, difference and intersection preserve their geometry operations', () => {
  for (const [operation, helper] of [['union', 'add'], ['difference', 'subtract'], ['intersect', 'intersect']]) {
    const output = compileShader(`sphere(1); ${operation}(); box(0.5,0.5,0.5);`)
    assert.deepEqual(normalizeCompiledShader(output), output, operation)
    assert.match(output.geoGLSL, new RegExp(`scope_0_d = ${helper}\\( prim_1, scope_0_d  \\);`), operation)
  }
})

test('a fake, commented, macro-shadowed or unused iteration guard cannot authorize another GPU program', () => {
  const artifact = base()
  for (const frag of [
    '// const int MAX_ITERATIONS = 200;\nvoid main() {}',
    '/* const int MAX_ITERATIONS = 200; */\nvoid main() {}',
    'const int MAX_ITERATIONS = 200; void main(){for(int i=0;i<999999;i++){} }',
    artifact.frag.replace('const int MAX_ITERATIONS = 200;', 'const int MAX_ITERATIONS = 200;\n#define MAX_ITERATIONS 999999'),
    artifact.frag.replace('i < MAX_ITERATIONS', 'i < 999999'),
    artifact.frag + '\nvoid unrelatedProgram() {}',
  ]) assert.throws(() => normalizeCompiledShader({ ...artifact, frag }), /Invalid compiled/)
  assert.throws(() => normalizeCompiledShader({ ...artifact, vert: 'void main(){gl_Position=vec4(0.);}' }), /Invalid compiled/)
  assert.throws(() => normalizeCompiledShader({ ...artifact, geoGLSL: artifact.geoGLSL + '\n// unbound metadata' }), /Invalid compiled/)
})

test('GPU loops, directives, shell redefinitions and unexpected uniform declarations are rejected even in matching fragments', () => {
  const artifact = base()
  const additions = [
    'float extra(float x){for(int i=0;i<999999;i++){x=sin(x);}return x;}',
    'float extra(float x){while(x>0.0){x-=0.01;}return x;}',
    'float extra(float x){do{x-=0.01;}while(x>0.0);return x;}',
    'float extra(float x){float scratch[1000000000];scratch[0]=x;return scratch[0];}',
    'float extra(float scratch[1000000000]){return scratch[0];}',
    'float extra(float x){return extra(x);}',
    'float extraOne(float x){return extraTwo(x);} float extraTwo(float x){return extraOne(x);}',
    '#define MAX_ITERATIONS 999999', '#undef MAX_REFLECTIONS', '#extension GL_EXT_draw_buffers : enable',
    '#include <common>', '#if 1\n#endif', '#define X \\\n999999',
    '// A CR-only line ending cannot hide the next directive.\r#define MAX_ITERATIONS 999999',
    'void main(){}', 'float intersect(vec3 a, vec3 b, float c){return 0.0;}',
    'float sin(float x){return x;}', 'float clamp(float x,float a,float b){return x;}',
    'uniform sampler2D extraTexture;', 'uniform float injected;',
  ]
  for (const name of ['geoGLSL', 'colorGLSL']) {
    for (const addition of additions) {
      const changed = withSection(artifact, name, `${addition}\n${artifact[name]}`)
      assert.throws(() => normalizeCompiledShader(changed), /Invalid compiled/, `${name}: ${addition}`)
    }
  }
  assert.throws(() => compileShader('let f=glslFunc("float expensive(float x){for(int i=0;i<999999;i++){x=sin(x);}return x;}"); sphere(f(time));'), /Invalid compiled/)
  const ordinaryComment = withSection(artifact, 'geoGLSL', `// while and for remain harmless in a comment.\r${artifact.geoGLSL}`)
  assert.deepEqual(normalizeCompiledShader(ordinaryComment), ordinaryComment)
})

test('geometry cannot recurse through trusted helpers while nonrecursive color shadow calls remain supported', () => {
  const artifact = base()
  for (const expression of [
    'intersect(p,vec3(0.0,1.0,0.0),0.5)',
    'shadow(p,vec3(0.0,1.0,0.0),0.5)',
    'occlusion(p,vec3(0.0,1.0,0.0))',
    'length(calcNormal(p))',
  ]) {
    const changed = withSection(artifact, 'geoGLSL', `float surfaceDistance(vec3 p){return ${expression};}`)
    assert.throws(() => normalizeCompiledShader(changed), /Invalid compiled/, expression)
  }
  const color = artifact.colorGLSL.replace('ShadedMaterial shade(vec3 p, vec3 normal) {',
    'ShadedMaterial shade(vec3 p, vec3 normal) {\nfloat additionalShadow=shadow(p,normal,0.5);')
  assert.notEqual(color, artifact.colorGLSL)
  const supported = withSection(artifact, 'colorGLSL', color)
  assert.deepEqual(normalizeCompiledShader(supported), supported)
})

test('receiver clamps finite quality/reflection requests independently and rejects nonfinite program settings', () => {
  const artifact = base()
  const requested = { ...artifact, frag: artifact.frag
    .replace(/const float STEP_SIZE_CONSTANT = [^;]+;/, 'const float STEP_SIZE_CONSTANT = -123;')
    .replace(/#define MAX_REFLECTIONS [^\n]+/, '#define MAX_REFLECTIONS 999999') }
  const limited = normalizeCompiledShader(requested, { maxRaymarchIterations: 32 })
  assert.match(limited.frag, /const int MAX_ITERATIONS = 32;/)
  assert(limited.frag.includes(`const float STEP_SIZE_CONSTANT = ${COMPILED_SHADER_LIMITS.minStepSize};`))
  assert(limited.frag.includes(`#define MAX_REFLECTIONS ${COMPILED_SHADER_LIMITS.maxReflections}\n`))
  for (const source of ['setGeometryQuality(1000000); sphere(1);', 'setStepSize(0); sphere(1);',
    'setStepSize(-1); sphere(1);', 'setStepSize(123); sphere(1);', 'setMaxReflections(999999); sphere(1);']) {
    const output = compileShader(source)
    const step = Number(output.frag.match(/const float STEP_SIZE_CONSTANT = ([^;]+);/)[1])
    const reflections = Number(output.frag.match(/#define MAX_REFLECTIONS ([^\n]+)/)[1])
    assert(step >= COMPILED_SHADER_LIMITS.minStepSize && step <= COMPILED_SHADER_LIMITS.maxStepSize, source)
    assert(reflections <= COMPILED_SHADER_LIMITS.maxReflections, source)
  }
  for (const value of ['NaN', 'Infinity', '-Infinity']) {
    assert.throws(() => normalizeCompiledShader({ ...artifact,
      frag: artifact.frag.replace(/const float STEP_SIZE_CONSTANT = [^;]+;/, `const float STEP_SIZE_CONSTANT = ${value};`) }), /Invalid compiled/)
    assert.throws(() => compileShader(`setStepSize(${value}); sphere(1);`))
    assert.throws(() => compileShader(`setMaxReflections(${value}); sphere(1);`))
  }
})

test('records, arrays and vector components are own dense data without getter execution', () => {
  const artifact = base()
  for (const mutate of [
    value => Object.setPrototypeOf(value, { inherited: true }),
    value => Object.defineProperty(value, 'extra', { value: 1 }),
    value => Object.defineProperty(value, Symbol('extra'), { value: 1 }),
    value => { value.uniforms.length++ },
    value => { delete value.uniforms[0] },
    value => { value.uniforms.extra = 1 },
    value => Object.defineProperty(value.uniforms, 'extra', { value: 1 }),
    value => Object.setPrototypeOf(value.uniforms, Object.create(Array.prototype)),
    value => Object.setPrototypeOf(value.uniforms[0], { inherited: true }),
    value => Object.setPrototypeOf(value.uniforms.find(uniform => uniform.name === 'mouse').value, { inherited: true }),
  ]) {
    const value = clone(artifact)
    mutate(value)
    assert.throws(() => normalizeCompiledShader(value), /Invalid compiled/)
  }
  let reads = 0
  for (const locate of [value => [value, 'frag'], value => [value.uniforms, '0'],
    value => [value.uniforms[0], 'name'], value => [value.uniforms.find(uniform => uniform.name === 'mouse').value, 'x']]) {
    const value = clone(artifact), [record, key] = locate(value)
    Object.defineProperty(record, key, { enumerable: true, get() { reads++; throw new Error('Untrusted getter ran') } })
    assert.throws(() => normalizeCompiledShader(value), /Invalid compiled/)
  }
  assert.equal(reads, 0)
})

test('uniform names, types, finite magnitudes and component ranges are validated', () => {
  const artifact = base()
  const index = artifact.uniforms.findIndex(uniform => uniform.name === 'bass')
  for (const change of [
    { name: 'gl_Position' }, { name: 'MAX_ITERATIONS' }, { name: 'resolution' }, { name: 'constructor' },
    { name: 'main' }, { name: 'float' }, { name: 'intersect' }, { name: 'bad-name' },
    { type: 'sampler2D' }, { type: 'mat4' }, { type: 'float[]' },
    { value: Infinity }, { value: NaN }, { value: 1000001 }, { value: -1000001 },
    { min: 2, max: 1 }, { min: 0.3 }, { max: 0.1 },
  ]) {
    const value = clone(artifact)
    Object.assign(value.uniforms[index], change)
    assert.throws(() => normalizeCompiledShader(value), /Invalid compiled/, JSON.stringify(change))
  }
  const vector = compileShader('let offset=input2D({x:0.25,y:0.5},{x:0,y:0},{x:1,y:1}); sphere(1);')
  for (const change of [{ min: { x: 0, y: 2 } }, { max: { x: 1, y: 0.25 } },
    { value: { x: 0, y: Infinity } }, { value: { x: 0, y: 0, z: 0 } }]) {
    const value = clone(vector)
    Object.assign(value.uniforms.find(uniform => uniform.name === 'offset'), change)
    assert.throws(() => normalizeCompiledShader(value), /Invalid compiled/)
  }
})

test('UTF-8 section and aggregate budgets apply before accepting otherwise matching shader sections', () => {
  assert(Object.isFrozen(COMPILED_SHADER_LIMITS))
  const artifact = base()
  const small = padSection(artifact, 'geoGLSL', 120000, 'é')
  assert.deepEqual(normalizeCompiledShader(small), small)
  assert(small.geoGLSL.length < bytes(small.geoGLSL))
  const sectionTooLarge = padSection(artifact, 'geoGLSL', COMPILED_SHADER_LIMITS.geometryBytes + 1, 'é')
  assert(sectionTooLarge.geoGLSL.length < COMPILED_SHADER_LIMITS.geometryBytes)
  assert.throws(() => normalizeCompiledShader(sectionTooLarge), /Invalid compiled/)
  const under = padSection(padSection(artifact, 'geoGLSL', 160000), 'colorGLSL', 160000)
  assert(bytes(under.frag) < COMPILED_SHADER_LIMITS.fragBytes)
  assert.deepEqual(normalizeCompiledShader(under), under)
  const aggregateTooLarge = padSection(padSection(artifact, 'geoGLSL', 200000), 'colorGLSL', 200000)
  assert(bytes(aggregateTooLarge.frag) < COMPILED_SHADER_LIMITS.fragBytes)
  assert(bytes(aggregateTooLarge.geoGLSL) < COMPILED_SHADER_LIMITS.geometryBytes)
  assert(bytes(aggregateTooLarge.colorGLSL) < COMPILED_SHADER_LIMITS.colorBytes)
  assert(['frag', 'vert', 'geoGLSL', 'colorGLSL'].reduce((sum, name) => sum + bytes(aggregateTooLarge[name]), 0) > COMPILED_SHADER_LIMITS.totalShaderBytes)
  assert.throws(() => normalizeCompiledShader(aggregateTooLarge), /Invalid compiled/)
})
