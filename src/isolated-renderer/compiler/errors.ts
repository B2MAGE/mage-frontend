export type ShaderCompilationFailure = 'failed' | 'invalid-output' | 'timeout' | 'startup' | 'interrupted' | 'unavailable'

/** Fixed host-owned messages only; never expose source or errors supplied by a worker. */
export class ShaderCompilationError extends Error {
  readonly code: ShaderCompilationFailure
  constructor(code: ShaderCompilationFailure = 'failed') {
    super(code === 'interrupted' ? 'Shader compilation was interrupted while the page was hidden.'
      : code === 'startup' ? 'The shader compiler did not start. Try again when the browser is active.'
      : code === 'timeout'
      ? 'Shader compilation took too long. Simplify the shader or choose a template.'
      : code === 'unavailable'
        ? 'Shader compilation is unavailable in this browser. Try an updated browser.'
        : code === 'invalid-output'
          ? 'Shader compilation failed because its output is unsupported. Simplify the shader or choose a template.'
          : 'Shader compilation failed. Check the shader or choose a template.')
    this.name = 'ShaderCompilationError'
    this.code = code
  }
}
