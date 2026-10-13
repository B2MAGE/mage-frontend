import type { AuthenticatedFetch } from '@auth'
import { parseApiError } from '@shared/lib'
import { builderDesign, type BuilderDesign } from './builderDesign'

export const PERSONAL_TEMPLATE_NAME_LIMIT = 100

export type PersonalTemplate = {
  templateId: number
  name: string
  sceneData: BuilderDesign
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

export type SavePersonalTemplate = {
  name: string
  sceneData: BuilderDesign
  template?: PersonalTemplate
}

/** Save the Builder design directly; personal templates have no image assets. */
export async function savePersonalTemplate(authenticatedFetch: AuthenticatedFetch, input: SavePersonalTemplate, signal?: AbortSignal): Promise<PersonalTemplate> {
  signal?.throwIfAborted()
  const name = personalTemplateName(input.name)
  // This boundary selects only Builder fields, even when a caller passes a full scene.
  const sceneData = builderDesign(input.sceneData)
  const response = await checkedResponse(await authenticatedFetch(input.template ? `/builder-templates/${input.template.templateId}` : '/builder-templates', {
    method: input.template ? 'PUT' : 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, sceneData, ...(input.template ? { expectedRevision: input.template.revision } : {}) }),
  }), 'The template could not be saved. Your editor draft is unchanged.')
  return response.json()
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
