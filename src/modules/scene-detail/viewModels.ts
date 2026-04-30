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
  return {
    viewsLabel: `${scene.engagement.views.toLocaleString()} ${
      scene.engagement.views === 1 ? 'view' : 'views'
    }`,
    upvotesLabel: scene.engagement.upvotes.toLocaleString(),
    downvotesLabel: scene.engagement.downvotes.toLocaleString(),
    savesLabel: scene.engagement.saves.toLocaleString(),
    currentUserVote: scene.engagement.currentUserVote,
    currentUserSaved: scene.engagement.currentUserSaved,
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
