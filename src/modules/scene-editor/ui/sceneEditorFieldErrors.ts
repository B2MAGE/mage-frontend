import { createContext, useContext } from 'react'
import type { EditorSectionId } from '../types'

type FieldIssue = { path: string; message: string }
export type FieldIssues = Record<string, FieldIssue>
export const FieldErrorsContext = createContext<FieldIssues>({})

const controlIds: Record<string, string> = {
  templateId: 'template-templateId',
  'parameters.scale': 'template-parameters-scale',
  'parameters.speed': 'time-multiplier',
  'settings.skybox': 'template-settings-skybox',
  'settings.camera.fov': 'field-of-view',
  'settings.camera.autoRotate': 'automatic-orbit-toggle',
  'settings.camera.orbitSpeed': 'rotation-speed',
  'settings.camera.tilt': 'camera-tilt',
  'settings.camera.orientationMode': 'camera-orientation-mode',
  'settings.camera.orientationSpeed': 'camera-orientation-speed',
  'settings.controls.zoom0': 'zoom',
  'settings.state.time': 'state-time',
  'settings.state.volume_multiplier': 'music-response-offset',
  'settings.motion.minimizing_factor': 'music-response-gain',
  'settings.motion.power_factor': 'music-response-peaks',
  'settings.motion.base_speed': 'music-response-resting',
  'settings.motion.easing_speed': 'music-response-smoothing',
  'settings.audioResponse': 'music-response-mode',
  'settings.audioResponseConfig.sensitivity': 'music-response-sensitivity',
  'settings.bloom.enabled': 'bloom-toggle',
  'settings.bloom.strength': 'bloom-strength',
  'settings.bloom.radius': 'bloom-radius',
  'settings.bloom.threshold': 'bloom-threshold',
  'settings.tint.enabled': 'colorify-toggle',
  'settings.tint.color': 'colorify-color',
  'settings.effects.toneMapping.method': 'tone-mapping-method',
  'settings.effects.toneMapping.exposure': 'tone-mapping-exposure',
  'settings.effects.params.rgbShift.amount': 'rgb-shift-amount',
  'settings.effects.params.rgbShift.angle': 'rgb-shift-angle',
  'settings.effects.params.afterImage.damp': 'trail-fade',
  'settings.effects.params.kaleid.sides': 'kaleid-sides',
  'settings.effects.params.kaleid.angle': 'kaleid-angle',
  'settings.effects.passOrder': 'scene-pass-order',
}
const passTitles: Record<string, string> = {
  outputPass: 'output-pass', rgbShift: 'rgb-shift', afterImage: 'afterimage', kaleid: 'kaleidoscope',
  glitch: 'glitch', dot: 'dot-screen', technicolor: 'technicolor', luminosity: 'luminosity',
  bleachBypass: 'bleach-bypass', toon: 'toon', sobel: 'sobel', halftone: 'halftone', gammaCorrection: 'gamma-correction',
}
for (const [pass, title] of Object.entries(passTitles)) controlIds[`settings.effects.passes.${pass}`] = `${title}-toggle`
for (const [name, prefix] of [['position0', 'camera-position'], ['target0', 'camera-target']]) {
  for (const axis of ['x', 'y', 'z']) controlIds[`settings.controls.${name}.${axis}`] = `${prefix}-${axis}`
}

export function templateControlLocation(rawPath: string): { path: string; id: string; section: EditorSectionId } | null {
  const path = rawPath.replace(/^sceneData\./, '').replace(/^scene\./, '')
  const mappingField = /^settings\.audioResponseConfig\.mappings(?:\[\d+\]|\.\d+)\.(\w+)$/.exec(path)?.[1]
  const mappingIds: Record<string, string> = { amount: 'amount', source: 'frequency', attack: 'attack', release: 'release', target: 'target' }
  const id = controlIds[path] ?? (mappingField && mappingIds[mappingField] ? `music-response-${mappingIds[mappingField]}` : undefined)
  if (!id) return null
  const section = path.startsWith('settings.camera.') || path.startsWith('settings.controls.') ? 'camera'
    : path === 'settings.effects.passOrder' ? 'pass-order'
      : path.startsWith('settings.effects.') || path.startsWith('settings.bloom.') || path.startsWith('settings.tint.') ? 'effects'
        : path === 'parameters.speed' || /^settings\.(state|motion|audioResponse)/.test(path) ? 'motion' : 'scene'
  return { path, id, section }
}

const builderObjectControlIds: Record<string, string> = {
  name: 'builder-object-name',
  'operation.type': 'builder-object-shape',
  'operation.radius': 'builder-radius',
  'operation.width': 'builder-width',
  'operation.height': 'builder-height',
  'operation.depth': 'builder-depth',
  'operation.tube': 'builder-tube',
  'transform.position.x': 'builder-position-x',
  'transform.position.y': 'builder-position-y',
  'transform.position.z': 'builder-position-z',
  'transform.rotation.x': 'builder-rotation-x',
  'transform.rotation.y': 'builder-rotation-y',
  'transform.rotation.z': 'builder-rotation-z',
  'transform.scale.x': 'builder-scale-x',
  'transform.scale.y': 'builder-scale-y',
  'transform.scale.z': 'builder-scale-z',
  'material.color': 'builder-color',
  'material.metalness': 'builder-metalness',
  'material.shininess': 'builder-shininess',
}

export function builderControlLocation(rawPath: string): { path: string; id: string; objectIndex?: number; section: EditorSectionId } | null {
  const path = rawPath.replace(/^sceneData\./, '').replace(/^scene\./, '')
  const objectMatch = /^objects(?:\[(\d+)\]|\.(\d+))(?:\.(.+))?$/.exec(path)
  if (objectMatch) {
    const objectIndex = Number(objectMatch[1] ?? objectMatch[2])
    const id = builderObjectControlIds[objectMatch[3] ?? ''] ?? 'builder-object-list'
    return { path, id, objectIndex, section: 'scene' }
  }
  if (path === 'objects') return { path, id: 'builder-object-list', section: 'scene' }
  if (path === 'parameters.scale') return { path, id: 'builder-scene-scale', section: 'scene' }
  if (path === 'settings.skybox') return { path, id: 'builder-skybox', section: 'scene' }
  return templateControlLocation(path)
}

export function useSceneEditorFieldErrors() { return useContext(FieldErrorsContext) }
export function useSceneEditorFieldIssue(id: string) {
  const issue = useSceneEditorFieldErrors()[id]
  return {
    issue,
    attributes: { 'aria-invalid': Boolean(issue), 'aria-describedby': issue ? `${id}-error` : undefined },
  }
}

