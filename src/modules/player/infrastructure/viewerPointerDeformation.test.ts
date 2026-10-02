import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachViewerPointerDeformation, type ViewerPointerMesh } from './viewerPointerDeformation'

const source = `#version 300 es
precision highp float;
float surfaceDistance(vec3 p);
float surfaceDistance(vec3 p) { return length(p) - 1.0; }
ShadedMaterial shade(vec3 p, vec3 normal) { return ShadedMaterial(p); }`
const shader = 'let size = input(); let pointerDown = input(); sphere(1 + size);'

function createMesh() {
  const material = { fragmentShader: source, uniforms: {} as Record<string, { value: unknown }>, needsUpdate: false, uniformsNeedUpdate: false }
  const mesh: ViewerPointerMesh = { material, onBeforeRender: vi.fn() }
  return { material, mesh }
}

function readUniform(material: ReturnType<typeof createMesh>['material']) {
  return material.uniforms.mageViewerPointerDeformation.value as Float32Array
}

function renderFrames(mesh: ViewerPointerMesh, count: number, start = 0) {
  const clock = vi.spyOn(performance, 'now')
  for (let frame = 0; frame < count; frame += 1) {
    clock.mockReturnValue(start + frame * (1000 / 60))
    mesh.onBeforeRender?.()
  }
}

afterEach(() => vi.restoreAllMocks())

describe('viewer pointer deformation', () => {
  it('keeps the original distance path exactly neutral and deforms geometry and shading together', () => {
    const { mesh, material } = createMesh()
    const controller = attachViewerPointerDeformation(mesh, shader)
    expect([...readUniform(material)]).toEqual([0, 0, 0, 0])
    expect(material.fragmentShader).toMatch(/^#version 300 es/)
    expect(material.fragmentShader).toContain('if (amount <= 0.0) return mageViewerOriginalSurfaceDistance(p);')
    expect(material.fragmentShader).toContain('if (amount <= 0.0) return p;')
    expect(material.fragmentShader).toContain('p = mageViewerWarp(p);')
    expect(material.fragmentShader).toContain('float mageViewerOriginalSurfaceDistance(vec3 p) { return length(p) - 1.0; }')
    expect(material.fragmentShader).toContain('0.06 * mageViewerPointerDeformation.z + 0.14 * mageViewerPointerDeformation.w')
    controller.dispose()
  })

  it.each([
    'let pointerDown = input(); sphere(1 + pointerDown);',
    'rotateY(mouse.x); sphere(1);',
    'let p = mouseIntersection(); sphere(length(p));',
  ])('preserves an authored pointer response: %s', (authoredShader) => {
    const { mesh, material } = createMesh()
    const before = mesh.onBeforeRender
    const controller = attachViewerPointerDeformation(mesh, authoredShader)
    controller.update(1, 1, 1, 1)
    expect(material.fragmentShader).toBe(source)
    expect(material.uniforms).toEqual({})
    expect(mesh.onBeforeRender).toBe(before)
  })

  it('ignores comments and unused declarations when identifying authored pointer behavior', () => {
    const { mesh, material } = createMesh()
    const controller = attachViewerPointerDeformation(mesh, `${shader}\n// mouse.x\n/* pointerDown and mouseIntersection() */`)
    expect(material.fragmentShader).not.toBe(source)
    controller.dispose()
  })

  it('smooths bounded inputs while retaining the original render callback context and arguments', () => {
    const { mesh, material } = createMesh()
    const before = vi.fn(function (this: ViewerPointerMesh, value: unknown) {
      expect(this).toBe(mesh)
      expect(value).toBe('renderer')
      expect([...readUniform(material)]).toEqual([0, 0, 0, 0])
    })
    mesh.onBeforeRender = before
    const controller = attachViewerPointerDeformation(mesh, shader)
    controller.update(4, -3, 5, 7)
    mesh.onBeforeRender?.('renderer')
    expect(before).toHaveBeenCalledOnce()
    const value = readUniform(material)
    expect(value[0]).toBeGreaterThan(0)
    expect(value[0]).toBeLessThan(1)
    expect(value[1]).toBeCloseTo(-value[0])
    expect(value[2]).toBeCloseTo(value[0])
    expect(value[3]).toBeCloseTo(value[0])
    expect(material.uniformsNeedUpdate).toBe(true)
    controller.dispose()
  })

  it('settles back to exact zero after leaving and safely handles invalid input', () => {
    const { mesh, material } = createMesh()
    const controller = attachViewerPointerDeformation(mesh, shader)
    controller.update(1, -1, 1, 1)
    renderFrames(mesh, 80)
    expect([...readUniform(material)]).toEqual([1, -1, 1, 1])
    controller.update(NaN, Infinity, NaN, Infinity)
    renderFrames(mesh, 80, 2000)
    expect([...readUniform(material)]).toEqual([0, 0, 0, 0])
    controller.dispose()
  })

  it('deduplicates attachment and shared materials and restores the original live state', () => {
    const { mesh, material } = createMesh()
    mesh.material = [material, material]
    const before = mesh.onBeforeRender
    const controller = attachViewerPointerDeformation(mesh, shader)
    expect(attachViewerPointerDeformation(mesh, shader)).toBe(controller)
    expect(material.fragmentShader.match(/uniform vec4 mageViewerPointerDeformation;/g)).toHaveLength(1)
    controller.dispose()
    controller.dispose()
    controller.update(1, 1, 1, 1)
    expect(material.fragmentShader).toBe(source)
    expect(material.uniforms).toEqual({})
    expect(mesh.onBeforeRender).toBe(before)
    expect(attachViewerPointerDeformation(mesh, shader)).not.toBe(controller)
  })

  it('does not overwrite a later material or render hook change during disposal', () => {
    const { mesh, material } = createMesh()
    const controller = attachViewerPointerDeformation(mesh, shader)
    const nextBefore = vi.fn()
    const nextUniform = { value: 'replacement' }
    material.fragmentShader = 'replacement shader'
    material.uniforms.mageViewerPointerDeformation = nextUniform
    mesh.onBeforeRender = nextBefore
    controller.dispose()
    expect(material.fragmentShader).toBe('replacement shader')
    expect(material.uniforms.mageViewerPointerDeformation).toBe(nextUniform)
    expect(mesh.onBeforeRender).toBe(nextBefore)
  })

  it('does not modify unsupported meshes, shaders, or colliding uniforms', () => {
    expect(() => attachViewerPointerDeformation(null, shader).dispose()).not.toThrow()
    const { mesh, material } = createMesh()
    material.fragmentShader = 'void main() {}'
    attachViewerPointerDeformation(mesh, shader)
    expect(material.fragmentShader).toBe('void main() {}')
    material.fragmentShader = source
    material.uniforms.mageViewerPointerDeformation = { value: [1, 2, 3, 4] }
    attachViewerPointerDeformation(mesh, shader)
    expect(material.fragmentShader).toBe(source)
  })
})
