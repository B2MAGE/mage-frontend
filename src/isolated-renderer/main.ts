import { installRendererRuntime } from './runtime'
import { loadKnownSample } from './sample'
import { verifyOpaqueSandbox } from './boundary'

declare const __MAGE_RENDERER_PARENT_ORIGINS__: readonly string[]

const canvas = document.getElementById('renderer-canvas')
const statusElement = document.getElementById('renderer-status')
if (!(canvas instanceof HTMLCanvasElement) || !statusElement) throw new Error('Renderer document is incomplete.')

if (verifyOpaqueSandbox(window)) {
  installRendererRuntime({ canvas, statusElement, allowedParentOrigins: __MAGE_RENDERER_PARENT_ORIGINS__, loadSample: loadKnownSample })
} else {
  statusElement.textContent = window.parent === window ? 'Open this player from MAGE.' : 'The separate player is unavailable.'
}
