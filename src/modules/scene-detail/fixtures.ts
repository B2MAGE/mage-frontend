import type { CreatorProfile, SceneComment } from './types'

type CreatorProfileBlueprint = Pick<CreatorProfile, 'displayName' | 'handle' | 'subscribersLabel'>

const creatorProfileBlueprints = [
  {
    displayName: 'Mina Park',
    handle: '@mina.afterlight',
    subscribersLabel: '2.18K subscribers',
  },
  {
    displayName: 'Jonah Reed',
    handle: '@jonahreedsignal',
    subscribersLabel: '1.42K subscribers',
  },
  {
    displayName: 'Talia North',
    handle: '@talianorth',
    subscribersLabel: '3.84K subscribers',
  },
  {
    displayName: 'Elio Mercer',
    handle: '@elio.mercer',
    subscribersLabel: '986 subscribers',
  },
] satisfies CreatorProfileBlueprint[]

export function pickCreatorProfileBlueprint(seed: number): CreatorProfileBlueprint {
  return creatorProfileBlueprints[Math.abs(seed) % creatorProfileBlueprints.length]
}

export function buildSceneComments(): SceneComment[] {
  return []
}
