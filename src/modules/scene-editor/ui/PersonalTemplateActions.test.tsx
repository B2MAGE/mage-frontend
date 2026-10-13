import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createBuilderScene } from '../builderEditor'
import { builderDesign } from '../builderDesign'
import { PersonalTemplateError } from '../personalTemplates'
import { PersonalTemplateActions } from './PersonalTemplateActions'

const template = { templateId: 7, name: 'My template', sceneData: builderDesign(createBuilderScene()), revision: 2, createdAt: '', updatedAt: '' }
const props = () => ({ selectedTemplate: null, canSave: true, onNew: vi.fn(), onSave: vi.fn().mockResolvedValue(undefined), onRename: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn().mockResolvedValue(undefined) })

async function chooseAction(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'Template actions' }))
  await user.click(screen.getByRole('menuitem', { name }))
}

describe('PersonalTemplateActions', () => {
  it('requires a trimmed name, explains the saved contents and returns focus after keyboard cancel', async () => {
    const user = userEvent.setup(), actions = props()
    render(<PersonalTemplateActions {...actions} />)
    const trigger = screen.getByRole('button', { name: 'Template actions' })
    await chooseAction(user, 'Save as new template')
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
    await chooseAction(user, 'Save as new template')
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
    await chooseAction(user, 'Update template')
    let dialog = screen.getByRole('dialog', { name: 'Update template' })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByRole('button', { name: 'Update template' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Update template' }))
    expect(actions.onSave).toHaveBeenCalledWith(template.name, template)
    await chooseAction(user, 'Delete template')
    dialog = screen.getByRole('alertdialog', { name: 'Delete template' })
    expect(dialog).toHaveTextContent(/editor will switch to Prism Core/)
    expect(dialog).toHaveTextContent(/other scene settings and saved scenes stay unchanged/)
    expect(actions.onDelete).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Delete template' }))
    expect(actions.onDelete).toHaveBeenCalledWith(template)
  })

  it('omits thumbnails and keeps save-as-new separate from update and rename', async () => {
    const user = userEvent.setup(), actions = props()
    render(<PersonalTemplateActions {...actions} selectedTemplate={template} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    await chooseAction(user, 'Save as new template')
    expect(screen.queryByText(/thumbnail|snapshot/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Template name')).toHaveValue('')
    await user.type(screen.getByLabelText('Template name'), 'Different')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save as template' }))
    expect(actions.onSave).toHaveBeenCalledWith('Different')
    expect(actions.onRename).not.toHaveBeenCalled()
  })

  it('supports keyboard menu navigation and new designs without exposing owner actions for built-ins', async () => {
    const user = userEvent.setup(), actions = props()
    render(<PersonalTemplateActions {...actions} canSave={false} />)
    const trigger = screen.getByRole('button', { name: 'Template actions' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'New template' })).toHaveFocus()
    expect(screen.getByRole('menuitem', { name: 'Save as new template' })).toBeDisabled()
    expect(screen.queryByRole('menuitem', { name: 'Update template' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await chooseAction(user, 'New template')
    expect(actions.onNew).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('restores focus after an asynchronous save re-enables the menu trigger', async () => {
    const user = userEvent.setup(), actions = props()
    let finishSave!: () => void
    actions.onSave.mockImplementation(() => new Promise<void>(resolve => { finishSave = resolve }))
    render(<PersonalTemplateActions {...actions} />)
    await chooseAction(user, 'Save as new template')
    await user.type(screen.getByLabelText('Template name'), 'My design')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save as template' }))
    expect(screen.getByRole('button', { name: 'Template actions' })).toBeDisabled()
    await act(async () => { finishSave() })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Template actions' })).toHaveFocus()
  })

  it('closes when clicking outside or tabbing out, and skips disabled actions with arrow keys', async () => {
    const user = userEvent.setup(), actions = props()
    render(<><PersonalTemplateActions {...actions} canSave={false} selectedTemplate={template} /><button>Outside</button></>)
    await user.click(screen.getByRole('button', { name: 'Template actions' }))
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Rename template' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('menuitem', { name: 'Delete template' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('menuitem', { name: 'New template' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Template actions' }))
    await user.tab()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
  })
})
