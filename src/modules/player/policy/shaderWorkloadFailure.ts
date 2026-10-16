/** Fixed diagnostics shared by the worker receiver, renderer bridge and player. */
export const SHADER_WORKLOAD_MESSAGES = Object.freeze({
  'shader-workload-tokens': 'This scene exceeds the shader instruction limit. Reduce repeated shapes or simplify its animation and effects.',
  'shader-workload-nesting': 'This scene exceeds the shader nesting limit. Simplify nested groups, combined inputs, or shader expressions.',
  'shader-workload-functions': 'This scene exceeds the shader function limit. Reduce repeated shapes or simplify the shader.',
  'shader-workload-call-depth': 'This scene exceeds the shader call-depth limit. Simplify nested shader operations.',
  'shader-workload-expanded-cost': 'This scene exceeds the expanded calculation limit. Reduce repeated shapes, noise, or complex shader operations.',
  'shader-workload-fragment-cost': 'This scene exceeds the rendering-work limit. Reduce rendering detail, reflections, repeated shapes, or noise.',
  'shader-workload-unsupported': 'This scene uses shader instructions whose workload cannot be checked. Simplify the shader or choose a supported template.',
  'shader-workload-cycles': 'This scene contains shader functions that call back into each other. Remove the circular calls before playback.',
})
export type ShaderWorkloadFailure = keyof typeof SHADER_WORKLOAD_MESSAGES
export const SHADER_WORKLOAD_FAILURES = Object.keys(SHADER_WORKLOAD_MESSAGES) as ShaderWorkloadFailure[]

export function isShaderWorkloadFailure(value: unknown): value is ShaderWorkloadFailure {
  return typeof value === 'string' && Object.hasOwn(SHADER_WORKLOAD_MESSAGES, value)
}

/** Class identity does not survive workers. Never relay arbitrary error text or budgets. */
export function shaderWorkloadFailure(error: unknown): ShaderWorkloadFailure | null {
  if (!error || typeof error !== 'object') return null
  const code = Object.getOwnPropertyDescriptor(error, 'code')?.value
  if (code !== 'shader-workload-limit' && code !== 'shader-workload-unsupported') return null
  const limit = Object.getOwnPropertyDescriptor(error, 'limit')?.value
  if (typeof limit !== 'string') return null
  const failure = `shader-workload-${limit}`
  return isShaderWorkloadFailure(failure) ? failure : null
}
