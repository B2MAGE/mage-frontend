import { describe, expect, it } from 'vitest'
import { builderControlLocation, builderObjectFieldIssues } from './sceneEditorFieldErrors'

describe('Builder field locations', () => {
  it.each([
    ['objects[2].modifiers[0].amount', 'builder-modifier-0-amount'],
    ['sceneData.objects.2.modifiers.1.thickness', 'builder-modifier-1-thickness'],
    ['objects[2].modifiers[2].axis', 'builder-modifier-2-axis'],
    ['objects[2].arrangements[0].count', 'builder-arrangement-0-count'],
    ['objects.2.arrangements.1.spacing', 'builder-arrangement-1-spacing'],
    ['objects[2].arrangements[1].radius', 'builder-arrangement-1-radius'],
    ['objects[2].arrangements[0].axis', 'builder-arrangement-0-axis'],
    ['objects[2].motion.speed', 'builder-motion-speed'],
    ['objects[2].motion.axis', 'builder-motion-axis'],
  ])('maps %s to its editable input', (path, id) => {
    expect(builderControlLocation(path)).toMatchObject({ id, objectIndex: 2, section: 'scene' })
  })

  it('keeps duplicate inspector IDs scoped to their respective objects', () => {
    const first = { path: 'objects[0].motion.speed', message: 'First speed is too high.' }
    const second = { path: 'objects[1].motion.speed', message: 'Second speed is too low.' }
    const issues = { 'builder-motion-speed': second, '0:builder-motion-speed': first, '1:builder-motion-speed': second }
    expect(builderObjectFieldIssues(issues, 0)).toEqual({ 'builder-motion-speed': first })
    expect(builderObjectFieldIssues(issues, 1)).toEqual({ 'builder-motion-speed': second })
    expect(builderObjectFieldIssues(issues, 2)).toEqual({})
  })
})
