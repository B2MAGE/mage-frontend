import type { CreatorProfile, SceneComment, SceneDetail } from './types'

type CreatorProfileBlueprint = Pick<CreatorProfile, 'displayName' | 'handle' | 'studioNote' | 'subscribersLabel'>

const creatorProfileBlueprints = [
  {
    displayName: 'Mina Park',
    handle: '@mina.afterlight',
    subscribersLabel: '2.18K subscribers',
    studioNote: 'I usually tune motion to stay readable for the first minute before the highlights wake up.',
  },
  {
    displayName: 'Jonah Reed',
    handle: '@jonahreedsignal',
    subscribersLabel: '1.42K subscribers',
    studioNote: 'Most of my scenes start from a music-first pass, then I add texture until the frame feels alive.',
  },
  {
    displayName: 'Talia North',
    handle: '@talianorth',
    subscribersLabel: '3.84K subscribers',
    studioNote: 'I care more about pacing than density, so the quieter parts of a track still have room to breathe.',
  },
  {
    displayName: 'Elio Mercer',
    handle: '@elio.mercer',
    subscribersLabel: '986 subscribers',
    studioNote: 'If a scene looks loud with the volume off, I usually strip it back and start over.',
  },
] satisfies CreatorProfileBlueprint[]

export function pickCreatorProfileBlueprint(seed: number): CreatorProfileBlueprint {
  return creatorProfileBlueprints[Math.abs(seed) % creatorProfileBlueprints.length]
}

export function buildFallbackSceneDescriptionParagraphs(creatorProfile: CreatorProfile) {
  return [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    `${creatorProfile.displayName} lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  ]
}

export function buildSceneComments(scene: SceneDetail): SceneComment[] {
  return [
    {
      author: 'Nora Vale',
      handle: '@noravale',
      posted: '2 days ago',
      text: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. ${scene.name} sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
      upvotes: '14',
      downvotes: '1',
    },
    {
      author: 'Cass Mercer',
      handle: '@cassmercer',
      posted: '5 days ago',
      text:
        'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
      upvotes: '9',
      downvotes: '0',
    },
    {
      author: 'Jun Park',
      handle: '@junpark',
      posted: '1 week ago',
      text:
        'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
      upvotes: '6',
      downvotes: '0',
    },
  ]
}
