export type ShaderCompilationFailure = 'failed' | 'invalid-output' | 'timeout' | 'unavailable'

/** Fixed host-owned messages only; never expose source or errors supplied by a worker. */
export class ShaderCompilationError extends Error {
  readonly code: ShaderCompilationFailure
  constructor(code: ShaderCompilationFailure = 'failed') {
    super(code === 'timeout'
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
