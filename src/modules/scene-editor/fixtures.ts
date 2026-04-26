import {
  createDefaultSceneData,
  getSceneEditorModel,
  sanitizeSceneData,
  type PersistedPassFlag,
  type ScenePassId,
} from './sceneEditor'
import type { AdditionalPassConfig, EditorSectionConfig, EffectCategoryId } from './types'

export const EDITOR_SECTIONS: EditorSectionConfig[] = [
  { id: 'details', title: 'Details' },
  { id: 'scene', title: 'Scene' },
  { id: 'camera', title: 'Camera' },
  { id: 'motion', title: 'Motion' },
  { id: 'effects', title: 'Effects' },
  { id: 'pass-order', title: 'Pass Order' },
  { id: 'confirm', title: 'Confirm' },
]

export const PLAYLIST_OPTIONS = [
  { label: 'Featured Collection', value: 'featured-collection' },
  { label: 'Ambient Atlas', value: 'ambient-atlas' },
  { label: 'Night Drive', value: 'night-drive' },
  { label: 'Discovery Lab', value: 'discovery-lab' },
]

export const initialSceneData = sanitizeSceneData(createDefaultSceneData())
export const initialSceneModel = getSceneEditorModel(initialSceneData)

const additionalPasses: AdditionalPassConfig[] = [
  {
    category: 'trail',
    flag: 'glitch',
    passId: 'glitchPass',
    description: 'Inject sharp digital breakups and instability.',
  },
  {
    category: 'pattern',
    flag: 'dot',
    passId: 'dotShader',
    description: 'Halftone-style dots for a print-like screen texture.',
  },
  {
    category: 'color',
    flag: 'technicolor',
    passId: 'technicolorShader',
    description: 'Shift the image toward a high-contrast retro palette.',
  },
  {
    category: 'color',
    flag: 'luminosity',
    passId: 'luminosityShader',
    description: 'Flatten the palette toward a luminance-driven look.',
  },
  {
    category: 'pattern',
    flag: 'sobel',
    passId: 'sobelShader',
    description: 'Emphasize outlines and edge contrast.',
  },
  {
    category: 'pattern',
    flag: 'halftone',
    passId: 'halftonePass',
    description: 'Break the image into clustered print cells.',
  },
  {
    category: 'finish',
    flag: 'gammaCorrection',
    passId: 'gammaCorrectionShader',
    description: 'Apply a gamma correction pass at the end of the stack.',
  },
]

export const additionalPassesByCategory: Record<EffectCategoryId, AdditionalPassConfig[]> = {
  color: additionalPasses.filter((passConfig) => passConfig.category === 'color'),
  finish: additionalPasses.filter((passConfig) => passConfig.category === 'finish'),
  pattern: additionalPasses.filter((passConfig) => passConfig.category === 'pattern'),
  trail: additionalPasses.filter((passConfig) => passConfig.category === 'trail'),
}

export const passFlagsById: Partial<Record<ScenePassId, PersistedPassFlag>> = {
  RGBShift: 'rgbShift',
  afterImagePass: 'afterImage',
  colorifyShader: 'colorify',
  dotShader: 'dot',
  gammaCorrectionShader: 'gammaCorrection',
  glitchPass: 'glitch',
  halftonePass: 'halftone',
  kaleidoShader: 'kaleid',
  luminosityShader: 'luminosity',
  outputPass: 'outputPass',
  sobelShader: 'sobel',
  technicolorShader: 'technicolor',
}

export const ALLOWED_THUMBNAIL_CONTENT_TYPES = new Set(['image/png'])

export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024
export const MAX_TAG_NAME_LENGTH = 64
export const TAG_SKELETON_COUNT = 5
