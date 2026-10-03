import { describe, expect, it } from 'vitest'
import { sceneSubmissionErrors } from './sceneValidation'

describe('template submission field errors', () => {
  it('keeps server messages beside template controls and preserves metadata errors', () => {
    expect(sceneSubmissionErrors(400, { details: {
      name: 'Choose another name.',
      'sceneData.parameters.scale': 'Expected a finite number from 1 to 30.',
      'sceneData.settings.camera.fov': 'Expected a finite number from 20 to 100.',
      'sceneData.settings.tint.color': 'Expected a #RRGGBB color.',
    } })).toMatchObject({
      name: 'Choose another name.',
      fields: {
        'parameters.scale': 'Expected a finite number from 1 to 30.',
        'settings.camera.fov': 'Expected a finite number from 20 to 100.',
        'settings.tint.color': 'Expected a #RRGGBB color.',
      },
      sceneData: 'Scale: Expected a finite number from 1 to 30. FOV: Expected a finite number from 20 to 100. Tint color: Expected a #RRGGBB color.',
    })
  })

  it('leaves unknown-version and size errors actionable without inventing a supported field', () => {
    expect(sceneSubmissionErrors(400, { details: { 'sceneData.templateVersion': 'Unsupported version.' } }))
      .toMatchObject({ fields: { templateVersion: 'Unsupported version.' }, sceneData: 'Template version: Unsupported version.' })
    expect(sceneSubmissionErrors(413, null).form).toContain('512 KiB')
  })
})
