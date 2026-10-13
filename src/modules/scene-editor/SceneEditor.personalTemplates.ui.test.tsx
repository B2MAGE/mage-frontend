import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BuilderSceneDocument } from '@modules/player'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { createBuilderScene } from './builderEditor'
import { createBuilderRecipe } from './builderRecipes'
import { buildSceneEditorApiScene, mockCreateScenePageFetch, renderCreateScenePage, renderEditScenePage, storeSceneEditorSession,
  type SceneEditorFetchHandler } from './test-fixtures'

const capture = vi.fn<() => Promise<string | null>>()
const permission = vi.hoisted(() => ({
  allowed: true,
  available: Object.freeze({ allowed: true, code: 'AVAILABLE', message: '', checkedAt: 1 }),
  unavailable: Object.freeze({ allowed: false, code: 'SCENE_DISABLED', message: 'Playback is paused.', checkedAt: 1 }),
}))
vi.mock('@modules/player', async original => {
  const actual = await original<typeof import('@modules/player')>()
  const React = await import('react')
  return { ...actual, MagePlayer: ({ sceneBlob, onCaptureFramePreviewChange }: import('@modules/player').MagePlayerProps) => {
    React.useEffect(() => {
      onCaptureFramePreviewChange?.(capture)
      return () => onCaptureFramePreviewChange?.(null)
    }, [onCaptureFramePreviewChange])
    return <div data-testid="personal-template-preview" data-scene={JSON.stringify(sceneBlob)} />
  } }
})
vi.mock('@modules/player/availability/sceneAvailability', () => ({
  sceneAvailabilityStore: {
    getSnapshot: () => permission.allowed ? permission.available : permission.unavailable,
    isAllowed: () => permission.allowed,
    check: async () => permission.allowed ? permission.available : permission.unavailable,
    subscribe: () => () => {},
  },
}))

type StoredDesign = Pick<BuilderSceneDocument, 'schemaVersion' | 'kind' | 'builderVersion' | 'objects' | 'composition' | 'rendering'>
type StoredTemplate = {
  templateId: number
  name: string
  sceneData: StoredDesign
  revision: number
  createdAt: string
  updatedAt: string
}
type Mutation = { method: string; path: string; body: Record<string, unknown> }

function templateFixture(templateId = 17, name = 'Evening orbit'): StoredTemplate {
  const sceneData = createBuilderScene()
  sceneData.objects[0].name = 'Personal orb'
  return { templateId, name, sceneData: designOnly(sceneData), revision: 4,
    createdAt: '2026-10-13T12:00:00Z', updatedAt: '2026-10-13T12:00:00Z' }
}

function designOnly(document: BuilderSceneDocument): StoredDesign {
  const copy: Partial<BuilderSceneDocument> = structuredClone(document)
  delete copy.settings
  delete copy.parameters
  return copy as StoredDesign
}

function applyDesign(saved: StoredTemplate, current: BuilderSceneDocument): BuilderSceneDocument {
  return { ...saved.sceneData, parameters: current.parameters, settings: current.settings }
}

/** Exercise the real authenticated client, not a replacement library hook. */
function templateServer(initial: StoredTemplate[] = [], sceneHandler?: SceneEditorFetchHandler) {
  const templates = new Map(initial.map(template => [template.templateId, structuredClone(template)]))
  const mutations: Mutation[] = []
  let rejection: { status: number; payload: unknown } | null = null
  let nextId = 30
  let delayedCreate: Promise<void> | null = null
  const fetcher = mockCreateScenePageFetch((input, init) => {
    const url = String(input)
    const method = init?.method?.toUpperCase() ?? 'GET'
    const prefix = buildApiUrl('/builder-templates')
    if (!url.startsWith(prefix)) return sceneHandler?.(input, init)
    const path = url.slice(prefix.length)
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    if (method === 'GET') {
      if (!path) return jsonResponse([...templates.values()])
      const template = templates.get(Number(path.slice(1)))
      return template ? jsonResponse(template) : jsonResponse({ message: 'Template not found.' }, 404)
    }
    mutations.push({ method, path, body })
    if (rejection) return jsonResponse(rejection.payload, rejection.status)
    if (method === 'POST' && !path) {
      const created = { templateId: nextId++, name: String(body.name),
        sceneData: structuredClone(body.sceneData) as StoredDesign,
        revision: 0, createdAt: '2026-10-13T13:00:00Z', updatedAt: '2026-10-13T13:00:00Z' }
      templates.set(created.templateId, created)
      return delayedCreate ? delayedCreate.then(() => jsonResponse(created, 201)) : jsonResponse(created, 201)
    }
    const templateId = Number(path.split(/[/?]/)[1])
    const current = templates.get(templateId)
    if (!current) return jsonResponse({ message: 'Template not found.' }, 404)
    if (method === 'DELETE') {
      templates.delete(templateId)
      return new Response(null, { status: 204 })
    }
    const updated = { ...current, name: String(body.name), revision: current.revision + 1,
      updatedAt: '2026-10-13T13:00:00Z' }
    if (method === 'PUT') {
      updated.sceneData = structuredClone(body.sceneData) as StoredDesign
    }
    templates.set(templateId, updated)
    return jsonResponse(updated)
  })
  return { templates, mutations, fetcher,
    reject: (status: number, payload: unknown) => { rejection = { status, payload } },
    allow: () => { rejection = null },
    delayCreate: () => {
      let resolve!: () => void
      delayedCreate = new Promise<void>(finish => { resolve = finish })
      return resolve
    },
  }
}

