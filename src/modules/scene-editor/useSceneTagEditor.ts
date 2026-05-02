import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { AuthenticatedFetch } from '@auth'
import { parseApiError, type TagResponse } from '@shared/lib'
import { MAX_TAG_NAME_LENGTH } from './fixtures'
import type { CreateSceneFormErrors, PendingTagAttachment } from './types'
import { loadAvailableTagsFromBackend, normalizeTagName, sortTags, upsertTag } from './utils'

type UseSceneTagEditorArgs = {
  authenticatedFetch: AuthenticatedFetch
  clearErrors: (...fields: Array<keyof CreateSceneFormErrors>) => void
  initialSelectedTagNames?: string[]
  pendingTagAttachment: PendingTagAttachment | null
  setErrors: Dispatch<SetStateAction<CreateSceneFormErrors>>
}

export function useSceneTagEditor({
  authenticatedFetch,
  clearErrors,
  initialSelectedTagNames = [],
  pendingTagAttachment,
  setErrors,
}: UseSceneTagEditorArgs) {
  const [availableTags, setAvailableTags] = useState<TagResponse[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [tagSearchValue, setTagSearchValue] = useState('')
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false)
  const [tagsLoading, setTagsLoading] = useState(true)
  const [tagsError, setTagsError] = useState<string | null>(null)
  const [isCreatingTag, setIsCreatingTag] = useState(false)
  const tagDropdownRef = useRef<HTMLDivElement | null>(null)
  const hasAppliedInitialSelectedTagsRef = useRef(false)
  const initialSelectedTagNameSetRef = useRef(
    new Set(initialSelectedTagNames.map((tagName) => normalizeTagName(tagName))),
  )
  const tagSearchInputId = useId()
  const normalizedTagSearchValue = normalizeTagName(tagSearchValue)
  const selectedTags = useMemo(
    () => availableTags.filter((tag) => selectedTagIds.includes(tag.tagId)),
    [availableTags, selectedTagIds],
  )
  const selectableTags = useMemo(
    () => availableTags.filter((tag) => !selectedTagIds.includes(tag.tagId)),
    [availableTags, selectedTagIds],
  )
  const filteredSelectableTags = useMemo(() => {
    if (!normalizedTagSearchValue) {
      return selectableTags
    }

    return selectableTags.filter((tag) => tag.name.includes(normalizedTagSearchValue))
  }, [normalizedTagSearchValue, selectableTags])
  const exactMatchedTag = useMemo(
    () => availableTags.find((tag) => tag.name === normalizedTagSearchValue) ?? null,
    [availableTags, normalizedTagSearchValue],
  )
  const isExactMatchedTagSelected =
    exactMatchedTag !== null && selectedTagIds.includes(exactMatchedTag.tagId)
  const canCreateTagFromSearch =
    normalizedTagSearchValue.length > 0 && exactMatchedTag === null
  const pendingRetryTags = useMemo(
    () =>
      pendingTagAttachment === null
        ? []
        : availableTags.filter((tag) => pendingTagAttachment.tagIds.includes(tag.tagId)),
    [availableTags, pendingTagAttachment],
  )

  useEffect(() => {
    let isCurrent = true

    async function loadTags() {
      try {
        const nextTags = await loadAvailableTagsFromBackend()

        if (!isCurrent) {
          return
        }

        setAvailableTags(nextTags)
        setTagsError(null)
      } catch (error) {
        if (!isCurrent) {
          return
        }

        setAvailableTags([])
        setTagsError(
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Unable to load available tags right now.',
        )
      } finally {
        if (isCurrent) {
          setTagsLoading(false)
        }
      }
    }

    void loadTags()

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    if (hasAppliedInitialSelectedTagsRef.current || tagsLoading) {
      return
    }

    hasAppliedInitialSelectedTagsRef.current = true

    if (initialSelectedTagNameSetRef.current.size === 0) {
      return
    }

    setSelectedTagIds(
      availableTags
        .filter((tag) => initialSelectedTagNameSetRef.current.has(normalizeTagName(tag.name)))
        .map((tag) => tag.tagId),
    )
  }, [availableTags, tagsLoading])

  useEffect(() => {
    if (!isTagDropdownOpen) {
      return
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      if (!tagDropdownRef.current?.contains(event.target as Node)) {
        setIsTagDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
    }
  }, [isTagDropdownOpen])

  useEffect(() => {
    if (!isTagDropdownOpen || !pendingTagAttachment) {
      return
    }

    setIsTagDropdownOpen(false)
  }, [isTagDropdownOpen, pendingTagAttachment])

  async function reloadAvailableTags() {
    setTagsLoading(true)
    setTagsError(null)

    try {
      const nextTags = await loadAvailableTagsFromBackend()
      setAvailableTags(nextTags)
    } catch (error) {
      setAvailableTags([])
      setTagsError(
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Unable to load available tags right now.',
      )
    } finally {
      setTagsLoading(false)
    }
  }

  function openTagDropdown() {
    if (pendingTagAttachment || tagsLoading || isCreatingTag) {
      return
    }

    clearErrors('form', 'newTag', 'tags')
    setIsTagDropdownOpen(true)
  }

  function handleTagSearchChange(nextValue: string) {
    setTagSearchValue(nextValue)
    setIsTagDropdownOpen(true)
    clearErrors('form', 'newTag', 'tags')
  }

  function toggleTagSelection(tagId: number) {
    if (pendingTagAttachment || isCreatingTag) {
      return
    }

    clearErrors('form', 'newTag', 'tags')
    setSelectedTagIds((currentTagIds) =>
      currentTagIds.includes(tagId)
        ? currentTagIds.filter((currentTagId) => currentTagId !== tagId)
        : [...currentTagIds, tagId],
    )
    setTagSearchValue('')
    setIsTagDropdownOpen(false)
  }

  async function handleCreateTag(requestedTagName = tagSearchValue) {
    if (pendingTagAttachment || isCreatingTag) {
      return
    }

    const normalizedTagName = normalizeTagName(requestedTagName)

    if (!normalizedTagName) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        newTag: 'Tag name is required.',
      }))
      return
    }

    if (normalizedTagName.length > MAX_TAG_NAME_LENGTH) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        newTag: `Tag name must be at most ${MAX_TAG_NAME_LENGTH} characters.`,
      }))
      return
    }

    const existingTag = availableTags.find((tag) => tag.name === normalizedTagName)

    if (existingTag) {
      setSelectedTagIds((currentTagIds) =>
        currentTagIds.includes(existingTag.tagId)
          ? currentTagIds
          : [...currentTagIds, existingTag.tagId],
      )
      setTagSearchValue('')
      setIsTagDropdownOpen(false)
      clearErrors('newTag', 'form', 'tags')
      return
    }

    setIsCreatingTag(true)
    clearErrors('newTag', 'form', 'tags')

    try {
      const response = await authenticatedFetch('/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizedTagName,
        }),
      })

      if (response.ok) {
        const createdTag = (await response.json()) as TagResponse
        setAvailableTags((currentTags) => upsertTag(currentTags, createdTag))
        setTagsError(null)
        setSelectedTagIds((currentTagIds) =>
          currentTagIds.includes(createdTag.tagId)
            ? currentTagIds
            : [...currentTagIds, createdTag.tagId],
        )
        setTagSearchValue('')
        setIsTagDropdownOpen(false)
        return
      }

      const apiError = await parseApiError(response)

      if (response.status === 409 && apiError?.code === 'TAG_ALREADY_EXISTS') {
        try {
          const nextTags = await loadAvailableTagsFromBackend()
          const matchedTag = nextTags.find((tag) => tag.name === normalizedTagName)

          setAvailableTags(sortTags(nextTags))
          setTagsError(null)

          if (matchedTag) {
            setSelectedTagIds((currentTagIds) =>
              currentTagIds.includes(matchedTag.tagId)
                ? currentTagIds
                : [...currentTagIds, matchedTag.tagId],
            )
            setTagSearchValue('')
            setIsTagDropdownOpen(false)
            return
          }
        } catch (error) {
          setTagsError(
            error instanceof Error && error.message.trim()
              ? error.message
              : 'Unable to refresh tags right now.',
          )
        }
      }

      setErrors((currentErrors) => ({
        ...currentErrors,
        newTag:
          apiError?.details?.name ??
          apiError?.message ??
          'Failed to create tag. Please try again.',
      }))
    } catch (error) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        newTag:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Failed to create tag. Please try again.',
      }))
    } finally {
      setIsCreatingTag(false)
    }
  }

  return {
    availableTags,
    canCreateTagFromSearch,
    filteredSelectableTags,
    handleCreateTag,
    handleTagSearchChange,
    isCreatingTag,
    isExactMatchedTagSelected,
    isTagDropdownOpen,
    normalizedTagSearchValue,
    openTagDropdown,
    pendingRetryTags,
    reloadAvailableTags,
    selectableTags,
    selectedTagIds,
    selectedTags,
    tagDropdownRef,
    tagSearchInputId,
    tagSearchValue,
    tagsError,
    tagsLoading,
    toggleTagSelection,
  }
}
