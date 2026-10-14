export function fixedSecurityCheckConfig(): Readonly<{ parentOrigin: string; rendererUrl: string; path: string; canaryPrefix: string }>
export function isSecurityCheckLocation(href: string, development: boolean): boolean
export function securityCanaryUrl(nonce: string, kind: string, socket?: boolean): string
