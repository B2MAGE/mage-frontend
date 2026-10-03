import type { ReactNode } from 'react'
import { listSceneTemplates, type TemplateSceneDocument } from '@modules/player'
import { EditorFieldShell, SliderFieldShell } from '@shared/ui'
import type { TemplateFieldPath } from '../templateEditor'
import type { EditorSectionId } from '../types'
import { SKYBOX_OPTIONS } from '../sceneEditor'
import { EffectCard, SceneSection } from './SceneEditorControls'
import { ConfirmSummaryItem, ConfirmSummarySection } from './SceneEditorLayout'

type Props = {
  section: EditorSectionId
  document: TemplateSceneDocument
  fields?: Record<string, string>
  onTemplateChange: (id: string) => void
  onChange: (path: TemplateFieldPath, value: number | string | boolean) => void
}

export function TemplateSceneControls({ section, document, fields = {}, onTemplateChange, onChange }: Props) {
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
  function toggle(path: TemplateFieldPath, title: string, description: string, enabled: boolean, children?: ReactNode) {
    const groupPath = path.slice(0, path.lastIndexOf('.') + 1)
    const hasHiddenError = !enabled && Object.keys(fields).some(key => {
      const field = key.replace(/^sceneData\./, '').replace(/^scene\./, '')
      return field !== path && field.startsWith(groupPath)
    })
    return <div data-template-field={path}>
      <EffectCard title={title} description={description} enabled={enabled} toggleLabel={title} onToggle={value => onChange(path, value)}>
        {children}
      </EffectCard>
      {hasHiddenError ? <div className="effect-card__details"><div className="effect-card__content">{children}</div></div> : null}
      {issue(path)}
    </div>
  }
  if (section === 'scene') return <SceneSection title="Scene" description="Choose a template, then adjust its scale and surroundings.">
    <div data-template-field="templateId">
      <EditorFieldShell htmlFor={id('templateId')} label="Template" description="Choose the visual to build your scene around.">
        <select {...props('templateId')} className="mage-select" id={id('templateId')} value={document.templateId} onChange={event => onTemplateChange(event.currentTarget.value)}>
          {listSceneTemplates().map(template => <option key={`${template.templateId}:${template.templateVersion}`} value={template.templateId}>{template.label}</option>)}
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
    {number('parameters.scale', 'Scene Scale', document.parameters.scale, 1, 30, 0.1)}
  </SceneSection>

  if (section === 'camera') return <SceneSection title="Camera" description="Frame the template and choose whether the camera moves around it.">
    {number('settings.camera.fov', 'FOV', document.settings.camera.fov, 20, 100, 1, 'How wide the camera lens feels.')}
    <section className="scene-effects-category" aria-labelledby="template-camera-movement"><h3 className="scene-effects-category__title" id="template-camera-movement">Camera movement</h3>
      {toggle('settings.camera.autoRotate', 'Automatic orbit', 'Let the camera travel around the scene on its own.', document.settings.camera.autoRotate,
        number('settings.camera.orbitSpeed', 'Orbit speed', document.settings.camera.orbitSpeed, 0, 2, 0.01))}
    </section>
  </SceneSection>

  if (section === 'motion') return <SceneSection title="Motion" description="Set how quickly the template animates.">
    {number('parameters.speed', 'Animation speed', document.parameters.speed, 0, 3, 0.05, 'Music playback stays at its original speed.')}
  </SceneSection>

  if (section === 'effects') return <SceneSection title="Effects" description="Add bloom or a color tint to finish the template.">
    {toggle('settings.bloom.enabled', 'Bloom', 'Add a glow around bright areas.', document.settings.bloom.enabled, <>
      {number('settings.bloom.strength', 'Strength', document.settings.bloom.strength, 0, 3, 0.1)}
      {number('settings.bloom.radius', 'Radius', document.settings.bloom.radius, 0, 1, 0.01)}
      {number('settings.bloom.threshold', 'Threshold', document.settings.bloom.threshold, 0, 1, 0.01)}
    </>)}
    {toggle('settings.tint.enabled', 'Tint', 'Give the scene a color wash.', document.settings.tint.enabled,
      <div data-template-field="settings.tint.color"><EditorFieldShell htmlFor={id('settings.tint.color')} label="Tint color">
        <input {...props('settings.tint.color')} id={id('settings.tint.color')} type="color" value={document.settings.tint.color}
          onChange={event => onChange('settings.tint.color', event.currentTarget.value)} />
      </EditorFieldShell>{issue('settings.tint.color')}</div>)}
  </SceneSection>
  return null
}

export function TemplateSceneSummary({ document }: { document: TemplateSceneDocument }) {
  return <>
    <ConfirmSummarySection title="Visual Setup">
      <ConfirmSummaryItem label="Template" value={listSceneTemplates().find(template => template.templateId === document.templateId)?.label ?? document.templateId} />
      <ConfirmSummaryItem label="Skybox" value={SKYBOX_OPTIONS.find(option => option.value === document.settings.skybox)?.label ?? String(document.settings.skybox)} />
      <ConfirmSummaryItem label="Scale" value={String(document.parameters.scale)} />
    </ConfirmSummarySection>
    <ConfirmSummarySection title="Camera">
      <ConfirmSummaryItem label="FOV" value={String(document.settings.camera.fov)} />
      <ConfirmSummaryItem label="Automatic orbit" value={document.settings.camera.autoRotate ? 'On' : 'Off'} />
      {document.settings.camera.autoRotate ? <ConfirmSummaryItem label="Orbit speed" value={String(document.settings.camera.orbitSpeed)} /> : null}
    </ConfirmSummarySection>
    <ConfirmSummarySection title="Motion & Effects">
      <ConfirmSummaryItem label="Animation speed" value={String(document.parameters.speed)} />
      <ConfirmSummaryItem label="Bloom" value={document.settings.bloom.enabled ? 'On' : 'Off'} />
      {document.settings.bloom.enabled ? <>
        <ConfirmSummaryItem label="Bloom strength" value={String(document.settings.bloom.strength)} />
        <ConfirmSummaryItem label="Bloom radius" value={String(document.settings.bloom.radius)} />
        <ConfirmSummaryItem label="Bloom threshold" value={String(document.settings.bloom.threshold)} />
      </> : null}
      <ConfirmSummaryItem label="Tint" value={document.settings.tint.enabled ? document.settings.tint.color : 'Off'} />
    </ConfirmSummarySection>
  </>
}
