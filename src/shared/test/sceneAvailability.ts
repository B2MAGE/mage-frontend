/** Explicit permission fixture for tests of unrelated player features.
 * Availability boundary tests use denied/real stores instead.
 */
const available = Object.freeze({ allowed: true, code: 'AVAILABLE', message: '', checkedAt: 1 })
export const allowedSceneAvailability = {
  getSnapshot: () => available,
  isAllowed: () => true,
  check: async () => available,
  subscribe: () => () => {},
}
