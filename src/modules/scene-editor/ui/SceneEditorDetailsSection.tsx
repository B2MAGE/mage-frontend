import type { RefObject } from 'react'
import { useTheme } from '@theme'
import type { TagResponse } from '@shared/lib'
import { LoadingRegion, PendingButtonLabel, Skeleton } from '@shared/ui'
import { PLAYLIST_OPTIONS } from '../fixtures'
import type { CreateSceneFormErrors, PendingTagAttachment } from '../types'
import { FieldGroupLabel } from './SceneEditorLayout'
import { SceneSection } from './SceneEditorControls'

type SceneEditorDetailsSectionProps = {
  availableTags: TagResponse[]
  canCreateTagFromSearch: boolean
  description: string
  errors: CreateSceneFormErrors
  filteredSelectableTags: TagResponse[]
  isCapturingThumbnail: boolean
  isCreatingTag: boolean
  isExactMatchedTagSelected: boolean
  isSubmitting: boolean
  isTagDropdownOpen: boolean
  name: string
  normalizedTagSearchValue: string
  pendingRetryTags: TagResponse[]
  pendingTagAttachment: PendingTagAttachment | null
  playlistValue: string
  selectableTags: TagResponse[]
  selectedTags: TagResponse[]
  tagDropdownRef: RefObject<HTMLDivElement | null>
  tagSearchInputId: string
  tagSearchValue: string
  tagsError: string | null
  tagsLoading: boolean
  thumbnailPreviewUrl: string | null
  onCreateTag: () => Promise<void>
  onDescriptionChange: (description: string) => void
  onNameChange: (name: string) => void
  onOpenTagDropdown: () => void
  onPlaylistValueChange: (playlistValue: string) => void
  onReloadAvailableTags: () => Promise<void>
  onTagSearchChange: (tagSearchValue: string) => void
  onThumbnailCaptureRequest: () => void
  onToggleTagSelection: (tagId: number) => void
}

function SceneNameField({
  errors,
  name,
  onNameChange,
}: Pick<SceneEditorDetailsSectionProps, 'errors' | 'name' | 'onNameChange'>) {
  return (
    <div className="field-group">
      <FieldGroupLabel htmlFor="name" label="Scene Name" meta="Required · 2+ characters" />
      <input
        id="name"
        minLength={2}
        name="name"
        onChange={(event) => onNameChange(event.currentTarget.value)}
        placeholder="Aurora Drift"
        required
        type="text"
        value={name}
        aria-describedby={errors.name ? 'name-error' : 'name-hint'}
        aria-invalid={Boolean(errors.name)}
      />
      {errors.name ? (
        <p className="field-error" id="name-error" role="alert">
          {errors.name}
        </p>
      ) : (
        <p className="field-hint" id="name-hint">
          Start with a memorable name.
        </p>
      )}
    </div>
  )
}

function SceneDescriptionField({
  description,
  errors,
  onDescriptionChange,
}: Pick<SceneEditorDetailsSectionProps, 'description' | 'errors' | 'onDescriptionChange'>) {
  return (
    <div className="field-group">
      <FieldGroupLabel htmlFor="description" label="Description" meta={`${description.length} / 1000`} />
      <textarea
        aria-describedby={errors.description ? 'description-error' : undefined}
        aria-invalid={Boolean(errors.description)}
        id="description"
        maxLength={1000}
        onChange={(event) => onDescriptionChange(event.currentTarget.value)}
        placeholder="Describe the mood, motion, or moment this scene is built for."
        rows={5}
        value={description}
      />
      {errors.description ? (
        <p className="field-error" id="description-error" role="alert">
          {errors.description}
        </p>
      ) : null}
    </div>
  )
}

