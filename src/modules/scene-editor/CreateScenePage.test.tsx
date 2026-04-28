import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import {
  mockCreateScenePageFetch,
  renderCreateScenePage,
  storeSceneEditorSession,
} from './test-fixtures'

const CAPTURED_THUMBNAIL_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j+7sAAAAASUVORK5CYII='
const mockCaptureFramePreview = vi.fn(
  async (): Promise<string | null> => CAPTURED_THUMBNAIL_DATA_URL,
)

vi.mock('@modules/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modules/player')>()
  const React = await import('react')

  return {
    ...actual,
    MagePlayer: ({
      initialPlayback,
      onCaptureFramePreviewChange,
      sceneBlob,
    }: {
      initialPlayback?: string
      onCaptureFramePreviewChange?: (
        captureFramePreview: (() => Promise<string | null>) | null,
      ) => void
      sceneBlob: unknown
    }) => {
      React.useEffect(() => {
        onCaptureFramePreviewChange?.(
          sceneBlob ? () => mockCaptureFramePreview() : null,
        )

        return () => {
          onCaptureFramePreviewChange?.(null)
        }
      }, [onCaptureFramePreviewChange, sceneBlob])

      return (
        <div data-playback={initialPlayback} data-testid="mage-player">
          {sceneBlob ? 'preview-ready' : 'no-preview'}
        </div>
      )
    },
  }
})

