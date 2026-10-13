import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createMagePlayer, type MagePlayerController } from '../src/modules/player/infrastructure/engineAdapter'
import { sceneRecovery, sceneRecoveryKey } from '../src/modules/player/recovery/sceneRecovery'
import { parseSceneDocument, type PlayableSceneDocument, type TemplateId } from '../src/modules/player/templates/sceneContract'
import { compileBuilderDocument, compileBuilderPreviewDocument } from '../src/modules/player/templates/builderCompiler'
import { listSelectableSceneTemplates } from '../src/modules/player/templates/templateRegistry'
import { createTemplateScene } from '../src/modules/scene-editor/templateEditor'
import { createBuilderRecipe } from '../src/modules/scene-editor/builderRecipes'

type Kind = 'template' | 'builder'
type Settings = { templateId: TemplateId; width: number; time: number; size: number; scale: number;
  animated: boolean; pointer: boolean; profile: 'preview' | 'full'; response: 'reference' | 'mapped-silence' | 'mapped-beats' }
type Review = { settings: Settings; documents: Record<Kind, PlayableSceneDocument>; revision: number }
type Capture = { url: string; key: string }
const catalog = listSelectableSceneTemplates()

function documentFor(settings: Settings, kind: Kind): PlayableSceneDocument {
  const scene = kind === 'template' ? createTemplateScene(settings.templateId) : createBuilderRecipe(settings.templateId)
  scene.parameters = { scale: settings.scale, speed: settings.animated ? 1 : 0 }
  scene.settings.camera = { ...scene.settings.camera, fov: 75, autoRotate: false, orbitSpeed: 0, tilt: 0, orientationMode: 0 }
  scene.settings.controls = { position0: { x: 0, y: 0, z: 5.5 }, target0: { x: 0, y: 0, z: 0 }, zoom0: 1 }
  scene.settings.motion = { minimizing_factor: .8, power_factor: 8, pointerDownMultiplier: 0, base_speed: 0, easing_speed: 1 }
  scene.settings.state = { size: settings.size, time: settings.time, pointerDown: 0, currPointerDown: 0, currAudio: 0, volume_multiplier: 0 }
  scene.settings.audioResponse = settings.response === 'reference' ? 'legacy' : 'mapped-v1'
  if (settings.response !== 'reference') scene.settings.audioResponseConfig = { version: 1, sensitivity: 1, mappings: [
    { target: 'size', source: 'bass-level', amount: .15, attack: .02, release: .2 },
  ] }
  scene.settings.bloom.enabled = false
  scene.settings.tint.enabled = false
  return parseSceneDocument(scene)
}

