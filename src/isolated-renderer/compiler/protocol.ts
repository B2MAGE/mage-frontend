/** The compiler receives source and one host-owned ceiling; never account or audio data. */
export const COMPILER_PROTOCOL = 'mage-compiler'
export const COMPILER_VERSION = 1
export const COMPILER_LIMITS = Object.freeze({ sourceBytes: 65_536, deadlineMs: 2_000, maxIterations: 200 })

export type CompileRequest = {
  protocol: typeof COMPILER_PROTOCOL
  version: typeof COMPILER_VERSION
  jobId: string
  type: 'compile'
  source: string
  maxRaymarchIterations: number
}

export function dataRecord(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  const keys = Reflect.ownKeys(value)
  return keys.length === fields.length && keys.every(key => typeof key === 'string' && fields.includes(key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value'))
}

export function validSource(source: unknown): source is string {
  return typeof source === 'string' && source.length > 0 && source.length <= COMPILER_LIMITS.sourceBytes
    && new TextEncoder().encode(source).byteLength <= COMPILER_LIMITS.sourceBytes
}

export function validCeiling(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= COMPILER_LIMITS.maxIterations
}

export function isCompileRequest(value: unknown): value is CompileRequest {
  return dataRecord(value, ['protocol', 'version', 'jobId', 'type', 'source', 'maxRaymarchIterations'])
    && value.protocol === COMPILER_PROTOCOL && value.version === COMPILER_VERSION && value.type === 'compile'
    && typeof value.jobId === 'string' && /^[a-f0-9]{32}$/.test(value.jobId)
    && validSource(value.source) && validCeiling(value.maxRaymarchIterations)
}
