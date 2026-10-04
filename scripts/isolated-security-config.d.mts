export const SECURITY_CHECK_PARENT_ORIGIN: 'https://mage.peterbucci.com'
export const SECURITY_CHECK_RENDERER_URL: 'https://d2wwpgc7sgvmnm.cloudfront.net/index.html'
export const SECURITY_CHECK_PATH: '/player-check/security/'
export const SECURITY_CHECK_CANARY_PREFIX: '/player-check/__isolated-security/'
export type SecurityCheckMode = 'local' | 'deployed'
export function fixedSecurityCheckConfig(mode: SecurityCheckMode): Readonly<{ parentOrigin: string; rendererUrl: string; path: string; canaryPrefix: string }>
export function isSecurityCheckLocation(mode: SecurityCheckMode, href: string, development: boolean): boolean
export function securityCanaryUrl(mode: SecurityCheckMode, nonce: string, kind: string, socket?: boolean): string
