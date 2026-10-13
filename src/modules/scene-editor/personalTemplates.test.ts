import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBuilderScene } from './builderEditor'
import { builderDesign } from './builderDesign'
import { deletePersonalTemplate, personalTemplateName, renamePersonalTemplate, savePersonalTemplate, type PersonalTemplate } from './personalTemplates'

const template = (): PersonalTemplate => ({ templateId: 7, name: 'My template', sceneData: builderDesign(createBuilderScene()), revision: 2, createdAt: '', updatedAt: '' })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('personal template API', () => {
  it('trims names and rejects blank or oversized names before sending', async () => {
    expect(personalTemplateName('  Aurora  ')).toBe('Aurora')
    const request = vi.fn()
    for (const name of ['   ', 'a'.repeat(101)]) {
      await expect(savePersonalTemplate(request, { name, sceneData: builderDesign(createBuilderScene()) })).rejects.toMatchObject({ fields: { name: expect.any(String) } })
    }
    expect(request).not.toHaveBeenCalled()
  })

  it.each([false, true])('saves design JSON in one request without thumbnail or storage requests (update: %s)', async update => {
    const saved = template()
    const request = vi.fn().mockResolvedValue(json(saved))
    const externalFetch = vi.fn()
    vi.stubGlobal('fetch', externalFetch)
    const result = await savePersonalTemplate(request, { name: ' New name ', sceneData: saved.sceneData, ...(update ? { template: saved } : {}) })
    expect(result).toEqual(saved)
    expect(request).toHaveBeenCalledOnce()
    expect(request.mock.calls[0][0]).toBe(update ? '/builder-templates/7' : '/builder-templates')
    expect(request.mock.calls[0][1].method).toBe(update ? 'PUT' : 'POST')
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ name: 'New name', sceneData: saved.sceneData, ...(update ? { expectedRevision: 2 } : {}) })
    expect(externalFetch).not.toHaveBeenCalled()
  })

  it('never sends camera, skybox, scale, motion or effects when passed a full scene', async () => {
    const scene = createBuilderScene()
    scene.settings = { ...scene.settings, skybox: 6 }
    scene.parameters = { ...scene.parameters, scale: 24 }
    const request = vi.fn().mockResolvedValue(json(template()))
    await savePersonalTemplate(request, { name: 'Design only', sceneData: scene })
    const body = JSON.parse(request.mock.calls[0][1].body)
    expect(body.sceneData).toEqual(builderDesign(scene))
    expect(body.sceneData).not.toHaveProperty('settings')
    expect(body.sceneData).not.toHaveProperty('parameters')
    expect(body.sceneData.objects).toEqual(scene.objects)
  })

  it('reports a revision conflict and its field details without retrying the write', async () => {
    const request = vi.fn().mockResolvedValue(json({ message: 'Another tab updated this template.', details: { expectedRevision: 'Load the current template before updating.' } }, 409))
    await expect(savePersonalTemplate(request, { name: 'Name', sceneData: builderDesign(createBuilderScene()), template: template() }))
      .rejects.toMatchObject({ status: 409, fields: { expectedRevision: 'Load the current template before updating.' } })
    expect(request).toHaveBeenCalledOnce()
  })

  it('does not send a cancelled request', async () => {
    const request = vi.fn()
    const controller = new AbortController()
    controller.abort()
    await expect(savePersonalTemplate(request, { name: 'Name', sceneData: builderDesign(createBuilderScene()) }, controller.signal)).rejects.toThrow()
    expect(request).not.toHaveBeenCalled()
  })

  it('renames and deletes using the loaded revision without changing the scene document', async () => {
    const saved = template()
    const request = vi.fn().mockResolvedValueOnce(json({ ...saved, name: 'Renamed', revision: 3 })).mockResolvedValueOnce(new Response(null, { status: 204 }))
    const renamed = await renamePersonalTemplate(request, saved, ' Renamed ')
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ name: 'Renamed', expectedRevision: 2 })
    await deletePersonalTemplate(request, renamed)
    expect(request.mock.calls[1]).toEqual(['/builder-templates/7?expectedRevision=3', { method: 'DELETE', signal: undefined }])
  })
})
