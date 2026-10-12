import { describe, expect, it } from 'vitest'
import { createBuilderScene } from './builderEditor'
import { BUILDER_RECIPES, createBuilderRecipe } from './builderRecipes'
import { createTemplateScene } from './templateEditor'
import { builderWorkspaceAdapted, openTemplateWorkspace } from './templateWorkspace'

describe('template-driven Builder workspace', () => {
  it.each(BUILDER_RECIPES)('opens the $label representation with current scene settings', ({ templateId }) => {
    const template = createTemplateScene(templateId)
    template.parameters = { scale: 27, speed: 0.4 }
    template.settings.skybox = 2
    template.settings.camera.fov = 49
    template.settings.bloom = { enabled: true, strength: 0.9, radius: 0.4, threshold: 0.6 }
    const before = structuredClone(template)

    const workspace = openTemplateWorkspace(template)
    expect(workspace.templateSourceId).toBe(templateId)
    expect(workspace.document).toEqual(createBuilderRecipe(templateId, template.settings, template.parameters))
    expect(workspace.document.settings).toEqual(template.settings)
    expect(workspace.document.parameters).toEqual(template.parameters)
    expect(template).toEqual(before)
  })

  it('keeps unsupported catalog templates and custom scenes unchanged', () => {
    const template = createTemplateScene('embedded-scene-0')
    expect(openTemplateWorkspace(template)).toEqual({ document: template, templateSourceId: template.templateId })
    expect(openTemplateWorkspace(template).document).toBe(template)
    const custom = { visualizer: { shader: 'sphere(1)' } }
    expect(openTemplateWorkspace(custom)).toEqual({ document: custom, templateSourceId: null })
    expect(openTemplateWorkspace(custom).document).toBe(custom)
  })

  it('retains repairable settings errors when opening a template or checking its adaptation', () => {
    const template = createTemplateScene('embedded-scene-5')
    template.settings.camera.fov = 200
    template.parameters.scale = -2
    const workspace = openTemplateWorkspace(template)
    expect(workspace.document.settings).toEqual(template.settings)
    expect(workspace.document.parameters).toEqual(template.parameters)
    const builder = createBuilderRecipe('embedded-scene-5')
    builder.settings = structuredClone(template.settings)
    builder.parameters = structuredClone(template.parameters)
    expect(workspace.document).toEqual(builder)
    expect(builderWorkspaceAdapted(builder, 'embedded-scene-5')).toBe(false)
  })

  it('preserves saved Builder edits and uses stable recipe IDs only to suggest a label', () => {
    const builder = createBuilderRecipe('embedded-scene-5')
    builder.objects[0].name = 'My edited shell'
    builder.objects[0].transform.position.x = 3
    builder.objects.push(createBuilderScene().objects[0])
    const workspace = openTemplateWorkspace(builder)
    expect(workspace.document).toBe(builder)
    expect(workspace.templateSourceId).toBe('embedded-scene-5')
    expect(builderWorkspaceAdapted(builder, workspace.templateSourceId)).toBe(true)
  })

  it('does not guess an origin for a new scene, mixed recipes, or unknown IDs', () => {
    const builder = createBuilderScene()
    expect(openTemplateWorkspace(builder)).toEqual({ document: builder, templateSourceId: null })
    const mixed = createBuilderRecipe('embedded-scene-5')
    mixed.objects.push({ ...builder.objects[0], id: 'recipe-8-imported' })
    expect(openTemplateWorkspace(mixed).templateSourceId).toBeNull()
    builder.objects[0].id = 'recipe-999-object-1'
    expect(openTemplateWorkspace(builder).templateSourceId).toBeNull()
  })

  it('only marks Builder changes as adaptations and clears the label when those edits are reversed', () => {
    const original = createBuilderRecipe('embedded-scene-5')
    const builder = structuredClone(original)
    builder.settings.skybox = 2
    builder.settings.camera.fov = 45
    builder.parameters = { scale: 19, speed: 0.7 }
    expect(builderWorkspaceAdapted(builder, 'embedded-scene-5')).toBe(false)

    builder.objects[0].transform.position.x = 2
    expect(builderWorkspaceAdapted(builder, 'embedded-scene-5')).toBe(true)
    builder.objects = structuredClone(original.objects)
    expect(builderWorkspaceAdapted(builder, 'embedded-scene-5')).toBe(false)

    builder.rendering!.maxIterations += 1
    expect(builderWorkspaceAdapted(builder, 'embedded-scene-5')).toBe(true)
    builder.rendering = structuredClone(original.rendering)
    builder.composition!.groups[0].name = 'Renamed motion'
    expect(builderWorkspaceAdapted(builder, 'embedded-scene-5')).toBe(true)
    expect(builderWorkspaceAdapted(builder, null)).toBe(false)
  })
})
