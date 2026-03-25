import { startTransition, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import type { MageEngineApi } from '@mage-engine'

type MageModule = typeof import('@mage-engine')

type MageEngineRuntime = MageEngineApi & {
  audio?: {
    buffer?: AudioBuffer | null
  }
}

type PresetComment = {
  author: string
  posted: string
  text: string
}

type PresetShowcase = {
  id: number
  title: string
  creator: string
  creatorRole: string
  duration: string
  plays: string
  published: string
  teaser: string
  description: string
  tags: string[]
  accent: string
  comments: PresetComment[]
}

const presetCatalog: PresetShowcase[] = [
  {
    id: 1,
    title: 'Glass Orbit / Live Visual Preset',
    creator: 'MAGE Studio',
    creatorRole: 'Audio-reactive showcase',
    duration: '08:34',
    plays: '18.4K plays',
    published: 'Premiered 3 days ago',
    teaser: 'A slow-burn orbital scene built for melodic intros and long ambient breakdowns.',
    description:
      'This preset leans on reflective surfaces, wide camera drift, and soft color ramps so the visualizer feels cinematic instead of purely diagnostic.',
    tags: ['ambient', 'orbital', 'live-visual'],
    accent: '#63f0d6',
    comments: [
      { author: 'synthlayer', posted: '2 hours ago', text: 'The pacing on this one feels like an actual release trailer instead of a dev test.' },
      { author: 'frameshift', posted: '5 hours ago', text: 'Would absolutely use this as the default watch surface for calmer tracks.' },
    ],
  },
  {
    id: 2,
    title: 'Neon Cathedral / Bass Sweep',
    creator: 'MAGE Studio',
    creatorRole: 'High-energy preset',
    duration: '05:12',
    plays: '31.2K plays',
    published: 'Premiered 1 week ago',
    teaser: 'Sharper contrast, heavier bloom, and faster motion for tracks with more impact.',
    description:
      'The cathedral build pushes the scale higher and lets bass hits drive broader lighting changes. It is meant to feel bigger and more theatrical in a watch-page context.',
    tags: ['bass-heavy', 'neon', 'cinematic'],
    accent: '#5cb7ff',
    comments: [
      { author: 'kickdrumclub', posted: '1 day ago', text: 'Preset 2 feels the closest to a real product demo. The contrast is strong without being noisy.' },
      { author: 'vfxnotes', posted: '2 days ago', text: 'This is the one I would put first in a recommendation rail.' },
    ],
  },
  {
    id: 3,
    title: 'Signal Bloom / Pulse Study',
    creator: 'MAGE Studio',
    creatorRole: 'Responsive motion preset',
    duration: '06:48',
    plays: '12.7K plays',
    published: 'Premiered 9 days ago',
    teaser: 'Designed to show rhythmic response quickly, with more obvious pulse behavior on the first beat.',
    description:
      'Signal Bloom is the easiest preset for users to read at a glance. The shapes are simpler, the reactions are faster, and the motion language is more direct.',
    tags: ['pulse', 'responsive', 'clean'],
    accent: '#ff8d6b',
    comments: [
      { author: 'latencyscan', posted: '7 hours ago', text: 'This is the best one for testing whether the audio response is landing on time.' },
      { author: 'rendernorth', posted: '11 hours ago', text: 'A strong option for people who want less atmosphere and more immediate movement.' },
    ],
  },
  {
    id: 4,
    title: 'Polar Echo / Skybox Run',
    creator: 'MAGE Studio',
    creatorRole: 'Wide-frame preset',
    duration: '04:41',
    plays: '9.9K plays',
    published: 'Premiered 2 weeks ago',
    teaser: 'Built for bigger displays, wide compositions, and a colder palette that reads well in dark UI shells.',
    description:
      'Preset 4 was tuned for broad lateral motion and cleaner edge lighting, so it holds up when the player is stretched into a full-width watch experience.',
    tags: ['wide', 'skybox', 'cool-tone'],
    accent: '#9fd9ff',
    comments: [
      { author: 'panorama', posted: '3 days ago', text: 'This one looks the most premium when the player is full width.' },
      { author: 'mixroom', posted: '4 days ago', text: 'Cold palette works well here. It feels less like a tool and more like a release page.' },
    ],
  },
  {
    id: 5,
    title: 'Afterglow Drift / Minimal Cut',
    creator: 'MAGE Studio',
    creatorRole: 'Minimal preset',
    duration: '03:57',
    plays: '6.3K plays',
    published: 'Premiered 3 weeks ago',
    teaser: 'A softer preset with fewer elements on screen, meant to keep focus on the track rather than the rendering complexity.',
    description:
      'This variant strips back the scene and lets the animation breathe. It works better for softer arrangements or product surfaces that need a calmer visual baseline.',
    tags: ['minimal', 'soft', 'product-ready'],
    accent: '#f7b267',
    comments: [
      { author: 'designops', posted: '5 days ago', text: 'This feels the most realistic for an actual customer-facing preset page.' },
      { author: 'loopwindow', posted: '1 week ago', text: 'Good reminder that not every preset needs to max out the frame.' },
    ],
  },
  {
    id: 6,
    title: 'Night Drive / Spectrum Tunnel',
    creator: 'MAGE Studio',
    creatorRole: 'Motion-first preset',
    duration: '07:10',
    plays: '22.1K plays',
    published: 'Premiered 1 month ago',
    teaser: 'A faster-moving tunnel composition for users who want a more kinetic watch experience.',
    description:
      'Night Drive increases movement and perceived depth so the player feels more transportive. It is the most aggressive option in the embedded preset set.',
    tags: ['tunnel', 'motion', 'high-energy'],
    accent: '#c28cff',
    comments: [
      { author: 'oscillator', posted: '8 hours ago', text: 'This one feels closest to a music video visualization rather than a lab view.' },
      { author: 'spectraline', posted: '12 hours ago', text: 'Would pair this with the autoplay state if the product ever gets that far.' },
    ],
  },
  {
    id: 7,
    title: 'Solar Tide / Prism Bloom',
    creator: 'MAGE Studio',
    creatorRole: 'Color-forward preset',
    duration: '04:56',
    plays: '14.8K plays',
    published: 'Premiered 6 days ago',
    teaser: 'Preset 7 pushes warm gradients and broader color swings for tracks that need a brighter watch surface.',
    description:
      'Solar Tide is tuned to feel more celebratory than technical. It uses fuller color transitions and a softer visual cadence so the page feels like a release destination.',
    tags: ['warm-tone', 'prism', 'bright'],
    accent: '#ffb26b',
    comments: [
      { author: 'coverartclub', posted: '3 hours ago', text: 'This is the easiest preset to imagine sitting behind a launch trailer.' },
      { author: 'lightgrid', posted: '9 hours ago', text: 'The warmer palette makes the page feel much less like an internal tool.' },
    ],
  },
  {
    id: 8,
    title: 'Static Garden / Echo Field',
    creator: 'MAGE Studio',
    creatorRole: 'Texture-led preset',
    duration: '06:03',
    plays: '11.5K plays',
    published: 'Premiered 10 days ago',
    teaser: 'A denser, more layered preset where the motion feels textural rather than explosive.',
    description:
      'Echo Field is useful when the visualizer should feel rich and occupied without turning into a fast strobe. It fills the frame and reads well in a recommendation rail.',
    tags: ['texture', 'layered', 'dense'],
    accent: '#7ef0c0',
    comments: [
      { author: 'noiseatlas', posted: '6 hours ago', text: 'This one feels like the best bridge between the cinematic presets and the cleaner study presets.' },
      { author: 'phasevector', posted: '1 day ago', text: 'Lots of texture, but still readable in the sidebar thumbnail.' },
    ],
  },
  {
    id: 9,
    title: 'Vector Bloom / Midnight Signal',
    creator: 'MAGE Studio',
    creatorRole: 'Late-night preset',
    duration: '05:44',
    plays: '16.1K plays',
    published: 'Premiered 2 weeks ago',
    teaser: 'This preset keeps the palette darker and lets the highlights do the work.',
    description:
      'Vector Bloom is designed for darker tracks and moodier presentations. The scene stays restrained until brighter moments break through, which helps the player feel more intentional.',
    tags: ['night', 'vector', 'moody'],
    accent: '#7f9bff',
    comments: [
      { author: 'afterhours', posted: '4 hours ago', text: 'Preset 9 is the best fit for a darker product shell.' },
      { author: 'renderdeck', posted: '18 hours ago', text: 'The restrained motion makes the highlights land harder.' },
    ],
  },
  {
    id: 10,
    title: 'Final Arc / Showcase Cut',
    creator: 'MAGE Studio',
    creatorRole: 'Showcase preset',
    duration: '09:02',
    plays: '27.6K plays',
    published: 'Premiered 4 days ago',
    teaser: 'Preset 10 is the full showcase cut: larger motion, stronger framing, and the most overtly presentational layout.',
    description:
      'This is the most polished preset in the embedded set for a watch-page mockup. It is meant to feel like the version a user clicks when browsing featured presets, not the version an engineer tests in isolation.',
    tags: ['featured', 'showcase', 'hero'],
    accent: '#63f0d6',
    comments: [
      { author: 'launchboard', posted: '1 hour ago', text: 'This finally feels like a real featured preset instead of an uncatalogued fallback.' },
      { author: 'uiwatch', posted: '7 hours ago', text: 'Good choice for the hero slot. The page reads much better with all ten presets filled out.' },
    ],
  },
]

const defaultPreset = presetCatalog[0]

function getPresetShowcase(presetId: number): PresetShowcase {
  return (
    presetCatalog.find((preset) => preset.id === presetId) ?? {
      id: presetId,
      title: `Preset ${presetId}`,
      creator: 'MAGE Studio',
      creatorRole: 'Embedded preset',
      duration: '05:00',
      plays: 'Preview build',
      published: 'Loaded from engine',
      teaser: 'This preset comes directly from the embedded engine bundle.',
      description:
        'The lab page is prioritizing the curated presets in the Up Next rail, but the engine can still load additional embedded presets if needed.',
      tags: ['embedded', 'visualizer'],
      accent: '#63f0d6',
      comments: [
        { author: 'system', posted: 'just now', text: 'Embedded preset loaded successfully.' },
        { author: 'mage-lab', posted: 'just now', text: 'Metadata for this preset is using the generic fallback view.' },
      ],
    }
  )
}

function getAudioSourceLabel(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.hostname || 'Website audio'
  } catch {
    return 'Website audio'
  }
}

