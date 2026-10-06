import { listSceneTemplates } from '@modules/player'
import { EditorFieldShell, SliderFieldShell } from '@shared/ui'
import { SKYBOX_OPTIONS } from '../sceneEditor'

export const BUILDER_SHADER_TEMPLATE_VALUE = '__builder-shader__'

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
const SCENE_SCALE_MIN = 1
const SCENE_SCALE_MAX = 200
const SCENE_SCALE_SLIDER_MAX = 1000
const SCENE_SCALE_CURVE = 4

function sceneScaleToSliderPosition(scale: number) {
  const bounded = Math.min(SCENE_SCALE_MAX, Math.max(SCENE_SCALE_MIN, scale))
  const normalizedScale = Math.log(bounded) / Math.log(SCENE_SCALE_MAX)
  return Math.round(Math.pow(normalizedScale, 1 / SCENE_SCALE_CURVE) * SCENE_SCALE_SLIDER_MAX)
}

function sliderPositionToSceneScale(position: number) {
  const bounded = Math.min(SCENE_SCALE_SLIDER_MAX, Math.max(0, position))
  const normalizedPosition = bounded / SCENE_SCALE_SLIDER_MAX
  return Number(Math.exp(Math.log(SCENE_SCALE_MAX) * Math.pow(normalizedPosition, SCENE_SCALE_CURVE)).toFixed(2))
}

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
        description={isBuilder
          ? 'Builder Shader is generated from the objects in this workspace.'
          : isTemplateDisabled
            ? templateDisabledDescription
            : 'Choose the visual to use as-is or open in Custom Code.'}
      >
        <select
          aria-describedby={describedBy('templateId')}
          aria-invalid={Boolean(error('templateId'))}
          className="mage-select"
          disabled={isTemplateDisabled}
          id={fieldId('templateId')}
          onChange={event => onTemplateChange(event.currentTarget.value)}
          value={templateId}
        >
          {isBuilder ? <option value={BUILDER_SHADER_TEMPLATE_VALUE}>Builder Shader</option> : null}
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
      <EditorFieldShell description="Set the surrounding environment for the scene." htmlFor={fieldId('settings.skybox')} label="Skybox">
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
      <SliderFieldShell description="Change the scene-wide size without editing each object." htmlFor={fieldId('parameters.scale')} label="Scene Scale" valueLabel={String(scale)}>
        <input
          aria-describedby={describedBy('parameters.scale')}
          aria-invalid={Boolean(error('parameters.scale'))}
          aria-valuemax={SCENE_SCALE_MAX}
          aria-valuemin={SCENE_SCALE_MIN}
          aria-valuenow={scale}
          className="scene-slider__range"
          id={fieldId('parameters.scale')}
          max={SCENE_SCALE_SLIDER_MAX}
          min={0}
          onChange={event => {
            const position = event.currentTarget.valueAsNumber
            if (Number.isFinite(position)) onScaleChange(sliderPositionToSceneScale(position))
          }}
          step={1}
          type="range"
          value={sceneScaleToSliderPosition(scale)}
        />
        <input
          aria-describedby={describedBy('parameters.scale')}
          aria-invalid={Boolean(error('parameters.scale'))}
          aria-label="Scene Scale numeric value"
          className="scene-slider__number"
          id={`${fieldId('parameters.scale')}-number`}
          max={SCENE_SCALE_MAX}
          min={SCENE_SCALE_MIN}
          onChange={event => {
            const value = event.currentTarget.valueAsNumber
            if (Number.isFinite(value)) onScaleChange(value)
          }}
          step={0.01}
          type="number"
          value={scale}
        />
      </SliderFieldShell>
      {issue('parameters.scale')}
    </div>
  </div>
}
