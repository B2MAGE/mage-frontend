import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@auth'
import { useTheme } from '@theme'
import { ClassicHomePage } from './ClassicHomePage'
import { fetchScenes, fetchTags, formatMetricLabel, formatRelativeTime, type SceneListResponse, type TagResponse } from '@shared/lib'
import { EngagementButton, LoadingRegion, ScrollableTagBar, Skeleton, UserAvatar } from '@shared/ui'
import { selectPopularHomeTags } from './selectors'
import { MagePlayer } from '@modules/player'
import { BrandScene } from '@modules/scene-artwork'
import { DiscoverySceneCard } from '../discovery/ui/DiscoverySceneCard'
import { SceneCollectionState } from '../discovery/ui/SceneCollectionState'
import { DiscoveryEmptyState, DiscoveryErrorState, SceneGridSkeleton } from '../discovery/ui/DiscoveryStates'
import { fetchSceneDetail, updateSceneVote, clearSceneVote, updateSceneSave } from '../scene-detail/loaders'
import type { SceneDetail } from '../scene-detail/types'
import './home.css'
import '../discovery/discovery.css'

export function HomePage() {
  const { themeId } = useTheme()
  return themeId === 'classic-facebook' ? <ClassicHomePage /> : <PulseHomePage />
}

function FeaturedSceneSkeleton() {
  return (
    <LoadingRegion
      as="article"
      className="featured-loading-region"
      label="Loading featured scene"
      visualClassName="featured-scene featured-scene--loading"
    >
      <div className="featured-player featured-player--loading" aria-hidden="true">
        <Skeleton shape="block" className="featured-loading__player" />
      </div>
      <div className="featured-info" aria-hidden="true">
        <div className="creator-row">
          <Skeleton shape="circle" className="featured-loading__avatar" />
          <div className="featured-loading__creator-copy">
            <Skeleton shape="line" className="featured-loading__creator-name" />
            <Skeleton shape="line" className="featured-loading__creator-role" />
          </div>
          <Skeleton shape="block" className="featured-loading__follow" />
        </div>
        <div className="scene-copy featured-loading__scene-copy">
          <Skeleton shape="line" className="featured-loading__title" />
          <Skeleton shape="line" className="featured-loading__published" />
          <Skeleton shape="line" className="featured-loading__description" />
          <Skeleton shape="line" className="featured-loading__description featured-loading__description--short" />
        </div>
        <Skeleton shape="line" className="featured-loading__tag-space" />
        <div className="scene-stats featured-loading__stats">
          <Skeleton shape="line" className="featured-loading__stats-line" />
        </div>
        <div className="featured-action">
          <Skeleton shape="block" className="featured-loading__action" />
        </div>
      </div>
    </LoadingRegion>
  )
}

