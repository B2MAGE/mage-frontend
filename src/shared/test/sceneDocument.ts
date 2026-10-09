/** Declare authored custom scene data using the current public transport contract. */
export function customDocument<T extends Record<string, unknown>>(scene: T) {
  return { schemaVersion: 1 as const, kind: 'custom' as const, scene }
}
