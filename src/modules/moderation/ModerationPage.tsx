import { useState, type FormEvent } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  ActionButton,
  FormNotice,
  LoadingRegion,
  PageFrame,
  PageHeader,
  PagePanel,
  PageSectionNav,
  PageState,
  SectionHeader,
  Skeleton,
} from '@shared/ui'
import { ModeratorsPage } from './ModeratorsPage'
import { CustomShaderControls } from './CustomShaderControls'
import { useAdminCapabilities } from './useAdminCapabilities'
import './moderation.css'

type ModerationSection = 'scenes' | 'playback' | 'moderators'

export function ModerationPage({ section = 'scenes' }: { section?: ModerationSection }) {
  const { capabilities, checking, failed, refresh } = useAdminCapabilities()
  const allowed = capabilities && (
    capabilities.canModerateScenes ||
    capabilities.canManageModerators ||
    capabilities.canManageCustomRendering
  )
  const sectionAllowed = section === 'scenes'
    ? capabilities?.canModerateScenes
    : section === 'playback'
      ? capabilities?.canManageCustomRendering
      : capabilities?.canManageModerators

  return (
    <PageFrame className="moderation-area" width="form">
      <PageHeader
        className="moderation-area__header"
        description="Review scenes and manage the tools available to your account."
        title="Moderation"
      />

      {checking ? (
        <LoadingRegion
          as="section"
          className="moderation-area__loading"
          label="Checking your permissions"
        >
          <PagePanel className="moderation-loading-panel">
            <Skeleton className="moderation-loading-panel__title" shape="line" />
            <Skeleton className="moderation-loading-panel__copy" shape="line" />
            <Skeleton className="moderation-loading-panel__copy moderation-loading-panel__copy--short" shape="line" />
          </PagePanel>
        </LoadingRegion>
      ) : !allowed ? (
        <PageState
          actions={failed ? (
            <ActionButton onClick={refresh} tone="secondary">Try again</ActionButton>
          ) : undefined}
          description={failed
            ? 'Please check your connection and try again.'
            : 'This area is for moderators and administrators.'}
          kind="error"
          title={failed ? 'Permissions couldn’t be checked' : 'Moderator access required'}
        />
      ) : (
        <div className="moderation-layout">
          <PageSectionNav ariaLabel="Moderation sections">
            {capabilities.canModerateScenes ? (
              <NavLink className="ui-section-nav__link" end to="/moderation">Scenes</NavLink>
            ) : null}
            {capabilities.canManageCustomRendering ? (
              <NavLink className="ui-section-nav__link" to="/moderation/playback">Custom shaders</NavLink>
            ) : null}
            {capabilities.canManageModerators ? (
              <NavLink className="ui-section-nav__link" to="/moderation/moderators">Moderator access</NavLink>
            ) : null}
          </PageSectionNav>

          <section className="moderation-area__content">
            {!sectionAllowed ? (
              <PageState
                description="Your account does not have access to this tool."
                kind="error"
                title={section === 'scenes'
                  ? 'Scene moderation access required'
                  : 'Administrator access required'}
              />
            ) : section === 'scenes' ? (
              <SceneModerationOverview />
            ) : section === 'playback' ? (
              <CustomShaderControls />
            ) : (
              <ModeratorsPage embedded />
            )}
          </section>
        </div>
      )}
    </PageFrame>
  )
}

function SceneModerationOverview() {
  const [sceneId, setSceneId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  function openScene(event: FormEvent) {
    event.preventDefault()
    const id = Number(sceneId)
    if (!/^\d+$/.test(sceneId) || !Number.isSafeInteger(id) || id < 1) {
      setError('Enter a valid scene ID.')
      return
    }
    navigate(`/scenes/${id}`)
  }

  return (
    <PagePanel className="moderation-tool moderation-area__scenes">
      <SectionHeader
        actions={(
          <Link className="ui-button ui-button--secondary" to="/scenes">Browse scenes</Link>
        )}
        description={(
          <p>
            Open a scene and select the shield beside Follow or Edit scene to block or unblock it.
            Blocking stops playback for everyone while keeping the scene available to restore later.
          </p>
        )}
        title="Manage a scene"
        titleId="moderation-scenes-title"
      />

      <form className="moderation-area__lookup" onSubmit={openScene}>
        <div className="ui-field moderation-area__lookup-field">
          <label htmlFor="moderation-scene-id">Or open a scene by ID</label>
          <div className="moderation-action-row">
            <input
              aria-describedby="moderation-scene-id-hint"
              id="moderation-scene-id"
              inputMode="numeric"
              onChange={(event) => {
                setSceneId(event.target.value)
                setError(null)
              }}
              pattern="[0-9]+"
              required
              value={sceneId}
            />
            <ActionButton tone="secondary" type="submit">Open scene</ActionButton>
          </div>
          <p className="field-hint" id="moderation-scene-id-hint">
            The scene ID is the number at the end of its page address.
          </p>
        </div>
        {error ? <FormNotice tone="error">{error}</FormNotice> : null}
      </form>
    </PagePanel>
  )
}
