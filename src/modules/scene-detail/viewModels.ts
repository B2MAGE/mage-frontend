import { formatCalendarDate } from '@shared/lib'
import { pickCreatorProfileBlueprint } from './fixtures'
import type { CreatorProfile, SceneDescription, SceneDetail, SceneEngagement } from './types'

function buildSubscriberLabel(seed: number) {
  const subscriberCount = 1720 + seed * 38

  if (subscriberCount >= 1000) {
    return `${(subscriberCount / 1000).toFixed(2)}K subscribers`
  }

  return `${subscriberCount} subscribers`
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function buildDescriptionParagraphs(description: string | null) {
  const normalizedDescription = description?.replace(/\r\n/g, '\n').trim()

  if (!normalizedDescription) {
    return []
  }

  return normalizedDescription
    .split(/\n[ \t]*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

export function buildSceneEngagement(scene: SceneDetail): SceneEngagement {
  const views = 1559 + scene.id * 120
  const upvotes = 56 + scene.id * 30
  const downvotes = 8 + scene.id * 2
  const saves = 18 + scene.id * 11

  return {
    viewsLabel: `${views.toLocaleString()} views`,
    upvotesLabel: upvotes.toLocaleString(),
    downvotesLabel: downvotes.toLocaleString(),
    savesLabel: saves.toLocaleString(),
    publishedLabel: `Published ${formatCalendarDate(scene.createdAt, 'Unavailable')}`,
    topicLabel: 'Audio-reactive scene',
  }
}

export function buildSceneDescription(scene: SceneDetail): SceneDescription {
  return {
    paragraphs: buildDescriptionParagraphs(scene.description),
    tags: scene.tags,
  }
}

export function buildCreatorProfile(
  scene: SceneDetail,
  viewerDisplayName: string | undefined,
  viewerUserId: number | null | undefined,
): CreatorProfile {
  const resolvedDisplayName = scene.creatorDisplayName?.trim() || viewerDisplayName?.trim() || 'Your Studio'

  if (viewerUserId !== null && viewerUserId !== undefined && viewerUserId === scene.ownerUserId) {
    return {
      displayName: resolvedDisplayName,
      handle: `@${slugify(resolvedDisplayName) || 'magecreator'}`,
      subscribersLabel: buildSubscriberLabel(scene.id),
      primaryActionLabel: 'Subscribe',
    }
  }

  const blueprint = pickCreatorProfileBlueprint(scene.ownerUserId ?? scene.id)

  return {
    ...blueprint,
    displayName: resolvedDisplayName,
    handle: `@${slugify(resolvedDisplayName) || slugify(blueprint.displayName) || 'magecreator'}`,
    primaryActionLabel: 'Subscribe',
  }
}
