import { useEffect, useRef, useState } from 'react'
import type { AuthenticatedFetch } from '@auth'
import type { BuilderSceneDocument } from '@modules/player'
import { isBuilderEditorDocument } from './builderEditor'
import type { PersonalTemplate } from './personalTemplates'
import type { PersonalTemplateSource, SceneDraftSnapshot } from './sceneDraftRecovery'
import { usePersonalTemplates } from './usePersonalTemplates'
import { buildSceneSubmissionDocument } from './utils'
import { builderDesign } from './builderDesign'

type Args = {
  authenticatedFetch: AuthenticatedFetch
  userId?: number | null
  source: PersonalTemplateSource | null
  readDraft: () => SceneDraftSnapshot
  captureThumbnail: () => Promise<File>
  onLoad: (template: PersonalTemplate) => boolean
  onSaved: (template: PersonalTemplate, document: BuilderSceneDocument) => void
  onSourceChange: (source: PersonalTemplateSource) => void
}

/** Owns library requests and capture; the scene draft remains owned by its history. */
export function usePersonalTemplateWorkspace({ authenticatedFetch, userId, source, readDraft,
  captureThumbnail, onLoad, onSaved, onSourceChange }: Args) {
  const library = usePersonalTemplates({ authenticatedFetch, userId })
  const [notice, setNotice] = useState('')
  const [loadError, setLoadError] = useState('')
  const [isOpening, setIsOpening] = useState(false)
  const request = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; request.current += 1 }
  }, [userId])
  const listed = source ? library.templates.find(item => item.templateId === source.templateId) : undefined
  // Keep the revision actually loaded by this editor, so another tab's updates conflict safely.
  const selectedTemplate = listed && source ? { ...listed, name: source.name,
    revision: source.revision, thumbnailRef: source.thumbnailRef } : null

  async function open(templateId: number) {
    const started = ++request.current
    const draft = readDraft()
    setIsOpening(true)
    setLoadError('')
    setNotice('')
    try {
      const template = await library.load(templateId)
      if (started !== request.current) return false
      if (readDraft() !== draft) throw new Error('The editor changed while the template was loading. Your work was kept; choose the template again when ready.')
      return onLoad(template)
    } catch (error) {
      if (started === request.current) setLoadError(error instanceof Error ? error.message : 'Could not open this template. Your scene was kept.')
      return false
    } finally {
      if (started === request.current) setIsOpening(false)
    }
  }

  function cancelOpen() {
    request.current += 1
    setIsOpening(false)
  }

  async function save(name: string, template?: PersonalTemplate) {
    const started = request.current
    const draft = readDraft()
    if (!isBuilderEditorDocument(draft.sceneData)) throw new Error('Open an editable Builder template first.')
    const document = buildSceneSubmissionDocument(draft.sceneData)
    if (document.kind !== 'builder') throw new Error('Only Builder templates can be saved.')
    const assertCurrent = () => {
      const current = readDraft()
      if (!mounted.current || started !== request.current || current.sceneData !== draft.sceneData || current.sceneDataText !== draft.sceneDataText) {
        throw new Error('The scene changed while the template was being saved. Your edits were kept. Save again to use the current scene.')
      }
    }
    setNotice('')
    let thumbnailFile: File | null = null
    try { thumbnailFile = await captureThumbnail() }
    catch { /* An unavailable preview has an explicit placeholder, never an old scene image. */ }
    assertCurrent()
    const saved = await library.save({ name, sceneData: builderDesign(document), thumbnailFile, template, assertCurrent })
    if (!mounted.current || started !== request.current) return
    onSaved(saved, draft.sceneData)
    setNotice(thumbnailFile ? `Saved “${saved.name}” with a fresh thumbnail.`
      : `Saved “${saved.name}” without a thumbnail because the preview could not be captured. Update it when the preview is ready to add one.`)
  }

  async function rename(template: PersonalTemplate, name: string) {
    const started = request.current
    const renamed = await library.rename(template, name)
    if (!mounted.current || started !== request.current) return
    const currentSource = readDraft().personalTemplateSource
    if (currentSource?.templateId === template.templateId) {
      onSourceChange({ ...currentSource, name: renamed.name, revision: renamed.revision })
    }
    setNotice(`Renamed template to “${renamed.name}”.`)
  }

  async function remove(template: PersonalTemplate) {
    const started = request.current
    await library.remove(template)
    if (mounted.current && started === request.current) setNotice(`Deleted “${template.name}” from your templates. Your open scene and saved scenes are unchanged.`)
  }

  return { ...library, selectedTemplate, notice, loadError, isOpening, open, cancelOpen, save, rename, remove }
}
