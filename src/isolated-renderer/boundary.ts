function throwsSecurityError(read: () => unknown): boolean {
  try {
    read()
    return false
  } catch (error) {
    // Exceptions from another realm need not pass instanceof DOMException.
    return typeof error === 'object' && error !== null && 'name' in error && error.name === 'SecurityError'
  }
}

/**
 * Fail closed if the browser does not enforce the expected opaque frame boundary.
 * This startup check is defense in depth: the HTTP CSP and iframe sandbox supply
 * the protection. It is not an authority for later untrusted renderer messages.
 * Values and exception details are never retained or sent to the host.
 */
export function verifyOpaqueSandbox(targetWindow: Window = window): boolean {
  try {
    const parent = targetWindow.parent
    if (parent === targetWindow) return false
    return throwsSecurityError(() => targetWindow.document.cookie)
      && throwsSecurityError(() => targetWindow.localStorage)
      && throwsSecurityError(() => parent.document)
  } catch {
    return false
  }
}
