// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { renderSecurityCheckDocument } from '../deployment/isolated-renderer/security-check-page.mjs'
import { mountIsolatedSecurityCheck } from './isolated-security-ui'

let dom: JSDOM | undefined
afterEach(() => { dom?.window.close(); vi.unstubAllGlobals() })

describe('fixed deployed security page initialization', () => {
  function open(url: string) {
    dom = new JSDOM(renderSecurityCheckDocument({ scriptPath: 'assets/security-test.js', scriptIntegrity: `sha384-${'a'.repeat(64)}`,
      stylePath: 'assets/security-test.css', styleIntegrity: `sha384-${'b'.repeat(64)}` }), { url })
    vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('location', dom.window.location); vi.stubGlobal('navigator', dom.window.navigator)
    mountIsolatedSecurityCheck('deployed')
    return dom.window.document
  }
  it('enables fixed groups only after matching the deployed page without starting a player', () => {
    const page = open('https://mage.peterbucci.com/player-check/security/')
    for (const id of ['boundary', 'failures', 'stall']) expect((page.getElementById(id) as HTMLButtonElement).disabled).toBe(false)
    expect(page.querySelector('iframe')).toBeNull()
    expect((page.getElementById('download') as HTMLButtonElement).disabled).toBe(true)
    expect(page.getElementById('status')?.textContent).toContain('Ready.')
  })
  it('leaves all groups disabled on another site or an address with configuration-like query input', () => {
    for (const url of ['https://other.example/player-check/security/', 'https://mage.peterbucci.com/player-check/security/?renderer=other']) {
      const page = open(url)
      for (const id of ['boundary', 'failures', 'stall']) expect((page.getElementById(id) as HTMLButtonElement).disabled).toBe(true)
      expect(page.querySelector('iframe')).toBeNull()
      dom?.window.close()
    }
  })
})
