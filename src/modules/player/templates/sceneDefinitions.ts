import schema from '../../../../contracts/scenes/scene-v1.schema.json'

/** Authored scene values shared by template parsing, Builder parsing and controls. */
export const SCENE_PARAMETER_RULES = schema.$defs.template.properties.parameters.properties
export const SCENE_SETTING_RULES = schema.$defs.template.properties.settings.properties
