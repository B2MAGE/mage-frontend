import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { MagePlayer } from '../components/MagePlayer'
import { buildApiUrl } from '../lib/api'
import type { MageSceneBlob } from '../lib/magePlayerAdapter'

type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type PresetDetailResponse = {
  id?: number
  presetId?: number
  ownerUserId?: number
  name?: string
  sceneData?: unknown
  thumbnailRef?: string | null
  createdAt?: string
}

type PresetDetail = {
  id: number
  ownerUserId: number | null
  name: string
  sceneData: MageSceneBlob
  thumbnailRef: string | null
  createdAt: string | null
}

type PresetDetailErrorCode =
  | 'auth-required'
  | 'invalid-id'
  | 'invalid-payload'
  | 'not-found'
  | 'unavailable'

type PresetComment = {
  author: string
  handle: string
  posted: string
  text: string
  upvotes: string
  downvotes: string
}

type CreatorProfile = {
  displayName: string
  handle: string
  subscribersLabel: string
  studioNote: string
  primaryActionLabel?: string
}

type PresetEngagement = {
  playsLabel: string
  upvotesLabel: string
  downvotesLabel: string
  savesLabel: string
  publishedLabel: string
  topicLabel: string
}

type PresetDescription = {
  opening: string
  middle: string
  closing: string
  bestFor: string
  builtWith: string
  tags: string[]
}

type RecommendedPresetCard = {
  id: number
  title: string
  creator: string
  stats: string
  duration: string
  accent: string
  badge: string
  note: string
  isActive?: boolean
}

const recommendedPresetBlueprints = [
  {
    id: 4,
    title: 'After Rain / Windowlight',
    creator: 'Mina Park',
    stats: '9.9K plays',
    duration: '04:41',
    accent: '#9fd9ff',
    badge: 'Featured',
    note: 'Soft gradients and patient motion for low-BPM intros.',
  },
  {
    id: 7,
    title: 'Soft Static / Midnight Lobby',
    creator: 'Jonah Reed',
    stats: '14.8K plays',
    duration: '04:56',
    accent: '#ffb26b',
    badge: 'Editor Pick',
    note: 'Warmer bloom and wider highlights for vocal-led mixes.',
  },
  {
    id: 8,
    title: 'Harbor Glass / Dawn Fade',
    creator: 'Talia North',
    stats: '11.5K plays',
    duration: '06:03',
    accent: '#7ef0c0',
    badge: 'Up Next',
    note: 'Designed for long builds, softer drops, and calm pacing.',
  },
  {
    id: 9,
    title: 'Low Tide / Signal Room',
    creator: 'Elio Mercer',
    stats: '16.1K plays',
    duration: '05:44',
    accent: '#7f9bff',
    badge: 'For Later',
    note: 'A darker preset with restrained motion and brighter accents.',
  },
] as const

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
    studioNote: 'Most of my presets start from a music-first pass, then I add texture until the frame feels alive.',
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
    studioNote: 'If a preset looks loud with the volume off, I usually strip it back and start over.',
  },
] as const

class PresetDetailRequestError extends Error {
  code: PresetDetailErrorCode

  constructor(code: PresetDetailErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

function UpvoteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 3.8a1 1 0 0 1 .8.4l5.7 7.2a1 1 0 0 1-.8 1.6h-3.3V19a1.2 1.2 0 0 1-1.2 1.2h-2.4a1.2 1.2 0 0 1-1.2-1.2V13H6.3a1 1 0 0 1-.8-1.6l5.7-7.2a1 1 0 0 1 .8-.4Z"
        fill="currentColor"
      />
    </svg>
  )
}

function DownvoteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M11.2 20.2a1 1 0 0 1-.8-.4l-5.7-7.2a1 1 0 0 1 .8-1.6h3.3V5a1.2 1.2 0 0 1 1.2-1.2h2.4A1.2 1.2 0 0 1 13.6 5v6h3.3a1 1 0 0 1 .8 1.6l-5.7 7.2a1 1 0 0 1-.8.4Z"
        fill="currentColor"
      />
    </svg>
  )
}

