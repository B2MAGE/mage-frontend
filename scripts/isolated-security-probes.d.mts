export function reportProbeSource(nonce: string, checks: string): string
export function portAttackSource(mode: 'window' | 'spoof' | 'flood', nonce: string): string
export const THROW_PROBE_SOURCE: string
export function boundedStallSource(nonce: string): string
export const STALL_MARKERS: readonly ['queued', 'scheduled', 'start', 'end']
export type StallMarker = typeof STALL_MARKERS[number]
export function readStallMarker(event: { source: unknown; origin: string; data: unknown }, source: unknown, nonce: string): { marker: StallMarker; atMs: number } | null
