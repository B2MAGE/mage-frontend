import { describe, expect, it } from 'vitest'
import { isRendererMessage, rendererMessage, RENDERER_COMMANDS, RENDERER_RESPONSES } from './protocol'

const session = '4b50667d-27d8-4634-93e8-3a795e110123'
describe('isolated renderer bootstrap protocol', () => {
  it('permits only small versioned commands and responses', () => {
    expect(isRendererMessage(rendererMessage('render-sample', session), RENDERER_COMMANDS)).toBe(true)
    expect(isRendererMessage(rendererMessage('ready', session), RENDERER_RESPONSES)).toBe(true)
    expect(isRendererMessage(rendererMessage('ready', session), RENDERER_COMMANDS)).toBe(false)
  })
  it.each([
    null, [], 'ready', {},
    { ...rendererMessage('ready', session), version: 2 },
    { ...rendererMessage('ready', session), session: '' },
    { ...rendererMessage('ready', session), session: 'x'.repeat(1000) },
    { ...rendererMessage('ready', session), source: 'unexpected code' },
    { ...rendererMessage('ready', session), type: 'fetch' },
    { ...rendererMessage('ready', session), html: '<img src=x>' },
  ])('rejects malformed, oversized, or extended payloads', value => {
    expect(isRendererMessage(value, RENDERER_RESPONSES)).toBe(false)
  })
})
