import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { TagResponse } from '@shared/lib'
import { AppIcon, LoadingRegion, PendingButtonLabel, Skeleton } from '@shared/ui'
import type { CreateSceneFormErrors } from '../types'
import { FieldGroupLabel } from './SceneEditorLayout'
import { SceneSection } from './SceneEditorControls'

type SceneEditorDetailsSectionProps = {
  availableTags: TagResponse[]
  canCreateTagFromSearch: boolean
  description: string
  errors: CreateSceneFormErrors
  filteredSelectableTags: TagResponse[]
  isCapturingThumbnail: boolean
  isThumbnailCaptureAvailable: boolean
  isCreatingTag: boolean
  isExactMatchedTagSelected: boolean
  isSubmitting: boolean
  isTagDropdownOpen: boolean
  name: string
  normalizedTagSearchValue: string
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
  onReloadAvailableTags: () => Promise<void>
  onTagSearchChange: (tagSearchValue: string) => void
  onThumbnailCaptureRequest: () => void
  onToggleTagSelection: (tagId: number) => void
}

function DetailsGroup({ children, id, label }: { children: ReactNode; id: string; label: string }) {
  return (
    <section aria-labelledby={id} className="scene-editor-details__group">
      <h3 className="scene-editor-details__group-label" id={id}>{label}</h3>
      <div className="scene-editor-details__surface">{children}</div>
    </section>
  )
}

function SceneNameField({
  errors,
  name,
  onNameChange,
}: Pick<SceneEditorDetailsSectionProps, 'errors' | 'name' | 'onNameChange'>) {
  return (
    <div className="field-group scene-editor-details__field-row">
      <FieldGroupLabel
        htmlFor="name"
        label="Scene Name"
        meta={`Required · ${name.length} ${name.length === 1 ? 'character' : 'characters'} · 2 minimum`}
        metaLive="polite"
      />
      <input
        aria-describedby={errors.name ? 'name-error' : 'name-hint'}
        aria-invalid={Boolean(errors.name)}
        id="name"
        minLength={2}
        name="name"
        onChange={(event) => onNameChange(event.currentTarget.value)}
        placeholder="Aurora Drift"
        required
        type="text"
        value={name}
      />
      {errors.name ? (
        <p className="field-error" id="name-error" role="alert">{errors.name}</p>
      ) : (
        <p className="field-hint" id="name-hint">Start with a memorable name.</p>
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
    <div className="field-group scene-editor-details__field-row">
      <FieldGroupLabel
        htmlFor="description"
        label="Description"
        meta={`${description.length} / 1000`}
        metaLive="polite"
      />
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
        <p className="field-error" id="description-error" role="alert">{errors.description}</p>
      ) : null}
    </div>
  )
}