export function PlayerCard({ review, kind, playing, onCapture }: { review: Review; kind: Kind; playing: boolean; onCapture: (kind: Kind, capture: Capture) => void }) {
  const element = useRef<HTMLDivElement>(null)
  const controller = useRef<MagePlayerController | null>(null)
  const latestPlaying = useRef(playing)
  const [status, setStatus] = useState('Loading isolated renderer')
  const [error, setError] = useState('')
  const [capture, setCapture] = useState('')
  const [capturing, setCapturing] = useState(false)
  const { settings, documents } = review
  const scene = documents[kind]
  const compilation = scene.kind === 'builder'
    ? (settings.profile === 'preview' ? compileBuilderPreviewDocument : compileBuilderDocument)(scene) : null

  useEffect(() => { latestPlaying.current = playing; controller.current?.setPlaybackState(playing ? 'playing' : 'paused') }, [playing])
  useEffect(() => {
    const abort = new AbortController()
    let owned: MagePlayerController | null = null
    const start = performance.now()
    void (async () => {
      try {
        owned = await createMagePlayer(element.current!, { initialSceneBlob: scene, renderProfile: settings.profile, mouseInteractions: settings.pointer, signal: abort.signal })
        if (abort.signal.aborted) { owned.dispose(); return }
        controller.current = owned
        await owned.loadSceneBlob(scene)
        if (abort.signal.aborted) return
        owned.setSyntheticPreview?.(settings.response === 'mapped-beats', 17, 1)
        owned.setPlaybackState(latestPlaying.current ? 'playing' : 'paused')
        setStatus(`Loaded in ${(performance.now() - start).toFixed(0)} ms`)
      } catch (cause) {
        if (!abort.signal.aborted) {
          const key = sceneRecoveryKey(scene)
          setError(`${cause instanceof Error ? cause.message : String(cause)}; recovery: ${key ? sceneRecovery.getBlock(key)?.reason ?? 'none' : 'none'}`)
          setStatus('Failed')
        }
      }
    })()
    return () => { abort.abort(); owned?.dispose(); if (controller.current === owned) controller.current = null }
  }, [scene, settings])

  async function captureFrame() {
    if (!controller.current || capturing) return
    const owner = controller.current
    setCapturing(true)
    try {
      const url = await owner.captureFramePreview?.({ width: 640, height: 360, type: 'image/png' })
      if (controller.current !== owner) return
      if (!url) throw new Error('Capture returned no image')
      setCapture(url)
      onCapture(kind, { url, key: JSON.stringify(settings) })
    } catch (cause) { setError(String(cause)) }
    finally { setCapturing(false) }
  }

  return <section className="card">
    <header><h2>{kind === 'template' ? 'Original template' : 'Editable Builder'}</h2><span className={`status ${error ? 'error' : ''}`}>{status}</span></header>
    <div className="stage-wrap"><div aria-label={`${kind} review scene`} className="stage" ref={element} style={{ maxWidth: settings.width }} /></div>
    <div className="metrics">
      {error && <code role="alert" className="error">{error}</code>}
      <code>{settings.profile} profile · {settings.response} · start time {settings.time} · mesh scale {settings.scale} · camera (0,0,5.5)</code>
      {compilation && <code>Primitives {compilation.workload.expandedPrimitives}/16 · groups {compilation.workload.groups}/8 · uniforms {compilation.workload.liveUniforms}/64 · driver work {compilation.workload.driverOperations}/1024 · geometry/modifiers {compilation.workload.modifierOperations}/80</code>}
      <button disabled={!status.startsWith('Loaded') || capturing} onClick={() => { void captureFrame() }}>{capturing ? 'Capturing…' : `Capture ${kind} snapshot`}</button>
    </div>
    {capture && <><div className="capture-label"><span>Captured 640×360</span><a download={`${settings.templateId}-${kind}.png`} href={capture}>Save snapshot</a></div><img className="captured" src={capture} alt={`${kind} captured reference`} /></>}
    <details><summary>Scene document and workload</summary><pre>{JSON.stringify({ workload: compilation?.workload ?? 'Original authored profile', document: scene }, null, 2)}</pre></details>
  </section>
}

async function comparePixels(first: string, second: string) {
  const captures = await Promise.all([first, second].map(async url => {
    const image = new Image(); image.src = url; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, 640, 360)
    return context.getImageData(0, 0, 640, 360).data
  }))
  let total = 0, different = 0
  for (let pixel = 0; pixel < captures[0].length; pixel += 4) {
    let maximum = 0
    for (let channel = 0; channel < 3; channel++) {
      const delta = Math.abs(captures[0][pixel + channel] - captures[1][pixel + channel])
      total += delta; maximum = Math.max(maximum, delta)
    }
    if (maximum > 8) different++
  }
  return `Mean RGB error ${(total / (640 * 360 * 3)).toFixed(4)}/255; pixels differing >8: ${(100 * different / (640 * 360)).toFixed(3)}%`
}

