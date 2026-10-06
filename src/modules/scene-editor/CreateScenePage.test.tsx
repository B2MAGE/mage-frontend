import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { createDefaultSceneData } from './sceneEditor'
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
        <div data-playback={initialPlayback} data-scene={JSON.stringify(sceneBlob)} data-testid="mage-player">
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

async function importCustomScene(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await user.click(screen.getByRole('button', { name: 'Show Raw JSON' }))
  fireEvent.change(screen.getByLabelText('Scene Data JSON'), { target: { value: JSON.stringify({
    schemaVersion: 1, kind: 'custom', scene: createDefaultSceneData(),
  }) } })
  expect(screen.getByTestId('mage-player')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Hide Raw JSON' }))
  await user.click(screen.getByRole('button', { name: 'Details' }))
}

describe('CreateScenePage workflow', () => {
  it('renders the details step first while keeping the full section menu available', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    renderCreateScenePage()

    expect(screen.getByRole('heading', { name: /create a scene/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /basic/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^start with the basics\.$/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^choose the visual foundation\.$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^frame the scene\.$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^tune how it moves\.$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^finish the look\.$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /section navigation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^details$/i })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: /^scene$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^pass order$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^advanced$/i })).not.toBeInTheDocument()
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
    await user.click(
      screen.getByRole('button', { name: /capture thumbnail/i }),
    )

    expect(screen.getByLabelText(/description/i)).toHaveValue(
      'A soft drifting scene for night scenes.',
    )
    expect(screen.getByLabelText(/playlists/i)).toBeDisabled()
    expect(screen.getByLabelText(/playlists/i)).toHaveValue('')
    expect(
      screen.getByAltText(/captured thumbnail preview/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /recapture thumbnail/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /a\/b testing/i })).not.toBeInTheDocument()
  })

  it('groups Details into scene information, thumbnail, and discovery with live feedback', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()
    const user = userEvent.setup()

    renderCreateScenePage()

    const sceneInformation = screen.getByRole('region', { name: 'Scene information' })
    const thumbnail = screen.getByRole('region', { name: 'Thumbnail' })
    const discovery = screen.getByRole('region', { name: 'Discovery' })
    const nameInput = within(sceneInformation).getByLabelText('Scene Name')

    expect(sceneInformation).toHaveClass('scene-editor-details__group')
    expect(thumbnail.querySelector('.scene-editor-thumbnail__frame')).toHaveAttribute('data-captured', 'false')
    expect(within(discovery).getByText('0 selected')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('Required · 0 characters · 2 minimum')).toHaveAttribute('aria-live', 'polite')

    await user.type(nameInput, 'Nova')
    expect(screen.getByText('Required · 4 characters · 2 minimum')).toBeInTheDocument()
  })

  it('shows capture progress and prevents duplicate thumbnail requests', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()
    let resolveCapture!: (value: string | null) => void
    mockCaptureFramePreview.mockImplementationOnce(() =>
      new Promise((resolve) => {
        resolveCapture = resolve
      }),
    )
    const user = userEvent.setup()

    renderCreateScenePage()

    await user.click(screen.getByRole('button', { name: /capture thumbnail/i }))

    const captureButton = screen.getByRole('button', { name: /capturing/i })
    expect(captureButton).toBeDisabled()
    expect(captureButton).toHaveAttribute('aria-busy', 'true')
    await user.click(captureButton)
    expect(mockCaptureFramePreview).toHaveBeenCalledTimes(1)

    resolveCapture(CAPTURED_THUMBNAIL_DATA_URL)
    expect(await screen.findByRole('button', { name: /recapture thumbnail/i })).toBeEnabled()
  })

  it('keeps the first section ordered around scene metadata with publishing reserved for Confirm', async () => {
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

    expect(screen.getByRole('heading', { name: /^start with the basics\.$/i })).toBeInTheDocument()
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

    expect(screen.queryByRole('button', { name: /^back$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^next$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create scene/i })).not.toBeInTheDocument()
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

  it('groups animation and music in Motion while keeping camera and raw state elsewhere', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()
    await importCustomScene(user)

    await user.click(screen.getByRole('button', { name: /^motion$/i }))

    expect(screen.getByRole('heading', { name: /^tune how it moves\.$/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^animation speed$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^input gain$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^peak emphasis$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^resting response$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^smoothing$/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/pointer release hold/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/automatic orbit/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/orbit speed/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/state size|current pointer|current audio|pointer down/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/camera orientation mode/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/scene data json/i)).not.toBeInTheDocument()
  })

  it('moves between sections with the shared section menu and keeps its active state in sync', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()

    const detailsStep = screen.getByRole('button', { name: /^details$/i })
    const sceneStep = screen.getByRole('button', { name: /^scene$/i })

    expect(detailsStep).toHaveAttribute('aria-current', 'step')
    expect(sceneStep).not.toHaveAttribute('aria-current')

    await user.click(sceneStep)

    expect(screen.getByRole('heading', { name: /^choose the visual foundation\.$/i })).toBeInTheDocument()
    expect(sceneStep).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('combobox', { name: 'Template' })).toHaveValue('embedded-scene-0')
    expect(screen.queryByLabelText(/custom shader/i)).not.toBeInTheDocument()

    await user.click(detailsStep)

    expect(screen.getByRole('heading', { name: /^start with the basics\.$/i })).toBeInTheDocument()
    expect(detailsStep).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByLabelText(/custom shader/i)).not.toBeInTheDocument()
  })

  it('switches the shared template select to Custom shader when source no longer matches a template', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()
    await importCustomScene(user)

    await user.click(screen.getByRole('button', { name: /^scene$/i }))

    const templateSelect = screen.getByLabelText(/^template$/i)
    const shaderSource = screen.getByLabelText(/custom shader/i)

    await user.clear(shaderSource)
    await user.type(shaderSource, 'let customSize = input()')

    expect(templateSelect).toHaveValue('custom')
    expect(screen.getByRole('option', { name: /^custom shader$/i })).toBeInTheDocument()
  })

  it('marks previous required sections as needing attention when you move past them incomplete', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()

    const detailsStep = screen.getByRole('button', { name: /^details$/i })

    await user.click(screen.getByRole('button', { name: /^scene$/i }))

    expect(screen.getByRole('heading', { name: /^choose the visual foundation\.$/i })).toBeInTheDocument()
    expect(detailsStep).toHaveClass('scene-editor-stepper__button--invalid')
    expect(detailsStep).not.toHaveClass('scene-editor-stepper__button--complete')
    expect(detailsStep).toHaveAttribute('title', 'Scene name is required.')
  })

  it('splits pass ordering into its own section and groups effects into categorized cards', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()
    await importCustomScene(user)

    await user.click(screen.getByRole('button', { name: /^effects$/i }))

    expect(screen.getByRole('heading', { name: /^finish the look\.$/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^control the effect stack\.$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^finish & output$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^channel & motion$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^color & tone$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^pattern & structure$/i })).toBeInTheDocument()
    expect(screen.getByText(/^gamma correction$/i)).toBeInTheDocument()
    expect(screen.getByText(/sharp digital breakups and instability/i)).toBeInTheDocument()
    expect(screen.queryByText(/^additional passes$/i)).not.toBeInTheDocument()
    expect(screen.getByText(/^output pass$/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^pass order$/i }))

    expect(screen.getByRole('heading', { name: /^control the effect stack\.$/i })).toBeInTheDocument()
    expect(screen.getByText(/^output$/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^finish & output$/i })).not.toBeInTheDocument()
  })

  it('reveals inline advanced controls without changing scene data and keeps raw data in Confirm', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()

    const user = userEvent.setup()

    renderCreateScenePage()
    await importCustomScene(user)

    await user.click(screen.getByRole('button', { name: /^camera$/i }))

    expect(screen.getByRole('heading', { name: /^frame the scene\.$/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/camera orientation mode/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /show advanced camera controls/i }))
    expect(screen.getByLabelText(/camera orientation mode/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/camera orientation speed/i)).toBeInTheDocument()
    expect(screen.getByTestId('mage-player')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /hide advanced camera controls/i }))
    expect(screen.queryByLabelText(/camera orientation mode/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('mage-player')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^motion$/i }))

    expect(screen.getByRole('heading', { name: /^tune how it moves\.$/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/state size/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/starting animation time/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /show advanced animation controls/i }))
    expect(screen.getByLabelText(/starting animation time/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/state size|current pointer|current audio|pointer down/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('mage-player')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /hide advanced animation controls/i }))
    expect(screen.queryByLabelText(/starting animation time/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('mage-player')).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: /^advanced$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show scene data|show engine diagnostics|reset advanced settings/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^confirm$/i }))

    expect(screen.getByRole('heading', { name: /^review before publishing\.$/i })).toBeInTheDocument()
    expect(screen.getByText(/^scene name$/i)).toBeInTheDocument()
    expect(screen.getByText(/^motion & effects$/i)).toBeInTheDocument()
    expect(screen.queryByText(/^advanced camera$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/scene data json/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show shader/i })).not.toBeInTheDocument()
    if (screen.queryByRole('button', { name: /show raw json/i })) await user.click(screen.getByRole('button', { name: /show raw json/i }))
    expect(screen.getByLabelText(/scene data json/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /format json/i })).toBeInTheDocument()
    const document = JSON.parse((screen.getByLabelText(/scene data json/i) as HTMLTextAreaElement).value)
    expect(document).toEqual({ schemaVersion: 1, kind: 'custom', scene: createDefaultSceneData() })
    expect(screen.getByTestId('mage-player')).toBeInTheDocument()
  })
})

