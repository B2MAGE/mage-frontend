import { listSceneTemplates } from '@modules/player'
import { EditorFieldShell, SliderFieldShell } from '@shared/ui'
import { SKYBOX_OPTIONS } from '../sceneEditor'

type Props = {
  fields?: Record<string, string>
  isBuilder: boolean
  isTemplateDisabled?: boolean
  templateDisabledDescription?: string
  onScaleChange: (value: number) => void
  onSkyboxChange: (value: number) => void
  onTemplateChange: (templateId: string) => void
  scale: number
  skybox: number
  templateId: string
}

const fieldId = (path: string) => `template-${path.replaceAll('.', '-')}`

export function SceneSetupControls({
  fields = {},
  isBuilder,
  isTemplateDisabled = false,
  templateDisabledDescription,
  onScaleChange,
  onSkyboxChange,
  onTemplateChange,
  scale,
  skybox,
  templateId,
}: Props) {
  const error = (path: string) => fields[`sceneData.${path}`] ?? fields[path] ?? fields[`scene.${path}`]
  const describedBy = (path: string) => error(path) ? `${fieldId(path)}-error` : undefined
  const issue = (path: string) => error(path)
    ? <p className="field-error" id={`${fieldId(path)}-error`} role="alert">{error(path)}</p>
    : null

  return <div className="scene-editor-grid scene-editor-grid--3 scene-setup-controls">
    <div data-template-field="templateId">
      <EditorFieldShell
        htmlFor={fieldId('templateId')}
        label="Template"
        description={isBuilder || isTemplateDisabled
          ? templateDisabledDescription ?? 'Turn off Builder to choose a template.'
          : 'Choose the visual to use as-is or open in Custom Code.'}
      >
        <select
          aria-describedby={describedBy('templateId')}
          aria-invalid={Boolean(error('templateId'))}
          className="mage-select"
          disabled={isBuilder || isTemplateDisabled}
          id={fieldId('templateId')}
          onChange={event => onTemplateChange(event.currentTarget.value)}
          value={templateId}
        >
          {templateId === 'custom' ? <option value="custom" disabled>Custom shader</option> : null}
          {listSceneTemplates().map(template => <option
            key={`${template.templateId}:${template.templateVersion}`}
            value={template.templateId}
          >{template.label}</option>)}
        </select>
      </EditorFieldShell>
      {issue('templateId')}
    </div>

    <div data-template-field="settings.skybox">
      <EditorFieldShell htmlFor={fieldId('settings.skybox')} label="Skybox">
        <select
          aria-describedby={describedBy('settings.skybox')}
          aria-invalid={Boolean(error('settings.skybox'))}
          className="mage-select"
          id={fieldId('settings.skybox')}
          onChange={event => onSkyboxChange(Number(event.currentTarget.value))}
          value={skybox}
        >
          {SKYBOX_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </EditorFieldShell>
      {issue('settings.skybox')}
    </div>

    <div className="scene-setup-controls__scale" data-template-field="parameters.scale">
      <SliderFieldShell htmlFor={fieldId('parameters.scale')} label="Scene Scale" valueLabel={String(scale)}>
        <input
          aria-describedby={describedBy('parameters.scale')}
          aria-invalid={Boolean(error('parameters.scale'))}
          className="scene-slider__range"
          id={fieldId('parameters.scale')}
          max={200}
          min={1}
          onChange={event => {
            const value = event.currentTarget.valueAsNumber
            if (Number.isFinite(value)) onScaleChange(value)
          }}
          step={1}
          type="range"
          value={scale}
        />
        <input
          aria-describedby={describedBy('parameters.scale')}
          aria-invalid={Boolean(error('parameters.scale'))}
          aria-label="Scene Scale numeric value"
          className="scene-slider__number"
          id={`${fieldId('parameters.scale')}-number`}
          max={200}
          min={1}
          onChange={event => {
            const value = event.currentTarget.valueAsNumber
            if (Number.isFinite(value)) onScaleChange(value)
          }}
          step={1}
          type="number"
          value={scale}
        />
      </SliderFieldShell>
      {issue('parameters.scale')}
    </div>
  </div>
}