beforeEach(() => {
  capture.mockReset().mockResolvedValue('data:image/png;base64,ZnJlc2gtcHJldmlldw==')
  permission.allowed = true
  storeSceneEditorSession()
})
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

const preview = (): BuilderSceneDocument => JSON.parse(screen.getByTestId('personal-template-preview').getAttribute('data-scene')!)
const selector = () => screen.getByRole('combobox', { name: 'Template' })
const yourTemplates = () => screen.getByRole('group', { name: 'Your templates' })
function expectSelectedDraft(name: RegExp) {
  const option = within(yourTemplates()).getByRole('option', { name })
  expect(option).toHaveProperty('selected', true)
  expect(within(screen.getByRole('group', { name: 'Built-in templates' })).queryByRole('option', { name })).not.toBeInTheDocument()
}
async function openScene(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByLabelText(/scene name/i)
  await user.click(screen.getByRole('button', { name: 'Scene' }))
}
async function choosePersonal(user: ReturnType<typeof userEvent.setup>, id = 17) {
  await screen.findByRole('option', { name: 'Evening orbit' })
  await user.selectOptions(selector(), `personal:${id}`)
}
async function loadPersonal(user: ReturnType<typeof userEvent.setup>, saved: StoredTemplate) {
  const expected = applyDesign(saved, preview())
  await choosePersonal(user, saved.templateId)
  await waitFor(() => expect(preview()).toEqual(expected))
  return expected
}
async function nameAndSave(user: ReturnType<typeof userEvent.setup>, name: string) {
  const dialog = screen.getByRole('dialog')
  const input = within(dialog).getByRole('textbox', { name: 'Template name' })
  await user.clear(input)
  await user.type(input, name)
  await user.click(within(dialog).getByRole('button', { name: /^Save/ }))
}
async function templateAction(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'Template actions' }))
  await user.click(screen.getByRole('menuitem', { name }))
}
async function customizeOtherSections(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(screen.getByLabelText('Scene Scale numeric value'), { target: { value: '8' } })
  await user.selectOptions(screen.getByLabelText('Skybox'), '3')
  await user.click(screen.getByRole('button', { name: 'Camera' }))
  fireEvent.change(screen.getByLabelText('FOV numeric value'), { target: { value: '72' } })
  fireEvent.change(screen.getByLabelText('Camera Position X'), { target: { value: '15' } })
  await user.click(screen.getByRole('button', { name: 'Motion' }))
  fireEvent.change(screen.getByLabelText('Animation speed'), { target: { value: '1.8' } })
  fireEvent.change(screen.getByLabelText('Input gain numeric value'), { target: { value: '0.7' } })
  await user.click(screen.getByRole('button', { name: 'Effects' }))
  const tint = screen.getByRole('checkbox', { name: 'Colorify' })
  if (!(tint as HTMLInputElement).checked) await user.click(tint)
  fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#abc123' } })
  await user.click(screen.getByRole('button', { name: 'Scene' }))
  await waitFor(() => expect(preview()).toMatchObject({ parameters: { scale: 8, speed: 1.8 }, settings: {
    skybox: 3, camera: { fov: 72 }, controls: { position0: { x: 15 } }, motion: { minimizing_factor: 0.7 },
    tint: { enabled: true, color: '#abc123' },
  } }))
}

