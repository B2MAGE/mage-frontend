import type { ApiErrorResponse } from '@shared/lib'
import type { CreateSceneFormErrors } from './types'

const fieldLabels: Record<string, string> = {
  visualizer: 'Scene', 'visualizer.shader': 'Custom shader', 'visualizer.scale': 'Scene scale',
  'visualizer.skyboxPreset': 'Skybox', controls: 'Camera', 'controls.position0': 'Camera position',
  'controls.target0': 'Camera target', 'controls.zoom0': 'Zoom', intent: 'Movement',
  'intent.fov': 'FOV', 'intent.camTilt': 'Camera orientation', 'intent.camOrientationMode': 'Camera orientation mode',
  'intent.camOrientationSpeed': 'Camera orientation speed', 'intent.autoRotateSpeed': 'Orbit speed',
  'intent.time_multiplier': 'Animation speed', 'state.time': 'Starting animation time',
  'state.volume_multiplier': 'Response offset', fx: 'Effects', 'fx.toneMapping.exposure': 'Exposure',
  audioResponse: 'Response mode', audioResponseConfig: 'Music response',
  templateId: 'Template', templateVersion: 'Template version',
  'parameters.scale': 'Scale', 'parameters.speed': 'Animation speed',
  'settings.skybox': 'Skybox', 'settings.camera.fov': 'FOV',
  'settings.camera.autoRotate': 'Automatic orbit', 'settings.camera.orbitSpeed': 'Orbit speed',
  'settings.bloom.enabled': 'Bloom', 'settings.bloom.strength': 'Bloom strength',
  'settings.bloom.radius': 'Bloom radius', 'settings.bloom.threshold': 'Bloom threshold',
  'settings.tint.enabled': 'Tint', 'settings.tint.color': 'Tint color',
}

function fieldPath(path: string) {
  return path.replace(/^sceneData(?:\.scene)?\.?/, '').replace(/^scene(?:\.scene)?\.?/, '')
}

function fieldLabel(path: string) {
  const field = fieldPath(path)
  if (!field) return 'Scene data'
  if (fieldLabels[field]) return fieldLabels[field]
  const parent = Object.keys(fieldLabels).sort((a, b) => b.length - a.length)
    .find(key => field.startsWith(`${key}.`) || field.startsWith(`${key}[`))
  return parent ? `${fieldLabels[parent]} (${field.slice(parent.length + 1)})` : field
}

export function describeSceneValidation(details: Readonly<Record<string, string>>, fallback: string) {
  const entries = Object.entries(details).filter(([path]) => /^(sceneData|scene)(\.|\[|$)/.test(path))
  return entries.length ? entries.slice(0, 8).map(([path, message]) => `${fieldLabel(path)}: ${message}`).join(' ') : fallback
}

export function describeSceneValidationError(error: unknown) {
  const fallback = error instanceof Error && error.message.trim() ? error.message : 'Check the scene settings before continuing.'
  if (error && typeof error === 'object' && 'details' in error && typeof error.details === 'object' && error.details) {
    return describeSceneValidation(error.details as Record<string, string>, fallback)
  }
  return fallback
}

export function sceneSubmissionErrors(status: number, error: ApiErrorResponse | null): CreateSceneFormErrors {
  if (status === 413 || error?.code === 'REQUEST_TOO_LARGE') {
    return { form: 'This scene is too large to save. Keep the complete submission under 512 KiB; shorten the description or scene data, then save again.' }
  }
  const details = error?.details ?? {}
  const sceneData = describeSceneValidation(details, '') || undefined
  const fields = Object.fromEntries(Object.entries(details)
    .filter(([path]) => /^(sceneData|scene)(\.|\[|$)/.test(path))
    .map(([path, message]) => [fieldPath(path), message]))
  return {
    description: details.description,
    name: details.name,
    sceneData,
    ...(Object.keys(fields).length ? { fields } : {}),
    form: sceneData ? 'Some scene settings need attention. Your changes are still here.'
      : error?.message ?? 'Unable to save this scene. Your changes are still here; please try again.',
  }
}
