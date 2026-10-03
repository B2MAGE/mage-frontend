/** Check the actual loaded frame; an absent frame or unrelated exception is not a pass. */
export function hasVerifiedParentBoundary(frame: HTMLIFrameElement | null): boolean {
  if (!frame?.isConnected || frame.getAttribute('sandbox')?.trim() !== 'allow-scripts') return false
  const child = frame.contentWindow
  if (!child) return false
  try {
    void child.document
    return false
  } catch (error) {
    return error instanceof DOMException && error.name === 'SecurityError'
  }
}