describe.each(['mage-pulse', 'classic-facebook'] as const)('%s scene studio', (themeId) => {
  it('keeps draft values across all seven basic steps and offers publishing only on Confirm', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage(themeId)

    const emptyThumbnail = screen.getByText('No thumbnail captured')
    const thumbnailFrame = emptyThumbnail.closest('.scene-editor-thumbnail__frame')
    expect(thumbnailFrame).not.toBeNull()
    expect(thumbnailFrame?.querySelector('svg')).toBeNull()
    expect(within(thumbnailFrame as HTMLElement).queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Create a scene' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Start with the basics.' })).toBeInTheDocument()
    expect(screen.getByLabelText('Playlists')).toBeDisabled()
    expect(screen.getByLabelText('Playlists')).toHaveClass('mage-select')
    expect(screen.queryByRole('option', { name: 'Ambient Atlas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^create scene$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^next$/i })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/scene name/i), 'Neon Studio')
    await user.type(screen.getByLabelText(/description/i), 'A live scene draft.')
    await user.click(screen.getByRole('button', { name: /capture thumbnail/i }))
    expect(screen.getByAltText('Captured thumbnail preview')).toBeInTheDocument()
    expect(screen.queryByText('No thumbnail captured')).not.toBeInTheDocument()

    const navigation = within(screen.getByRole('navigation', { name: 'Section navigation' }))
    expect(navigation.getAllByRole('button')).toHaveLength(7)
    for (const section of ['Scene', 'Camera', 'Motion', 'Effects', 'Pass Order', 'Confirm']) {
      await user.click(navigation.getByRole('button', { name: section }))
      expect(navigation.getByRole('button', { name: section })).toHaveAttribute('aria-current', 'step')
    }
    expect(screen.getByRole('heading', { name: 'Review before publishing.' })).toBeInTheDocument()
    expect(screen.getByText('Neon Studio')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^create scene$/i })).toBeEnabled()
    await user.click(navigation.getByRole('button', { name: 'Details' }))
    expect(screen.getByLabelText(/scene name/i)).toHaveValue('Neon Studio')
    expect(screen.getByLabelText(/description/i)).toHaveValue('A live scene draft.')
  })

  it('returns to invalid details and exposes invalid JSON when submitting from Confirm', async () => {
    storeSceneEditorSession()
    mockCreateScenePageFetch()
    const user = userEvent.setup()
    renderCreateScenePage(themeId)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: /^create scene$/i }))
    expect(screen.getByRole('heading', { name: 'Start with the basics.' })).toBeInTheDocument()
    expect(screen.getByLabelText(/scene name/i)).toHaveAttribute('aria-invalid', 'true')
    await user.type(screen.getByLabelText(/scene name/i), 'Valid name')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: 'Show Raw JSON' }))
    fireEvent.change(screen.getByLabelText(/scene data json/i), { target: { value: '{bad json' } })
    await user.click(screen.getByRole('button', { name: /^create scene$/i }))
    expect(screen.getByLabelText(/scene data json/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('mage-player')).toHaveTextContent('preview-ready')
  })

})

// These editor workflows exercise fields/submission with explicit playback permission.
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})
