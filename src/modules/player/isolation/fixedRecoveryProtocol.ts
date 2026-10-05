/** Fixed diagnostics only: this bootstrap cannot contain submitted code or URLs. */
export const FIXED_RECOVERY_PROTOCOL = 'mage-fixed-renderer-recovery'
export const FIXED_RECOVERY_VERSION = 1
export const FIXED_RECOVERY_CASES = ['missing-ready', 'window-message', 'unknown-message', 'message-flood', 'context-loss'] as const
export type FixedRecoveryCase = typeof FIXED_RECOVERY_CASES[number]
export type FixedRecoveryCheck = Readonly<{ case: FixedRecoveryCase; nonce: string }>
export type FixedRecoveryConnection = FixedRecoveryCheck & { protocol: typeof FIXED_RECOVERY_PROTOCOL; version: 1; type: 'connect'; session: string }
export type FixedRecoveryMarker = FixedRecoveryCheck & { protocol: typeof FIXED_RECOVERY_PROTOCOL; version: 1; type: 'marker'; session: string;
  event: 'connected' | 'action' | 'context-lost' | 'unsupported'; atMs: number }
function record(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors)
  return keys.length === fields.length && keys.every(key => typeof key === 'string' && fields.includes(key)
    && 'value' in descriptors[key] && descriptors[key].enumerable)
}
export function isFixedRecoveryCheck(value: unknown): value is FixedRecoveryCheck {
  return record(value, ['case', 'nonce']) && FIXED_RECOVERY_CASES.includes(value.case as FixedRecoveryCase)
    && typeof value.nonce === 'string' && /^[a-f0-9]{32}$/.test(value.nonce)
}
const validSession = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,128}$/.test(value)
export function isFixedRecoveryConnection(value: unknown): value is FixedRecoveryConnection {
  return record(value, ['protocol', 'version', 'type', 'session', 'case', 'nonce'])
    && value.protocol === FIXED_RECOVERY_PROTOCOL && value.version === FIXED_RECOVERY_VERSION && value.type === 'connect'
    && validSession(value.session) && isFixedRecoveryCheck({ case: value.case, nonce: value.nonce })
}
export function fixedRecoveryConnection(session: string, check: FixedRecoveryCheck): FixedRecoveryConnection {
  if (!isFixedRecoveryCheck(check) || !validSession(session)) throw new Error('Invalid fixed recovery check.')
  return { protocol: FIXED_RECOVERY_PROTOCOL, version: 1, type: 'connect', session, ...check }
}
export function isFixedRecoveryMarker(value: unknown): value is FixedRecoveryMarker {
  return record(value, ['protocol', 'version', 'type', 'session', 'case', 'nonce', 'event', 'atMs'])
    && value.protocol === FIXED_RECOVERY_PROTOCOL && value.version === 1 && value.type === 'marker' && validSession(value.session)
    && isFixedRecoveryCheck({ case: value.case, nonce: value.nonce })
    && ['connected', 'action', 'context-lost', 'unsupported'].includes(value.event as string)
    && typeof value.atMs === 'number' && Number.isFinite(value.atMs) && value.atMs >= 0 && value.atMs <= 120000
}
export const fixedRecoveryScene = () => ({ visualizer: { shader: 'setMaxIterations(48); color(0.35,0.2,0.8); sphere(0.5);', scale: 1 },
  controls: { position0: { x: 0, y: 0, z: 4 }, target0: { x: 0, y: 0, z: 0 }, zoom0: 1 },
  intent: { autoRotate: false }, fx: { bloom: { enabled: false }, passes: { outputPass: true } } })
