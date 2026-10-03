import { hasSceneDocumentMarkers, parseSceneDocument, SceneContractError, type TemplateSceneDocument } from './sceneContract'
import { getTemplateDefinition } from './templateRegistry'

export type ResolvedPlaybackScene = {
  kind: 'template' | 'custom'
  trust: 'platform-owned' | 'untrusted'
  engineScene: Record<string, unknown>
}

// Version 1's engine defaults are part of its saved appearance. Changes to these
// defaults or the source must ship as a new template version.
function buildVersionOnePayload(document: TemplateSceneDocument): Record<string, unknown> {
  const definition = getTemplateDefinition(document.templateId, document.templateVersion)
  if (!definition) throw new SceneContractError('Unknown template ID or version.')
  const { parameters, settings } = document
  return {
    visualizer: {
      shader: definition.shader,
      scale: parameters.scale,
      skyboxPreset: settings.skybox,
    },
    controls: settings.controls ?? {
      target0: { x: 0, y: 0, z: 0 },
      position0: { x: 0, y: 0, z: 5.5 },
      zoom0: 1,
    },
    intent: {
      time_multiplier: parameters.speed,
      minimizing_factor: settings.motion?.minimizing_factor ?? 0.8,
      power_factor: settings.motion?.power_factor ?? 8,
      pointerDownMultiplier: settings.motion?.pointerDownMultiplier ?? 0,
      base_speed: settings.motion?.base_speed ?? 0.2,
      easing_speed: settings.motion?.easing_speed ?? 0.6,
      camTilt: settings.camera.tilt ?? 0,
      camOrientationMode: settings.camera.orientationMode ?? 0,
      camOrientationSpeed: settings.camera.orientationSpeed ?? 1,
      autoRotate: settings.camera.autoRotate,
      autoRotateSpeed: settings.camera.orbitSpeed,
      fov: settings.camera.fov,
    },
    fx: {
      passOrder: settings.effects?.passOrder ?? [
        'glitchPass', 'bloom', 'RGBShift', 'dotShader', 'technicolorShader',
        'luminosityShader', 'afterImagePass', 'sobelShader', 'colorifyShader',
        'halftonePass', 'gammaCorrectionShader', 'kaleidoShader', 'copyShader',
        'bleachBypassShader', 'toonShader', 'outputPass',
      ],
      bloom: {
        enabled: settings.bloom.enabled,
        strength: settings.bloom.strength,
        radius: settings.bloom.radius,
        threshold: settings.bloom.threshold,
      },
      toneMapping: { method: settings.effects?.toneMapping?.method ?? 0, exposure: settings.effects?.toneMapping?.exposure ?? 1.5 },
      passes: {
        rgbShift: false, dot: false, technicolor: false, luminosity: false,
        afterImage: false, sobel: false, glitch: false, colorify: settings.tint.enabled,
        halftone: false, gammaCorrection: false, kaleid: false, bleachBypass: false,
        toon: false, outputPass: true,
        ...settings.effects?.passes,
      },
      params: {
        rgbShift: { amount: settings.effects?.params?.rgbShift?.amount ?? 0.005, angle: settings.effects?.params?.rgbShift?.angle ?? 0 },
        afterImage: { damp: settings.effects?.params?.afterImage?.damp ?? 0.96 },
        colorify: { color: settings.tint.color },
        kaleid: { sides: settings.effects?.params?.kaleid?.sides ?? 6, angle: settings.effects?.params?.kaleid?.angle ?? 0 },
      },
    },
    state: {
      size: settings.state?.size ?? 0, pointerDown: settings.state?.pointerDown ?? 0,
      currPointerDown: settings.state?.currPointerDown ?? 0, currAudio: settings.state?.currAudio ?? 0,
      time: settings.state?.time ?? 0, volume_multiplier: settings.state?.volume_multiplier ?? 0,
    },
    audioResponse: settings.audioResponse ?? 'legacy',
    ...(settings.audioResponseConfig === undefined ? {} : { audioResponseConfig: settings.audioResponseConfig }),
  }
}

export function resolveSceneForPlayback(value: unknown): ResolvedPlaybackScene {
  if (hasSceneDocumentMarkers(value)) {
    const document = parseSceneDocument(value)
    if (document.kind === 'template') {
      return { kind: 'template', trust: 'platform-owned', engineScene: buildVersionOnePayload(document) }
    }
    return { kind: 'custom', trust: 'untrusted', engineScene: document.scene }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SceneContractError('Scene data must be an object.')
  }
  // Compatibility only. Legacy source is never promoted by matching a preset.
  // Routing custom scenes to an isolated renderer is the separate PP-I work.
  return { kind: 'custom', trust: 'untrusted', engineScene: { ...value } }
}