describe('personal Builder designs in the scene editor', () => {
  it('labels each source and loads a concrete design copy without changing other sections or scene details', async () => {
    const saved = templateFixture()
    const server = templateServer([saved])
    const user = userEvent.setup()
    renderCreateScenePage()
    fireEvent.change(await screen.findByLabelText(/scene name/i), { target: { value: 'My published scene' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Scene-only description' } })
    await openScene(user)
    await customizeOtherSections(user)
    const previous = preview()
    expect(screen.queryByRole('button', { name: 'Add new template' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Template actions' })).toBeInTheDocument()
    await screen.findByRole('option', { name: 'Evening orbit' })
    expect(within(screen.getByRole('group', { name: 'Built-in templates' })).getByRole('option', { name: 'Prism Core' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Your templates' })).getByRole('option', { name: 'Evening orbit' })).toHaveValue('personal:17')
    await loadPersonal(user, saved)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(preview().settings).toEqual(previous.settings)
    expect(preview().parameters).toEqual(previous.parameters)
    expect(preview()).toMatchObject({ parameters: { scale: 8 }, settings: { skybox: 3,
      camera: { fov: 72 }, tint: { enabled: true, color: '#abc123' } } })
    fireEvent.change(screen.getByLabelText('Name', { exact: true }), { target: { value: 'Draft-only orb' } })
    await waitFor(() => expect(preview().objects[0].name).toBe('Draft-only orb'))
    expectSelectedDraft(/^Evening orbit.*Modified/)
    expect(within(yourTemplates()).getByRole('option', { name: 'Evening orbit' })).toHaveValue('personal:17')
    expect(server.templates.get(17)?.sceneData).toEqual(saved.sceneData)
    expect(server.mutations).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByLabelText(/scene name/i)).toHaveValue('My published scene')
    expect(screen.getByLabelText('Description')).toHaveValue('Scene-only description')
  })

  it('allows cancelling replacement of new work and makes accepted replacement undoable', async () => {
    const saved = templateFixture()
    templateServer([saved])
    const user = userEvent.setup()
    renderCreateScenePage()
    await openScene(user)
    await templateAction(user, 'New template')
    expectSelectedDraft(/^New Template.*Unsaved/)
    fireEvent.change(screen.getByLabelText('Name', { exact: true }), { target: { value: 'Keep this draft' } })
    await waitFor(() => expect(preview().objects[0].name).toBe('Keep this draft'))
    const before = preview()
    await choosePersonal(user)
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(preview()).toEqual(before)
    expect(selector()).toHaveFocus()
    await choosePersonal(user)
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^Use / }))
    await waitFor(() => expect(preview()).toEqual(applyDesign(saved, before)))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview()).toEqual(before))
    expectSelectedDraft(/^New Template.*Unsaved/)
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    await waitFor(() => expect(preview()).toEqual(applyDesign(saved, before)))
    expect(selector()).toHaveValue('personal:17')
  })

  it('saves only design and its trimmed name without capturing or uploading a template thumbnail', async () => {
    const server = templateServer()
    const user = userEvent.setup()
    renderCreateScenePage()
    fireEvent.change(await screen.findByLabelText(/scene name/i), { target: { value: 'Scene title is not the template name' } })
    await user.click(screen.getByRole('button', { name: 'Capture Thumbnail' }))
    await screen.findByAltText('Captured thumbnail preview')
    await openScene(user)
    await templateAction(user, 'New template')
    expectSelectedDraft(/^New Template.*Unsaved/)
    fireEvent.change(screen.getByLabelText('Name', { exact: true }), { target: { value: 'Newly edited orb' } })
    await waitFor(() => expect(preview().objects[0].name).toBe('Newly edited orb'))
    await customizeOtherSections(user)
    const expected = preview()
    capture.mockClear()
    await templateAction(user, 'Save as new template')
    await nameAndSave(user, '  My reusable orbit  ')
    await waitFor(() => expect(server.mutations).toHaveLength(1))
    expect(server.mutations[0]).toEqual({ method: 'POST', path: '', body: {
      name: 'My reusable orbit', sceneData: designOnly(expected),
    } })
    expect(capture).not.toHaveBeenCalled()
    expect(server.fetcher.mock.calls.some(([input]) => String(input).includes('/thumbnail/'))).toBe(false)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(selector()).toHaveValue('personal:30')
    expect(within(yourTemplates()).getAllByRole('option')).toHaveLength(1)
    expect(within(yourTemplates()).getByRole('option', { name: 'My reusable orbit' })).toHaveProperty('selected', true)
    expect(within(selector()).queryByRole('option', { name: /Unsaved|Modified/ })).not.toBeInTheDocument()
    expect(preview()).toEqual(expected)
    expect(server.templates.get(30)?.name).toBe('My reusable orbit')
    expect(server.templates.get(30)?.sceneData).not.toHaveProperty('settings')
    expect(server.templates.get(30)?.sceneData).not.toHaveProperty('parameters')
    expect(JSON.stringify(server.mutations[0].body)).not.toContain('Scene title is not the template name')
  })

  it('keeps the draft and name dialog on rejection, allowing an explicit corrected retry', async () => {
    const server = templateServer()
    const user = userEvent.setup()
    renderCreateScenePage()
    await openScene(user)
    const expected = preview()
    server.reject(409, { message: 'You already have a template with this name.', details: { name: 'Choose a different template name.' } })
    await templateAction(user, 'Save as new template')
    await nameAndSave(user, 'Evening orbit')
    expect(await screen.findByRole('alert')).toHaveTextContent(/already have a template with this name/i)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Template name' })).toHaveValue('Evening orbit')
    expect(preview()).toEqual(expected)
    expect(server.templates.size).toBe(0)
    server.allow()
    await nameAndSave(user, 'Evening orbit copy')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(server.templates.size).toBe(1)
    expect(server.templates.get(30)?.sceneData).toEqual(designOnly(expected))
  })

  it('does not overwrite a newer saved revision when an explicit template update conflicts', async () => {
    const saved = templateFixture()
    const server = templateServer([saved])
    const user = userEvent.setup()
    renderCreateScenePage()
    await openScene(user)
    await loadPersonal(user, saved)
    fireEvent.change(screen.getByLabelText('Name', { exact: true }), { target: { value: 'Unsaved changes' } })
    await waitFor(() => expect(preview().objects[0].name).toBe('Unsaved changes'))
    const edited = preview()
    server.reject(409, { message: 'This template was changed elsewhere. Reload it before updating.' })
    await templateAction(user, 'Update template')
    await user.click(within(screen.getByRole('dialog', { name: 'Update template' })).getByRole('button', { name: 'Update template' }))
    await waitFor(() => expect(server.mutations).toHaveLength(1))
    expect(server.mutations[0]).toMatchObject({ method: 'PUT', path: '/17', body: {
      expectedRevision: 4, name: saved.name, sceneData: designOnly(edited),
    } })
    await screen.findByText(/changed elsewhere/i)
    expectSelectedDraft(/^Evening orbit.*Modified/)
    expect(server.templates.get(17)).toEqual(saved)
    expect(preview()).toEqual(edited)
    expect(server.mutations).toHaveLength(1)
  })

  it('allows design saving and updating when the scene preview and its capture are unavailable', async () => {
    const server = templateServer()
    const user = userEvent.setup()
    permission.allowed = false
    capture.mockRejectedValue(new Error('No rendered frame is available.'))
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    expect(screen.getByRole('button', { name: 'Capture Thumbnail' })).toBeDisabled()
    await openScene(user)
    await templateAction(user, 'Save as new template')
    await nameAndSave(user, 'Without a snapshot')
    await waitFor(() => expect(server.templates.size).toBe(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await templateAction(user, 'Update template')
    await user.click(within(screen.getByRole('dialog', { name: 'Update template' })).getByRole('button', { name: 'Update template' }))
    await waitFor(() => expect(server.mutations).toHaveLength(2))
    expect(capture).not.toHaveBeenCalled()
    expect(server.fetcher.mock.calls.some(([input]) => String(input).includes('/thumbnail/'))).toBe(false)
    expect(server.mutations[0].body).not.toHaveProperty('thumbnailObjectKey')
    expect(server.mutations[1].body).not.toHaveProperty('thumbnailObjectKey')
    expect(screen.queryByLabelText('Saved template preview')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('No saved template snapshot')).not.toBeInTheDocument()
  })

  it('renames a template then switches to a built-in design after deletion while preserving other scene sections', async () => {
    const saved = templateFixture()
    const server = templateServer([saved])
    const user = userEvent.setup()
    renderCreateScenePage()
    fireEvent.change(await screen.findByLabelText(/scene name/i), { target: { value: 'My independent scene' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Keep these scene details.' } })
    await openScene(user)
    await customizeOtherSections(user)
    const loaded = await loadPersonal(user, saved)
    await templateAction(user, 'Rename template')
    const rename = screen.getByRole('dialog', { name: 'Rename template' })
    const name = within(rename).getByRole('textbox', { name: 'Template name' })
    await user.clear(name)
    await user.type(name, 'Dusk orbit')
    await user.click(within(rename).getByRole('button', { name: 'Rename template' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(server.mutations[0]).toEqual({ method: 'PATCH', path: '/17/name', body: { expectedRevision: 4, name: 'Dusk orbit' } })
    expect(selector()).toHaveValue('personal:17')
    expect(preview()).toEqual(loaded)
    const renamedNotice = await screen.findByText('Renamed template to “Dusk orbit”.')
    expect(renamedNotice).toHaveAttribute('role', 'status')
    expect(renamedNotice.closest('form')).toBeNull()
    expect(screen.getByRole('button', { name: 'Template actions' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(renamedNotice).not.toBeInTheDocument()
    expect(selector()).toHaveValue('personal:17')
    expect(preview()).toEqual(loaded)
    await templateAction(user, 'Delete template')
    const confirmation = screen.getByRole('alertdialog', { name: 'Delete template' })
    expect(confirmation).toHaveTextContent('The editor will switch to Prism Core at its default scale.')
    expect(confirmation).toHaveTextContent('Your other scene settings and saved scenes stay unchanged.')
    await user.click(within(confirmation).getByRole('button', { name: 'Delete template' }))
    await waitFor(() => expect(server.templates.size).toBe(0))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(within(selector()).queryByRole('option', { name: /Dusk orbit/ })).not.toBeInTheDocument()
    expect(selector()).toHaveValue('embedded-scene-0')
    expect(selector()).toHaveDisplayValue('Prism Core')
    expect(screen.queryByRole('group', { name: 'Your templates' })).not.toBeInTheDocument()
    await waitFor(() => expect(designOnly(preview())).toEqual(designOnly(createBuilderRecipe('embedded-scene-0'))))
    expect(preview().settings).toEqual(loaded.settings)
    expect(preview().parameters).toEqual({ ...loaded.parameters,
      scale: createBuilderRecipe('embedded-scene-0').parameters.scale })
    expect(capture).not.toHaveBeenCalled()
    expect(server.mutations[1]).toMatchObject({ method: 'DELETE', path: '/17?expectedRevision=5' })
    const deletedNotice = await screen.findByText('Deleted “Dusk orbit”.')
    expect(deletedNotice).toHaveAttribute('role', 'status')
    expect(deletedNotice.closest('form')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(deletedNotice).not.toBeInTheDocument()
    expect(selector()).toHaveValue('embedded-scene-0')
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByLabelText(/scene name/i)).toHaveValue('My independent scene')
    expect(screen.getByLabelText('Description')).toHaveValue('Keep these scene details.')
  })

  it('keeps the selected template and its edited design when deletion fails', async () => {
    const saved = templateFixture()
    const server = templateServer([saved])
    const user = userEvent.setup()
    renderCreateScenePage()
    await openScene(user)
    await loadPersonal(user, saved)
    fireEvent.change(screen.getByLabelText('Name', { exact: true }), { target: { value: 'Keep these object edits' } })
    await waitFor(() => expect(preview().objects[0].name).toBe('Keep these object edits'))
    const edited = preview()
    server.reject(500, { message: 'Templates could not be deleted. Try again.' })
    await templateAction(user, 'Delete template')
    const confirmation = screen.getByRole('alertdialog', { name: 'Delete template' })
    await user.click(within(confirmation).getByRole('button', { name: 'Delete template' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Templates could not be deleted. Try again.')
    expect(server.templates.get(17)).toEqual(saved)
    expect(preview()).toEqual(edited)
    expectSelectedDraft(/^Evening orbit.*Modified/)
    expect(screen.queryByRole('button', { name: 'Dismiss notification' })).not.toBeInTheDocument()
    await user.click(within(confirmation).getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Template actions' }))
    expect(screen.getByRole('menuitem', { name: 'Update template' })).toBeEnabled()
    expect(preview()).toEqual(edited)
  })

  it('offers Save as new to duplicate a personal template instead of overwriting its original', async () => {
    const saved = templateFixture()
    const server = templateServer([saved])
    const user = userEvent.setup()
    renderCreateScenePage()
    await openScene(user)
    await loadPersonal(user, saved)
    await templateAction(user, 'Save as new template')
    await nameAndSave(user, 'Second orbit')
    await waitFor(() => expect(server.templates.size).toBe(2))
    expect(server.templates.get(17)).toEqual(saved)
    expect(server.templates.get(30)?.sceneData).toEqual(saved.sceneData)
    expect(server.mutations[0]).toMatchObject({ method: 'POST', path: '', body: { name: 'Second orbit' } })
    expect(server.mutations[0].body).not.toHaveProperty('expectedRevision')
  })

  it('supports keyboard naming and cancellation while rejecting blank names before capture or network changes', async () => {
    const server = templateServer()
    const user = userEvent.setup()
    renderCreateScenePage()
    await openScene(user)
    const button = screen.getByRole('button', { name: 'Template actions' })
    button.focus()
    await user.keyboard('{Enter}')
    const save = screen.getByRole('menuitem', { name: 'Save as new template' })
    save.focus()
    await user.keyboard('{Enter}')
    const dialog = screen.getByRole('dialog', { name: /^Save/ })
    const input = within(dialog).getByRole('textbox', { name: 'Template name' })
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('maxlength', '100')
    await user.type(input, '   ')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i)
    expect(server.mutations).toEqual([])
    expect(capture).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('keeps newer draft edits when an earlier template save finishes', async () => {
    const server = templateServer()
    const user = userEvent.setup()
    renderCreateScenePage()
    await openScene(user)
    await templateAction(user, 'New template')
    await waitFor(() => expect(preview().objects).toHaveLength(1))
    const original = preview()
    const finishSave = server.delayCreate()
    await templateAction(user, 'Save as new template')
    await nameAndSave(user, 'A saved design')
    await waitFor(() => expect(server.mutations).toHaveLength(1))
    fireEvent.change(screen.getByLabelText('Name', { exact: true }), { target: { value: 'A newer draft' } })
    await waitFor(() => expect(preview().objects[0].name).toBe('A newer draft'))
    await act(async () => finishSave())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(server.templates.get(30)?.sceneData).toEqual(designOnly(original))
    expect(preview().objects[0].name).toBe('A newer draft')
    expect(capture).not.toHaveBeenCalled()
  })

  it('publishes and reopens its own Builder document after the originating template is deleted', async () => {
    const saved = templateFixture()
    let submittedScene: Record<string, unknown> | undefined
    const server = templateServer([saved], (input, init) => {
      if (input === buildApiUrl('/scenes') && init?.method === 'POST') {
        submittedScene = JSON.parse(String(init.body)) as Record<string, unknown>
        return jsonResponse({ sceneId: 12, revision: 0 })
      }
      if (input === buildApiUrl('/scenes/12')) return jsonResponse(buildSceneEditorApiScene({
        name: submittedScene?.name, sceneData: submittedScene?.sceneData,
      }))
      return undefined
    })
    const user = userEvent.setup()
    const editor = renderCreateScenePage()
    fireEvent.change(await screen.findByLabelText(/scene name/i), { target: { value: 'An independent scene' } })
    await openScene(user)
    const loaded = await loadPersonal(user, saved)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^create scene$/i }))
    await screen.findByText('My Scenes')
    expect(capture).toHaveBeenCalledOnce()
    expect(submittedScene?.thumbnailObjectKey).toBe('scenes/pending/default/thumbnails/scene-preview-thumbnail.png')
    expect(submittedScene?.sceneData).toEqual(loaded)
    expect(submittedScene).not.toHaveProperty('personalTemplateSource')
    expect(submittedScene?.sceneData).not.toHaveProperty('personalTemplateSource')
    expect(submittedScene?.sceneData).not.toHaveProperty('templateId')
    expect(submittedScene?.sceneData).not.toHaveProperty('templateSourceId')
    editor.unmount()
    server.templates.delete(saved.templateId)
    renderEditScenePage()
    expect(await screen.findByLabelText(/scene name/i)).toHaveValue('An independent scene')
    await waitFor(() => expect(preview()).toEqual(loaded))
    await user.click(screen.getByRole('button', { name: 'Scene' }))
    expect(within(selector()).queryByRole('option', { name: saved.name })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Template actions' }))
    expect(screen.getByRole('menuitem', { name: 'Save as new template' })).toBeEnabled()
  })

  it('treats only Builder design edits as an adaptation and warns only for those edits when switching personal templates', async () => {
    const saved = templateFixture()
    const second = templateFixture(18, 'Morning orbit')
    second.sceneData.objects[0].name = 'Morning orb'
    const server = templateServer([saved, second])
    const user = userEvent.setup()
    renderCreateScenePage()
    await openScene(user)
    await loadPersonal(user, saved)
    await customizeOtherSections(user)
    const settings = preview().settings
    const parameters = preview().parameters
    expect(selector()).toHaveValue('personal:17')
    expect(selector()).toHaveDisplayValue('Evening orbit')
    await loadPersonal(user, second)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(selector()).toHaveDisplayValue('Morning orbit')
    expect(preview().settings).toEqual(settings)
    expect(preview().parameters).toEqual(parameters)
    await user.click(screen.getByRole('button', { name: 'Add object' }))
    await waitFor(() => expect(preview().objects).toHaveLength(2))
    expectSelectedDraft(/^Morning orbit.*Modified/)
    expect(within(yourTemplates()).getByRole('option', { name: 'Morning orbit' })).toHaveValue('personal:18')
    const edited = preview()
    await user.selectOptions(selector(), 'personal:18')
    const warning = await screen.findByRole('alertdialog')
    await user.click(within(warning).getByRole('button', { name: 'Cancel' }))
    expect(preview()).toEqual(edited)
    expectSelectedDraft(/^Morning orbit.*Modified/)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview().objects).toHaveLength(1))
    expect(selector()).toHaveValue('personal:18')
    expect(within(yourTemplates()).getAllByRole('option')).toHaveLength(2)
    expect(within(selector()).queryByRole('option', { name: /Modified/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    await waitFor(() => expect(preview()).toEqual(edited))
    expectSelectedDraft(/^Morning orbit.*Modified/)
    await templateAction(user, 'Update template')
    await user.click(within(screen.getByRole('dialog', { name: 'Update template' })).getByRole('button', { name: 'Update template' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(server.templates.get(18)?.sceneData).toEqual(designOnly(edited))
    expect(selector()).toHaveValue('personal:18')
    expect(selector()).toHaveDisplayValue('Morning orbit')
    expect(within(yourTemplates()).getAllByRole('option')).toHaveLength(2)
    expect(within(selector()).queryByRole('option', { name: /Modified/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview().objects).toHaveLength(1))
    expectSelectedDraft(/^Morning orbit.*Modified/)
    expect(server.templates.get(18)?.sceneData).toEqual(designOnly(edited))
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    await waitFor(() => expect(preview()).toEqual(edited))
    expect(selector()).toHaveValue('personal:18')
    expect(within(selector()).queryByRole('option', { name: /Modified/ })).not.toBeInTheDocument()
    expect(server.mutations).toHaveLength(1)
  })

  it('puts an unsaved built-in adaptation in Your templates and removes that draft row when the design edit is undone', async () => {
    templateServer()
    const user = userEvent.setup()
    renderCreateScenePage()
    await openScene(user)
    await customizeOtherSections(user)
    expect(selector()).toHaveDisplayValue('Prism Core')
    expect(screen.queryByRole('group', { name: 'Your templates' })).not.toBeInTheDocument()
    const original = preview()
    await user.click(screen.getByRole('button', { name: 'Add object' }))
    await waitFor(() => expect(preview().objects).toHaveLength(original.objects.length + 1))
    expectSelectedDraft(/^Prism Core Adaptation.*Unsaved/)
    expect(within(screen.getByRole('group', { name: 'Built-in templates' })).getByRole('option', { name: 'Prism Core' })).toHaveValue('embedded-scene-0')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(preview()).toEqual(original))
    expect(selector()).toHaveDisplayValue('Prism Core')
    expect(screen.queryByRole('group', { name: 'Your templates' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expectSelectedDraft(/^Prism Core Adaptation.*Unsaved/)
    await templateAction(user, 'Save as new template')
    await nameAndSave(user, 'My prism design')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(selector()).toHaveDisplayValue('My prism design')
    expect(within(yourTemplates()).getAllByRole('option')).toHaveLength(1)
    expect(within(selector()).queryByRole('option', { name: /Unsaved|Modified/ })).not.toBeInTheDocument()
  })
})