function ThumbnailField({
  errors,
  isCapturingThumbnail,
  isThumbnailCaptureAvailable,
  isSubmitting,
  thumbnailPreviewUrl,
  onThumbnailCaptureRequest,
}: Pick<
  SceneEditorDetailsSectionProps,
  'errors' | 'isCapturingThumbnail' | 'isThumbnailCaptureAvailable' | 'isSubmitting' | 'thumbnailPreviewUrl' | 'onThumbnailCaptureRequest'
>) {
  return (
    <div className="scene-editor-details__thumbnail-row">
      <div
        className="scene-editor-thumbnail__frame"
        data-captured={thumbnailPreviewUrl ? 'true' : 'false'}
      >
        {thumbnailPreviewUrl ? (
          <img alt="Captured thumbnail preview" src={thumbnailPreviewUrl} />
        ) : (
          <span className="scene-editor-thumbnail__placeholder">No thumbnail captured</span>
        )}
      </div>
      <div className="scene-editor-thumbnail__copy">
        <strong>Capture the current scene frame</strong>
        <p>Use the current live preview frame as the scene thumbnail. It is captured automatically when creating if needed.</p>
        <button
          aria-busy={isCapturingThumbnail}
          className="scene-secondary-button"
          disabled={isSubmitting || isCapturingThumbnail || !isThumbnailCaptureAvailable}
          onClick={onThumbnailCaptureRequest}
          type="button"
        >
          <PendingButtonLabel pending={isCapturingThumbnail} pendingLabel="Capturing...">
            {thumbnailPreviewUrl ? 'Recapture Thumbnail' : 'Capture Thumbnail'}
          </PendingButtonLabel>
        </button>
        {!isThumbnailCaptureAvailable ? (
          <p className="scene-editor-thumbnail__status">Capture is unavailable while scene playback is paused.</p>
        ) : null}
      </div>
      {errors.thumbnail ? (
        <p className="field-error scene-editor-details__wide-message" role="alert">{errors.thumbnail}</p>
      ) : null}
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
  const tagDropdownPanelRef = useRef<HTMLDivElement | null>(null)
  const [tagDropdownPosition, setTagDropdownPosition] = useState<{
    left: number
    placement: 'above' | 'below'
    top: number
    width: number
  }>({ left: 0, placement: 'below', top: -10000, width: 0 })

  useLayoutEffect(() => {
    const dropdown = tagDropdownRef.current
    const panel = tagDropdownPanelRef.current

    if (!isTagDropdownOpen || !dropdown || !panel) {
      return
    }

    const positionedDropdown = dropdown
    const positionedPanel = panel
    const scrollContainer = dropdown.closest<HTMLElement>('.scene-editor-main')

    function updatePlacement() {
      const dropdownBounds = positionedDropdown.getBoundingClientRect()
      const panelHeight = positionedPanel.getBoundingClientRect().height
      const viewportTop = 8
      const viewportBottom = window.innerHeight - 8
      const spaceAbove = dropdownBounds.top - viewportTop - 8
      const spaceBelow = viewportBottom - dropdownBounds.bottom - 8
      const placement = spaceBelow < panelHeight && spaceAbove > spaceBelow ? 'above' : 'below'
      const preferredTop = placement === 'above'
        ? dropdownBounds.top - panelHeight - 8
        : dropdownBounds.bottom + 8
      const top = Math.max(viewportTop, Math.min(preferredTop, viewportBottom - panelHeight))

      setTagDropdownPosition({
        left: dropdownBounds.left,
        placement,
        top,
        width: dropdownBounds.width,
      })
    }

    updatePlacement()

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updatePlacement)
    resizeObserver?.observe(panel)
    scrollContainer?.addEventListener('scroll', updatePlacement, { passive: true })
    window.addEventListener('resize', updatePlacement)

    return () => {
      resizeObserver?.disconnect()
      scrollContainer?.removeEventListener('scroll', updatePlacement)
      window.removeEventListener('resize', updatePlacement)
    }
  }, [canCreateTagFromSearch, filteredSelectableTags.length, isTagDropdownOpen, tagDropdownRef])

  const tagDropdownPortalStyle: CSSProperties = {
    left: tagDropdownPosition.left,
    top: tagDropdownPosition.top,
    width: tagDropdownPosition.width,
  }

  return (
    <div className="scene-tag-editor">
      <div className="scene-tag-editor__search-row">
        <div className="scene-tag-editor__header">
          <FieldGroupLabel
            htmlFor={tagSearchInputId}
            label="Tags"
            meta={`${selectedTags.length} selected`}
            metaLive="polite"
          />

        </div>

        <p className="field-hint">Search existing tags. If there is no exact match, add it before saving.</p>

        {tagsError ? (
          <div className="scene-tag-editor__status">
            <p className="field-error" role="alert">{tagsError}</p>
            <button
              className="scene-secondary-button"
              disabled={tagsLoading}
              onClick={() => { void onReloadAvailableTags() }}
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
              <input disabled id={`${tagSearchInputId}-loading`} placeholder="Loading available tags" type="text" />
              <Skeleton className="scene-tag-editor__loading-results" shape="block" />
            </LoadingRegion>
          ) : (
            <div className="scene-tag-dropdown" ref={tagDropdownRef}>
              <div className="scene-tag-dropdown__search">
                <input
                  aria-label="Select existing tags"
                  aria-controls="scene-tag-dropdown-panel"
                  aria-describedby={errors.newTag ? 'tag-editor-error' : undefined}
                  aria-expanded={isTagDropdownOpen}
                  aria-invalid={Boolean(errors.newTag)}
                  disabled={isCreatingTag}
                  id={tagSearchInputId}
                  onChange={(event) => onTagSearchChange(event.currentTarget.value)}
                  onClick={onOpenTagDropdown}
                  onFocus={onOpenTagDropdown}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return

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

              {isTagDropdownOpen ? createPortal(
                <div
                  className="scene-editor-page scene-tag-dropdown__portal"
                  data-placement={tagDropdownPosition.placement}
                  style={tagDropdownPortalStyle}
                >
                  <div
                    className="scene-tag-dropdown__panel"
                    id="scene-tag-dropdown-panel"
                    ref={tagDropdownPanelRef}
                  >
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
                          onClick={() => { void onCreateTag() }}
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
                </div>
              , document.body) : null}
            </div>
          )}
        </div>
      </div>

      <div className="scene-tag-editor__selected">
        <div className="scene-tag-editor__selected-heading">
          <span className="scene-tag-editor__selected-label">Selected tags</span>
          <span className="scene-field__meta">Press Enter to add</span>
        </div>
        {selectedTags.length > 0 ? (
          <div className="scene-tag-editor__selected-list">
            {selectedTags.map((tag) => (
              <button
                aria-label={`Remove ${tag.name}`}
                key={tag.tagId}
                className="tag-pill tag-pill--active"
                onClick={() => onToggleTagSelection(tag.tagId)}
                type="button"
              >
                {tag.name}
                <AppIcon className="scene-tag-editor__selected-remove-icon" name="x" size={12} />
              </button>
            ))}
          </div>
        ) : (
          <p className="field-hint">No tags selected yet.</p>
        )}

        {errors.newTag ? (
          <p className="field-error" id="tag-editor-error" role="alert">{errors.newTag}</p>
        ) : null}
        {errors.tags ? <p className="field-error" role="alert">{errors.tags}</p> : null}

      </div>
    </div>
  )
}

export function SceneEditorDetailsSection(props: SceneEditorDetailsSectionProps) {
  return (
    <SceneSection
      description="Set the scene metadata, capture a thumbnail from the live preview, and choose tags for discovery."
      title="Details"
    >
      <div className="scene-editor-details">
        <DetailsGroup id="scene-information-heading" label="Scene information">
          <SceneNameField errors={props.errors} name={props.name} onNameChange={props.onNameChange} />
          <SceneDescriptionField
            description={props.description}
            errors={props.errors}
            onDescriptionChange={props.onDescriptionChange}
          />

        </DetailsGroup>

        <DetailsGroup id="scene-thumbnail-heading" label="Thumbnail">
          <ThumbnailField
            errors={props.errors}
            isCapturingThumbnail={props.isCapturingThumbnail}
            isThumbnailCaptureAvailable={props.isThumbnailCaptureAvailable}
            isSubmitting={props.isSubmitting}
            thumbnailPreviewUrl={props.thumbnailPreviewUrl}
            onThumbnailCaptureRequest={props.onThumbnailCaptureRequest}
          />
        </DetailsGroup>

        <DetailsGroup id="scene-discovery-heading" label="Discovery">
          <TagEditor {...props} />
        </DetailsGroup>
      </div>
    </SceneSection>
  )
}
