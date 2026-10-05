import type { PropsWithChildren } from 'react'
import { builderControlLocation, FieldErrorsContext, templateControlLocation, useSceneEditorFieldIssue, type FieldIssues } from './sceneEditorFieldErrors'

export function SceneEditorFieldErrorsProvider({ fields, mode = 'template', children }: PropsWithChildren<{ fields: Record<string, string>; mode?: 'template' | 'builder' }>) {
  const issues: FieldIssues = {}
  for (const [path, message] of Object.entries(fields)) {
    const location = mode === 'builder' ? builderControlLocation(path) : templateControlLocation(path)
    if (location) issues[location.id] = { path: location.path, message }
  }
  return <FieldErrorsContext.Provider value={issues}>{children}</FieldErrorsContext.Provider>
}

export function FieldValidation({ id, children }: PropsWithChildren<{ id: string }>) {
  const { issue } = useSceneEditorFieldIssue(id)
  return <div className="scene-field-validation" data-template-field={issue?.path}>
    {children}
    {issue ? <p className="field-error" id={`${id}-error`} role="alert">{issue.message}</p> : null}
  </div>
}
