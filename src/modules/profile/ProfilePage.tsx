import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@auth'
import {
  DiscoverySceneCard,
  SceneCollectionState,
  SceneGridSkeleton,
} from '@modules/discovery'
import { formatCompactCount } from '@shared/lib'
import { Skeleton } from '@shared/ui'
import {
  buildProfileViewModel,
  fetchPublicProfile,
  filterProfileScenes,
  normalizeProfileHandle,
  PublicProfileRequestError,
  type ProfileViewModel,
} from './profileData'
import '../discovery/discovery.css'
import './profile.css'

type ProfileLoadState =
  | { status: 'idle' }
  | { status: 'not-found'; requestKey: string }
  | { status: 'unavailable'; requestKey: string }
  | { status: 'ready'; profile: ProfileViewModel; requestKey: string }

function SearchIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  )
}

function ProfileLoadingState() {
  return (
    <main className="profile-page profile-page--loading" aria-busy="true" aria-label="Loading profile">
      <section className="profile-hero" aria-hidden="true">
        <Skeleton className="profile-avatar profile-avatar--loading" shape="circle" />
        <div className="profile-identity profile-identity--loading">
          <Skeleton className="profile-identity__name-loading" shape="line" />
          <Skeleton className="profile-identity__handle-loading" shape="line" />
          <Skeleton className="profile-identity__description-loading" shape="line" />
          <div className="profile-stats">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton className="profile-stat profile-stat--loading" key={index} shape="line" />
            ))}
          </div>
        </div>
      </section>

      <section className="profile-scenes">
        <div className="profile-scenes__toolbar" aria-hidden="true">
          <Skeleton className="profile-scenes__tab-loading" shape="line" />
          <Skeleton className="profile-scenes__search-loading" shape="block" />
        </div>
        <SceneGridSkeleton count={6} label="Loading profile scenes" />
      </section>
    </main>
  )
}

function ProfilePageState({
  action,
  description,
  title,
}: {
  action: ReactNode
  description: string
  title: string
}) {
  return (
    <main className="profile-page profile-page--state">
      <SceneCollectionState
        action={action}
        description={description}
        kind="error"
        title={title}
      />
    </main>
  )
}

