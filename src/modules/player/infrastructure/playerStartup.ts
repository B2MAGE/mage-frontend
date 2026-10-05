export function playerStartupCancelled() {
  return new DOMException('Player creation cancelled.', 'AbortError')
}

/** Stop awaiting shared permission/import work without cancelling other players. */
export function waitForPlayerStartup<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(playerStartupCancelled())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void operation.then(value => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) reject(playerStartupCancelled())
      else resolve(value)
    }, error => {
      signal.removeEventListener('abort', onAbort)
      reject(signal.aborted ? playerStartupCancelled() : error)
    })
    if (signal.aborted) onAbort()
  })
}
