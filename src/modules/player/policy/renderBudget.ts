import policy from '../../../../contracts/scenes/scene-limits.v1.json'

export type RenderProfile = 'full' | 'preview'
export type RenderBudget = Readonly<{
  maxRenderPixels: number
  maxLongestEdge: number
  maxDevicePixelRatio: number
  maxFramesPerSecond: number
  maxRaymarchIterations: number
}>

/** Host-owned ceilings, never derived from a submitted document. */
export function getRenderBudget(profile: RenderProfile = 'full'): RenderBudget {
  const limits = policy.runtimeCeilings
  return Object.freeze({
    maxRenderPixels: profile === 'preview' ? limits.previewPixels : limits.renderPixels,
    maxLongestEdge: profile === 'preview' ? limits.previewLongestEdge : limits.longestEdge,
    maxDevicePixelRatio: limits.devicePixelRatio,
    maxFramesPerSecond: profile === 'preview' ? limits.previewFramesPerSecond : limits.framesPerSecond,
    maxRaymarchIterations: limits.raymarchIterations,
  })
}

/** Captures share the smaller preview budget, preserving aspect without upscaling. */
export function boundCaptureSize(width: number, height: number) {
  const budget = getRenderBudget('preview')
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1
  const scale = Math.min(1, budget.maxLongestEdge / Math.max(safeWidth, safeHeight),
    Math.sqrt(budget.maxRenderPixels / safeWidth / safeHeight))
  return { width: Math.max(1, Math.floor(safeWidth * scale)), height: Math.max(1, Math.floor(safeHeight * scale)) }
}
