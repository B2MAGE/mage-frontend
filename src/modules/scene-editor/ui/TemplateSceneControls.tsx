import type { ReactNode } from 'react'
import { SCENE_PARAMETER_RULES, listSceneTemplates, listSelectableSceneTemplates, type TemplateSceneDocument } from '@modules/player'
import { EditorFieldShell, SliderFieldShell } from '@shared/ui'
import type { TemplateFieldPath } from '../templateEditor'
import type { EditorSectionId } from '../types'
import { SKYBOX_OPTIONS } from '../sceneEditor'
import { SceneSection } from './SceneEditorControls'

type Props = {
  section: EditorSectionId
  document: TemplateSceneDocument
  creationMode?: ReactNode
  fields?: Record<string, string>
  onTemplateChange: (id: string) => void
  onChange: (path: TemplateFieldPath, value: number | string | boolean) => void
}

export function TemplateSceneControls({ section, document, creationMode, fields = {}, onTemplateChange, onChange }: Props) {
  const selectableTemplates = listSelectableSceneTemplates()
  const selectedRetiredTemplate = !selectableTemplates.some(template => template.templateId === document.templateId)
    ? listSceneTemplates().find(template => template.templateId === document.templateId)
    : undefined
  const error = (path: string) => fields[`sceneData.${path}`] ?? fields[path] ?? fields[`scene.${path}`]
  const id = (path: string) => `template-${path.replaceAll('.', '-')}`
  const issue = (path: string) => error(path) ? <p className="field-error" id={`${id(path)}-error`} role="alert">{error(path)}</p> : null
  const props = (path: string) => ({ 'aria-invalid': Boolean(error(path)), 'aria-describedby': error(path) ? `${id(path)}-error` : undefined })
  function number(path: TemplateFieldPath, label: string, value: number, min: number, max: number, step = 0.1, description?: string) {
    const change = (next: number) => { if (Number.isFinite(next)) onChange(path, next) }
    return <div data-template-field={path}>
      <SliderFieldShell htmlFor={id(path)} label={label} valueLabel={String(value)} description={description}>
        <input {...props(path)} className="scene-slider__range" id={id(path)} type="range" min={min} max={max} step={step}
          value={Number.isFinite(value) ? value : min} onChange={event => change(event.currentTarget.valueAsNumber)} />
        <input {...props(path)} className="scene-slider__number" id={`${id(path)}-number`} aria-label={`${label} numeric value`}
          type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? value : ''}
          onChange={event => change(event.currentTarget.valueAsNumber)} />
      </SliderFieldShell>
      {issue(path)}
    </div>
  }
  if (section === 'scene') return <SceneSection title="Scene" description="Choose a template, then adjust its scale and surroundings.">
    {creationMode}
    <div data-template-field="templateId">
      <EditorFieldShell htmlFor={id('templateId')} label="Template" description="Choose the visual to build your scene around.">
        <select {...props('templateId')} className="mage-select" id={id('templateId')} value={document.templateId} onChange={event => onTemplateChange(event.currentTarget.value)}>
          {selectedRetiredTemplate ? <option value={selectedRetiredTemplate.templateId} disabled>{selectedRetiredTemplate.label} (unavailable)</option> : null}
          {selectableTemplates.map(template => <option key={`${template.templateId}:${template.templateVersion}`} value={template.templateId}>{template.label}</option>)}
        </select>
      </EditorFieldShell>
      {issue('templateId')}
    </div>
    <div data-template-field="settings.skybox">
      <EditorFieldShell htmlFor={id('settings.skybox')} label="Skybox">
        <select {...props('settings.skybox')} className="mage-select" id={id('settings.skybox')} value={document.settings.skybox}
          onChange={event => onChange('settings.skybox', Number(event.currentTarget.value))}>
          {SKYBOX_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </EditorFieldShell>
      {issue('settings.skybox')}
    </div>
    {number('parameters.scale', 'Scene Scale', document.parameters.scale, SCENE_PARAMETER_RULES.scale.minimum, SCENE_PARAMETER_RULES.scale.maximum, 1)}
  </SceneSection>

  return null
}
