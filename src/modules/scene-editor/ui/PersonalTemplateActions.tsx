import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@shared/ui'
import { PERSONAL_TEMPLATE_NAME_LIMIT, PersonalTemplateError, personalTemplateName, type PersonalTemplate } from '../personalTemplates'
import '../personalTemplates.css'

type Props = {
  selectedTemplate: PersonalTemplate | null
  canSave: boolean
  disabled?: boolean
  busy?: boolean
  onSave: (name: string, template?: PersonalTemplate) => Promise<void>
  onRename: (template: PersonalTemplate, name: string) => Promise<void>
  onDelete: (template: PersonalTemplate) => Promise<void>
}
type Dialog = { mode: 'save' | 'update' | 'rename' | 'delete'; template?: PersonalTemplate }

const titles = { save: 'Save as template', update: 'Update template', rename: 'Rename template', delete: 'Delete template' }

export function PersonalTemplateActions({ selectedTemplate, canSave, disabled = false, busy = false, onSave, onRename, onDelete }: Props) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const modal = useRef<HTMLElement>(null)
  const mounted = useRef(true)
  const submitting = useRef(false)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<{ message: string; fields?: Record<string, string>; status?: number } | null>(null)
  const [brokenThumbnail, setBrokenThumbnail] = useState<string | null>(null)
  const blocked = disabled || busy || pending
  const editableName = dialog?.mode === 'save' || dialog?.mode === 'rename'

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!dialog) return
    modal.current?.querySelector<HTMLElement>(editableName ? 'input' : '[data-cancel]')?.focus()
  }, [dialog, editableName])

  function open(mode: Dialog['mode'], template?: PersonalTemplate) {
    trigger.current = document.activeElement as HTMLElement
    setName(mode === 'rename' ? template!.name : '')
    setFailure(null)
    setDialog({ mode, template })
  }
  function close() {
    if (submitting.current) return
    setDialog(null)
    trigger.current?.focus()
  }
  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key !== 'Tab') return
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href], [tabindex="0"]'))
    if (!controls.length) { event.preventDefault(); return }
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) {
      event.preventDefault(); last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || !event.currentTarget.contains(document.activeElement))) {
      event.preventDefault(); first.focus()
    }
  }
  async function submit() {
    if (!dialog || submitting.current || blocked) return
    setFailure(null)
    submitting.current = true
    setPending(true)
    try {
      if (dialog.mode === 'save') await onSave(personalTemplateName(name))
      else if (dialog.mode === 'update') await onSave(dialog.template!.name, dialog.template)
      else if (dialog.mode === 'rename') await onRename(dialog.template!, personalTemplateName(name))
      else await onDelete(dialog.template!)
      if (mounted.current) {
        setDialog(null)
        trigger.current?.focus()
      }
    } catch (cause) {
      if (mounted.current) setFailure({ message: cause instanceof Error ? cause.message : 'The template action failed. Please try again.', fields: cause instanceof PersonalTemplateError ? cause.fields : undefined, status: cause instanceof PersonalTemplateError ? cause.status : undefined })
    } finally {
      submitting.current = false
      if (mounted.current) setPending(false)
    }
  }

  const image = selectedTemplate?.thumbnailRef && selectedTemplate.thumbnailRef !== brokenThumbnail ? selectedTemplate.thumbnailRef : null
  const dialogMarkup = dialog ? <div className="scene-editor-modal-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget) close()
  }}>
    <section className="scene-editor-modal personal-template-modal" role={dialog.mode === 'delete' ? 'alertdialog' : 'dialog'}
      aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onKeyDown={trapFocus} ref={modal}>
      <form onSubmit={event => { event.preventDefault(); event.stopPropagation(); void submit() }}>
        <h2 id={`${id}-title`}>{titles[dialog.mode]}</h2>
        <p id={`${id}-description`}>{dialog.mode === 'delete'
          ? `Delete “${dialog.template!.name}” from Your templates? Scenes and drafts made from it will keep their own copies.`
          : dialog.mode === 'rename' ? 'Give this template a new name. Its saved design and existing scenes stay the same.'
            : dialog.mode === 'update' ? `Replace “${dialog.template!.name}” with your current Builder design—objects, groups, materials, animation and input bindings? Other scene sections stay unchanged, and existing scenes and drafts keep their own copies.`
              : 'Save your Builder design: objects, groups, materials, animation and input bindings. Camera, skybox, scene scale, Motion, Effects and other scene sections stay unchanged when you use it.'}</p>
        {editableName ? <div className="personal-template-modal__field">
          <label htmlFor={`${id}-name`}>Template name</label>
          <input id={`${id}-name`} type="text" maxLength={PERSONAL_TEMPLATE_NAME_LIMIT} value={name} disabled={blocked}
            aria-invalid={Boolean(failure?.fields?.name)} aria-describedby={`${id}-name-help${failure?.fields?.name ? ` ${id}-name-error` : ''}`}
            onChange={event => { setName(event.target.value); setFailure(null) }} />
          <small id={`${id}-name-help`}>Required · Up to {PERSONAL_TEMPLATE_NAME_LIMIT} characters · Use a unique name</small>
          {failure?.fields?.name ? <span id={`${id}-name-error`} className="personal-template-modal__error">{failure.fields.name}</span> : null}
        </div> : null}
        {dialog.mode === 'save' || dialog.mode === 'update' ? <p className="personal-template-modal__capture-note">A fresh thumbnail is captured from this scene. Its camera, surroundings, and effects aren't part of the saved design. If capture is unavailable, a placeholder is used.</p> : null}
        {failure ? <div className="personal-template-modal__error" role="alert">
          <p>{failure.message}</p>
          {Object.entries(failure.fields ?? {}).filter(([field]) => field !== 'name').map(([field, message]) => <p key={field}>{field}: {message}</p>)}
          {failure.status === 409 && dialog.mode !== 'save' && !failure.fields?.name ? <p>Your current draft is unchanged. Cancel and save it as a new template, or reselect the saved template to load its latest version before updating.</p> : null}
        </div> : null}
        <div className="auth-actions">
          <button className="scene-editor-confirm-submit" disabled={blocked} type="submit">{pending ? 'Working…' : titles[dialog.mode]}</button>
          <button className="scene-secondary-button" data-cancel disabled={pending} onClick={close} type="button">Cancel</button>
        </div>
      </form>
    </section>
  </div> : null

  return <div className="personal-template-actions" ref={root}>
    {selectedTemplate ? <div className="personal-template-actions__source">
      <div className="personal-template-actions__thumbnail" aria-label={image ? 'Saved template preview' : 'No saved template snapshot'}>
        {image ? <img src={image} alt="" onError={() => setBrokenThumbnail(image)} /> : <AppIcon name="images" size={20} />}
      </div>
      <div><span>Your template</span><strong>{selectedTemplate.name}</strong></div>
    </div> : null}
    <div className="personal-template-actions__buttons" aria-label="Template actions">
      <button className="scene-secondary-button" disabled={!canSave || blocked} type="button" onClick={() => open('save')}>
        {selectedTemplate ? 'Save as new template' : 'Save as template'}
      </button>
      {selectedTemplate ? <>
        <button className="scene-secondary-button" disabled={!canSave || blocked} type="button" onClick={() => open('update', selectedTemplate)}>Update template</button>
        <button className="scene-secondary-button" disabled={blocked} type="button" onClick={() => open('rename', selectedTemplate)}>Rename template</button>
        <button className="scene-secondary-button" disabled={blocked} type="button" onClick={() => open('delete', selectedTemplate)}>Delete template</button>
      </> : null}
    </div>
    {dialogMarkup ? createPortal(dialogMarkup, root.current?.closest('.scene-editor-page') ?? document.body) : null}
  </div>
}
