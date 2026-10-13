import { useCallback, useEffect, useRef, useState } from 'react'
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
  onLoad: (template: PersonalTemplate) => boolean
  onSaved: (template: PersonalTemplate, document: BuilderSceneDocument) => void
  onSourceChange: (source: PersonalTemplateSource) => void
  onDeleted: (templateId: number) => void
}

/** Owns library requests; the scene draft remains owned by its history. */
export function usePersonalTemplateWorkspace({ authenticatedFetch, userId, source, readDraft,
  onLoad, onSaved, onSourceChange, onDeleted }: Args) {
  const library = usePersonalTemplates({ authenticatedFetch, userId })
  const [notice, setNotice] = useState('')
  const dismissNotice = useCallback(() => setNotice(''), [])
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
    revision: source.revision } : null

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
    setNotice('')
    const saved = await library.save({ name, sceneData: builderDesign(document), template })
    if (!mounted.current || started !== request.current) return
    onSaved(saved, draft.sceneData)
    setNotice(`${template ? 'Updated' : 'Saved'} “${saved.name}”.`)
  }

  async function rename(template: PersonalTemplate, name: string) {
    const started = request.current
    setNotice('')
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
    setNotice('')
    await library.remove(template)
    if (!mounted.current || started !== request.current) return
    onDeleted(template.templateId)
    setNotice(`Deleted “${template.name}”.`)
  }

  return { ...library, selectedTemplate, notice, dismissNotice, loadError, isOpening, open, cancelOpen, save, rename, remove }
}