export function ProfilePage() {
  const { profileHandle } = useParams<{ profileHandle: string }>()
  const {
    authenticatedFetch,
    isAuthenticated,
    isRestoringSession,
    user,
  } = useAuth()
  const handle = useMemo(() => normalizeProfileHandle(profileHandle), [profileHandle])
  const [loadState, setLoadState] = useState<ProfileLoadState>({ status: 'idle' })
  const [query, setQuery] = useState('')
  const [reloadVersion, setReloadVersion] = useState(0)
  const requestKey = handle
    ? `${handle}:${isAuthenticated ? 'authenticated' : 'public'}:${reloadVersion}`
    : null

  useEffect(() => {
    if (!handle || !requestKey || isRestoringSession) {
      return
    }

    let cancelled = false

    fetchPublicProfile(authenticatedFetch, isAuthenticated, handle)
      .then((profile) => {
        if (!cancelled) {
          setQuery('')
          setLoadState({
            status: 'ready',
            profile: buildProfileViewModel(profile),
            requestKey,
          })
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }

        setLoadState({
          status:
            error instanceof PublicProfileRequestError && error.code === 'not-found'
              ? 'not-found'
              : 'unavailable',
          requestKey,
        })
      })

    return () => {
      cancelled = true
    }
  }, [authenticatedFetch, handle, isAuthenticated, isRestoringSession, requestKey])

  if (!handle) {
    return (
      <ProfilePageState
        action={<Link className="scene-collection-state__button" to="/scenes">Browse scenes</Link>}
        description="Profile handles begin with @ and use 3–30 letters, numbers, or underscores."
        title="Invalid profile address"
      />
    )
  }

  if (
    isRestoringSession ||
    !requestKey ||
    loadState.status === 'idle' ||
    loadState.requestKey !== requestKey
  ) {
    return <ProfileLoadingState />
  }

  if (loadState.status === 'not-found') {
    return (
      <ProfilePageState
        action={<Link className="scene-collection-state__button" to="/scenes">Browse scenes</Link>}
        description={`We couldn’t find @${handle}. The handle may have changed or the account may no longer exist.`}
        title="Profile not found"
      />
    )
  }

  if (loadState.status === 'unavailable') {
    return (
      <ProfilePageState
        action={(
          <button
            className="scene-collection-state__button"
            onClick={() => setReloadVersion((version) => version + 1)}
            type="button"
          >
            Try again
          </button>
        )}
        description="We couldn’t load this profile. Please try again in a moment."
        title="Profile unavailable"
      />
    )
  }

  const { profile } = loadState
  const isOwner = user?.userId === profile.userId
  const filteredScenes = filterProfileScenes(profile.scenes, query)
  const profileStats = [
    { label: 'scenes', value: profile.stats.scenes },
    { label: 'views', value: profile.stats.views },
    { label: 'upvotes', value: profile.stats.likes },
    { label: 'saves', value: profile.stats.saves },
  ]

  return (
    <main className="profile-page" aria-labelledby="profile-page-title">
      <section className="profile-hero" aria-label="Profile summary">
        <div className="profile-avatar" aria-hidden="true">{profile.initials}</div>

        <div className="profile-identity">
          <h1 id="profile-page-title">{profile.displayName}</h1>
          <p className="profile-identity__handle">@{profile.handle}</p>
          {profile.description ? (
            <p className="profile-identity__description">{profile.description}</p>
          ) : null}

          <div className="profile-stats" aria-label="Profile statistics">
            {profileStats.map((stat) => (
              <span className="profile-stat" key={stat.label}>
                <strong>{formatCompactCount(stat.value)}</strong>{stat.label}
              </span>
            ))}
          </div>
        </div>

        {isOwner ? (
          <div className="profile-actions">
            <Link className="profile-edit-button" to="/settings#profile">Edit profile</Link>
          </div>
        ) : null}
      </section>

      <section className="profile-scenes" aria-labelledby="profile-scenes-title">
        <div className="profile-scenes__toolbar">
          <div className="profile-scenes__tabs">
            <h2 className="profile-scenes__tab" id="profile-scenes-title">Scenes</h2>
          </div>

          <label className="profile-scenes__search">
            <SearchIcon />
            <input
              aria-label="Search scenes"
              disabled={profile.scenes.length === 0}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search scenes"
              type="search"
              value={query}
            />
          </label>
        </div>

        <div className="profile-scenes__content" aria-live="polite">
          {profile.scenes.length === 0 ? (
            <SceneCollectionState
              description={
                isOwner
                  ? 'Create your first audio-reactive scene and it will appear here.'
                  : `${profile.displayName} hasn’t published any scenes yet.`
              }
              title="No scenes yet"
              action={
                isOwner
                  ? <Link className="scene-collection-state__button" to="/create-scene">Create a scene</Link>
                  : <Link className="scene-collection-state__button" to="/scenes">Explore scenes</Link>
              }
            />
          ) : null}
          {profile.scenes.length > 0 && filteredScenes.length === 0 ? (
            <SceneCollectionState
              description={`No scene titles match “${query.trim()}”.`}
              title="No matching scenes"
              action={(
                <button
                  className="scene-collection-state__button"
                  onClick={() => setQuery('')}
                  type="button"
                >
                  Clear search
                </button>
              )}
            />
          ) : null}
          {filteredScenes.length > 0 ? (
            <div className="scene-grid" aria-label={`${profile.displayName} scenes`}>
              {filteredScenes.map((scene) => (
                <DiscoverySceneCard key={scene.sceneId} scene={scene} />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}
