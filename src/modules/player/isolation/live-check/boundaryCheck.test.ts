import { afterEach, describe, expect, it } from 'vitest'
import { hasVerifiedParentBoundary } from './boundaryCheck'

afterEach(() => document.body.replaceChildren())

function frameWithAccess(readDocument: () => Document) {
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-scripts')
  document.body.append(frame)
  Object.defineProperty(frame, 'contentWindow', { value: { get document() { return readDocument() } }, configurable: true })
  return frame
}

describe('live check parent boundary evidence', () => {
  it('passes only when a connected scripts-only frame blocks document access with SecurityError', () => {
    const frame = frameWithAccess(() => { throw new DOMException('Blocked', 'SecurityError') })
    expect(hasVerifiedParentBoundary(frame)).toBe(true)
  })

  it('does not count absent, detached, or uninitialized frames as isolated', () => {
    expect(hasVerifiedParentBoundary(null)).toBe(false)
    const frame = frameWithAccess(() => { throw new DOMException('Blocked', 'SecurityError') })
    frame.remove()
    expect(hasVerifiedParentBoundary(frame)).toBe(false)
    document.body.append(frame)
    Object.defineProperty(frame, 'contentWindow', { value: null })
    expect(hasVerifiedParentBoundary(frame)).toBe(false)
  })

  it('fails when document access succeeds or throws an unrelated error', () => {
    expect(hasVerifiedParentBoundary(frameWithAccess(() => document))).toBe(false)
    expect(hasVerifiedParentBoundary(frameWithAccess(() => { throw new Error('Unrelated failure') }))).toBe(false)
  })

  it('rejects extra sandbox permissions even if the cross-origin document is inaccessible', () => {
    const frame = frameWithAccess(() => { throw new DOMException('Blocked', 'SecurityError') })
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin')
    expect(hasVerifiedParentBoundary(frame)).toBe(false)
    frame.removeAttribute('sandbox')
    expect(hasVerifiedParentBoundary(frame)).toBe(false)
  })
})
