import { describe, expect, it, vi } from 'vitest'
import { createPointerOrbit } from './pointerOrbit'

function fixture(up = { x: 0, y: 1, z: 0 }) {
  const fields = { camera: { position: { x: 1, y: 2, z: 8 }, up },
    controls: { target: { x: 1, y: 2, z: 3 }, autoRotate: true, update: vi.fn() } }
  const orbit = createPointerOrbit(fields)
  const distance = () => Math.hypot(fields.camera.position.x - 1, fields.camera.position.y - 2, fields.camera.position.z - 3)
  const drag = (x: number, y: number, down = true, inside = true) => orbit.update({ x, y, down, inside }, 600, 400)
  return { fields, orbit, distance, drag }
}

describe('isolated numeric pointer orbit', () => {
  it('rebases edited camera fields without applying the existing cumulative wheel factor twice', () => {
    const f = fixture(); f.orbit.zoom(2)
    expect(f.distance()).toBeCloseTo(10)
    f.orbit.dispose()
    const rebased = createPointerOrbit(f.fields, 2)
    rebased.zoom(2.01)
    expect(f.distance()).toBeCloseTo(10.05)
    rebased.zoom(1)
    expect(f.distance()).toBeCloseTo(5)
  })
  it('rotates only during consecutive down inputs while keeping target and camera distance', () => {
    const f = fixture()
    f.drag(0, 0, false); f.drag(0, 0); expect(f.fields.controls.update).not.toHaveBeenCalled()
    f.drag(0.1, 0.1)
    expect(f.fields.camera.position.x).toBeLessThan(1)
    expect(f.fields.camera.position.y).toBeLessThan(2)
    expect(f.distance()).toBeCloseTo(5)
    expect(f.fields.controls.target).toEqual({ x: 1, y: 2, z: 3 })
    expect(f.fields.controls.autoRotate).toBe(true)
    f.drag(0.3, 0.3, false); f.drag(0.5, 0.5)
    expect(f.fields.controls.update).toHaveBeenCalledOnce()
    f.drag(0.6, 0.6); expect(f.fields.controls.update).toHaveBeenCalledTimes(2)
  })

  it('honors a tilted camera up vector and clamps repeated polar rotations away from singularities', () => {
    const f = fixture({ x: 1, y: 1, z: -1 })
    f.drag(0, 0)
    for (let i = 0; i < 100; i++) f.drag(i % 2, i % 2 ? 1 : -1)
    const position = f.fields.camera.position
    expect(Object.values(position).every(Number.isFinite)).toBe(true)
    expect(f.distance()).toBeCloseTo(5)
    const cosine = ((position.x - 1) + (position.y - 2) - (position.z - 3)) / Math.sqrt(3) / 5
    expect(Math.abs(cosine)).toBeLessThan(1)
  })

  it('resets drag on leave and disposal and ignores nonfinite input', () => {
    const f = fixture()
    f.drag(0, 0); f.drag(1, 1, true, false); f.drag(-1, -1)
    expect(f.fields.controls.update).not.toHaveBeenCalled()
    f.drag(NaN, 0); f.drag(1, 1)
    expect(f.fields.controls.update).not.toHaveBeenCalled()
    f.orbit.dispose(); f.drag(0, 0); f.orbit.zoom(2)
    expect(f.fields.controls.update).not.toHaveBeenCalled()
  })

  it('zooms from the saved scene distance without cumulative drift or changing orbit direction', () => {
    const f = fixture(); f.drag(0, 0); f.drag(0.1, 0.1)
    const before = { ...f.fields.camera.position }
    f.orbit.zoom(2); expect(f.distance()).toBeCloseTo(10)
    f.orbit.zoom(2); expect(f.distance()).toBeCloseTo(10)
    expect(f.fields.camera.position.x - 1).toBeCloseTo((before.x - 1) * 2)
    f.orbit.zoom(100); expect(f.distance()).toBeCloseTo(12.5)
    f.orbit.zoom(-1); expect(f.distance()).toBeCloseTo(2)
    f.orbit.zoom(NaN); expect(f.distance()).toBeCloseTo(2)
  })
})
