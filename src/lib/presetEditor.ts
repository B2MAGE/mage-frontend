import { EMBEDDED_SHADER_PRESETS } from './embeddedShaderPresets'

export type PresetSceneData = Record<string, unknown>

export type Vector3Value = {
  x: number
  y: number
  z: number
}

export type PresetPassId =
  | 'glitchPass'
  | 'bloom'
  | 'RGBShift'
  | 'dotShader'
  | 'technicolorShader'
  | 'luminosityShader'
  | 'afterImagePass'
  | 'sobelShader'
  | 'colorifyShader'
  | 'halftonePass'
  | 'gammaCorrectionShader'
  | 'kaleidoShader'
  | 'copyShader'
  | 'bleachBypassShader'
  | 'toonShader'
  | 'outputPass'

export type PersistedPassFlag =
  | 'rgbShift'
  | 'dot'
  | 'technicolor'
  | 'luminosity'
  | 'afterImage'
  | 'sobel'
  | 'glitch'
  | 'colorify'
  | 'halftone'
  | 'gammaCorrection'
  | 'kaleid'
  | 'outputPass'

export type ShaderPresetOption = {
  description: string
  id: string
  label: string
  shader: string
}

export type ToneMappingOption = {
  description: string
  label: string
  value: number
}

export type SceneEditorModel = {
  controls: {
    position0: Vector3Value
    target0: Vector3Value
    zoom0: number
  }
  fx: {
    bloom: {
      enabled: boolean
      radius: number
      strength: number
      threshold: number
    }
    params: {
      afterImage: {
        damp: number
      }
      colorify: {
        color: string
      }
      kaleid: {
        angle: number
        sides: number
      }
      rgbShift: {
        angle: number
        amount: number
      }
    }
    passOrder: PresetPassId[]
    passes: Record<PersistedPassFlag, boolean>
    toneMapping: {
      exposure: number
      method: number
    }
  }
  intent: {
    autoRotate: boolean
    autoRotateSpeed: number
    base_speed: number
    camTilt: number
    camOrientationMode: number
    camOrientationSpeed: number
    easing_speed: number
    fov: number
    minimizing_factor: number
    pointerDownMultiplier: number
    power_factor: number
    time_multiplier: number
  }
  state: {
    currAudio: number
    currPointerDown: number
    pointerDown: number
    size: number
    time: number
    volume_multiplier: number
  }
  visualizer: {
    scale: number
    shader: string
    skyboxPreset: number
  }
}

const DEFAULT_PASS_ORDER: PresetPassId[] = [
  'glitchPass',
  'bloom',
  'RGBShift',
  'dotShader',
  'technicolorShader',
  'luminosityShader',
  'afterImagePass',
  'sobelShader',
  'colorifyShader',
  'halftonePass',
  'gammaCorrectionShader',
  'kaleidoShader',
  'copyShader',
  'bleachBypassShader',
  'toonShader',
  'outputPass',
]

export const PASS_LABELS: Record<PresetPassId, string> = {
  RGBShift: 'RGB Shift',
  afterImagePass: 'Afterimage',
  bleachBypassShader: 'Bleach Bypass',
  bloom: 'Bloom',
  colorifyShader: 'Colorify',
  copyShader: 'Copy Shader',
  dotShader: 'Dot Screen',
  gammaCorrectionShader: 'Gamma Correction',
  glitchPass: 'Glitch',
  halftonePass: 'Halftone',
  kaleidoShader: 'Kaleidoscope',
  luminosityShader: 'Luminosity',
  outputPass: 'Output',
  sobelShader: 'Sobel',
  technicolorShader: 'Technicolor',
  toonShader: 'Toon',
}

export const SHADER_PRESETS: ShaderPresetOption[] = [...EMBEDDED_SHADER_PRESETS]

