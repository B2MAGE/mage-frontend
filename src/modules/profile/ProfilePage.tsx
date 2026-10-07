import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@auth'
import {
  DiscoverySceneCard,
  DiscoverySortSelect,
  SceneCollectionState,
  SceneGridSkeleton,
  type DiscoverySort,
} from '@modules/discovery'
import { formatCompactCount } from '@shared/lib'
import { AppIcon, PageFrame, PagePanel, Skeleton, UserAvatar } from '@shared/ui'
import {
  buildProfileViewModel,
  fetchPublicProfile,
  normalizeProfileHandle,
  PublicProfileRequestError,
  type ProfileViewModel,
} from './profileData'
import {
  buildProfileScenePage,
  DEFAULT_PROFILE_PAGE_SIZE,
  PROFILE_SCENE_SORT_OPTIONS,
} from './profileSceneList'
import { ProfileScenesPagination } from './ui/ProfileScenesPagination'
import '../discovery/discovery.css'
import './profile.css'

type ProfileLoadState =
  | { status: 'idle' }
  | { status: 'not-found'; requestKey: string }
  | { status: 'unavailable'; requestKey: string }
  | { status: 'ready'; profile: ProfileViewModel; requestKey: string }

function ProfileLoadingState() {
  return (
    <PageFrame className="profile-page profile-page--loading" aria-busy="true" aria-label="Loading profile">
      <PagePanel className="profile-hero" aria-hidden="true">
        <div className="profile-identity-row">
          <Skeleton className="profile-avatar profile-avatar--loading" shape="circle" />
          <div className="profile-identity profile-identity--loading">
            <Skeleton className="profile-identity__name-loading" shape="line" />
            <Skeleton className="profile-identity__handle-loading" shape="line" />
          </div>
        </div>
        <div className="profile-hero__details">
          <Skeleton className="profile-identity__description-loading" shape="line" />
          <div className="profile-stats">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton className="profile-stat profile-stat--loading" key={index} shape="line" />
            ))}
          </div>
        </div>
      </PagePanel>

      <section className="profile-scenes">
        <div className="profile-scenes__toolbar" aria-hidden="true">
          <Skeleton className="profile-scenes__tab-loading" shape="line" />
          <div className="profile-scenes__filters">
            <Skeleton className="profile-scenes__search-loading" shape="block" />
            <Skeleton className="profile-scenes__sort-loading" shape="block" />
          </div>
        </div>
        <SceneGridSkeleton count={6} label="Loading profile scenes" />
      </section>
    </PageFrame>
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
    <PageFrame className="profile-page profile-page--state">
      <SceneCollectionState
        action={action}
        description={description}
        kind="error"
        title={title}
      />
    </PageFrame>
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
  const [sort, setSort] = useState<DiscoverySort>('descending')
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PROFILE_PAGE_SIZE)
  const toolbarRef = useRef<HTMLDivElement>(null)
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
          setSort('descending')
          setPageIndex(0)
          setPageSize(DEFAULT_PROFILE_PAGE_SIZE)
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
  const scenePage = buildProfileScenePage({ scenes: profile.scenes, query, sort, pageIndex, pageSize })
  const changePage = (nextPageIndex: number) => {
    setPageIndex(nextPageIndex)
    requestAnimationFrame(() => {
      const toolbar = toolbarRef.current
      if (!toolbar) return
      const bounds = toolbar.getBoundingClientRect()
      if (bounds.top < 80 || bounds.bottom > window.innerHeight) {
        toolbar.scrollIntoView?.({
          block: 'start',
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        })
      }
    })
  }
  const profileStats = [
    { label: 'scenes', value: profile.stats.scenes },
    { label: 'views', value: profile.stats.views },
    { label: 'upvotes', value: profile.stats.likes },
    { label: 'saves', value: profile.stats.saves },
  ]

  return (
    <PageFrame className="profile-page" aria-labelledby="profile-page-title">
      <PagePanel className="profile-hero" aria-label="Profile summary">
        <div className="profile-identity-row">
          <UserAvatar className="profile-avatar" initials={profile.initials} gradientStart={profile.avatarGradientStart} gradientEnd={profile.avatarGradientEnd} />

          <div className="profile-identity">
            <h1 className="ui-page-title" id="profile-page-title">{profile.displayName}</h1>
            <p className="profile-identity__handle">@{profile.handle}</p>
          </div>
        </div>

        <div className="profile-hero__details">
          {profile.description ? (
            <p className="profile-identity__description">{profile.description}</p>
          ) : null}

          <div className="profile-hero__footer">
            <div className="profile-stats" aria-label="Profile statistics">
              {profileStats.map((stat) => (
                <span className="profile-stat" key={stat.label}>
                  <strong>{formatCompactCount(stat.value)}</strong>{stat.label}
                </span>
              ))}
            </div>

            {isOwner ? (
              <div className="profile-actions">
                <Link className="profile-edit-button ui-button ui-button--primary" to="/settings#profile">Edit profile</Link>
              </div>
            ) : null}
          </div>
        </div>
      </PagePanel>

      <section className="profile-scenes" aria-labelledby="profile-scenes-title">
        <div className="profile-scenes__toolbar" ref={toolbarRef}>
          <div className="profile-scenes__tabs">
            <h2 className="profile-scenes__tab" id="profile-scenes-title">Scenes</h2>
          </div>

          <div className="profile-scenes__filters">
            <label className="profile-scenes__search">
              <AppIcon name="search" size={16} />
              <input
                aria-label="Search scenes"
                disabled={profile.scenes.length === 0}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPageIndex(0)
                }}
                placeholder="Search scenes"
                type="search"
                value={query}
              />
            </label>
            <DiscoverySortSelect
              disabled={profile.scenes.length === 0}
              onChange={(nextSort) => {
                setSort(nextSort)
                setPageIndex(0)
              }}
              options={PROFILE_SCENE_SORT_OPTIONS}
              value={sort}
            />
          </div>
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
          {profile.scenes.length > 0 && scenePage.totalScenes === 0 ? (
            <SceneCollectionState
              description={`No scene titles match “${query.trim()}”.`}
              title="No matching scenes"
              action={(
                <button
                  className="scene-collection-state__button"
                  onClick={() => {
                    setQuery('')
                    setPageIndex(0)
                  }}
                  type="button"
                >
                  Clear search
                </button>
              )}
            />
          ) : null}
          {scenePage.scenes.length > 0 ? (
            <div className="scene-grid" aria-label={`${profile.displayName} scenes`}>
              {scenePage.scenes.map((scene) => (
                <DiscoverySceneCard key={scene.sceneId} scene={scene} />
              ))}
            </div>
          ) : null}
        </div>
        {profile.scenes.length > 0 ? (
          <ProfileScenesPagination
            currentPageIndex={scenePage.currentPageIndex}
            onPageChange={changePage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize)
              setPageIndex(0)
            }}
            pageCount={scenePage.pageCount}
            pageEnd={scenePage.pageEnd}
            pageSize={scenePage.pageSize}
            pageStart={scenePage.pageStart}
            totalScenes={scenePage.totalScenes}
          />
        ) : null}
      </section>
    </PageFrame>
  )
}
