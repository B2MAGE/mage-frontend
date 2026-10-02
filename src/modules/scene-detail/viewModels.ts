import { formatCalendarDate } from '@shared/lib'
import type { CreatorProfile, SceneDescription, SceneDetail, SceneEngagement } from './types'

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
  viewerHandle: string | undefined,
  viewerUserId: number | null | undefined,
  viewerAvatarGradientStart?: string | null,
  viewerAvatarGradientEnd?: string | null,
): CreatorProfile {
  const viewerOwnsScene = viewerUserId !== null && viewerUserId !== undefined && viewerUserId === scene.ownerUserId
  const resolvedDisplayName =
    scene.creatorDisplayName?.trim() || (viewerOwnsScene ? viewerDisplayName?.trim() : null) || 'Unknown creator'

  return {
    displayName: resolvedDisplayName,
    handle: scene.creatorHandle?.trim() || (viewerOwnsScene ? viewerHandle?.trim() : null) || null,
    avatarGradientStart: scene.creatorAvatarGradientStart ?? (viewerOwnsScene ? viewerAvatarGradientStart : undefined),
    avatarGradientEnd: scene.creatorAvatarGradientEnd ?? (viewerOwnsScene ? viewerAvatarGradientEnd : undefined),
  }
}