export const TONE_MAPPING_OPTIONS: ToneMappingOption[] = [
  {
    value: 0,
    label: 'NoTone',
    description: 'No extra tone mapping on the final output.',
  },
  {
    value: 1,
    label: 'Linear',
    description: 'Straight linear output with light compression.',
  },
  {
    value: 2,
    label: 'Reinhard',
    description: 'Classic roll-off for bright highlights.',
  },
  {
    value: 3,
    label: 'Cineon',
    description: 'Film-inspired contrast with a stronger curve.',
  },
  {
    value: 4,
    label: 'Filmic',
    description: 'Cinematic highlight shaping with balanced contrast.',
  },
  {
    value: 6,
    label: 'AGX',
    description: 'Modern color-rich tonality with smooth highlight handling.',
  },
  {
    value: 7,
    label: 'Neutral',
    description: 'Clean neutral tonality with restrained clipping.',
  },
]

export const SKYBOX_OPTIONS = Array.from({ length: 10 }, (_, index) => ({
  value: index + 1,
  label: `Skybox ${index + 1}`,
}))

const DEFAULT_SCENE_DATA: SceneEditorModel = {
  visualizer: {
    shader: SHADER_PRESETS[0].shader,
    skyboxPreset: 6,
    scale: 10,
  },
  controls: {
    target0: { x: 0, y: 0, z: 0 },
    position0: { x: 0, y: 0, z: 5.5 },
    zoom0: 1,
  },
  intent: {
    time_multiplier: 1,
    minimizing_factor: 0.8,
    power_factor: 8,
    pointerDownMultiplier: 0,
    base_speed: 0.2,
    easing_speed: 0.6,
    camTilt: 0,
    camOrientationMode: 0,
    camOrientationSpeed: 1,
    autoRotate: true,
    autoRotateSpeed: 0.2,
    fov: 75,
  },
  fx: {
    passOrder: DEFAULT_PASS_ORDER,
    bloom: {
      enabled: false,
      strength: 1,
      radius: 0.2,
      threshold: 0.1,
    },
    toneMapping: {
      method: 0,
      exposure: 1.5,
    },
    passes: {
      rgbShift: false,
      dot: false,
      technicolor: false,
      luminosity: false,
      afterImage: false,
      sobel: false,
      glitch: false,
      colorify: false,
      halftone: false,
      gammaCorrection: false,
      kaleid: false,
      outputPass: true,
    },
    params: {
      rgbShift: {
        amount: 0.005,
        angle: 0,
      },
      afterImage: {
        damp: 0.96,
      },
      colorify: {
        color: '#ffffff',
      },
      kaleid: {
        sides: 6,
        angle: 0,
      },
    },
  },
  state: {
    size: 0,
    pointerDown: 0,
    currPointerDown: 0,
    currAudio: 0,
    time: 0,
    volume_multiplier: 0,
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRecord(value: unknown) {
  return isRecord(value) ? value : {}
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function readString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function readVector3(value: unknown, fallback: Vector3Value): Vector3Value {
  const record = readRecord(value)

  return {
    x: readNumber(record.x, fallback.x),
    y: readNumber(record.y, fallback.y),
    z: readNumber(record.z, fallback.z),
  }
}

function normalizePassOrder(value: unknown): PresetPassId[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_PASS_ORDER]
  }

  const nextOrder: PresetPassId[] = []

  for (const item of value) {
    if (typeof item !== 'string') {
      continue
    }

    if (!DEFAULT_PASS_ORDER.includes(item as PresetPassId)) {
      continue
    }

    if (nextOrder.includes(item as PresetPassId)) {
      continue
    }

    nextOrder.push(item as PresetPassId)
  }

  for (const passId of DEFAULT_PASS_ORDER) {
    if (!nextOrder.includes(passId)) {
      nextOrder.push(passId)
    }
  }

  return [...nextOrder.filter((passId) => passId !== 'outputPass'), 'outputPass']
}

function normalizeSkyboxPreset(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10) {
    return value
  }

  if (typeof value === 'string') {
    const parsedValue = Number.parseInt(value, 10)

    if (Number.isInteger(parsedValue) && parsedValue >= 1 && parsedValue <= 10) {
      return parsedValue
    }

    const matchedPreset = value.match(/preset(\d+)/i)

    if (matchedPreset) {
      const matchedValue = Number.parseInt(matchedPreset[1], 10)

      if (Number.isInteger(matchedValue) && matchedValue >= 1 && matchedValue <= 10) {
        return matchedValue
      }
    }
  }

  if (isRecord(value) && value.type === 'preset') {
    return normalizeSkyboxPreset(value.presetId)
  }

  return DEFAULT_SCENE_DATA.visualizer.skyboxPreset
}

