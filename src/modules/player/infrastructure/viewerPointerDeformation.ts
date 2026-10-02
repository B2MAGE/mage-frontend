type ViewerShaderMaterial = {
  fragmentShader?: string
  uniforms?: Record<string, { value: unknown }>
  needsUpdate?: boolean
  uniformsNeedUpdate?: boolean
}

export type ViewerPointerMesh = {
  material?: ViewerShaderMaterial | ViewerShaderMaterial[]
  onBeforeRender?: (...args: unknown[]) => void
}

type PointerDeformation = {
  update: (x: number, y: number, hover: number, press: number) => void
  dispose: () => void
}

const UNIFORM_NAME = 'mageViewerPointerDeformation'
const SURFACE_DEFINITION = /\bfloat\s+surfaceDistance\s*\(\s*vec3\s+(\w+)\s*\)\s*\{/
const SHADE_DEFINITION = /\bShadedMaterial\s+shade\s*\(\s*vec3\s+(\w+)\s*,\s*vec3\s+\w+\s*\)\s*\{/
const activeDeformations = new WeakMap<ViewerPointerMesh, { shader: string; controller: PointerDeformation }>()
const noDeformation: PointerDeformation = { update() {}, dispose() {} }

function hasAuthoredPointerResponse(shader: string) {
  // ShaderPark examples often declare pointerDown without ever reading it.
  // Remove only that unused declaration, never an expression using the input.
  const code = shader
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, '')
    .replace(/\b(?:let|const|var)\s+pointerDown\s*=\s*input\s*\([^)]*\)\s*;/g, '')
  return /\b(?:mouse|pointerDown|mouseIntersection)\b/.test(code)
}

function patchFragmentShader(source: string) {
  const surface = SURFACE_DEFINITION.exec(source)
  if (!surface || source.includes(UNIFORM_NAME)) return null

  // This belongs to the live material, not the saved ShaderPark source. Both
  // geometry and color sample the same bounded, nonuniform coordinate warp.
  // A conservative distance correction prevents overstepping the warped SDF.
  const wrapper = `
uniform vec4 ${UNIFORM_NAME};
vec3 mageViewerWarp(vec3 p) {
  float amount = 0.06 * ${UNIFORM_NAME}.z + 0.14 * ${UNIFORM_NAME}.w;
  if (amount <= 0.0) return p;
  vec2 pointer = ${UNIFORM_NAME}.xy;
  vec3 ripple = vec3(
    sin(p.y * 2.4 + pointer.x * 2.0) * 0.65 + sin(p.z * 2.0 + pointer.y) * 0.35,
    sin(p.x * 2.1 + pointer.y * 2.0) * 0.65 + sin(p.z * 1.8 - pointer.x) * 0.35,
    sin(p.x * 1.8 + p.y * 1.6 + pointer.x - pointer.y) * 0.6
  );
  return p + ripple * amount;
}
float mageViewerOriginalSurfaceDistance(vec3 p);
float surfaceDistance(vec3 p) {
  float amount = 0.06 * ${UNIFORM_NAME}.z + 0.14 * ${UNIFORM_NAME}.w;
  if (amount <= 0.0) return mageViewerOriginalSurfaceDistance(p);
  return mageViewerOriginalSurfaceDistance(mageViewerWarp(p)) / (1.0 + amount * 4.0);
}
`
  return source
    .replace(SURFACE_DEFINITION, `${wrapper}float mageViewerOriginalSurfaceDistance(vec3 ${surface[1]}) {`)
    .replace(SHADE_DEFINITION, (definition, point: string) => `${definition}\n  ${point} = mageViewerWarp(${point});`)
}

function bounded(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, minimum), maximum) : 0
}

/** Adds a reversible viewer fallback only when the scene has no authored pointer response. */
export function attachViewerPointerDeformation(
  mesh: ViewerPointerMesh | null | undefined,
  shader: string,
): PointerDeformation {
  if (!mesh) return noDeformation
  const existing = activeDeformations.get(mesh)
  if (existing?.shader === shader) return existing.controller
  existing?.controller.dispose()
  if (hasAuthoredPointerResponse(shader)) return noDeformation

  const value = new Float32Array(4)
  const target = new Float32Array(4)
  const uniform = { value }
  const materials = [...new Set(Array.isArray(mesh.material) ? mesh.material : [mesh.material])]
  const modified = materials.flatMap((material) => {
    if (!material?.fragmentShader || !material.uniforms || UNIFORM_NAME in material.uniforms) return []
    const original = material.fragmentShader
    const patched = patchFragmentShader(original)
    if (!patched) return []
    material.fragmentShader = patched
    material.uniforms[UNIFORM_NAME] = uniform
    material.needsUpdate = true
    return [{ material, original, patched }]
  })
  if (!modified.length) return noDeformation

  const originalBeforeRender = mesh.onBeforeRender
  let disposed = false
  let previousFrameTime: number | null = null

  function beforeRender(this: ViewerPointerMesh, ...args: unknown[]) {
    originalBeforeRender?.apply(this, args)
    if (disposed) return
    const now = performance.now()
    const seconds = previousFrameTime === null ? 1 / 60 : Math.min(Math.max((now - previousFrameTime) / 1000, 0), 0.1)
    previousFrameTime = now
    const blend = 1 - Math.exp(-seconds * 14)
    for (let index = 0; index < 4; index += 1) {
      const difference = target[index] - value[index]
      value[index] = Math.abs(difference) < 0.0001 ? target[index] : value[index] + difference * blend
    }
    for (const { material } of modified) material.uniformsNeedUpdate = true
  }

  const controller: PointerDeformation = {
    update(x, y, hover, press) {
      if (disposed) return
      target[0] = bounded(x, -1, 1)
      target[1] = bounded(y, -1, 1)
      target[2] = bounded(hover, 0, 1)
      target[3] = bounded(press, 0, 1)
    },
    dispose() {
      if (disposed) return
      disposed = true
      value.fill(0)
      for (const { material, original, patched } of modified) {
        if (material.fragmentShader === patched) {
          material.fragmentShader = original
          material.needsUpdate = true
        }
        if (material.uniforms?.[UNIFORM_NAME] === uniform) delete material.uniforms[UNIFORM_NAME]
      }
      if (mesh.onBeforeRender === beforeRender) mesh.onBeforeRender = originalBeforeRender
      if (activeDeformations.get(mesh)?.controller === controller) activeDeformations.delete(mesh)
    },
  }
  mesh.onBeforeRender = beforeRender
  activeDeformations.set(mesh, { shader, controller })
  return controller
}
