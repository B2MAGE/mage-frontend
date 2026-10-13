import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BuilderSceneDocument } from '@modules/player'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import { createBuilderScene } from './builderEditor'
import { buildSceneEditorApiScene, mockCreateScenePageFetch, renderCreateScenePage, renderEditScenePage, storeSceneEditorSession,
  type SceneEditorFetchHandler } from './test-fixtures'

const capture = vi.fn<() => Promise<string | null>>()
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
vi.mock('@modules/player/availability/sceneAvailability', async () => ({
  sceneAvailabilityStore: (await import('@shared/test/sceneAvailability')).allowedSceneAvailability,
}))

type StoredDesign = Pick<BuilderSceneDocument, 'schemaVersion' | 'kind' | 'builderVersion' | 'objects' | 'composition' | 'rendering'>
type StoredTemplate = {
  templateId: number
  name: string
  sceneData: StoredDesign
  thumbnailRef: string | null
  revision: number
  createdAt: string
  updatedAt: string
}
type Mutation = { method: string; path: string; body: Record<string, unknown> }

function templateFixture(templateId = 17, name = 'Evening orbit'): StoredTemplate {
  const sceneData = createBuilderScene()
  sceneData.objects[0].name = 'Personal orb'
  return { templateId, name, sceneData: designOnly(sceneData), revision: 4,
    thumbnailRef: `https://cdn.example.com/builder-templates/${templateId}/old.png`,
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
  const uploads: RequestInit[] = []
  let rejection: { status: number; payload: unknown } | null = null
  let nextId = 30
  let nextUpload = 0
  const fetcher = mockCreateScenePageFetch((input, init) => {
    const url = String(input)
    const method = init?.method?.toUpperCase() ?? 'GET'
    if (url.startsWith('https://upload.example.com/builder-templates/') && method === 'PUT') {
      uploads.push(init!)
      return new Response(null, { status: 200 })
    }
    const prefix = buildApiUrl('/builder-templates')
    if (!url.startsWith(prefix)) return sceneHandler?.(input, init)
    const path = url.slice(prefix.length)
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    if (method === 'GET') {
      if (!path) return jsonResponse([...templates.values()])
      const template = templates.get(Number(path.slice(1)))
      return template ? jsonResponse(template) : jsonResponse({ message: 'Template not found.' }, 404)
    }
    if (path === '/thumbnail/presign') {
      const objectKey = `builder-templates/pending/new-${++nextUpload}.png`
      return jsonResponse({ objectKey, uploadUrl: `https://upload.example.com/${objectKey}`,
        method: 'PUT', headers: { 'Content-Type': 'image/png' } })
    }
    if (path.startsWith('/thumbnail')) return new Response(null, { status: 204 })
    mutations.push({ method, path, body })
    if (rejection) return jsonResponse(rejection.payload, rejection.status)
    if (method === 'POST' && !path) {
      const created = { templateId: nextId++, name: String(body.name),
        sceneData: structuredClone(body.sceneData) as StoredDesign,
        thumbnailRef: body.thumbnailObjectKey ? `https://cdn.example.com/${String(body.thumbnailObjectKey)}` : null,
        revision: 0, createdAt: '2026-10-13T13:00:00Z', updatedAt: '2026-10-13T13:00:00Z' }
      templates.set(created.templateId, created)
      return jsonResponse(created, 201)
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
      updated.thumbnailRef = body.thumbnailObjectKey ? `https://cdn.example.com/${String(body.thumbnailObjectKey)}` : null
    }
    templates.set(templateId, updated)
    return jsonResponse(updated)
  })
  return { templates, mutations, uploads, fetcher,
    reject: (status: number, payload: unknown) => { rejection = { status, payload } },
    allow: () => { rejection = null } }
}

beforeEach(() => {
  capture.mockReset().mockResolvedValue('data:image/png;base64,ZnJlc2gtcHJldmlldw==')
  storeSceneEditorSession()
})
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

const preview = (): BuilderSceneDocument => JSON.parse(screen.getByTestId('personal-template-preview').getAttribute('data-scene')!)
const selector = () => screen.getByRole('combobox', { name: 'Template' })
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
    await user.click(screen.getByRole('button', { name: 'Add new template' }))
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
    expect(selector()).toHaveDisplayValue('New Template')
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    await waitFor(() => expect(preview()).toEqual(applyDesign(saved, before)))
    expect(selector()).toHaveValue('personal:17')
  })

  it('uses an independent trimmed template name and freshly captures content instead of reusing the scene thumbnail', async () => {
    const server = templateServer()
    const user = userEvent.setup()
    renderCreateScenePage()
    fireEvent.change(await screen.findByLabelText(/scene name/i), { target: { value: 'Scene title is not the template name' } })
    await user.click(screen.getByRole('button', { name: 'Capture Thumbnail' }))
    await screen.findByAltText('Captured thumbnail preview')
    await openScene(user)
    await user.click(screen.getByRole('button', { name: 'Add new template' }))
    fireEvent.change(screen.getByLabelText('Name', { exact: true }), { target: { value: 'Newly edited orb' } })
    await waitFor(() => expect(preview().objects[0].name).toBe('Newly edited orb'))
    await customizeOtherSections(user)
    const expected = preview()
    capture.mockResolvedValueOnce('data:image/png;base64,cmVjYXB0dXJlZA==')
    await user.click(screen.getByRole('button', { name: 'Save as template' }))
    await nameAndSave(user, '  My reusable orbit  ')
    await waitFor(() => expect(server.mutations).toHaveLength(1))
    expect(server.mutations[0]).toEqual({ method: 'POST', path: '', body: {
      name: 'My reusable orbit', sceneData: designOnly(expected),
      thumbnailObjectKey: 'builder-templates/pending/new-1.png',
    } })
    expect(capture).toHaveBeenCalledTimes(2)
    expect(server.uploads).toHaveLength(1)
    expect(server.uploads[0].headers).not.toHaveProperty('Authorization')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
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
    await user.click(screen.getByRole('button', { name: 'Save as template' }))
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
    await user.click(screen.getByRole('button', { name: 'Update template' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Update template' })).getByRole('button', { name: 'Update template' }))
    await waitFor(() => expect(server.mutations).toHaveLength(1))
    expect(server.mutations[0]).toMatchObject({ method: 'PUT', path: '/17', body: {
      expectedRevision: 4, name: saved.name, sceneData: designOnly(edited),
    } })
    await screen.findByText(/changed elsewhere/i)
    expect(server.templates.get(17)).toEqual(saved)
    expect(preview()).toEqual(edited)
    expect(server.mutations).toHaveLength(1)
  })

  it('saves a documented placeholder when capture is unavailable without uploading an old scene image', async () => {
    const server = templateServer()
    const user = userEvent.setup()
    renderCreateScenePage()
    await screen.findByLabelText(/scene name/i)
    await user.click(screen.getByRole('button', { name: 'Capture Thumbnail' }))
    await screen.findByAltText('Captured thumbnail preview')
    await openScene(user)
    capture.mockResolvedValueOnce(null)
    await user.click(screen.getByRole('button', { name: 'Save as template' }))
    await nameAndSave(user, 'Without a snapshot')
    await waitFor(() => expect(server.templates.size).toBe(1))
    expect(server.templates.get(30)?.thumbnailRef).toBeNull()
    expect(server.uploads).toEqual([])
    expect(capture).toHaveBeenCalledTimes(2)
    expect(server.mutations[0].body.thumbnailObjectKey ?? null).toBeNull()
    expect(await screen.findByLabelText('No saved template snapshot')).toBeInTheDocument()
  })

  it('renames and deletes a library entry without recapturing or changing the open scene copy', async () => {
    const saved = templateFixture()
    const server = templateServer([saved])
    const user = userEvent.setup()
    renderCreateScenePage()
    await openScene(user)
    const loaded = await loadPersonal(user, saved)
    await user.click(screen.getByRole('button', { name: 'Rename template' }))
    const rename = screen.getByRole('dialog', { name: 'Rename template' })
    const name = within(rename).getByRole('textbox', { name: 'Template name' })
    await user.clear(name)
    await user.type(name, 'Dusk orbit')
    await user.click(within(rename).getByRole('button', { name: 'Rename template' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(server.mutations[0]).toEqual({ method: 'PATCH', path: '/17/name', body: { expectedRevision: 4, name: 'Dusk orbit' } })
    expect(server.templates.get(17)?.thumbnailRef).toBe(saved.thumbnailRef)
    expect(selector()).toHaveValue('personal:17')
    expect(preview()).toEqual(loaded)
    await user.click(screen.getByRole('button', { name: 'Delete template' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'Delete template' })
    expect(confirmation).toHaveTextContent(/keep their own copies/i)
    await user.click(within(confirmation).getByRole('button', { name: 'Delete template' }))
    await waitFor(() => expect(server.templates.size).toBe(0))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(within(selector()).queryByRole('option', { name: 'Dusk orbit' })).not.toBeInTheDocument()
    expect(preview()).toEqual(loaded)
    expect(capture).not.toHaveBeenCalled()
    expect(server.uploads).toEqual([])
    expect(server.mutations[1]).toMatchObject({ method: 'DELETE', path: '/17?expectedRevision=5' })
  })

  it('offers Save as new to duplicate a personal template instead of overwriting its original', async () => {
    const saved = templateFixture()
    const server = templateServer([saved])
    const user = userEvent.setup()
    renderCreateScenePage()
    await openScene(user)
    await loadPersonal(user, saved)
    await user.click(screen.getByRole('button', { name: 'Save as new template' }))
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
    const button = screen.getByRole('button', { name: 'Save as template' })
    button.focus()
    await user.keyboard('{Enter}')
    const dialog = screen.getByRole('dialog', { name: 'Save as template' })
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

  it('rejects a delayed thumbnail when the draft changes instead of saving mismatched content and image', async () => {
    const server = templateServer()
    const user = userEvent.setup()
    renderCreateScenePage()
    await openScene(user)
    await user.click(screen.getByRole('button', { name: 'Add new template' }))
    let finishCapture!: (value: string) => void
    capture.mockImplementationOnce(() => new Promise<string>(resolve => { finishCapture = resolve }))
    await user.click(screen.getByRole('button', { name: 'Save as template' }))
    await nameAndSave(user, 'Do not save an old snapshot')
    await waitFor(() => expect(capture).toHaveBeenCalledOnce())
    fireEvent.change(screen.getByLabelText('Name', { exact: true }), { target: { value: 'A newer draft' } })
    await waitFor(() => expect(preview().objects[0].name).toBe('A newer draft'))
    await act(async () => finishCapture('data:image/png;base64,b2xkLXByZXZpZXc='))
    expect(await screen.findByRole('alert')).toHaveTextContent(/changed|cancelled|current/i)
    expect(server.mutations).toEqual([])
    expect(server.templates.size).toBe(0)
    expect(preview().objects[0].name).toBe('A newer draft')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: 'Save as template' })).toBeEnabled()
  })

  it('treats only Builder design edits as an adaptation and warns only for those edits when switching personal templates', async () => {
    const saved = templateFixture()
    const second = templateFixture(18, 'Morning orbit')
    second.sceneData.objects[0].name = 'Morning orb'
    templateServer([saved, second])
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
    expect(selector()).toHaveDisplayValue('Morning orbit Adaptation')
    const edited = preview()
    await choosePersonal(user)
    const warning = await screen.findByRole('alertdialog')
    await user.click(within(warning).getByRole('button', { name: 'Cancel' }))
    expect(preview()).toEqual(edited)
    expect(selector()).toHaveDisplayValue('Morning orbit Adaptation')
  })
})
