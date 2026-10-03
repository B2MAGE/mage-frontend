import { describe, expect, it, vi } from 'vitest'
import { verifyOpaqueSandbox } from './boundary'

type Probe = 'cookie' | 'localStorage' | 'parentDocument'

function fixture() {
  const denied = () => { throw new DOMException('Blocked by the browser', 'SecurityError') }
  const reads = {
    cookie: vi.fn<() => unknown>(denied),
    localStorage: vi.fn<() => unknown>(denied),
    parentDocument: vi.fn<() => unknown>(denied),
  }
  const childDocument = Object.defineProperty({}, 'cookie', { get: reads.cookie })
  const parent = Object.defineProperty({}, 'document', { get: reads.parentDocument })
  const target = Object.defineProperties({}, {
    document: { value: childDocument },
    localStorage: { get: reads.localStorage },
    parent: { value: parent, configurable: true },
  }) as Window
  return { target, reads }
}

describe('opaque renderer startup boundary', () => {
  it('accepts an embedded frame only when the browser denies all three accesses', () => {
    const f = fixture()
    expect(verifyOpaqueSandbox(f.target)).toBe(true)
    for (const read of Object.values(f.reads)) expect(read).toHaveBeenCalledOnce()
  })

  it.each<Probe>(['cookie', 'localStorage', 'parentDocument'])('rejects a readable %s even when other restrictions hold', probe => {
    const f = fixture()
    f.reads[probe].mockImplementation(() => undefined)
    expect(verifyOpaqueSandbox(f.target)).toBe(false)
  })

  it('does not confuse an empty cookie jar with a denied cookie getter', () => {
    const f = fixture()
    f.reads.cookie.mockImplementation(() => '')
    expect(verifyOpaqueSandbox(f.target)).toBe(false)
  })

  it.each<Probe>(['cookie', 'localStorage', 'parentDocument'])('rejects unrelated exceptions from %s', probe => {
    const f = fixture()
    f.reads[probe].mockImplementation(() => { throw new TypeError('Missing API') })
    expect(verifyOpaqueSandbox(f.target)).toBe(false)
  })

  it('recognizes security exceptions across JavaScript realms without inspecting their contents', () => {
    const f = fixture()
    for (const read of Object.values(f.reads)) {
      read.mockImplementation(() => { throw { name: 'SecurityError' } })
    }
    expect(verifyOpaqueSandbox(f.target)).toBe(true)
  })

  it('rejects direct navigation before inspecting storage or cookies', () => {
    const f = fixture()
    Object.defineProperty(f.target, 'parent', { value: f.target })
    expect(verifyOpaqueSandbox(f.target)).toBe(false)
    for (const read of Object.values(f.reads)) expect(read).not.toHaveBeenCalled()
  })

  it('fails closed if the browsing context cannot be inspected', () => {
    const target = Object.defineProperty({}, 'parent', { get() { throw new Error('Unavailable window') } }) as Window
    expect(verifyOpaqueSandbox(target)).toBe(false)
  })
})
