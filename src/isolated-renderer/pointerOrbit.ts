type Point = { x: number; y: number; z: number }
export type OrbitFields = {
  camera: { position: Point; up: Point }
  controls: { target: Point; update: () => unknown; autoRotate?: boolean }
}
type Pointer = { x: number; y: number; down: boolean; inside?: boolean }
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Point, b: Point): Point => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const norm = (point: Point) => Math.hypot(point.x, point.y, point.z)
const scaled = (point: Point, amount: number): Point => ({ x: point.x * amount, y: point.y * amount, z: point.z * amount })
const offset = (fields: OrbitFields): Point => ({ x: fields.camera.position.x - fields.controls.target.x,
  y: fields.camera.position.y - fields.controls.target.y, z: fields.camera.position.z - fields.controls.target.z })

/** Numeric viewer input only: no synthetic DOM events or engine editor shortcuts. */
export function createPointerOrbit(fields: OrbitFields) {
  const initialDistance = norm(offset(fields))
  let previous: Pointer | null = null, disposed = false
  function apply(value: Point) {
    const { position } = fields.camera, { target } = fields.controls
    position.x = target.x + value.x; position.y = target.y + value.y; position.z = target.z + value.z
    // Updating orientation must not add an extra automatic-orbit step per input message.
    const autoRotate = fields.controls.autoRotate
    fields.controls.autoRotate = false
    try { fields.controls.update() } finally { fields.controls.autoRotate = autoRotate }
  }
  return {
    update(pointer: Pointer, width: number, height: number) {
      if (disposed) return
      if (pointer.inside === false || !pointer.down || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) { previous = null; return }
      const next = { ...pointer, x: clamp(pointer.x, -1, 1), y: clamp(pointer.y, -1, 1) }
      const before = previous; previous = next
      if (!before) return
      const dx = next.x - before.x, dy = next.y - before.y
      if (!dx && !dy) return
      const current = offset(fields), distance = norm(current), upLength = norm(fields.camera.up)
      if (!Number.isFinite(distance) || distance <= 1e-8 || !Number.isFinite(upLength) || upLength <= 1e-8) return
      const up = scaled(fields.camera.up, 1 / upLength)
      const elevation = dot(current, up)
      let horizontal: Point = { x: current.x - elevation * up.x, y: current.y - elevation * up.y, z: current.z - elevation * up.z }
      if (norm(horizontal) <= 1e-8) horizontal = cross(up, Math.abs(up.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })
      horizontal = scaled(horizontal, 1 / norm(horizontal))
      const aspect = Number.isFinite(width) && Number.isFinite(height) && height > 0 ? clamp(width / height, 0.1, 10) : 1
      const yaw = clamp(-dx * Math.PI * aspect, -Math.PI / 2, Math.PI / 2)
      const pitch = clamp(dy * Math.PI, -Math.PI / 2, Math.PI / 2)
      const tangent = cross(up, horizontal)
      const turned = { x: horizontal.x * Math.cos(yaw) + tangent.x * Math.sin(yaw),
        y: horizontal.y * Math.cos(yaw) + tangent.y * Math.sin(yaw),
        z: horizontal.z * Math.cos(yaw) + tangent.z * Math.sin(yaw) }
      const polar = clamp(Math.acos(clamp(elevation / distance, -1, 1)) + pitch, 0.01, Math.PI - 0.01)
      const side = distance * Math.sin(polar), vertical = distance * Math.cos(polar)
      apply({ x: turned.x * side + up.x * vertical, y: turned.y * side + up.y * vertical, z: turned.z * side + up.z * vertical })
    },
    zoom(factor: number) {
      if (disposed || !Number.isFinite(factor) || !Number.isFinite(initialDistance) || initialDistance <= 1e-8) return
      const current = offset(fields), distance = norm(current)
      if (!Number.isFinite(distance) || distance <= 1e-8) return
      apply(scaled(current, initialDistance * clamp(factor, 0.4, 2.5) / distance))
    },
    dispose() { disposed = true; previous = null },
  }
}
