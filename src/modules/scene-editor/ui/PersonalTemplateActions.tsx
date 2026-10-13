import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@shared/ui'
import { PERSONAL_TEMPLATE_NAME_LIMIT, PersonalTemplateError, personalTemplateName, type PersonalTemplate } from '../personalTemplates'
import '../personalTemplates.css'

type Props = {
  selectedTemplate: PersonalTemplate | null
  canSave: boolean
  disabled?: boolean
  busy?: boolean
  onNew: () => void
  onSave: (name: string, template?: PersonalTemplate) => Promise<void>
  onRename: (template: PersonalTemplate, name: string) => Promise<void>
  onDelete: (template: PersonalTemplate) => Promise<void>
}
type Dialog = { mode: 'save' | 'update' | 'rename' | 'delete'; template?: PersonalTemplate }

const titles = { save: 'Save as template', update: 'Update template', rename: 'Rename template', delete: 'Delete template' }

export function PersonalTemplateActions({ selectedTemplate, canSave, disabled = false, busy = false, onNew, onSave, onRename, onDelete }: Props) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [placement, setPlacement] = useState({ top: 0, left: 0 })
  const initialMenuFocus = useRef<'first' | 'last'>('first')
  const modal = useRef<HTMLElement>(null)
  const mounted = useRef(true)
  const submitting = useRef(false)
  const restoreTriggerFocus = useRef(false)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<{ message: string; fields?: Record<string, string>; status?: number } | null>(null)
  const blocked = disabled || busy || pending
  const editableName = dialog?.mode === 'save' || dialog?.mode === 'rename'

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!dialog) return
    modal.current?.querySelector<HTMLElement>(editableName ? 'input' : '[data-cancel]')?.focus()
  }, [dialog, editableName])
  useEffect(() => {
    if (!dialog && !blocked && restoreTriggerFocus.current) {
      trigger.current?.focus()
      restoreTriggerFocus.current = false
    }
  }, [dialog, blocked])

  useLayoutEffect(() => {
    if (!menuOpen || !menu.current || !trigger.current) return
    function position() {
      const anchor = trigger.current!.getBoundingClientRect()
      const panel = menu.current!.getBoundingClientRect()
      const below = anchor.bottom + 6
      const above = anchor.top - panel.height - 6
      setPlacement({
        top: Math.max(8, Math.min(below + panel.height > window.innerHeight - 8 ? above : below, window.innerHeight - panel.height - 8)),
        left: Math.max(8, Math.min(anchor.right - panel.width, window.innerWidth - panel.width - 8)),
      })
    }
    position()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position)
    resizeObserver?.observe(menu.current)
    const items = menu.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    items[initialMenuFocus.current === 'last' ? items.length - 1 : 0]?.focus()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target) && !menu.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      document.removeEventListener('pointerdown', closeOutside)
    }
  }, [menuOpen])

  function closeMenu() {
    setMenuOpen(false)
    trigger.current?.focus()
  }
  function navigateMenu(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      // The portaled menu is outside the picker in DOM order; Tab continues from its trigger.
      const tabbable = event.key === 'Tab' ? Array.from(document.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
      )).filter(element => !menu.current?.contains(element) && element.tabIndex >= 0
        && !element.closest('[hidden], [inert]') && getComputedStyle(element).display !== 'none'
        && getComputedStyle(element).visibility !== 'hidden') : []
      const next = tabbable[tabbable.indexOf(trigger.current!) + (event.shiftKey ? -1 : 1)]
      closeMenu()
      next?.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[index]?.focus()
  }

  function open(mode: Dialog['mode'], template?: PersonalTemplate) {
    setMenuOpen(false)
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
        restoreTriggerFocus.current = true
        setDialog(null)
      }
    } catch (cause) {
      if (mounted.current) setFailure({ message: cause instanceof Error ? cause.message : 'The template action failed. Please try again.', fields: cause instanceof PersonalTemplateError ? cause.fields : undefined, status: cause instanceof PersonalTemplateError ? cause.status : undefined })
    } finally {
      submitting.current = false
      if (mounted.current) setPending(false)
    }
  }

  const dialogMarkup = dialog ? <div className="scene-editor-modal-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget) close()
  }}>
    <section className="scene-editor-modal personal-template-modal" role={dialog.mode === 'delete' ? 'alertdialog' : 'dialog'}
      aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onKeyDown={trapFocus} ref={modal}>
      <form onSubmit={event => { event.preventDefault(); event.stopPropagation(); void submit() }}>
        <h2 id={`${id}-title`}>{titles[dialog.mode]}</h2>
        <p id={`${id}-description`}>{dialog.mode === 'delete'
          ? `Delete “${dialog.template!.name}” from Your templates? The editor will switch to Prism Core at its default scale. Your other scene settings and saved scenes stay unchanged.`
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
    <button aria-label="Template actions" title="Template actions" className="scene-secondary-button scene-template-picker__actions"
      id="scene-template-actions" type="button" ref={trigger} disabled={blocked} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? `${id}-menu` : undefined}
      onClick={() => { initialMenuFocus.current = 'first'; setMenuOpen(value => !value) }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          initialMenuFocus.current = event.key === 'ArrowUp' ? 'last' : 'first'
          setMenuOpen(true)
        }
      }}>
      <AppIcon name="ellipsis" size={18} />
    </button>
    {menuOpen ? createPortal(<div className="builder-object-actions__menu personal-template-actions__menu" id={`${id}-menu`}
      role="menu" aria-label="Template actions" ref={menu} style={placement} onKeyDown={navigateMenu}>
      <button type="button" role="menuitem" onClick={() => { closeMenu(); onNew() }}>New template</button>
      <button type="button" role="menuitem" disabled={!canSave || blocked} onClick={() => open('save')}>Save as new template</button>
      {selectedTemplate ? <>
        <button type="button" role="menuitem" disabled={!canSave || blocked} onClick={() => open('update', selectedTemplate)}>Update template</button>
        <button type="button" role="menuitem" disabled={blocked} onClick={() => open('rename', selectedTemplate)}>Rename template</button>
        <button className="builder-object-actions__remove" type="button" role="menuitem" disabled={blocked} onClick={() => open('delete', selectedTemplate)}>Delete template</button>
      </> : null}
    </div>, root.current?.closest('.scene-editor-page') ?? document.body) : null}
    {dialogMarkup ? createPortal(dialogMarkup, root.current?.closest('.scene-editor-page') ?? document.body) : null}
  </div>
}