beforeEach(() => {
  mockCaptureFramePreview.mockReset()
  mockCaptureFramePreview.mockResolvedValue(CAPTURED_THUMBNAIL_DATA_URL)
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('CreateScenePage workflow', () => {
  it('renders the details step first while keeping the full section menu available', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    renderCreateScenePage()

    expect(screen.getByRole('heading', { name: /create scene/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /basic/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^details$/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^scene$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^camera$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^motion$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^effects$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /section navigation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^details$/i })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: /^scene$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^pass order$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^confirm$/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/jump to section/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/scene data json/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/custom shader/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('mage-player')).toHaveTextContent('preview-ready')
    expect(screen.getByTestId('mage-player')).toHaveAttribute('data-playback', 'playing')
  })

  it('renders interactive metadata controls beneath the scene name field', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()
    const user = userEvent.setup()

    renderCreateScenePage()

    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'A soft drifting scene for night scenes.' },
    })
    fireEvent.change(screen.getByLabelText(/playlists/i), {
      target: { value: 'ambient-atlas' },
    })
    await user.click(
      screen.getByRole('button', { name: /capture thumbnail/i }),
    )

    expect(screen.getByLabelText(/description/i)).toHaveValue(
      'A soft drifting scene for night scenes.',
    )
    expect(screen.getByLabelText(/playlists/i)).toHaveValue('ambient-atlas')
    expect(
      screen.getByAltText(/captured thumbnail preview/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /capture again/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /a\/b testing/i })).not.toBeInTheDocument()
  })

  it('keeps the first section ordered around scene metadata and shows sticky navigation actions', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    renderCreateScenePage()

    const nameField = screen.getByLabelText(/scene name/i)
    const descriptionField = screen.getByLabelText(/description/i)
    const playlistsField = screen.getByLabelText(/playlists/i)
    const thumbnailField = screen.getByRole('button', {
      name: /capture thumbnail/i,
    })
    const tagSearchField = await screen.findByLabelText(/select existing tags/i)

    expect(screen.getByRole('heading', { name: /^details$/i })).toBeInTheDocument()
    expect(
      nameField.compareDocumentPosition(descriptionField) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      descriptionField.compareDocumentPosition(playlistsField) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      playlistsField.compareDocumentPosition(thumbnailField) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      thumbnailField.compareDocumentPosition(tagSearchField) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    expect(screen.getByRole('button', { name: /^back$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /create scene/i })).toBeInTheDocument()
  })

  it('shows a clear thumbnail error when the live preview cannot be captured', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()
    mockCaptureFramePreview.mockResolvedValueOnce(null)

    const user = userEvent.setup()

    renderCreateScenePage()

    await user.click(screen.getByRole('button', { name: /capture thumbnail/i }))

    expect(
      await screen.findByText(
        /we couldn't capture the current preview frame\. let the preview finish loading and try again\./i,
      ),
    ).toBeInTheDocument()
  })

  it('keeps the Motion section focused on the persisted MAGE engine motion controls', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()

    await user.click(screen.getByRole('button', { name: /^motion$/i }))

    expect(screen.getByRole('heading', { name: /^motion$/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/auto rotate/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/time multiplier/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/audio gain/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/audio curve/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pointer release hold/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/base speed/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/easing speed/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/rotation speed/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/camera orientation mode/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/scene data json/i)).not.toBeInTheDocument()
  })

  it('moves between sections with the next and back buttons and keeps the menu in sync', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()

    const detailsStep = screen.getByRole('button', { name: /^details$/i })
    const sceneStep = screen.getByRole('button', { name: /^scene$/i })

    expect(detailsStep).toHaveAttribute('aria-current', 'step')
    expect(sceneStep).not.toHaveAttribute('aria-current')

    await user.click(screen.getByRole('button', { name: /^next$/i }))

    expect(screen.getByRole('heading', { name: /^scene$/i })).toBeInTheDocument()
    expect(sceneStep).toHaveAttribute('aria-current', 'step')
    expect(screen.getByLabelText(/custom shader/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^back$/i }))

    expect(screen.getByRole('heading', { name: /^details$/i })).toBeInTheDocument()
    expect(detailsStep).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByLabelText(/custom shader/i)).not.toBeInTheDocument()
  })

  it('switches the shader select to Custom Shader when the source no longer matches a built-in shader', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()

    await user.click(screen.getByRole('button', { name: /^scene$/i }))

    const shaderSelect = screen.getByLabelText(/^shader$/i)
    const shaderSource = screen.getByLabelText(/custom shader/i)

    await user.clear(shaderSource)
    await user.type(shaderSource, 'let customSize = input()')

    expect(shaderSelect).toHaveValue('custom')
    expect(screen.getByRole('option', { name: /^custom shader$/i })).toBeInTheDocument()
  })

  it('marks previous required sections as needing attention when you move past them incomplete', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()

    const detailsStep = screen.getByRole('button', { name: /^details$/i })

    await user.click(screen.getByRole('button', { name: /^scene$/i }))

    expect(screen.getByRole('heading', { name: /^scene$/i })).toBeInTheDocument()
    expect(detailsStep).toHaveClass('scene-editor-stepper__button--invalid')
    expect(detailsStep).not.toHaveClass('scene-editor-stepper__button--complete')
    expect(detailsStep).toHaveAttribute('title', 'Scene name is required.')
  })

  it('splits pass ordering into its own section and groups effects into categorized cards', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()

    await user.click(screen.getByRole('button', { name: /^effects$/i }))

    expect(screen.getByRole('heading', { name: /^effects$/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^pass order$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^finish & output$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^channel & motion$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^color & tone$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^pattern & structure$/i })).toBeInTheDocument()
    expect(screen.getByText(/^gamma correction$/i)).toBeInTheDocument()
    expect(screen.getByText(/sharp digital breakups and instability/i)).toBeInTheDocument()
    expect(screen.queryByText(/^additional passes$/i)).not.toBeInTheDocument()
    expect(screen.getByText(/^output pass$/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^pass order$/i }))

    expect(screen.getByRole('heading', { name: /^pass order$/i })).toBeInTheDocument()
    expect(screen.getByText(/^output$/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^finish & output$/i })).not.toBeInTheDocument()
  })

  it('moves advanced controls into collapsible groups and uses confirm as the final review step', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()

    await user.click(screen.getByRole('button', { name: /^camera$/i }))

    expect(screen.getByRole('heading', { name: /^camera$/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/camera orientation mode/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable advanced/i }))
    expect(screen.getByLabelText(/camera orientation mode/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/camera orientation speed/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /disable advanced/i }))
    expect(screen.queryByLabelText(/camera orientation mode/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^motion$/i }))

    expect(screen.getByRole('heading', { name: /^motion$/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/state size/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable advanced/i }))
    expect(screen.getByLabelText(/state size/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/volume multiplier/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^confirm$/i }))

    expect(screen.getByRole('heading', { name: /^confirm$/i })).toBeInTheDocument()
    expect(screen.getByText(/^scene name$/i)).toBeInTheDocument()
    expect(screen.getByText(/^motion & effects$/i)).toBeInTheDocument()
    expect(screen.queryByText(/^advanced camera$/i)).not.toBeInTheDocument()
    expect(screen.getByText(/^runtime seed$/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/scene data json/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show shader/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /show raw json/i }))
    expect(screen.getByLabelText(/scene data json/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /format json/i })).toBeInTheDocument()
  })
})