export function MageLabPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const engineRef = useRef<MageEngineApi | null>(null)
  const moduleRef = useRef<MageModule | null>(null)
  const audioLoadTokenRef = useRef(0)

  const [status, setStatus] = useState('Loading the engine module...')
  const [audioUrl, setAudioUrl] = useState('')
  const [audioSourceLabel, setAudioSourceLabel] = useState('No track loaded')
  const [selectedPresetId, setSelectedPresetId] = useState(defaultPreset.id)
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false)
  const [isReady, setIsReady] = useState(false)

  const selectedPreset = getPresetShowcase(selectedPresetId)

  useEffect(() => {
    let disposed = false
    let localEngine: MageEngineApi | null = null

    const boot = async () => {
      try {
        const mageModule = await import('@mage-engine')

        if (disposed || !canvasRef.current) {
          return
        }

        moduleRef.current = mageModule

        const { engine } = mageModule.initMAGE({
          canvas: canvasRef.current,
          withControls: false,
          autoStart: false,
          options: { log: false },
        })

        localEngine = engine
        engineRef.current = engine
        engine.start()

        const appliedPreset = mageModule.applyEmbeddedPreset(engine, defaultPreset.id)

        startTransition(() => {
          setIsReady(true)
          setStatus(appliedPreset ? `${defaultPreset.title} is ready to preview.` : 'Engine ready. Default scene loaded.')
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown engine error'
        startTransition(() => {
          setStatus(`Engine failed to load: ${message}`)
        })
      }
    }

    void boot()

    return () => {
      disposed = true
      audioLoadTokenRef.current += 1
      engineRef.current = null
      moduleRef.current = null
      localEngine?.dispose()
    }
  }, [])

  const withEngine = <Result,>(action: (engine: MageEngineApi) => Result) => {
    const engine = engineRef.current

    if (!engine) {
      setStatus('The engine is still loading.')
      return null
    }

    return action(engine)
  }

  const queueWebsiteAutoplay = (sourceLabel: string) => {
    audioLoadTokenRef.current += 1
    const token = audioLoadTokenRef.current

    const waitForBuffer = (attemptsRemaining: number) => {
      window.setTimeout(() => {
        if (audioLoadTokenRef.current !== token) {
          return
        }

        const runtime = engineRef.current as MageEngineRuntime | null

        if (runtime?.audio?.buffer) {
          runtime.play()
          setStatus(`${sourceLabel} loaded. Playback started.`)
          return
        }

        if (attemptsRemaining <= 0) {
          setStatus(`${sourceLabel} requested. If nothing plays, use a direct audio link and press Play Audio.`)
          return
        }

        waitForBuffer(attemptsRemaining - 1)
      }, 250)
    }

    waitForBuffer(24)
  }

  const applyEmbeddedPresetById = async (nextPresetId: number) => {
    const mageModule = moduleRef.current ?? (await import('@mage-engine'))
    moduleRef.current = mageModule
    const preset = getPresetShowcase(nextPresetId)

    const ok = withEngine((engine) => mageModule.applyEmbeddedPreset(engine, nextPresetId))

    if (ok === null) {
      return false
    }

    if (ok) {
      startTransition(() => {
        setSelectedPresetId(nextPresetId)
      })
      setStatus(`${preset.title} is live.`)
      return true
    }

    setStatus(`Preset ${nextPresetId} is not available in this build.`)
    return false
  }

  const handlePresetSelection = async (nextPresetId: number) => {
    const preset = getPresetShowcase(nextPresetId)
    setStatus(`Loading ${preset.title}...`)
    await applyEmbeddedPresetById(nextPresetId)
  }

  const handlePlay = () => {
    withEngine((engine) => {
      const runtime = engine as MageEngineRuntime

      if (!runtime.audio) {
        setIsAudioModalOpen(true)
        setStatus('Load a track first.')
        return
      }

      if (!runtime.audio.buffer) {
        setStatus('Track is still loading.')
        return
      }

      engine.play()
      setStatus('Audio playback started.')
    })
  }

  const handlePause = () => {
    withEngine((engine) => {
      const runtime = engine as MageEngineRuntime

      if (!runtime.audio?.buffer) {
        setStatus('No track is loaded.')
        return
      }

      engine.pause()
      setStatus('Audio playback paused.')
    })
  }

  const handleLoadAudioUrl = () => {
    const trimmedUrl = audioUrl.trim()

    if (!trimmedUrl) {
      setStatus('Paste an audio URL first.')
      return
    }

    let parsedUrl: URL

    try {
      parsedUrl = new URL(trimmedUrl)
    } catch {
      setStatus('Enter a valid website URL.')
      return
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      setStatus('Use an http or https audio URL.')
      return
    }

    const sourceLabel = getAudioSourceLabel(trimmedUrl)

    withEngine((engine) => {
      engine.loadAudio(trimmedUrl)
      setAudioSourceLabel(sourceLabel)
      setIsAudioModalOpen(false)
      setStatus(`Loading audio from ${sourceLabel}...`)
      queueWebsiteAutoplay(sourceLabel)
    })
  }

  const handlePickAudioFile = () => {
    withEngine((engine) => {
      audioLoadTokenRef.current += 1

      if (audioInputRef.current) {
        audioInputRef.current.value = ''
      }

      engine.loadAudio()
      setIsAudioModalOpen(false)
      setStatus('Choose a local audio file.')
    })
  }

  const handleAudioInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setAudioSourceLabel(file.name)
    setStatus(`Loading local file: ${file.name}`)
  }

  return (
    <main className="mage-lab">
      <section className="mage-lab__layout">
        <section className="mage-watch">
          <div className="mage-watch__main">
            <div className="mage-player-shell">
              <div
                className="mage-stage-frame mage-stage-frame--watch"
                style={{ '--preset-accent': selectedPreset.accent } as CSSProperties}
              >
                <canvas ref={canvasRef} className="mage-stage-frame__canvas" />
                <div className="mage-stage-frame__hud">
                  <span className="mage-stage-pill" data-ready={isReady}>
                    {isReady ? 'Live Render' : 'Loading Engine'}
                  </span>
                  <span className="mage-stage-pill">{selectedPreset.duration}</span>
                </div>
              </div>
            </div>

            <div className="mage-watch__summary">
              <h1 className="mage-watch__title">{selectedPreset.title}</h1>
              <p className="mage-watch__stats">
                {selectedPreset.plays}
                <span aria-hidden="true"> / </span>
                {selectedPreset.published}
                <span aria-hidden="true"> / </span>
                Preset {selectedPreset.id}
              </p>
            </div>

            <div className="mage-watch__channel-row">
              <div className="mage-channel-card">
                <div className="mage-channel-card__avatar">{selectedPreset.creator.slice(0, 1)}</div>
                <div className="mage-channel-card__copy">
                  <strong>{selectedPreset.creator}</strong>
                  <span>{selectedPreset.creatorRole}</span>
                </div>
              </div>

              <div className="mage-watch__actions">
                <button type="button" className="mage-primary-button" onClick={handlePlay}>Play Audio</button>
                <button type="button" className="mage-secondary-button" onClick={handlePause}>Pause</button>
                <button type="button" className="mage-secondary-button" onClick={() => setIsAudioModalOpen(true)}>
                  Load Track
                </button>
              </div>
            </div>

            <section className="mage-watch__description">
              <div className="mage-watch__description-bar">
                <span className="mage-watch__description-pill">{selectedPreset.plays}</span>
                <span className="mage-watch__description-pill">{selectedPreset.published}</span>
                <span className="mage-watch__description-pill">{audioSourceLabel}</span>
                <span className="mage-watch__description-pill" data-ready={isReady}>
                  {status}
                </span>
              </div>
              <p>{selectedPreset.teaser}</p>
              <p>{selectedPreset.description}</p>
              <div className="mage-tag-row">
                {selectedPreset.tags.map((tag) => (
                  <span key={tag} className="mage-tag">#{tag}</span>
                ))}
              </div>
            </section>

            <section className="mage-comments">
              <div className="mage-comments__header">
                <h2>Comments</h2>
                <span>{selectedPreset.comments.length}</span>
              </div>
              <div className="mage-comments__list">
                {selectedPreset.comments.map((comment) => (
                  <article key={`${comment.author}-${comment.posted}`} className="mage-comment">
                    <div className="mage-comment__avatar">{comment.author.slice(0, 1)}</div>
                    <div className="mage-comment__body">
                      <div className="mage-comment__meta">
                        <strong>{comment.author}</strong>
                        <span>{comment.posted}</span>
                      </div>
                      <p>{comment.text}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="mage-watch__rail">
            <div className="mage-watch__rail-header">
              <h2>Up Next</h2>
              <p>Click any preset to swap the current showcase.</p>
            </div>
            <div className="mage-watch__rail-list">
              {presetCatalog.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`mage-preset-card${preset.id === selectedPreset.id ? ' is-active' : ''}`}
                  onClick={() => {
                    void handlePresetSelection(preset.id)
                  }}
                >
                  <div
                    className="mage-preset-card__thumb"
                    style={{ '--preset-accent': preset.accent } as CSSProperties}
                  >
                    <span className="mage-preset-card__badge">Preset {preset.id}</span>
                    <span className="mage-preset-card__duration">{preset.duration}</span>
                  </div>
                  <div className="mage-preset-card__body">
                    <strong>{preset.title}</strong>
                    <span>{preset.creator}</span>
                    <span>{preset.plays}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>
        </section>
      </section>

      {isAudioModalOpen ? (
        <div className="mage-audio-modal" role="dialog" aria-modal="true" aria-labelledby="mage-audio-modal-title">
          <button type="button" className="mage-audio-modal__backdrop" aria-label="Close audio modal" onClick={() => setIsAudioModalOpen(false)} />
          <div className="mage-audio-modal__panel">
            <div className="mage-audio-modal__header">
              <div>
                <p className="eyebrow">Audio Source</p>
                <h2 id="mage-audio-modal-title">Load a Track</h2>
              </div>
              <button type="button" className="mage-secondary-button" onClick={() => setIsAudioModalOpen(false)}>
                Close
              </button>
            </div>

            <div className="mage-audio-modal__stack">
              <section className="mage-audio-modal__option">
                <h3>Choose a local file</h3>
                <p>Select an audio file from your machine. Local files start playback automatically after you pick one.</p>
                <button type="button" className="mage-primary-button" onClick={handlePickAudioFile}>
                  Choose File
                </button>
              </section>

              <section className="mage-audio-modal__option">
                <h3>Load from a website</h3>
                <p>Paste a direct audio URL. If the site blocks direct loading, the engine will not be able to play it.</p>
                <label className="mage-field">
                  <span>Website URL</span>
                  <input
                    type="url"
                    placeholder="https://example.com/track.mp3"
                    value={audioUrl}
                    onChange={(event) => setAudioUrl(event.target.value)}
                  />
                </label>
                <div className="mage-audio-modal__option-actions">
                  <button type="button" className="mage-primary-button" onClick={handleLoadAudioUrl}>
                    Load Website Audio
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      <input ref={audioInputRef} id="file" type="file" accept="audio/*" hidden onChange={handleAudioInputChange} />
    </main>
  )
}
