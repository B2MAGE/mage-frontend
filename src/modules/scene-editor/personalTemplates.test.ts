import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBuilderScene } from './builderEditor'
import { builderDesign } from './builderDesign'
import { deletePersonalTemplate, personalTemplateName, renamePersonalTemplate, savePersonalTemplate, type PersonalTemplate } from './personalTemplates'

const template = (): PersonalTemplate => ({ templateId: 7, name: 'My template', sceneData: builderDesign(createBuilderScene()), thumbnailRef: null, revision: 2, createdAt: '', updatedAt: '' })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const file = () => new File(['png'], 'preview.png', { type: 'image/png' })

afterEach(() => vi.unstubAllGlobals())

describe('personal template API', () => {
  it('trims names and rejects blank or oversized names before sending', async () => {
    expect(personalTemplateName('  Aurora  ')).toBe('Aurora')
    const request = vi.fn()
    for (const name of ['   ', 'a'.repeat(101)]) {
      await expect(savePersonalTemplate(request, { name, sceneData: builderDesign(createBuilderScene()), thumbnailFile: null })).rejects.toMatchObject({ fields: { name: expect.any(String) } })
    }
    expect(request).not.toHaveBeenCalled()
  })

  it('writes the Builder design with an independently uploaded fresh thumbnail', async () => {
    const saved = template()
    const request = vi.fn().mockResolvedValueOnce(json({ objectKey: 'pending/new.png', uploadUrl: 'https://storage.test/new', method: 'PUT', headers: { 'Content-Type': 'image/png' } })).mockResolvedValueOnce(json(saved))
    const storage = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', storage)
    const assertCurrent = vi.fn()
    const result = await savePersonalTemplate(request, { name: ' New name ', sceneData: saved.sceneData, thumbnailFile: file(), template: saved, assertCurrent })
    expect(result).toEqual(saved)
    expect(request.mock.calls[0][0]).toBe('/builder-templates/thumbnail/presign')
    expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ name: 'New name', sceneData: saved.sceneData, thumbnailObjectKey: 'pending/new.png', expectedRevision: 2 })
    expect(request.mock.calls[1][0]).toBe('/builder-templates/7')
    expect(storage.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'image/png' })
    expect(storage.mock.calls[0][1].body).toBeInstanceOf(File)
    expect(assertCurrent).toHaveBeenCalledTimes(2)
  })

  it('never sends camera, skybox, scale, motion or effects when passed a full scene', async () => {
    const scene = createBuilderScene()
    scene.settings = { ...scene.settings, skybox: 6 }
    scene.parameters = { ...scene.parameters, scale: 24 }
    const request = vi.fn().mockResolvedValue(json(template()))
    await savePersonalTemplate(request, { name: 'Design only', sceneData: scene, thumbnailFile: null })
    const body = JSON.parse(request.mock.calls[0][1].body)
    expect(body.sceneData).toEqual(builderDesign(scene))
    expect(body.sceneData).not.toHaveProperty('settings')
    expect(body.sceneData).not.toHaveProperty('parameters')
    expect(body.sceneData.objects).toEqual(scene.objects)
  })

  it('uses no stale thumbnail when capture is unavailable', async () => {
    const saved = { ...template(), thumbnailRef: 'old.png' }
    const request = vi.fn().mockResolvedValue(json(saved))
    await savePersonalTemplate(request, { name: saved.name, sceneData: saved.sceneData, thumbnailFile: null, template: saved })
    expect(request).toHaveBeenCalledOnce()
    expect(JSON.parse(request.mock.calls[0][1].body)).not.toHaveProperty('thumbnailObjectKey')
  })

  it.each(['upload', 'conflict', 'draft change'])('does not leave an abandoned image after %s failure', async failure => {
    const request = vi.fn().mockImplementation(async (path: string) => {
      if (path.endsWith('/presign')) return json({ objectKey: 'pending/new.png', uploadUrl: 'https://storage.test/new', method: 'PUT' })
      if (path.includes('/pending?')) return new Response(null, { status: 204 })
      return json({ message: 'Another tab updated this template.', details: { expectedRevision: 'Load the current template before updating.' } }, 409)
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: failure === 'upload' ? 500 : 200 })))
    const assertCurrent = vi.fn().mockImplementationOnce(() => {}).mockImplementation(() => { if (failure === 'draft change') throw new Error('Draft changed.') })
    const action = savePersonalTemplate(request, { name: 'Name', sceneData: builderDesign(createBuilderScene()), thumbnailFile: file(), assertCurrent })
    if (failure === 'conflict') await expect(action).rejects.toMatchObject({ status: 409, fields: { expectedRevision: expect.any(String) } })
    else await expect(action).rejects.toThrow(failure === 'upload' ? /could not be uploaded/ : /Draft changed/)
    expect(request).toHaveBeenCalledWith('/builder-templates/thumbnail/pending?objectKey=pending%2Fnew.png', { method: 'DELETE' })
    if (failure !== 'conflict') expect(request.mock.calls.some(([path]) => path === '/builder-templates')).toBe(false)
  })

  it('renames and deletes using the loaded revision without uploading or changing the scene document', async () => {
    const saved = template()
    const request = vi.fn().mockResolvedValueOnce(json({ ...saved, name: 'Renamed', revision: 3 })).mockResolvedValueOnce(new Response(null, { status: 204 }))
    const renamed = await renamePersonalTemplate(request, saved, ' Renamed ')
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ name: 'Renamed', expectedRevision: 2 })
    await deletePersonalTemplate(request, renamed)
    expect(request.mock.calls[1]).toEqual(['/builder-templates/7?expectedRevision=3', { method: 'DELETE', signal: undefined }])
  })
})
