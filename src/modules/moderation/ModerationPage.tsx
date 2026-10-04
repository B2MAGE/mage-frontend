import { useState, type FormEvent } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ModeratorsPage } from './ModeratorsPage'
import { CustomShaderControls } from './CustomShaderControls'
import { useAdminCapabilities } from './useAdminCapabilities'
import './moderation.css'

type ModerationSection = 'scenes' | 'playback' | 'moderators'

export function ModerationPage({ section = 'scenes' }: { section?: ModerationSection }) {
  const { capabilities, checking, failed, refresh } = useAdminCapabilities()
  const allowed = capabilities && (capabilities.canModerateScenes || capabilities.canManageModerators || capabilities.canManageCustomRendering)
  const sectionAllowed = section === 'scenes' ? capabilities?.canModerateScenes
    : section === 'playback' ? capabilities?.canManageCustomRendering : capabilities?.canManageModerators

  return <main className="moderators-page moderation-area">
    <header className="moderation-area__header">
      <h1>Moderation</h1>
      <p>Review scenes and manage the tools available to your account.</p>
    </header>
    {checking ? <p role="status">Checking your permissions…</p> : !allowed ? <section>
      <h2>{failed ? 'Permissions couldn’t be checked' : 'Moderator access required'}</h2>
      <p>{failed ? 'Please check your connection and try again.' : 'This area is for moderators and administrators.'}</p>
      {failed && <button className="secondary-button" type="button" onClick={refresh}>Try again</button>}
    </section> : <>
      <nav className="moderation-area__nav" aria-label="Moderation sections">
        {capabilities.canModerateScenes && <NavLink end to="/moderation">Scenes</NavLink>}
        {capabilities.canManageCustomRendering && <NavLink to="/moderation/playback">Custom shaders</NavLink>}
        {capabilities.canManageModerators && <NavLink to="/moderation/moderators">Moderator access</NavLink>}
      </nav>
      {!sectionAllowed ? <section>
        <h2>{section === 'scenes' ? 'Scene moderation access required' : 'Administrator access required'}</h2>
        <p>Your account does not have access to this tool.</p>
      </section> : section === 'scenes' ? <SceneModerationOverview />
        : section === 'playback' ? <CustomShaderControls /> : <ModeratorsPage embedded />}
    </>}
  </main>
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

  return <section className="moderation-area__scenes" aria-labelledby="moderation-scenes-title">
    <h2 id="moderation-scenes-title">Manage a scene</h2>
    <p>Open a scene and select the shield beside Follow or Edit scene to block or unblock it.</p>
    <p>Blocking stops playback for everyone. The scene stays saved and can be unblocked later.</p>
    <Link className="secondary-button moderation-area__browse" to="/scenes">Browse scenes</Link>
    <form className="moderation-area__lookup" onSubmit={openScene}>
      <label htmlFor="moderation-scene-id">Or open a scene by ID</label>
      <div className="moderators-actions">
        <input id="moderation-scene-id" inputMode="numeric" pattern="[0-9]+" value={sceneId} required
          onChange={(event) => { setSceneId(event.target.value); setError(null) }} aria-describedby="moderation-scene-id-hint" />
        <button type="submit" className="secondary-button">Open scene</button>
      </div>
      <p id="moderation-scene-id-hint" className="moderators-muted">The scene ID is the number at the end of its page address.</p>
      {error && <p role="alert" className="moderators-error">{error}</p>}
    </form>
  </section>
}