function normalizeColorValue(value: unknown) {
  if (typeof value === 'string' && /^#?[0-9a-f]{6}$/i.test(value.trim())) {
    return value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`
  }

  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) {
    return `#${value.toString(16).padStart(6, '0')}`
  }

  return DEFAULT_SCENE_DATA.fx.params.colorify.color
}

function createDefaultModel(): SceneEditorModel {
  return {
    visualizer: { ...DEFAULT_SCENE_DATA.visualizer },
    controls: {
      position0: { ...DEFAULT_SCENE_DATA.controls.position0 },
      target0: { ...DEFAULT_SCENE_DATA.controls.target0 },
      zoom0: DEFAULT_SCENE_DATA.controls.zoom0,
    },
    intent: { ...DEFAULT_SCENE_DATA.intent },
    fx: {
      passOrder: [...DEFAULT_SCENE_DATA.fx.passOrder],
      bloom: { ...DEFAULT_SCENE_DATA.fx.bloom },
      toneMapping: { ...DEFAULT_SCENE_DATA.fx.toneMapping },
      passes: { ...DEFAULT_SCENE_DATA.fx.passes },
      params: {
        rgbShift: { ...DEFAULT_SCENE_DATA.fx.params.rgbShift },
        afterImage: { ...DEFAULT_SCENE_DATA.fx.params.afterImage },
        colorify: { ...DEFAULT_SCENE_DATA.fx.params.colorify },
        kaleid: { ...DEFAULT_SCENE_DATA.fx.params.kaleid },
      },
    },
    state: { ...DEFAULT_SCENE_DATA.state },
  }
}

export function createDefaultSceneData(): PresetSceneData {
  const defaults = createDefaultModel()

  return {
    visualizer: defaults.visualizer,
    controls: defaults.controls,
    intent: defaults.intent,
    fx: defaults.fx,
    state: defaults.state,
  }
}

