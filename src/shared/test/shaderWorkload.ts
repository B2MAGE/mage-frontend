import type { CompiledShaderArtifact } from '@notrac/mage/compiled-shader'

/** A finite, loop-free artifact a compromised worker could return. Never submit to WebGL. */
export function amplifiedShaderArtifact(artifact: CompiledShaderArtifact) {
  const helpers = ['float amplified0(float x) { return sin(x); }']
  for (let depth = 1; depth <= 8; depth++) {
    helpers.push(`float amplified${depth}(float x) { return ${Array.from({ length: 10 }, () => `amplified${depth - 1}(x)`).join('+')}; }`)
  }
  const geoGLSL = `${helpers.join('\n')}\n${artifact.geoGLSL.replace('return scope_0_d;', 'return amplified8(p.x);')}`
  return { ...artifact, geoGLSL, frag: artifact.frag.replace(artifact.geoGLSL, geoGLSL) }
}
