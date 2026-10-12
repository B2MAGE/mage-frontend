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
  'motion.type': 'builder-motion-axis',
  'motion.axis': 'builder-motion-axis',
  'motion.speed': 'builder-motion-speed',
}

export function builderControlLocation(rawPath: string): { path: string; id: string; objectIndex?: number; groupIndex?: number; section: EditorSectionId } | null {
  const path = rawPath.replace(/^sceneData\./, '').replace(/^scene\./, '')
  const groupMatch = /^composition\.groups(?:\[(\d+)\]|\.(\d+))(?:\.(.+))?$/.exec(path)
  if (groupMatch) {
    const field = groupMatch[3] ?? ''
    const groupFields: Record<string, string> = { 'operation.type': 'builder-group-operation', 'operation.blend': 'builder-group-blend', 'transform.scale': 'builder-scale' }
    return { path, id: groupFields[field] ?? builderObjectControlIds[field] ?? 'builder-object-list', groupIndex: Number(groupMatch[1] ?? groupMatch[2]), section: 'scene' }
  }
  if (path.startsWith('composition')) return { path, id: 'builder-object-list', section: 'scene' }
  const objectMatch = /^objects(?:\[(\d+)\]|\.(\d+))(?:\.(.+))?$/.exec(path)
  if (objectMatch) {
    const objectIndex = Number(objectMatch[1] ?? objectMatch[2])
    const field = objectMatch[3] ?? ''
    const stage = /^(modifiers|arrangements)(?:\[(\d+)\]|\.(\d+))\.(amount|thickness|axis|count|spacing|radius)$/.exec(field)
    const stageId = stage ? `builder-${stage[1] === 'modifiers' ? 'modifier' : 'arrangement'}-${stage[2] ?? stage[3]}-${stage[4]}` : undefined
    const frame = /^frame\.(position\.[xyz]|rotation\.[xyz]|scale)$/.exec(field)
    const binding = /^bindings(?:\[(\d+)\]|\.(\d+))(?:\.(target|source|mode|amount|offset|attack|release))?$/.exec(field)
    const bindingId = binding ? `builder-binding-${binding[1] ?? binding[2]}-${binding[3] ?? 'target'}` : field === 'bindings' ? 'builder-bindings' : undefined
    const id = builderObjectControlIds[field] ?? stageId ?? bindingId ?? (frame ? `builder-frame-${frame[1].replace('.', '-')}` : 'builder-object-list')
    return { path, id, objectIndex, section: 'scene' }
  }
  if (path === 'objects') return { path, id: 'builder-object-list', section: 'scene' }
  if (path === 'parameters.scale') return { path, id: 'builder-scene-scale', section: 'scene' }
  if (path === 'settings.skybox') return { path, id: 'builder-skybox', section: 'scene' }
  return templateControlLocation(path)
}

/** Reused inspector IDs represent only the selected object's validation. */
export function builderObjectFieldIssues(issues: FieldIssues, objectIndex: number): FieldIssues {
  const selected: FieldIssues = {}
  for (const issue of Object.values(issues)) {
    const location = builderControlLocation(issue.path)
    if (location?.objectIndex === objectIndex) selected[location.id] = issue
  }
  return selected
}

export function builderGroupFieldIssues(issues: FieldIssues, groupIndex: number): FieldIssues {
  const selected: FieldIssues = {}
  for (const issue of Object.values(issues)) {
    const location = builderControlLocation(issue.path)
    if (location?.groupIndex === groupIndex) selected[location.id] = issue
  }
  return selected
}

export function useSceneEditorFieldErrors() { return useContext(FieldErrorsContext) }
export function useSceneEditorFieldIssue(id: string) {
  const issue = useSceneEditorFieldErrors()[id]
  return {
    issue,
    attributes: { 'aria-invalid': Boolean(issue), 'aria-describedby': issue ? `${id}-error` : undefined },
  }
}