export function getSceneEditorModel(sceneData: PresetSceneData): SceneEditorModel {
  const defaults = createDefaultModel()
  const visualizer = readRecord(sceneData.visualizer)
  const controls = readRecord(sceneData.controls)
  const intent = readRecord(sceneData.intent)
  const fx = readRecord(sceneData.fx)
  const fxParams = readRecord(fx.params)
  const fxPasses = readRecord(fx.passes)
  const state = readRecord(sceneData.state)

  return {
    visualizer: {
      shader: readString(visualizer.shader, defaults.visualizer.shader),
      skyboxPreset: normalizeSkyboxPreset(visualizer.skyboxPreset),
      scale: readNumber(visualizer.scale, defaults.visualizer.scale),
    },
    controls: {
      position0: readVector3(controls.position0, defaults.controls.position0),
      target0: readVector3(controls.target0, defaults.controls.target0),
      zoom0: readNumber(controls.zoom0, defaults.controls.zoom0),
    },
    intent: {
      time_multiplier: readNumber(intent.time_multiplier, defaults.intent.time_multiplier),
      minimizing_factor: readNumber(intent.minimizing_factor, defaults.intent.minimizing_factor),
      power_factor: readNumber(intent.power_factor, defaults.intent.power_factor),
      pointerDownMultiplier: readNumber(
        intent.pointerDownMultiplier,
        defaults.intent.pointerDownMultiplier,
      ),
      base_speed: readNumber(intent.base_speed, defaults.intent.base_speed),
      easing_speed: readNumber(intent.easing_speed, defaults.intent.easing_speed),
      camTilt: readNumber(intent.camTilt, defaults.intent.camTilt),
      camOrientationMode: readNumber(
        intent.camOrientationMode,
        defaults.intent.camOrientationMode,
      ),
      camOrientationSpeed: readNumber(
        intent.camOrientationSpeed,
        defaults.intent.camOrientationSpeed,
      ),
      autoRotate: readBoolean(intent.autoRotate, defaults.intent.autoRotate),
      autoRotateSpeed: readNumber(intent.autoRotateSpeed, defaults.intent.autoRotateSpeed),
      fov: readNumber(intent.fov, defaults.intent.fov),
    },
    fx: {
      passOrder: normalizePassOrder(fx.passOrder),
      bloom: {
        enabled: readBoolean(readRecord(fx.bloom).enabled, defaults.fx.bloom.enabled),
        strength: readNumber(readRecord(fx.bloom).strength, defaults.fx.bloom.strength),
        radius: readNumber(readRecord(fx.bloom).radius, defaults.fx.bloom.radius),
        threshold: readNumber(readRecord(fx.bloom).threshold, defaults.fx.bloom.threshold),
      },
      toneMapping: {
        method: readNumber(readRecord(fx.toneMapping).method, defaults.fx.toneMapping.method),
        exposure: readNumber(
          readRecord(fx.toneMapping).exposure,
          defaults.fx.toneMapping.exposure,
        ),
      },
      passes: {
        rgbShift: readBoolean(fxPasses.rgbShift, defaults.fx.passes.rgbShift),
        dot: readBoolean(fxPasses.dot, defaults.fx.passes.dot),
        technicolor: readBoolean(fxPasses.technicolor, defaults.fx.passes.technicolor),
        luminosity: readBoolean(fxPasses.luminosity, defaults.fx.passes.luminosity),
        afterImage: readBoolean(fxPasses.afterImage, defaults.fx.passes.afterImage),
        sobel: readBoolean(fxPasses.sobel, defaults.fx.passes.sobel),
        glitch: readBoolean(fxPasses.glitch, defaults.fx.passes.glitch),
        colorify: readBoolean(fxPasses.colorify, defaults.fx.passes.colorify),
        halftone: readBoolean(fxPasses.halftone, defaults.fx.passes.halftone),
        gammaCorrection: readBoolean(
          fxPasses.gammaCorrection,
          defaults.fx.passes.gammaCorrection,
        ),
        kaleid: readBoolean(fxPasses.kaleid, defaults.fx.passes.kaleid),
        outputPass: readBoolean(fxPasses.outputPass, defaults.fx.passes.outputPass),
      },
      params: {
        rgbShift: {
          amount: readNumber(readRecord(fxParams.rgbShift).amount, defaults.fx.params.rgbShift.amount),
          angle: readNumber(readRecord(fxParams.rgbShift).angle, defaults.fx.params.rgbShift.angle),
        },
        afterImage: {
          damp: readNumber(readRecord(fxParams.afterImage).damp, defaults.fx.params.afterImage.damp),
        },
        colorify: {
          color: normalizeColorValue(readRecord(fxParams.colorify).color),
        },
        kaleid: {
          sides: readNumber(readRecord(fxParams.kaleid).sides, defaults.fx.params.kaleid.sides),
          angle: readNumber(readRecord(fxParams.kaleid).angle, defaults.fx.params.kaleid.angle),
        },
      },
    },
    state: {
      size: readNumber(state.size, defaults.state.size),
      pointerDown: readNumber(state.pointerDown, defaults.state.pointerDown),
      currPointerDown: readNumber(state.currPointerDown, defaults.state.currPointerDown),
      currAudio: readNumber(state.currAudio, defaults.state.currAudio),
      time: readNumber(state.time, defaults.state.time),
      volume_multiplier: readNumber(state.volume_multiplier, defaults.state.volume_multiplier),
    },
  }
}