function VoteButton({
  className,
  count,
  direction,
}: {
  className: string
  count: string
  direction: 'up' | 'down'
}) {
  const label = direction === 'up' ? 'Upvote' : 'Downvote'
  const Icon = direction === 'up' ? UpvoteIcon : DownvoteIcon

  return (
    <button aria-label={`${label} ${count}`} className={className} type="button">
      <span className="preset-detail-vote-button__icon" aria-hidden="true">
        <Icon />
      </span>
      <span>{count}</span>
    </button>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readPresetId(value: string | undefined) {
  if (!value) {
    return null
  }

  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return null
  }

  return parsedValue
}

function normalizePresetDetail(payload: unknown): PresetDetail | null {
  if (!isRecord(payload)) {
    return null
  }

  const presetId =
    typeof payload.presetId === 'number'
      ? payload.presetId
      : typeof payload.id === 'number'
        ? payload.id
        : null

  if (presetId === null || !isRecord(payload.sceneData)) {
    return null
  }

  return {
    id: presetId,
    ownerUserId: typeof payload.ownerUserId === 'number' ? payload.ownerUserId : null,
    name:
      typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : `Preset ${presetId}`,
    sceneData: payload.sceneData,
    thumbnailRef:
      typeof payload.thumbnailRef === 'string' && payload.thumbnailRef.trim()
        ? payload.thumbnailRef
        : null,
    createdAt:
      typeof payload.createdAt === 'string' && payload.createdAt.trim() ? payload.createdAt : null,
  }
}

function readErrorCode(status: number): PresetDetailErrorCode {
  if (status === 401) {
    return 'auth-required'
  }

  if (status === 404) {
    return 'not-found'
  }

  return 'unavailable'
}

async function fetchPresetDetail(
  authenticatedFetch: AuthenticatedFetch,
  isAuthenticated: boolean,
  presetId: number,
) {
  const response = isAuthenticated
    ? await authenticatedFetch(`/presets/${presetId}`)
    : await fetch(buildApiUrl(`/presets/${presetId}`))

  if (!response.ok) {
    throw new PresetDetailRequestError(
      readErrorCode(response.status),
      `Preset detail request failed with status ${response.status}.`,
    )
  }

  const payload = (await response.json().catch(() => null)) as PresetDetailResponse | null
  const preset = normalizePresetDetail(payload)

  if (!preset) {
    throw new PresetDetailRequestError(
      'invalid-payload',
      'Preset detail response is missing the data required to render the player.',
    )
  }

  return preset
}

function formatCreatedAt(createdAt: string | null) {
  if (!createdAt) {
    return 'Unavailable'
  }

  const parsedDate = new Date(createdAt)

  if (Number.isNaN(parsedDate.getTime())) {
    return createdAt
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsedDate)
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function readInitial(value: string) {
  const trimmedValue = value.trim()

  return trimmedValue ? trimmedValue[0].toUpperCase() : 'M'
}

function buildPresetEngagement(preset: PresetDetail): PresetEngagement {
  const plays = 1559 + preset.id * 120
  const upvotes = 56 + preset.id * 30
  const downvotes = 8 + preset.id * 2
  const saves = 18 + preset.id * 11

  return {
    playsLabel: `${plays.toLocaleString()} plays`,
    upvotesLabel: upvotes.toLocaleString(),
    downvotesLabel: downvotes.toLocaleString(),
    savesLabel: saves.toLocaleString(),
    publishedLabel: `Published ${formatCreatedAt(preset.createdAt)}`,
    topicLabel: 'Audio-reactive preset',
  }
}

function buildSubscriberLabel(seed: number) {
  const subscriberCount = 1720 + seed * 38

  if (subscriberCount >= 1000) {
    return `${(subscriberCount / 1000).toFixed(2)}K subscribers`
  }

  return `${subscriberCount} subscribers`
}

function buildCreatorProfile(
  preset: PresetDetail,
  viewerDisplayName: string | undefined,
  viewerUserId: number | null | undefined,
): CreatorProfile {
  if (viewerUserId !== null && viewerUserId !== undefined && viewerUserId === preset.ownerUserId) {
    const displayName = viewerDisplayName?.trim() || 'Your Studio'

    return {
      displayName,
      handle: `@${slugify(displayName) || 'magecreator'}`,
      subscribersLabel: buildSubscriberLabel(preset.id),
      studioNote:
        'I wanted this preset page to feel like something I would actually share, not just a lab route with a player dropped into it.',
      primaryActionLabel: 'Subscribe',
    }
  }

  const blueprint =
    creatorProfileBlueprints[
      Math.abs((preset.ownerUserId ?? preset.id) % creatorProfileBlueprints.length)
    ]

  return {
    ...blueprint,
    primaryActionLabel: 'Subscribe',
  }
}

function buildPresetDescription(
  preset: PresetDetail,
  creatorProfile: CreatorProfile,
): PresetDescription {
  return {
    opening: `I built ${preset.name} for tracks that need atmosphere without visual clutter. The motion holds back during the intro, then the reflections and bloom open up once the mids start pushing forward.`,
    middle: `${creatorProfile.displayName} tends to tune scenes for patience rather than spectacle, so this one lands best behind slower house, downtempo electronica, mellow garage, and long vocal builds where the frame needs to stay supportive instead of noisy.`,
    closing:
      'This page is still an early public pass, but the preset render above is the real scene payload. I wanted the surrounding notes, comments, and recommendations to read like a creator page someone would actually spend time on while the rest of the social features catch up.',
    bestFor: 'late-night sets, focus mixes, ambient intros',
    builtWith: 'soft bloom, layered fog, reflective passes, restrained drift',
    tags: ['ambient', 'slow-bloom', 'focus-friendly', 'late-night', 'magepreset'],
  }
}

function buildPresetComments(preset: PresetDetail): PresetComment[] {
  return [
    {
      author: 'Nora Vale',
      handle: '@noravale',
      posted: '2 days ago',
      text: `Ran ${preset.name} behind a Rhodes sketch last night and it sat exactly where I wanted it. The slower build is what makes it feel intentional.`,
      upvotes: '14',
      downvotes: '1',
    },
    {
      author: 'Cass Mercer',
      handle: '@cassmercer',
      posted: '5 days ago',
      text: 'The restraint is the best part. Most reactive presets oversell the first beat, but this one gives the track room before the highlights start showing off.',
      upvotes: '9',
      downvotes: '0',
    },
    {
      author: 'Jun Park',
      handle: '@junpark',
      posted: '1 week ago',
      text: 'Would happily use this for an hour-long focus upload. The glassy reflections feel polished without tipping into sci-fi overload.',
      upvotes: '6',
      downvotes: '0',
    },
  ]
}

function buildRecommendedPresets(
  preset: PresetDetail,
  creatorProfile: CreatorProfile,
  engagement: PresetEngagement,
): RecommendedPresetCard[] {
  return [
    {
      id: preset.id,
      title: preset.name,
      creator: creatorProfile.displayName,
      stats: engagement.playsLabel,
      duration: 'Live',
      accent: '#63f0d6',
      badge: 'Now Playing',
      note: 'The preset currently loaded into the player above.',
      isActive: true,
    },
    ...recommendedPresetBlueprints
      .filter((recommendedPreset) => recommendedPreset.id !== preset.id)
      .map((recommendedPreset) => ({ ...recommendedPreset })),
  ]
}

function readErrorCopy(errorCode: PresetDetailErrorCode) {
  if (errorCode === 'invalid-id') {
    return {
      title: 'Invalid preset link',
      description: 'This route is missing a valid preset id. Check the URL and try again.',
    }
  }

  if (errorCode === 'auth-required') {
    return {
      title: 'Sign in to view this preset',
      description:
        'Preset detail requests are still authenticated in this build. Sign in, then reopen this preset route.',
    }
  }

  if (errorCode === 'not-found') {
    return {
      title: 'Preset not found',
      description: 'This preset does not exist or is no longer available.',
    }
  }

  if (errorCode === 'invalid-payload') {
    return {
      title: 'Unable to render this preset',
      description:
        'The backend returned preset detail data, but the scene payload is missing fields required by the player.',
    }
  }

  return {
    title: 'Unable to load this preset',
    description: 'MAGE could not load this preset right now. Please try again in a moment.',
  }
}

function PresetDetailState({
  title,
  description,
  actions,
}: {
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <main className="surface surface--hero">
      <div className="eyebrow">Preset Detail</div>
      <h1>{title}</h1>
      <p className="page-lead">{description}</p>
      {actions ? (
        <>
          <div className="divider" />
          {actions}
        </>
      ) : null}
      <p className="page-footnote">Preset detail routes now resolve through the live player flow.</p>
      <div className="page-mark">MAGE</div>
    </main>
  )
}

export function PresetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  const [preset, setPreset] = useState<PresetDetail | null>(null)
  const [errorCode, setErrorCode] = useState<PresetDetailErrorCode | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const presetId = readPresetId(id)

  useEffect(() => {
    if (presetId === null || isRestoringSession) {
      return
    }

    const nextPresetId = presetId
    let isCurrent = true

    async function loadPreset() {
      setIsLoading(true)
      setErrorCode(null)
      setPreset(null)

      try {
        const nextPreset = await fetchPresetDetail(
          authenticatedFetch,
          isAuthenticated,
          nextPresetId,
        )

        if (!isCurrent) {
          return
        }

        setPreset(nextPreset)
      } catch (error) {
        if (!isCurrent) {
          return
        }

        setErrorCode(error instanceof PresetDetailRequestError ? error.code : 'unavailable')
      } finally {
        if (isCurrent) {
          setIsLoading(false)
        }
      }
    }

    void loadPreset()

    return () => {
      isCurrent = false
    }
  }, [authenticatedFetch, isAuthenticated, isRestoringSession, presetId])

  if (presetId === null) {
    const { description, title } = readErrorCopy('invalid-id')

    return (
      <PresetDetailState
        title={title}
        description={description}
        actions={
          <div className="auth-actions">
            <Link className="demo-link" to="/">
              Back to Home
            </Link>
            {isAuthenticated ? (
              <Link className="secondary-link" to="/my-presets">
                Back to My Presets
              </Link>
            ) : null}
          </div>
        }
      />
    )
  }

  if (isRestoringSession || isLoading) {
    return (
      <PresetDetailState
        title="Loading preset..."
        description={
          isRestoringSession
            ? 'MAGE is restoring your session before loading this preset.'
            : 'MAGE is fetching preset metadata and loading the embedded player.'
        }
      />
    )
  }

  if (errorCode || !preset) {
    const { description, title } = readErrorCopy(errorCode ?? 'unavailable')

    return (
      <PresetDetailState
        title={title}
        description={description}
        actions={
          <div className="auth-actions">
            {errorCode === 'auth-required' ? (
              <Link className="demo-link" to="/login">
                Go to Login
              </Link>
            ) : (
              <Link className="demo-link" to="/">
                Back to Home
              </Link>
            )}
            {isAuthenticated ? (
              <Link className="secondary-link" to="/my-presets">
                Back to My Presets
              </Link>
            ) : errorCode !== 'auth-required' ? (
              <Link className="secondary-link" to="/login">
                Sign In
              </Link>
            ) : null}
          </div>
        }
      />
    )
  }

  const creatorProfile = buildCreatorProfile(preset, user?.displayName, user?.userId)
  const engagement = buildPresetEngagement(preset)
  const presetDescription = buildPresetDescription(preset, creatorProfile)
  const presetComments = buildPresetComments(preset)
  const recommendedPresets = buildRecommendedPresets(preset, creatorProfile, engagement)
  const composerInitial = readInitial(user?.displayName ?? 'Guest')
  const composerPrompt = user?.displayName
    ? `Add a comment as ${user.displayName}...`
    : 'Sign in to join the conversation'

  return (
    <main className="preset-detail-page">
      <section className="mage-watch preset-detail-watch">
        <div className="mage-watch__main">
          <div className="mage-player-shell">
            <div
              className="mage-stage-frame mage-stage-frame--watch preset-detail-stage"
              style={{ '--preset-accent': '#63f0d6' } as CSSProperties}
            >
              <MagePlayer
                ariaLabel={`${preset.name} live render`}
                className="preset-detail-player"
                sceneBlob={preset.sceneData}
              />

              <div className="mage-stage-frame__hud">
                <span className="mage-stage-pill" data-ready="true">
                  Live Render
                </span>
              </div>
            </div>
          </div>

          <div className="preset-detail-header">
            <h1 className="mage-watch__title">{preset.name}</h1>
          </div>

          <section className="preset-detail-social-row">
            <div className="preset-detail-social-row__creator">
              <div className="mage-channel-card">
                <div className="mage-channel-card__avatar" aria-hidden="true">
                  {readInitial(creatorProfile.displayName)}
                </div>
                <div className="mage-channel-card__copy">
                  <strong>{creatorProfile.displayName}</strong>
                  <span>{creatorProfile.subscribersLabel}</span>
                </div>
              </div>

              {creatorProfile.primaryActionLabel ? (
                <button className="preset-detail-follow-button" type="button">
                  {creatorProfile.primaryActionLabel}
                </button>
              ) : null}
            </div>

            <div className="preset-detail-action-row">
              <VoteButton
                className="preset-detail-action-chip"
                count={engagement.upvotesLabel}
                direction="up"
              />
              <VoteButton
                className="preset-detail-action-chip"
                count={engagement.downvotesLabel}
                direction="down"
              />
              <button className="preset-detail-action-chip" type="button">
                Share
              </button>
              <button className="preset-detail-action-chip" type="button">
                Save
              </button>
            </div>
          </section>

          <section className="preset-detail-description-card">
            <div className="preset-detail-description-card__meta">
              <strong>{engagement.playsLabel}</strong>
              <span>{engagement.publishedLabel}</span>
            </div>
            <p>{presetDescription.opening}</p>
            <p>{presetDescription.middle}</p>
            <p>{presetDescription.closing}</p>

            <div className="preset-detail-note-grid">
              <div className="preset-detail-note-grid__item">
                <span>Studio note</span>
                <strong>{creatorProfile.studioNote}</strong>
              </div>
              <div className="preset-detail-note-grid__item">
                <span>Best for</span>
                <strong>{presetDescription.bestFor}</strong>
              </div>
              <div className="preset-detail-note-grid__item">
                <span>Built with</span>
                <strong>{presetDescription.builtWith}</strong>
              </div>
              <div className="preset-detail-note-grid__item">
                <span>Saves</span>
                <strong>{engagement.savesLabel}</strong>
              </div>
            </div>

            <div className="mage-tag-row">
              {presetDescription.tags.map((tag) => (
                <span key={tag} className="mage-tag">
                  #{tag}
                </span>
              ))}
            </div>
          </section>

          <section className="preset-detail-comments-panel">
            <div className="preset-detail-comments-toolbar">
              <div className="mage-comments__header">
                <h2>Comments</h2>
                <span>{presetComments.length}</span>
              </div>
              <button className="preset-detail-sort-chip" type="button">
                Top comments
              </button>
            </div>

            <div className="preset-detail-comment-composer">
              <div className="preset-detail-comment-composer__avatar" aria-hidden="true">
                {composerInitial}
              </div>
              <div className="preset-detail-comment-composer__field">
                <span>{composerPrompt}</span>
              </div>
            </div>

            <div className="mage-comments__list">
              {presetComments.map((comment) => (
                <article key={`${comment.author}-${comment.posted}`} className="mage-comment">
                  <div className="mage-comment__avatar" aria-hidden="true">
                    {readInitial(comment.author)}
                  </div>
                  <div className="mage-comment__body">
                    <div className="preset-detail-comment__header">
                      <strong>{comment.author}</strong>
                      <span>{comment.handle}</span>
                      <span>{comment.posted}</span>
                    </div>
                    <p>{comment.text}</p>
                    <div className="preset-detail-comment__actions">
                      <VoteButton
                        className="preset-detail-comment__action"
                        count={comment.upvotes}
                        direction="up"
                      />
                      <VoteButton
                        className="preset-detail-comment__action"
                        count={comment.downvotes}
                        direction="down"
                      />
                      <button className="preset-detail-comment__action" type="button">
                        Reply
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="mage-watch__rail">
          <div className="mage-watch__rail-header">
            <h2>Recommended Presets</h2>
          </div>

          <div className="mage-watch__rail-list">
            {recommendedPresets.map((recommendedPreset) => (
              <article
                key={recommendedPreset.id}
                className={`mage-preset-card${recommendedPreset.isActive ? ' is-active' : ''}`}
              >
                <div
                  className="mage-preset-card__thumb"
                  style={{ '--preset-accent': recommendedPreset.accent } as CSSProperties}
                >
                  <span className="mage-preset-card__badge">{recommendedPreset.badge}</span>
                </div>
                <div className="mage-preset-card__body">
                  <strong>{recommendedPreset.title}</strong>
                  <span>{recommendedPreset.creator}</span>
                  <span>{recommendedPreset.stats}</span>
                  <span className="mage-preset-card__note">{recommendedPreset.note}</span>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </main>
  )
}
