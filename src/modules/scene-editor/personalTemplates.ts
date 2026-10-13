import type { AuthenticatedFetch } from '@auth'
import type { BuilderSceneDocument } from '@modules/player'
import { parseApiError } from '@shared/lib'

export const PERSONAL_TEMPLATE_NAME_LIMIT = 100

export type PersonalTemplate = {
  templateId: number
  name: string
  sceneData: BuilderSceneDocument
  thumbnailRef: string | null
  revision: number
  createdAt: string
  updatedAt: string
}

export class PersonalTemplateError extends Error {
  readonly status: number
  readonly fields: Record<string, string>
  constructor(message: string, status = 0, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'PersonalTemplateError'
    this.status = status
    this.fields = fields
  }
}

export function personalTemplateName(name: string) {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > PERSONAL_TEMPLATE_NAME_LIMIT) {
    const message = !trimmed ? 'Enter a template name.' : `Use ${PERSONAL_TEMPLATE_NAME_LIMIT} characters or fewer.`
    throw new PersonalTemplateError(message, 400, { name: message })
  }
  return trimmed
}

async function checkedResponse(response: Response, fallback: string) {
  if (response.ok) return response
  const error = await parseApiError(response)
  throw new PersonalTemplateError(error?.message || fallback, response.status, error?.details)
}

export async function fetchPersonalTemplates(authenticatedFetch: AuthenticatedFetch, signal?: AbortSignal): Promise<PersonalTemplate[]> {
  const response = await checkedResponse(await authenticatedFetch('/builder-templates', { signal }), 'Your templates could not be loaded.')
  return response.json()
}

export async function fetchPersonalTemplate(authenticatedFetch: AuthenticatedFetch, templateId: number, signal?: AbortSignal): Promise<PersonalTemplate> {
  const response = await checkedResponse(await authenticatedFetch(`/builder-templates/${templateId}`, { signal }), 'This template could not be loaded.')
  return response.json()
}

async function discardPendingThumbnail(authenticatedFetch: AuthenticatedFetch, objectKey: string) {
  // The server only deletes unclaimed uploads. Never pass a scene or template's saved thumbnail here.
  try { await authenticatedFetch(`/builder-templates/thumbnail/pending?objectKey=${encodeURIComponent(objectKey)}`, { method: 'DELETE' }) }
  catch { /* The server expires abandoned pending uploads as a fallback. */ }
}

export type SavePersonalTemplate = {
  name: string
  sceneData: BuilderSceneDocument
  thumbnailFile: File | null
  template?: PersonalTemplate
  assertCurrent?: () => void
}

/** Upload a newly captured image, then atomically write the template document and image reference. */
export async function savePersonalTemplate(authenticatedFetch: AuthenticatedFetch, input: SavePersonalTemplate, signal?: AbortSignal): Promise<PersonalTemplate> {
  const name = personalTemplateName(input.name)
  // Keep the submitted document independent of the editor while the image is uploading.
  const sceneData = structuredClone(input.sceneData)
  let objectKey: string | undefined
  try {
    signal?.throwIfAborted()
    input.assertCurrent?.()
    if (input.thumbnailFile) {
      const file = input.thumbnailFile
      const response = await checkedResponse(await authenticatedFetch('/builder-templates/thumbnail/presign', {
        method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: file.size }),
      }), 'The template thumbnail upload could not be prepared.')
      const upload = await response.json() as { objectKey: string; uploadUrl: string; method: string; headers?: Record<string, string> }
      objectKey = upload.objectKey
      if (!objectKey || !upload.uploadUrl || !upload.method) throw new PersonalTemplateError('The thumbnail upload response was incomplete.')
      signal?.throwIfAborted()
      // Storage is a presigned endpoint, not the authenticated application API.
      const uploaded = await fetch(upload.uploadUrl, { method: upload.method, headers: upload.headers, body: file, signal })
      if (!uploaded.ok) throw new PersonalTemplateError('The template thumbnail could not be uploaded. Your template has not been saved.')
    }
    signal?.throwIfAborted()
    input.assertCurrent?.()
    const response = await checkedResponse(await authenticatedFetch(input.template ? `/builder-templates/${input.template.templateId}` : '/builder-templates', {
      method: input.template ? 'PUT' : 'POST', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sceneData, ...(input.template ? { expectedRevision: input.template.revision } : {}), ...(objectKey ? { thumbnailObjectKey: objectKey } : {}) }),
    }), 'The template could not be saved. Your editor draft is unchanged.')
    return response.json()
  } catch (error) {
    if (objectKey) await discardPendingThumbnail(authenticatedFetch, objectKey)
    throw error
  }
}

export async function renamePersonalTemplate(authenticatedFetch: AuthenticatedFetch, template: PersonalTemplate, name: string, signal?: AbortSignal): Promise<PersonalTemplate> {
  const response = await checkedResponse(await authenticatedFetch(`/builder-templates/${template.templateId}/name`, {
    method: 'PATCH', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: personalTemplateName(name), expectedRevision: template.revision }),
  }), 'The template could not be renamed.')
  return response.json()
}

export async function deletePersonalTemplate(authenticatedFetch: AuthenticatedFetch, template: PersonalTemplate, signal?: AbortSignal) {
  await checkedResponse(await authenticatedFetch(`/builder-templates/${template.templateId}?expectedRevision=${template.revision}`, {
    method: 'DELETE', signal,
  }), 'The template could not be deleted.')
}