export function mergeSceneEditorBranch<K extends keyof SceneEditorModel>(
  sceneData: PresetSceneData,
  branch: K,
  value: SceneEditorModel[K],
): PresetSceneData {
  switch (branch) {
    case 'visualizer': {
      const nextVisualizer = value as SceneEditorModel['visualizer']

      return {
        ...sceneData,
        visualizer: {
          ...readRecord(sceneData.visualizer),
          ...nextVisualizer,
        },
      }
    }

    case 'controls': {
      const nextControls = value as SceneEditorModel['controls']

      return {
        ...sceneData,
        controls: {
          ...readRecord(sceneData.controls),
          ...nextControls,
          target0: {
            ...readRecord(readRecord(sceneData.controls).target0),
            ...nextControls.target0,
          },
          position0: {
            ...readRecord(readRecord(sceneData.controls).position0),
            ...nextControls.position0,
          },
        },
      }
    }

    case 'intent': {
      const nextIntent = value as SceneEditorModel['intent']

      return {
        ...sceneData,
        intent: {
          ...readRecord(sceneData.intent),
          ...nextIntent,
        },
      }
    }

    case 'fx': {
      const nextFx = value as SceneEditorModel['fx']
      const currentFx = readRecord(sceneData.fx)
      const currentParams = readRecord(currentFx.params)

      return {
        ...sceneData,
        fx: {
          ...currentFx,
          ...nextFx,
          bloom: {
            ...readRecord(currentFx.bloom),
            ...nextFx.bloom,
          },
          toneMapping: {
            ...readRecord(currentFx.toneMapping),
            ...nextFx.toneMapping,
          },
          passes: {
            ...readRecord(currentFx.passes),
            ...nextFx.passes,
          },
          params: {
            ...currentParams,
            ...nextFx.params,
            rgbShift: {
              ...readRecord(currentParams.rgbShift),
              ...nextFx.params.rgbShift,
            },
            afterImage: {
              ...readRecord(currentParams.afterImage),
              ...nextFx.params.afterImage,
            },
            colorify: {
              ...readRecord(currentParams.colorify),
              ...nextFx.params.colorify,
            },
            kaleid: {
              ...readRecord(currentParams.kaleid),
              ...nextFx.params.kaleid,
            },
          },
        },
      }
    }

    case 'state': {
      const nextState = value as SceneEditorModel['state']

      return {
        ...sceneData,
        state: {
          ...readRecord(sceneData.state),
          ...nextState,
        },
      }
    }
  }
}

export function sanitizeSceneData(sceneData: PresetSceneData): PresetSceneData {
  const normalizedModel = getSceneEditorModel(sceneData)
  let nextSceneData = { ...sceneData }

  nextSceneData = mergeSceneEditorBranch(nextSceneData, 'visualizer', normalizedModel.visualizer)
  nextSceneData = mergeSceneEditorBranch(nextSceneData, 'controls', normalizedModel.controls)
  nextSceneData = mergeSceneEditorBranch(nextSceneData, 'intent', normalizedModel.intent)
  nextSceneData = mergeSceneEditorBranch(nextSceneData, 'fx', normalizedModel.fx)
  nextSceneData = mergeSceneEditorBranch(nextSceneData, 'state', normalizedModel.state)

  return nextSceneData
}

export function parseSceneDataJson(value: string) {
  const parsedValue = JSON.parse(value) as unknown

  if (!isRecord(parsedValue)) {
    throw new Error('Scene data must be a JSON object.')
  }

  return parsedValue
}

export function prettyPrintSceneData(sceneData: PresetSceneData) {
  return JSON.stringify(sanitizeSceneData(sceneData), null, 2)
}

export function toDegrees(radians: number) {
  return radians * (180 / Math.PI)
}

export function toRadians(degrees: number) {
  return degrees * (Math.PI / 180)
}