export function App() {
  const [settings, setSettings] = useState<Settings>({ templateId: 'embedded-scene-0', width: 640, time: 0, size: .6, scale: 1,
    animated: false, pointer: false, profile: 'preview', response: 'reference' })
  const [mode, setMode] = useState<'both' | Kind>('template')
  const [review, setReview] = useState<Review | null>(null)
  const [playing, setPlaying] = useState(true)
  const [error, setError] = useState('')
  const [images, setImages] = useState<Partial<Record<Kind, Capture>>>({})
  const [difference, setDifference] = useState('Capture Original and Builder with identical settings to compare pixels.')
  const onCapture = useCallback((kind: Kind, capture: Capture) => { setImages(previous => ({ ...previous, [kind]: capture })) }, [])
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings(current => ({ ...current, [key]: value }))
  useEffect(() => {
    const first = images.template, second = images.builder
    if (!first || !second || first.key !== second.key) return
    let active = true
    void comparePixels(first.url, second.url).then(result => { if (active) setDifference(result) })
    return () => { active = false }
  }, [images])
  function run() {
    try {
      const documents = { template: documentFor(settings, 'template'), builder: documentFor(settings, 'builder') }
      for (const doc of Object.values(documents)) { const key = sceneRecoveryKey(doc); if (key) sceneRecovery.retry(key) }
      if (Object.values(images).some(capture => capture.key !== JSON.stringify(settings))) {
        setImages({}); setDifference('Settings changed. Capture Original and Builder again.')
      }
      setReview({ settings: { ...settings }, documents, revision: (review?.revision ?? 0) + 1 }); setError('')
    } catch (cause) { setError(String(cause)) }
  }
  return <main><h1>Builder catalog · local review</h1>
    <p>Unsaved reference scenes use the normal isolated player. This page does not read or modify accounts, editor drafts, scenes, or production data. Choose settings and Run; no scene loads automatically.</p>
    <div className="toolbar">
      <label>Template<select aria-label="Review template" value={settings.templateId} onChange={event => update('templateId', event.target.value as TemplateId)}>{catalog.map(template => <option key={template.templateId} value={template.templateId}>{template.label}</option>)}</select></label>
      <label>Compare<select aria-label="Comparison mode" value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="template">Original only</option><option value="builder">Builder only</option><option value="both">Original and Builder</option></select></label>
      <label>Profile<select aria-label="Render profile" value={settings.profile} onChange={event => update('profile', event.target.value as Settings['profile'])}><option value="preview">Preview</option><option value="full">Full playback</option></select></label>
      <label>Width<select aria-label="Player width" value={settings.width} onChange={event => update('width', Number(event.target.value))}><option value="640">640 px</option><option value="360">360 px narrow</option></select></label>
      <label>Response<select aria-label="Response mode" value={settings.response} onChange={event => update('response', event.target.value as Settings['response'])}><option value="reference">Frozen size reference (Original mode)</option><option value="mapped-silence">Mapped response · silence</option><option value="mapped-beats">Mapped response · simulated beats</option></select></label>
      <label>Start time<input aria-label="Reference time" type="number" min="0" max="3600" value={settings.time} onChange={event => update('time', Number(event.target.value))} /></label>
      <label>Reference size<input aria-label="Engine size" type="number" min=".006" max="2" step=".01" value={settings.size} onChange={event => update('size', Number(event.target.value))} /></label>
      <label>Mesh scale<input aria-label="Mesh scale" type="number" min=".1" max="10" step=".1" value={settings.scale} onChange={event => update('scale', Number(event.target.value))} /></label>
      <label className="check"><input type="checkbox" checked={settings.animated} onChange={event => update('animated', event.target.checked)} />Animate time</label>
      <label className="check"><input type="checkbox" checked={settings.pointer} onChange={event => update('pointer', event.target.checked)} />Enable pointer</label>
      <button className="primary" onClick={run}>Run / reload reference</button>
      <button disabled={!review} onClick={() => setPlaying(value => !value)}>{playing ? 'Pause' : 'Play'}</button>
      <button disabled={!review} onClick={() => setReview(null)}>Stop</button>
    </div>
    {error && <p role="alert" className="error">{error}</p>}
    <p className="note">Frozen size reference uses the supported Original response mode to hold the supplied native size. Mapped modes use the current mapping system and may replace that size; they verify current musical behavior. Simulated beats have a fixed seed but captures are not phase-synchronized. Pixel comparisons are reference evidence only with fixed time, silent matched input and pointer disabled.</p>
    <p className="foot">Sequential Original/Builder mode avoids running two previews at once. Changing settings requires Run. Width checks are desktop layout checks, not physical-phone performance evidence. No GPU frame-rate claim is made.</p>
    <output id="reference-difference">{difference}</output>
    <div className="players">{review && (['template', 'builder'] as const).filter(kind => mode === 'both' || mode === kind).map(kind =>
      <PlayerCard key={`${kind}-${review.revision}`} review={review} kind={kind} playing={playing} onCapture={onCapture} />)}</div>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
window.addEventListener('error', event => { document.getElementById('boot-error')!.textContent = event.message })
window.addEventListener('unhandledrejection', event => { document.getElementById('boot-error')!.textContent = String(event.reason) })
