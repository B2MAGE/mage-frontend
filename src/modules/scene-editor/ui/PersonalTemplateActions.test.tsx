import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createBuilderScene } from '../builderEditor'
import { builderDesign } from '../builderDesign'
import { PersonalTemplateError } from '../personalTemplates'
import { PersonalTemplateActions } from './PersonalTemplateActions'

const template = { templateId: 7, name: 'My template', sceneData: builderDesign(createBuilderScene()), thumbnailRef: null, revision: 2, createdAt: '', updatedAt: '' }
const props = () => ({ selectedTemplate: null, canSave: true, onSave: vi.fn().mockResolvedValue(undefined), onRename: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn().mockResolvedValue(undefined) })

describe('PersonalTemplateActions', () => {
  it('requires a trimmed name, explains the saved contents and returns focus after keyboard cancel', async () => {
    const user = userEvent.setup(), actions = props()
    render(<PersonalTemplateActions {...actions} />)
    const trigger = screen.getByRole('button', { name: 'Save as template' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Save as template' })
    const input = screen.getByLabelText('Template name')
    expect(input).toHaveFocus()
    expect(dialog).toHaveTextContent(/objects, groups, materials, animation and input bindings/)
    expect(dialog).toHaveTextContent(/Camera, skybox, scene scale, Motion, Effects and other scene sections stay unchanged/)
    await user.type(input, '   ')
    await user.click(within(dialog).getByRole('button', { name: 'Save as template' }))
    expect(actions.onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a template name.')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('keeps failed saves editable, including field errors, and only closes successful saves', async () => {
    const user = userEvent.setup(), actions = props()
    actions.onSave.mockRejectedValueOnce(new PersonalTemplateError('A template with this name already exists.', 409, { name: 'Use another name.' }))
    render(<PersonalTemplateActions {...actions} />)
    await user.click(screen.getByRole('button', { name: 'Save as template' }))
    await user.type(screen.getByLabelText('Template name'), ' Mine ')
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Save as template' }))
    expect(screen.getByLabelText('Template name')).toHaveValue(' Mine ')
    expect(screen.getByRole('alert')).toHaveTextContent('A template with this name already exists.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText('Template name'))
    await user.type(screen.getByLabelText('Template name'), ' Better ')
    await user.click(within(dialog).getByRole('button', { name: 'Save as template' }))
    expect(actions.onSave).toHaveBeenLastCalledWith('Better')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('requires explicit update/delete and traps keyboard focus within confirmation', async () => {
    const user = userEvent.setup(), actions = props()
    render(<PersonalTemplateActions {...actions} selectedTemplate={template} />)
    await user.click(screen.getByRole('button', { name: 'Update template' }))
    let dialog = screen.getByRole('dialog', { name: 'Update template' })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByRole('button', { name: 'Update template' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Update template' }))
    expect(actions.onSave).toHaveBeenCalledWith(template.name, template)
    await user.click(screen.getByRole('button', { name: 'Delete template' }))
    dialog = screen.getByRole('alertdialog', { name: 'Delete template' })
    expect(dialog).toHaveTextContent(/Scenes and drafts made from it will keep their own copies/)
    expect(actions.onDelete).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Delete template' }))
    expect(actions.onDelete).toHaveBeenCalledWith(template)
  })

  it('uses a placeholder when a saved snapshot is unavailable and keeps save-as-new separate', async () => {
    const user = userEvent.setup(), actions = props()
    const { container } = render(<PersonalTemplateActions {...actions} selectedTemplate={{ ...template, thumbnailRef: 'missing.png' }} />)
    fireEvent.error(container.querySelector('img')!)
    expect(screen.getByLabelText('No saved template snapshot')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save as new template' }))
    expect(screen.getByLabelText('Template name')).toHaveValue('')
    await user.type(screen.getByLabelText('Template name'), 'Different')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save as template' }))
    expect(actions.onSave).toHaveBeenCalledWith('Different')
    expect(actions.onRename).not.toHaveBeenCalled()
  })
})
