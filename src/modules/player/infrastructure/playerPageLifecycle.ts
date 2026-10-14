let suspended = false
let generation = 0

// Route cleanup is not guaranteed during navigation. The generation also
// rejects asynchronous startup interrupted by a complete BFCache round trip.
function onPageHide() { suspended = true; generation += 1 }
function onPageShow() { suspended = false }

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', onPageHide, { capture: true })
  window.addEventListener('pageshow', onPageShow, { capture: true })
  import.meta.hot?.dispose(() => {
    onPageHide()
    window.removeEventListener('pagehide', onPageHide, { capture: true })
    window.removeEventListener('pageshow', onPageShow, { capture: true })
  })
}

export const playerPageLifecycle = {
  get suspended() { return suspended },
  get generation() { return generation },
}
