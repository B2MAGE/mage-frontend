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
    controls: {
      target0: { x: 0, y: 0, z: 0 },
      position0: { x: 0, y: 0, z: 5.5 },
      zoom0: 1,
    },
    intent: {
      time_multiplier: parameters.speed,
      minimizing_factor: 0.8,
      power_factor: 8,
      pointerDownMultiplier: 0,
      base_speed: 0.2,
      easing_speed: 0.6,
      camTilt: 0,
      camOrientationMode: 0,
      camOrientationSpeed: 1,
      autoRotate: settings.camera.autoRotate,
      autoRotateSpeed: settings.camera.orbitSpeed,
      fov: settings.camera.fov,
    },
    fx: {
      passOrder: [
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
      toneMapping: { method: 0, exposure: 1.5 },
      passes: {
        rgbShift: false, dot: false, technicolor: false, luminosity: false,
        afterImage: false, sobel: false, glitch: false, colorify: settings.tint.enabled,
        halftone: false, gammaCorrection: false, kaleid: false, bleachBypass: false,
        toon: false, outputPass: true,
      },
      params: {
        rgbShift: { amount: 0.005, angle: 0 },
        afterImage: { damp: 0.96 },
        colorify: { color: settings.tint.color },
        kaleid: { sides: 6, angle: 0 },
      },
    },
    state: {
      size: 0, pointerDown: 0, currPointerDown: 0, currAudio: 0,
      time: 0, volume_multiplier: 0,
    },
    audioResponse: 'legacy',
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
