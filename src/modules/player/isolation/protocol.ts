/** PP-I01 bootstrap only. No user source, media, URLs, or account data crosses this protocol. */
export const RENDERER_PROTOCOL = 'mage-isolated-renderer'
export const RENDERER_VERSION = 1
export const RENDERER_COMMANDS = ['render-sample', 'dispose'] as const
export const RENDERER_RESPONSES = ['ready', 'rendered', 'error', 'disposed'] as const
export type RendererMessageType = 'connect' | typeof RENDERER_COMMANDS[number] | typeof RENDERER_RESPONSES[number]
export type RendererMessage = {
  protocol: typeof RENDERER_PROTOCOL
  version: typeof RENDERER_VERSION
  type: RendererMessageType
  session: string
}

export function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9-]{32,64}$/i.test(value)
}

export function isRendererMessage(value: unknown, types: readonly string[]): value is RendererMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const message = value as Record<string, unknown>
  return Object.keys(message).length === 4
    && message.protocol === RENDERER_PROTOCOL && message.version === RENDERER_VERSION
    && isSessionId(message.session) && typeof message.type === 'string' && types.includes(message.type)
}

export function rendererMessage(type: RendererMessageType, session: string): RendererMessage {
  return { protocol: RENDERER_PROTOCOL, version: RENDERER_VERSION, type, session }
}