function ThumbnailField({
  errors,
  isCapturingThumbnail,
  isSubmitting,
  thumbnailPreviewUrl,
  onThumbnailCaptureRequest,
}: Pick<
  SceneEditorDetailsSectionProps,
  'errors' | 'isCapturingThumbnail' | 'isSubmitting' | 'thumbnailPreviewUrl' | 'onThumbnailCaptureRequest'
>) {
  const { themeId } = useTheme()
  if (themeId === 'mage-pulse') {
    return (
      <div className="field-group">
        <FieldGroupLabel label="Thumbnail" />
        <div className="scene-editor-thumbnail">
          <div className="scene-editor-thumbnail__frame">
            {thumbnailPreviewUrl ? (
              <img alt="Captured thumbnail preview" src={thumbnailPreviewUrl} />
            ) : (
              <span aria-hidden="true" className="scene-editor-thumbnail__placeholder" />
            )}
          </div>
          <div className="scene-editor-thumbnail__copy">
            <strong>Capture the current scene frame</strong>
            <p>Use the current live preview frame as the scene thumbnail. It is captured automatically when creating if needed.</p>
            <button
              aria-busy={isCapturingThumbnail}
              className="scene-secondary-button"
              disabled={isSubmitting || isCapturingThumbnail}
              onClick={onThumbnailCaptureRequest}
              type="button"
            >
              <PendingButtonLabel pending={isCapturingThumbnail} pendingLabel="Capturing...">
                {thumbnailPreviewUrl ? 'Capture Again' : 'Capture Thumbnail'}
              </PendingButtonLabel>
            </button>
          </div>
        </div>
        {errors.thumbnail ? <p className="field-error" role="alert">{errors.thumbnail}</p> : null}
      </div>
    )
  }
  return (
    <div className="field-group">
      <FieldGroupLabel label="Thumbnail" />
      <div className="scene-thumbnail-picker">
        <div className="scene-thumbnail-picker__row">
          <div className="scene-thumbnail-picker__grid">
            <button
              className={`scene-thumbnail-choice${thumbnailPreviewUrl ? ' is-selected' : ''}`}
              aria-busy={isCapturingThumbnail}
              disabled={isSubmitting || isCapturingThumbnail}
              onClick={onThumbnailCaptureRequest}
              type="button"
            >
              <span className="scene-thumbnail-choice__eyebrow">
                {thumbnailPreviewUrl ? 'Recapture' : 'Live Preview'}
              </span>
              <strong className="scene-thumbnail-choice__title">
                <PendingButtonLabel pending={isCapturingThumbnail} pendingLabel="Capturing...">
                  {thumbnailPreviewUrl ? 'Capture Again' : 'Capture Thumbnail'}
                </PendingButtonLabel>
              </strong>
              <span className="scene-thumbnail-choice__description">
                Use the current live preview frame as the scene thumbnail.
              </span>
            </button>
          </div>

          <div className="scene-thumbnail-preview">
            <div className="scene-thumbnail-preview__frame">
              {thumbnailPreviewUrl ? (
                <img
                  alt="Captured thumbnail preview"
                  className="scene-thumbnail-preview__image"
                  src={thumbnailPreviewUrl}
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="scene-card__thumbnail-placeholder scene-thumbnail-preview__placeholder"
                />
              )}
            </div>
          </div>
        </div>

        {errors.thumbnail ? (
          <p className="field-error" role="alert">
            {errors.thumbnail}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function TagEditor({
  availableTags,
  canCreateTagFromSearch,
  errors,
  filteredSelectableTags,
  isCreatingTag,
  isExactMatchedTagSelected,
  isTagDropdownOpen,
  normalizedTagSearchValue,
  pendingRetryTags,
  pendingTagAttachment,
  selectableTags,
  selectedTags,
  tagDropdownRef,
  tagSearchInputId,
  tagSearchValue,
  tagsError,
  tagsLoading,
  onCreateTag,
  onOpenTagDropdown,
  onReloadAvailableTags,
  onTagSearchChange,
  onToggleTagSelection,
}: SceneEditorDetailsSectionProps) {
  return (
    <div className="field-group">
      <div className="scene-tag-editor__header">
        <FieldGroupLabel label="Tags" />
        {pendingTagAttachment ? (
          <span className="field-hint">
            Retry mode for scene #{pendingTagAttachment.sceneId}
          </span>
        ) : null}
      </div>

      <p className="field-hint">
        Search existing tags. If there is no exact match, add it from the dropdown before saving.
      </p>

      {tagsError ? (
        <div className="scene-tag-editor__status">
          <p className="field-error" role="alert">
            {tagsError}
          </p>
          <button
            className="scene-secondary-button"
            disabled={tagsLoading}
            onClick={() => {
              void onReloadAvailableTags()
            }}
            type="button"
          >
            Retry tag load
          </button>
        </div>
      ) : null}

      <div className="scene-tag-editor__picker" role="group" aria-label="Available tags">
        {tagsLoading ? (
          <LoadingRegion className="scene-tag-editor__loading" label="Loading available tags">
            <label htmlFor={`${tagSearchInputId}-loading`}>Select existing tags</label>
            <input
              disabled
              id={`${tagSearchInputId}-loading`}
              placeholder="Loading available tags"
              type="text"
            />
            <Skeleton className="scene-tag-editor__loading-results" shape="block" />
          </LoadingRegion>
        ) : (
          <div className="scene-tag-dropdown" ref={tagDropdownRef}>
            <div className="scene-tag-dropdown__search">
              <label htmlFor={tagSearchInputId}>Select existing tags</label>
              <input
                aria-controls="scene-tag-dropdown-panel"
                aria-describedby={errors.newTag ? 'tag-editor-error' : undefined}
                aria-expanded={isTagDropdownOpen}
                aria-invalid={Boolean(errors.newTag)}
                disabled={Boolean(pendingTagAttachment) || isCreatingTag}
                id={tagSearchInputId}
                onChange={(event) => onTagSearchChange(event.currentTarget.value)}
                onClick={onOpenTagDropdown}
                onFocus={onOpenTagDropdown}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') {
                    return
                  }

                  if (canCreateTagFromSearch) {
                    event.preventDefault()
                    void onCreateTag()
                    return
                  }

                  if (filteredSelectableTags.length === 1) {
                    event.preventDefault()
                    onToggleTagSelection(filteredSelectableTags[0].tagId)
                  }
                }}
                placeholder="Search or add tags"
                type="text"
                value={tagSearchValue}
              />
            </div>

            {isTagDropdownOpen ? (
              <div className="scene-tag-dropdown__panel" id="scene-tag-dropdown-panel">
                {filteredSelectableTags.length > 0 || canCreateTagFromSearch ? (
                  <div className="scene-tag-dropdown__options">
                    {filteredSelectableTags.map((tag) => (
                      <button
                        key={tag.tagId}
                        className="scene-tag-dropdown__option"
                        disabled={isCreatingTag}
                        onClick={() => onToggleTagSelection(tag.tagId)}
                        type="button"
                      >
                        {tag.name}
                      </button>
                    ))}
                    {canCreateTagFromSearch ? (
                      <button
                        aria-busy={isCreatingTag}
                        className="scene-tag-dropdown__option scene-tag-dropdown__option--create"
                        disabled={isCreatingTag}
                        onClick={() => {
                          void onCreateTag()
                        }}
                        type="button"
                      >
                        <PendingButtonLabel
                          pending={isCreatingTag}
                          pendingLabel={`Adding "${normalizedTagSearchValue}"...`}
                        >
                          {`Add tag "${normalizedTagSearchValue}"`}
                        </PendingButtonLabel>
                      </button>
                    ) : null}
                  </div>
                ) : availableTags.length === 0 && !normalizedTagSearchValue ? (
                  <p className="field-hint">No tags exist yet. Type a name to add the first one.</p>
                ) : isExactMatchedTagSelected ? (
                  <p className="field-hint">That tag is already selected.</p>
                ) : selectableTags.length === 0 ? (
                  <p className="field-hint">All available tags are already selected.</p>
                ) : (
                  <p className="field-hint">No matching unselected tags.</p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="scene-tag-editor__selected">
        <span className="scene-tag-editor__selected-label">Selected tags</span>
        {selectedTags.length > 0 ? (
          <div className="scene-tag-editor__selected-list">
            {selectedTags.map((tag) => (
              <button
                key={tag.tagId}
                className="tag-pill tag-pill--active"
                disabled={Boolean(pendingTagAttachment)}
                onClick={() => onToggleTagSelection(tag.tagId)}
                type="button"
              >
                {tag.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="field-hint">No tags selected yet.</p>
        )}
      </div>

      {errors.newTag ? (
        <p className="field-error" id="tag-editor-error" role="alert">
          {errors.newTag}
        </p>
      ) : null}

      {errors.tags ? (
        <p className="field-error" role="alert">
          {errors.tags}
        </p>
      ) : null}

      {pendingRetryTags.length > 0 ? (
        <p className="field-hint">
          Waiting to retry attachment for:{' '}
          <strong>{pendingRetryTags.map((tag) => tag.name).join(', ')}</strong>
        </p>
      ) : null}
    </div>
  )
}

export function SceneEditorDetailsSection(props: SceneEditorDetailsSectionProps) {
  const { themeId } = useTheme()
  const isPulse = themeId === 'mage-pulse'
  return (
    <SceneSection
      description="Set the scene metadata, capture a thumbnail from the live preview, and choose tags for discovery."
      title="Details"
    >
      <div className="scene-editor-stack">
        <SceneNameField errors={props.errors} name={props.name} onNameChange={props.onNameChange} />
        <SceneDescriptionField
          description={props.description}
          errors={props.errors}
          onDescriptionChange={props.onDescriptionChange}
        />

        <div className="field-group">
          <FieldGroupLabel htmlFor="playlists" label="Playlists" meta={isPulse ? 'Unavailable' : 'Optional'} />
          <select
            aria-describedby={isPulse ? 'scene-playlist-unavailable' : undefined}
            className="mage-select"
            disabled={isPulse}
            id="playlists"
            onChange={(event) => props.onPlaylistValueChange(event.currentTarget.value)}
            value={props.playlistValue}
          >
            <option value="">{isPulse ? 'Playlists coming soon' : 'Select playlist'}</option>
            {(!isPulse ? PLAYLIST_OPTIONS : []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {isPulse ? (
            <p className="field-hint" id="scene-playlist-unavailable">Saved playlists are not available yet. You can add local audio in the live preview.</p>
          ) : null}
        </div>

        <ThumbnailField
          errors={props.errors}
          isCapturingThumbnail={props.isCapturingThumbnail}
          isSubmitting={props.isSubmitting}
          thumbnailPreviewUrl={props.thumbnailPreviewUrl}
          onThumbnailCaptureRequest={props.onThumbnailCaptureRequest}
        />
        <TagEditor {...props} />
      </div>
    </SceneSection>
  )
}