function PulseHomePage() {
  const { isAuthenticated, isRestoringSession, authenticatedFetch } = useAuth()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false)
  const [scenes, setScenes] = useState<SceneListResponse[]>([])
  const [featured, setFeatured] = useState<SceneDetail | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [popularTags, setPopularTags] = useState<TagResponse[]>([])
  const [tagsLoading, setTagsLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [featuredLoading, setFeaturedLoading] = useState(true)
  const [featuredError, setFeaturedError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [pendingEngagementAction, setPendingEngagementAction] = useState<'up' | 'down' | 'save' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // Rank once for this visit, independently of filtered scene results or retries.
  useEffect(() => {
    let cancelled = false
    fetchTags({ attachedOnly: true })
      .then(tags => {
        if (!cancelled) {
          setPopularTags(selectPopularHomeTags(tags))
          setTagsLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPopularTags([])
          setTagsLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  // Recent-scene filters must not replace the featured player's scene identity.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    fetchScenes(tag)
      .then(data => {
        if (cancelled) return
        setScenes([...data].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)))
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) { setError(true); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [tag, retry])

  useEffect(() => {
    let cancelled = false
    setFeaturedLoading(true)
    setFeaturedError(false)
    const configured = Number(import.meta.env.VITE_HOME_FEATURED_SCENE_ID)
    const featuredId = Number.isSafeInteger(configured) && configured > 0
      ? Promise.resolve(configured)
      : fetchScenes().then(data =>
          [...data].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]?.sceneId,
        )
    featuredId
      .then(async id => {
        if (cancelled) return
        const detail = id ? await fetchSceneDetail(authenticatedFetch, isAuthenticated, id) : null
        if (!cancelled) {
          setFeatured(detail)
          setFeaturedLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) { setFeaturedError(true); setFeaturedLoading(false) }
      })
    return () => { cancelled = true }
  }, [retry, isAuthenticated, authenticatedFetch])

  async function engage(action: 'up' | 'down' | 'save') {
    if (!isAuthenticated) { navigate('/login'); return }
    if (!featured || pendingEngagementAction) return
    setPendingEngagementAction(action)
    setActionError(null)
    try {
      const engagement = action === 'save'
        ? await updateSceneSave(authenticatedFetch, featured.id, !featured.engagement.currentUserSaved)
        : featured.engagement.currentUserVote === action
          ? await clearSceneVote(authenticatedFetch, featured.id)
          : await updateSceneVote(authenticatedFetch, featured.id, action)
      setFeatured(current => current ? { ...current, engagement } : current)
    } catch { setActionError('Could not save that action. Please try again.') }
    finally { setPendingEngagementAction(null) }
  }
  const showWelcome = !isAuthenticated && !isRestoringSession && !dismissed
  return (
    <main className={`pulse-home${showWelcome ? '' : ' pulse-home--without-welcome'}`}>
      {showWelcome && <section className="creator-section" aria-label="Create with MAGE">
        <button className="creator-dismiss" type="button" aria-label="Dismiss create prompt" title="Dismiss" onClick={() => setDismissed(true)}>×</button>
        <div className="creator-copy">
          <h2>Build something that reacts.</h2>
          <p>Start with a visual scene, shape its motion and effects, then pair it with sound and publish it for others to explore.</p>
          <div className="creator-actions">
            <Link className="primary-button" to="/register">Sign up <span aria-hidden="true">→</span></Link>
            <Link className="secondary-button" to="/login">Sign in</Link>
          </div>
        </div>
        <div className="editor-preview" aria-hidden="true">
          <div className="editor-sidebar">{['Details','Scene','Camera','Motion','Effects','Confirm'].map((step,i) => <span key={step} className={`editor-step${i === 0 ? ' active' : ''}`}>{step}</span>)}</div>
          <div className="editor-canvas">
            <BrandScene className="editor-brand-scene" reactToBeat={false} />
          </div>
        </div>
      </section>}
      <section className="featured-section" aria-labelledby="featured-heading">
        <div className="featured-heading">
          <h1 id="featured-heading">Featured Scenes</h1>
          <Link className="browse-link" to="/scenes?sort=featured"><span className="browse-link__label">Browse all featured</span> <span aria-hidden="true">→</span></Link>
        </div>
        {featuredLoading && !featured && <FeaturedSceneSkeleton />}
        {featuredError && <SceneCollectionState
          kind="error"
          title="Featured scene unavailable"
          description="We couldn’t load the featured scene. You can try again or explore the collection."
          action={<>
            <button className="scene-collection-state__button" type="button" onClick={() => setRetry(n => n + 1)}>Try again</button>
            <Link className="scene-collection-state__button scene-collection-state__button--secondary" to="/scenes">Explore scenes</Link>
          </>}
        />}
        {!featuredLoading && !featuredError && !featured && <SceneCollectionState
          title="The next feature is on its way"
          description="There’s no featured scene right now. Explore the collection and find something you love."
          action={<Link className="scene-collection-state__button" to="/scenes">Explore scenes</Link>}
        />}
        {featured && !featuredError && <article className="featured-scene">
          <div className="featured-player"><MagePlayer ariaLabel={`Featured scene: ${featured.name}`} sceneBlob={featured.sceneData} initialPlayback="playing" /></div>
          <div className="featured-info">
            <div className="creator-row">
              {featured.creatorHandle ? (
                <Link className="featured-creator-profile" to={`/@${featured.creatorHandle}`}>
                  <UserAvatar className="creator-avatar" initials={(featured.creatorDisplayName || 'MAGE').split(/\s+/).slice(0,2).map(s=>s[0]).join('')} gradientStart={featured.creatorAvatarGradientStart} gradientEnd={featured.creatorAvatarGradientEnd} />
                  <div className="featured-creator-profile__copy"><strong>{featured.creatorDisplayName || 'MAGE creator'}</strong><span>@{featured.creatorHandle}</span></div>
                </Link>
              ) : (
                <div className="featured-creator-profile featured-creator-profile--static">
                  <UserAvatar className="creator-avatar" initials={(featured.creatorDisplayName || 'MAGE').split(/\s+/).slice(0,2).map(s=>s[0]).join('')} gradientStart={featured.creatorAvatarGradientStart} gradientEnd={featured.creatorAvatarGradientEnd} />
                  <div className="featured-creator-profile__copy"><strong>{featured.creatorDisplayName || 'MAGE creator'}</strong><span>Scene creator</span></div>
                </div>
              )}
              <button className="follow-button" type="button" disabled title="Following creators is not available yet">Follow</button>
            </div>
            <div className="scene-copy">
              <h2><Link className="featured-title-link" to={`/scenes/${featured.id}`} title={featured.name}>{featured.name}</Link></h2>
              <p className="scene-published">{formatMetricLabel(featured.engagement.views, 'view')}{featured.createdAt && <> · {formatRelativeTime(featured.createdAt)}</>}</p>
              <p className="featured-description">{featured.description}</p>
            </div>
            <ScrollableTagBar ariaLabel="Featured scene categories" barClassName="tag-row featured-tags">
              {featured.tags.map(t=><Link key={t} className="tag-pill" to={`/scenes?tag=${encodeURIComponent(t)}`}>{t}</Link>)}
            </ScrollableTagBar>
            <div className="scene-stats">
              <EngagementButton ariaLabel="Upvote featured scene" className="featured-engagement-button" count={featured.engagement.upvotes} disabled={pendingEngagementAction!==null} isBusy={pendingEngagementAction==='up'} isSelected={featured.engagement.currentUserVote==='up'} kind="upvote" onClick={()=>void engage('up')} />
              <EngagementButton ariaLabel="Downvote featured scene" className="featured-engagement-button" count={featured.engagement.downvotes} disabled={pendingEngagementAction!==null} isBusy={pendingEngagementAction==='down'} isSelected={featured.engagement.currentUserVote==='down'} kind="downvote" onClick={()=>void engage('down')} />
              <EngagementButton ariaLabel="Save featured scene" className="featured-engagement-button" count={featured.engagement.saves} disabled={pendingEngagementAction!==null} isBusy={pendingEngagementAction==='save'} isSelected={featured.engagement.currentUserSaved} kind="save" onClick={()=>void engage('save')} />
            </div>
            {actionError && <p role="alert">{actionError}</p>}
            <div className="featured-action">
              <Link className="primary-button" to={`/scenes/${featured.id}`}>Open scene <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </article>}
      </section>
      <section className="discover-section" aria-labelledby="recent-scenes-heading">
        <div className="section-heading">
          <h2 id="recent-scenes-heading">For You</h2>
          {tagsLoading ? (
            <LoadingRegion
              className="home-filter-loading-region"
              label="Loading scene filters"
              visualClassName="home-filter-loading"
            >
              <Skeleton shape="block" className="home-filter-loading__placeholder" />
            </LoadingRegion>
          ) : (
            <ScrollableTagBar ariaLabel="Filter recent scenes" barClassName="filters" role="group">
              <button type="button" className={`tag-pill${tag === null ? ' tag-pill--active' : ''}`} aria-pressed={tag === null} onClick={() => setTag(null)}>All</button>
              {popularTags.map(option => (
                <button type="button" key={option.tagId} className={`tag-pill${tag === option.name ? ' tag-pill--active' : ''}`} aria-pressed={tag === option.name} onClick={() => setTag(option.name)}>{option.name}</button>
              ))}
            </ScrollableTagBar>
          )}
        </div>
        {error && <DiscoveryErrorState
          headingLevel={3}
          onRetry={() => setRetry(n => n + 1)}
        />}
        {loading && <SceneGridSkeleton count={8} label="Loading recent scenes" />}
        {!loading && !error && scenes.length === 0 && <DiscoveryEmptyState
          headingLevel={3}
          activeTag={tag}
          onClearFilter={() => setTag(null)}
        />}
        {!loading && !error && scenes.length > 0 && <>
          <div className="scene-grid" aria-label="For You scenes">{scenes.slice(0,8).map(scene=><DiscoverySceneCard key={scene.sceneId} scene={scene}/>)}</div>
          <div className="discover-more"><Link className="secondary-button" to="/scenes?sort=recommended">See all recommended <span aria-hidden="true">→</span></Link></div>
        </>}
      </section>
    </main>
  )
}
