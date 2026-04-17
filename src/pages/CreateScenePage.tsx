import type { FormEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AuthPage, AuthPageHeader } from "../components/AuthPage";
import { MagePlayer } from "../components/MagePlayer";
import {
  EffectCard,
  NumberField,
  SceneSection,
  SelectField,
  SliderField,
  ToggleField,
  Vector3Field,
} from "../components/SceneEditorControls";
import { parseApiError } from "../lib/authForm";
import { uploadNewSceneThumbnail } from "../lib/sceneThumbnailUpload";
import {
  fetchAvailableTags,
  type TagResponse,
} from "../lib/api";
import {
  createDefaultSceneData,
  getSceneEditorModel,
  mergeSceneEditorBranch,
  parseSceneDataJson,
  PASS_LABELS,
  prettyPrintSceneData,
  sanitizeSceneData,
  SHADER_SCENES,
  SKYBOX_OPTIONS,
  TONE_MAPPING_OPTIONS,
  toDegrees,
  toRadians,
  type PersistedPassFlag,
  type ScenePassId,
  type SceneData,
  type SceneEditorModel,
} from "../lib/sceneEditor";

type CreateSceneFormErrors = Partial<
  Record<"form" | "name" | "newTag" | "sceneData" | "tags" | "thumbnail", string>
>;
type EditorSectionId =
  | "details"
  | "advanced"
  | "camera"
  | "effects"
  | "motion"
  | "pass-order"
  | "scene";
type EffectCategoryId = "color" | "finish" | "pattern" | "trail";
type ThumbnailMode = "skip" | "upload";

type PendingTagAttachment = {
  sceneId: number;
  tagIds: number[];
};

type TagAttachmentFailure = {
  tagId: number;
  tagName: string;
};

type AdditionalPassConfig = {
  category: EffectCategoryId;
  description: string;
  flag: PersistedPassFlag;
  passId: ScenePassId;
};

type EditorSectionConfig = {
  id: EditorSectionId;
  title: string;
};

const EDITOR_SECTIONS: EditorSectionConfig[] = [
  {
    id: "details",
    title: "Details",
  },
  {
    id: "scene",
    title: "Scene",
  },
  {
    id: "camera",
    title: "Camera",
  },
  {
    id: "motion",
    title: "Motion",
  },
  {
    id: "effects",
    title: "Effects",
  },
  {
    id: "pass-order",
    title: "Pass Order",
  },
  {
    id: "advanced",
    title: "Advanced",
  },
];

const initialSceneData = sanitizeSceneData(createDefaultSceneData());
const PLAYLIST_OPTIONS = [
  {
    label: "Featured Collection",
    value: "featured-collection",
  },
  {
    label: "Ambient Atlas",
    value: "ambient-atlas",
  },
  {
    label: "Night Drive",
    value: "night-drive",
  },
  {
    label: "Discovery Lab",
    value: "discovery-lab",
  },
];

const additionalPasses: AdditionalPassConfig[] = [
  {
    category: "trail",
    flag: "glitch",
    passId: "glitchPass",
    description: "Inject sharp digital breakups and instability.",
  },
  {
    category: "pattern",
    flag: "dot",
    passId: "dotShader",
    description: "Halftone-style dots for a print-like screen texture.",
  },
  {
    category: "color",
    flag: "technicolor",
    passId: "technicolorShader",
    description: "Shift the image toward a high-contrast retro palette.",
  },
  {
    category: "color",
    flag: "luminosity",
    passId: "luminosityShader",
    description: "Flatten the palette toward a luminance-driven look.",
  },
  {
    category: "pattern",
    flag: "sobel",
    passId: "sobelShader",
    description: "Emphasize outlines and edge contrast.",
  },
  {
    category: "pattern",
    flag: "halftone",
    passId: "halftonePass",
    description: "Break the image into clustered print cells.",
  },
  {
    category: "finish",
    flag: "gammaCorrection",
    passId: "gammaCorrectionShader",
    description: "Apply a gamma correction pass at the end of the stack.",
  },
];

const additionalPassesByCategory: Record<
  EffectCategoryId,
  AdditionalPassConfig[]
> = {
  color: additionalPasses.filter(
    (passConfig) => passConfig.category === "color",
  ),
  finish: additionalPasses.filter(
    (passConfig) => passConfig.category === "finish",
  ),
  pattern: additionalPasses.filter(
    (passConfig) => passConfig.category === "pattern",
  ),
  trail: additionalPasses.filter(
    (passConfig) => passConfig.category === "trail",
  ),
};

const passFlagsById: Partial<Record<ScenePassId, PersistedPassFlag>> = {
  RGBShift: "rgbShift",
  afterImagePass: "afterImage",
  colorifyShader: "colorify",
  dotShader: "dot",
  gammaCorrectionShader: "gammaCorrection",
  glitchPass: "glitch",
  halftonePass: "halftone",
  kaleidoShader: "kaleid",
  luminosityShader: "luminosity",
  outputPass: "outputPass",
  sobelShader: "sobel",
  technicolorShader: "technicolor",
};

const ALLOWED_THUMBNAIL_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
const MAX_TAG_NAME_LENGTH = 64;
const TAG_SKELETON_COUNT = 5;

function normalizeTagName(name: string) {
  return name.trim().toLowerCase();
}

function sortTags(tags: TagResponse[]) {
  return [...tags].sort((firstTag, secondTag) =>
    firstTag.name.localeCompare(secondTag.name),
  );
}

function upsertTag(tags: TagResponse[], nextTag: TagResponse) {
  return sortTags([
    ...tags.filter((tag) => tag.tagId !== nextTag.tagId),
    nextTag,
  ]);
}

function parseCreatedSceneId(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const sceneId = (payload as { sceneId?: unknown }).sceneId;
  return typeof sceneId === "number" && sceneId > 0 ? sceneId : null;
}

async function loadAvailableTagsFromBackend() {
  return sortTags(await fetchAvailableTags());
}

function buildShaderOptions(currentShader: string) {
  const matchedShaderScene = SHADER_SCENES.find(
    (shaderScene) => shaderScene.shader.trim() === currentShader.trim(),
  );
  const options = SHADER_SCENES.map((shaderScene) => ({
    label: shaderScene.label,
    value: shaderScene.id,
  }));

  if (!matchedShaderScene) {
    options.unshift({
      label: "Custom Shader",
      value: "custom",
    });
  }

  return {
    matchedShaderScene,
    options,
    value: matchedShaderScene?.id ?? "custom",
  };
}

function formatFixed(value: number, fractionDigits = 2) {
  return value.toFixed(fractionDigits).replace(/0+$/, "").replace(/\.$/, "");
}

function formatDegrees(value: number) {
  return `${Math.round(value)}\u00B0`;
}

function NavigationIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 3.8a8.2 8.2 0 1 0 8.2 8.2A8.2 8.2 0 0 0 12 3.8Zm0 14.9a6.7 6.7 0 1 1 6.7-6.7 6.7 6.7 0 0 1-6.7 6.7Z"
        fill="currentColor"
      />
      <path
        d="M14.9 8.3 9.8 10.6a.8.8 0 0 0-.4.4l-2.3 5.1a.4.4 0 0 0 .5.5l5.1-2.3a.8.8 0 0 0 .4-.4l2.3-5.1a.4.4 0 0 0-.5-.5Zm-2.8 4.8-2.4 1.1 1.1-2.4 2.4-1.1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function buildToneMappingOptions(currentMethod: number) {
  const matchedOption = TONE_MAPPING_OPTIONS.find(
    (option) => option.value === currentMethod,
  );
  const options = TONE_MAPPING_OPTIONS.map((option) => ({
    label: option.label,
    value: String(option.value),
  }));

  if (!matchedOption) {
    options.unshift({
      label: `Custom (${currentMethod})`,
      value: String(currentMethod),
    });
  }

  return {
    matchedOption,
    options,
    value: String(currentMethod),
  };
}

function describePassState(passId: ScenePassId, sceneModel: SceneEditorModel) {
  if (passId === "outputPass") {
    return sceneModel.fx.passes.outputPass ? "Enabled" : "Disabled";
  }

  if (passId === "bloom") {
    return sceneModel.fx.bloom.enabled ? "Enabled" : "Disabled";
  }

  const flag = passFlagsById[passId];

  if (!flag) {
    return "Stack only";
  }

  return sceneModel.fx.passes[flag] ? "Enabled" : "Disabled";
}

function validateForm(name: string, sceneDataText: string) {
  const errors: CreateSceneFormErrors = {};
  let parsedSceneData: SceneData | null = null;

  if (!name.trim()) {
    errors.name = "Scene name is required.";
  } else if (name.trim().length < 2) {
    errors.name = "Scene name must be at least 2 characters.";
  }

  if (!sceneDataText.trim()) {
    errors.sceneData = "Scene data is required.";
  } else {
    try {
      parsedSceneData = parseSceneDataJson(sceneDataText.trim());
    } catch (error) {
      errors.sceneData =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Scene data must be valid JSON.";
    }
  }

  return {
    errors,
    parsedSceneData,
  };
}

function validateThumbnailFile(file: File | null) {
  if (!file) {
    return "Select a thumbnail image to upload.";
  }

  if (!ALLOWED_THUMBNAIL_CONTENT_TYPES.has(file.type)) {
    return "Thumbnail must be a jpeg, png, webp, or gif image.";
  }

  if (file.size <= 0) {
    return "Thumbnail file must not be empty.";
  }

  if (file.size > MAX_THUMBNAIL_BYTES) {
    return "Thumbnail must not exceed 5 MB.";
  }

  return null;
}

export function CreateScenePage() {
  const { authenticatedFetch } = useAuth();
  const navigate = useNavigate();

  const [sectionMenuValue, setSectionMenuValue] =
    useState<EditorSectionId>("details");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailMode, setThumbnailMode] = useState<ThumbnailMode>("skip");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailFileName, setThumbnailFileName] = useState("");
  const [playlistValue, setPlaylistValue] = useState("");
  const [availableTags, setAvailableTags] = useState<TagResponse[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [tagSearchValue, setTagSearchValue] = useState("");
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [sceneData, setSceneData] = useState<SceneData>(initialSceneData);
  const [sceneDataText, setSceneDataText] = useState(() =>
    prettyPrintSceneData(initialSceneData),
  );
  const [errors, setErrors] = useState<CreateSceneFormErrors>({});
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [pendingTagAttachment, setPendingTagAttachment] =
    useState<PendingTagAttachment | null>(null);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement | null>(null);
  const thumbnailFileInputRef = useRef<HTMLInputElement | null>(null);

  const formErrorId = useId();
  const tagSearchInputId = useId();
  const thumbnailInputId = useId();
  const titleId = "create-scene-title";
  const sceneModel = useMemo(() => getSceneEditorModel(sceneData), [sceneData]);
  const previewSceneData = useMemo(
    () => sanitizeSceneData(sceneData),
    [sceneData],
  );
  const shaderSelection = useMemo(
    () => buildShaderOptions(sceneModel.visualizer.shader),
    [sceneModel.visualizer.shader],
  );
  const toneMappingSelection = useMemo(
    () => buildToneMappingOptions(sceneModel.fx.toneMapping.method),
    [sceneModel.fx.toneMapping.method],
  );
  const selectedShaderScene = shaderSelection.matchedShaderScene;
  const selectedToneMapping =
    toneMappingSelection.matchedOption ?? TONE_MAPPING_OPTIONS[0];
  const normalizedTagSearchValue = normalizeTagName(tagSearchValue);
  const selectedTags = useMemo(
    () =>
      availableTags.filter((tag) => selectedTagIds.includes(tag.tagId)),
    [availableTags, selectedTagIds],
  );
  const selectableTags = useMemo(
    () =>
      availableTags.filter((tag) => !selectedTagIds.includes(tag.tagId)),
    [availableTags, selectedTagIds],
  );
  const filteredSelectableTags = useMemo(() => {
    if (!normalizedTagSearchValue) {
      return selectableTags;
    }

    return selectableTags.filter((tag) =>
      tag.name.includes(normalizedTagSearchValue),
    );
  }, [normalizedTagSearchValue, selectableTags]);
  const exactMatchedTag = useMemo(
    () =>
      availableTags.find((tag) => tag.name === normalizedTagSearchValue) ?? null,
    [availableTags, normalizedTagSearchValue],
  );
  const isExactMatchedTagSelected =
    exactMatchedTag !== null && selectedTagIds.includes(exactMatchedTag.tagId);
  const canCreateTagFromSearch =
    normalizedTagSearchValue.length > 0 && exactMatchedTag === null;
  const pendingRetryTags = useMemo(
    () =>
      pendingTagAttachment === null
        ? []
        : availableTags.filter((tag) =>
            pendingTagAttachment.tagIds.includes(tag.tagId),
          ),
    [availableTags, pendingTagAttachment],
  );
  const currentSectionIndex = Math.max(
    0,
    EDITOR_SECTIONS.findIndex((section) => section.id === sectionMenuValue),
  );
  const currentSection = EDITOR_SECTIONS[currentSectionIndex] ?? EDITOR_SECTIONS[0];
  const previousSection =
    currentSectionIndex > 0 ? EDITOR_SECTIONS[currentSectionIndex - 1] : null;
  const nextSection =
    currentSectionIndex < EDITOR_SECTIONS.length - 1
      ? EDITOR_SECTIONS[currentSectionIndex + 1]
      : null;

  useEffect(() => {
    let isCurrent = true;

    async function loadTags() {
      try {
        const nextTags = await loadAvailableTagsFromBackend();

        if (!isCurrent) {
          return;
        }

        setAvailableTags(nextTags);
        setTagsError(null);
      } catch (error) {
        if (!isCurrent) {
          return;
        }

        setAvailableTags([]);
        setTagsError(
          error instanceof Error && error.message.trim()
            ? error.message
            : "Unable to load available tags right now.",
        );
      } finally {
        if (isCurrent) {
          setTagsLoading(false);
        }
      }
    }

    void loadTags();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!isTagDropdownOpen) {
      return;
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      if (!tagDropdownRef.current?.contains(event.target as Node)) {
        setIsTagDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, [isTagDropdownOpen]);

  useEffect(() => {
    if (!isTagDropdownOpen) {
      return;
    }

    if (pendingTagAttachment) {
      setIsTagDropdownOpen(false);
    }
  }, [isTagDropdownOpen, pendingTagAttachment]);

  function renderAdditionalPassCard(passConfig: AdditionalPassConfig) {
    return (
      <EffectCard
        description={passConfig.description}
        enabled={sceneModel.fx.passes[passConfig.flag]}
        key={passConfig.flag}
        onToggle={(nextValue) =>
          updateBranch("fx", (currentFx) => ({
            ...currentFx,
            passes: {
              ...currentFx.passes,
              [passConfig.flag]: nextValue,
            },
          }))
        }
        title={PASS_LABELS[passConfig.passId]}
      />
    );
  }

  function clearErrors(...fields: Array<keyof CreateSceneFormErrors>) {
    if (fields.length === 0) {
      setErrors({});
      return;
    }

    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };

      for (const field of fields) {
        nextErrors[field] = undefined;
      }

      return nextErrors;
    });
  }

  function clearThumbnailSelection() {
    setThumbnailFile(null);
    setThumbnailFileName("");
    if (thumbnailFileInputRef.current) {
      thumbnailFileInputRef.current.value = "";
    }
  }

  function applySceneData(nextSceneData: SceneData) {
    const sanitizedSceneData = sanitizeSceneData(nextSceneData);
    setSceneData(sanitizedSceneData);
    setSceneDataText(prettyPrintSceneData(sanitizedSceneData));
    clearErrors("sceneData", "form");
  }

  function updateBranch<K extends keyof SceneEditorModel>(
    branch: K,
    recipe: (currentBranch: SceneEditorModel[K]) => SceneEditorModel[K],
  ) {
    const currentModel = getSceneEditorModel(sceneData);
    const nextBranch = recipe(currentModel[branch]);
    applySceneData(mergeSceneEditorBranch(sceneData, branch, nextBranch));
  }

  function handleNameChange(nextValue: string) {
    setName(nextValue);
    clearErrors("name", "form");
  }

  function handleThumbnailModeChange(nextValue: ThumbnailMode) {
    setThumbnailMode(nextValue);
    if (nextValue === "skip") {
      clearThumbnailSelection();
    }
    setErrors((currentErrors) => ({
      ...currentErrors,
      thumbnail: undefined,
      form: undefined,
    }));
  }

  function handleThumbnailUploadClick() {
    setThumbnailMode("upload");
    thumbnailFileInputRef.current?.click();
  }

  function handleThumbnailFileChange(fileList: FileList | File[] | null) {
    let nextFile: File | null = null;

    if (Array.isArray(fileList)) {
      nextFile = fileList[0] ?? null;
    } else {
      nextFile = fileList?.item(0) ?? null;
    }

    if (!nextFile) {
      return;
    }

    setThumbnailMode("upload");
    setThumbnailFile(nextFile);
    setThumbnailFileName(nextFile.name);
    setErrors((currentErrors) => ({
      ...currentErrors,
      thumbnail: undefined,
      form: undefined,
    }));
  }

  function handleSectionJump(nextSectionId: EditorSectionId) {
    setSectionMenuValue(nextSectionId);
  }

  function handleSectionStep(direction: -1 | 1) {
    const nextIndex = currentSectionIndex + direction;
    const nextSectionConfig = EDITOR_SECTIONS[nextIndex];

    if (!nextSectionConfig) {
      return;
    }

    handleSectionJump(nextSectionConfig.id);
  }

  function handleRawSceneDataChange(nextValue: string) {
    setSceneDataText(nextValue);
    clearErrors("sceneData", "form");

    try {
      setSceneData(sanitizeSceneData(parseSceneDataJson(nextValue)));
    } catch {
      return;
    }
  }

  function handleFormatJson() {
    try {
      const parsedSceneData = parseSceneDataJson(sceneDataText);
      applySceneData(parsedSceneData);
    } catch (error) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        sceneData:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Scene data must be valid JSON before formatting.",
      }));
    }
  }

  async function reloadAvailableTags() {
    setTagsLoading(true);
    setTagsError(null);

    try {
      const nextTags = await loadAvailableTagsFromBackend();
      setAvailableTags(nextTags);
    } catch (error) {
      setAvailableTags([]);
      setTagsError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Unable to load available tags right now.",
      );
    } finally {
      setTagsLoading(false);
    }
  }

  function openTagDropdown() {
    if (pendingTagAttachment || tagsLoading || isCreatingTag) {
      return;
    }

    clearErrors("form", "newTag", "tags");
    setIsTagDropdownOpen(true);
  }

  function handleTagSearchChange(nextValue: string) {
    setTagSearchValue(nextValue);
    setIsTagDropdownOpen(true);
    clearErrors("form", "newTag", "tags");
  }

  function toggleTagSelection(tagId: number) {
    if (pendingTagAttachment || isCreatingTag) {
      return;
    }

    clearErrors("form", "newTag", "tags");
    setSelectedTagIds((currentTagIds) =>
      currentTagIds.includes(tagId)
        ? currentTagIds.filter((currentTagId) => currentTagId !== tagId)
        : [...currentTagIds, tagId],
    );
    setTagSearchValue("");
    setIsTagDropdownOpen(false);
  }

  async function handleCreateTag(requestedTagName = tagSearchValue) {
    if (pendingTagAttachment || isCreatingTag) {
      return;
    }

    const normalizedTagName = normalizeTagName(requestedTagName);

    if (!normalizedTagName) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        newTag: "Tag name is required.",
      }));
      return;
    }

    if (normalizedTagName.length > MAX_TAG_NAME_LENGTH) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        newTag: `Tag name must be at most ${MAX_TAG_NAME_LENGTH} characters.`,
      }));
      return;
    }

    const existingTag = availableTags.find(
      (tag) => tag.name === normalizedTagName,
    );

    if (existingTag) {
      setSelectedTagIds((currentTagIds) =>
        currentTagIds.includes(existingTag.tagId)
          ? currentTagIds
          : [...currentTagIds, existingTag.tagId],
      );
      setTagSearchValue("");
      setIsTagDropdownOpen(false);
      clearErrors("newTag", "form", "tags");
      return;
    }

    setIsCreatingTag(true);
    clearErrors("newTag", "form", "tags");

    try {
      const response = await authenticatedFetch("/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalizedTagName,
        }),
      });

      if (response.ok) {
        const createdTag = (await response.json()) as TagResponse;
        setAvailableTags((currentTags) => upsertTag(currentTags, createdTag));
        setTagsError(null);
        setSelectedTagIds((currentTagIds) =>
          currentTagIds.includes(createdTag.tagId)
            ? currentTagIds
            : [...currentTagIds, createdTag.tagId],
        );
        setTagSearchValue("");
        setIsTagDropdownOpen(false);
        return;
      }

      const apiError = await parseApiError(response);

      if (response.status === 409 && apiError?.code === "TAG_ALREADY_EXISTS") {
        try {
          const nextTags = await loadAvailableTagsFromBackend();
          const matchedTag = nextTags.find(
            (tag) => tag.name === normalizedTagName,
          );

          setAvailableTags(nextTags);
          setTagsError(null);

          if (matchedTag) {
            setSelectedTagIds((currentTagIds) =>
              currentTagIds.includes(matchedTag.tagId)
                ? currentTagIds
                : [...currentTagIds, matchedTag.tagId],
            );
            setTagSearchValue("");
            setIsTagDropdownOpen(false);
            return;
          }
        } catch (error) {
          setTagsError(
            error instanceof Error && error.message.trim()
              ? error.message
              : "Unable to refresh tags right now.",
          );
        }
      }

      setErrors((currentErrors) => ({
        ...currentErrors,
        newTag:
          apiError?.details?.name ??
          apiError?.message ??
          "Failed to create tag. Please try again.",
      }));
    } catch (error) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        newTag:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to create tag. Please try again.",
      }));
    } finally {
      setIsCreatingTag(false);
    }
  }

  async function attachTagsToScene(sceneId: number, tagIds: number[]) {
    const failures: TagAttachmentFailure[] = [];

    for (const tagId of tagIds) {
      const tag = availableTags.find((availableTag) => availableTag.tagId === tagId);

      if (!tag) {
        failures.push({
          tagId,
          tagName: `tag ${tagId}`,
        });
        continue;
      }

      try {
        const response = await authenticatedFetch(`/scenes/${sceneId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tagId,
          }),
        });

        if (response.ok) {
          continue;
        }

        const apiError = await parseApiError(response);

        if (
          response.status === 409 &&
          apiError?.code === "SCENE_TAG_ALREADY_EXISTS"
        ) {
          continue;
        }

        failures.push({
          tagId,
          tagName: tag.name,
        });
      } catch {
        failures.push({
          tagId,
          tagName: tag.name,
        });
      }
    }

    return failures;
  }

  function renderSceneNameField() {
    return (
      <div className="field-group">
        <label htmlFor="name">Scene Name</label>
        <input
          id="name"
          minLength={2}
          name="name"
          onChange={(event) => handleNameChange(event.currentTarget.value)}
          placeholder="Aurora Drift"
          required
          type="text"
          value={name}
          aria-describedby={errors.name ? "name-error" : "name-hint"}
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
    );
  }

  function renderTagEditor() {
    return (
      <div className="field-group">
        <div className="scene-tag-editor__header">
          <span className="scene-tag-editor__label">Tags</span>
          {pendingTagAttachment ? (
            <span className="field-hint">
              Retry mode for scene #{pendingTagAttachment.sceneId}
            </span>
          ) : null}
        </div>

        <p className="field-hint">
          Search existing tags. If there is no exact match, add it from the
          dropdown before saving.
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
                void reloadAvailableTags();
              }}
              type="button"
            >
              Retry tag load
            </button>
          </div>
        ) : null}

        <div
          className="scene-tag-editor__picker"
          role="group"
          aria-label="Available tags"
        >
          {tagsLoading ? (
            <div className="tag-filter-bar" aria-label="Available tags loading">
              {Array.from({ length: TAG_SKELETON_COUNT }, (_, index) => (
                <span
                  key={index}
                  className="tag-pill tag-pill--skeleton"
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : (
            <div className="scene-tag-dropdown" ref={tagDropdownRef}>
              <div className="scene-tag-dropdown__search">
                <label htmlFor={tagSearchInputId}>Select existing tags</label>
                <input
                  aria-controls="scene-tag-dropdown-panel"
                  aria-describedby={errors.newTag ? "tag-editor-error" : undefined}
                  aria-expanded={isTagDropdownOpen}
                  aria-invalid={Boolean(errors.newTag)}
                  disabled={Boolean(pendingTagAttachment) || isCreatingTag}
                  id={tagSearchInputId}
                  onChange={(event) =>
                    handleTagSearchChange(event.currentTarget.value)
                  }
                  onClick={openTagDropdown}
                  onFocus={openTagDropdown}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") {
                      return;
                    }

                    if (canCreateTagFromSearch) {
                      event.preventDefault();
                      void handleCreateTag();
                      return;
                    }

                    if (filteredSelectableTags.length === 1) {
                      event.preventDefault();
                      toggleTagSelection(filteredSelectableTags[0].tagId);
                    }
                  }}
                  placeholder="Search or add tags"
                  type="text"
                  value={tagSearchValue}
                />
              </div>

              {isTagDropdownOpen ? (
                <div
                  className="scene-tag-dropdown__panel"
                  id="scene-tag-dropdown-panel"
                >
                  {filteredSelectableTags.length > 0 || canCreateTagFromSearch ? (
                    <div className="scene-tag-dropdown__options">
                      {filteredSelectableTags.map((tag) => (
                        <button
                          key={tag.tagId}
                          className="scene-tag-dropdown__option"
                          disabled={isCreatingTag}
                          onClick={() => toggleTagSelection(tag.tagId)}
                          type="button"
                        >
                          {tag.name}
                        </button>
                      ))}
                      {canCreateTagFromSearch ? (
                        <button
                          className="scene-tag-dropdown__option scene-tag-dropdown__option--create"
                          disabled={isCreatingTag}
                          onClick={() => {
                            void handleCreateTag();
                          }}
                          type="button"
                        >
                          {isCreatingTag
                            ? `Adding "${normalizedTagSearchValue}"...`
                            : `Add tag "${normalizedTagSearchValue}"`}
                        </button>
                      ) : null}
                    </div>
                  ) : availableTags.length === 0 && !normalizedTagSearchValue ? (
                    <p className="field-hint">
                      No tags exist yet. Type a name to add the first one.
                    </p>
                  ) : isExactMatchedTagSelected ? (
                    <p className="field-hint">That tag is already selected.</p>
                  ) : selectableTags.length === 0 ? (
                    <p className="field-hint">
                      All available tags are already selected.
                    </p>
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
                  onClick={() => toggleTagSelection(tag.tagId)}
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

        {pendingRetryTags.length > 0 ? (
          <p className="field-hint">
            Waiting to retry attachment for:{" "}
            <strong>{pendingRetryTags.map((tag) => tag.name).join(", ")}</strong>
          </p>
        ) : null}
      </div>
    );
  }

  function renderThumbnailField() {
    return (
      <div className="field-group">
        <label htmlFor={thumbnailInputId}>Thumbnail</label>
        <div className="scene-thumbnail-picker">
          <input
            accept="image/jpeg,image/png,image/webp,image/gif"
            aria-label="Upload thumbnail file"
            className="scene-thumbnail-input"
            id={thumbnailInputId}
            onChange={(event) =>
              handleThumbnailFileChange(event.currentTarget.files)
            }
            ref={thumbnailFileInputRef}
            type="file"
          />

          <div className="scene-thumbnail-picker__grid">
            <button
              className={`scene-thumbnail-choice${
                thumbnailMode === "upload" ? " is-selected" : ""
              }`}
              onClick={handleThumbnailUploadClick}
              type="button"
            >
              <span className="scene-thumbnail-choice__eyebrow">Upload</span>
              <strong className="scene-thumbnail-choice__title">Upload File</strong>
              <span className="scene-thumbnail-choice__description">
                Use a custom image.
              </span>
            </button>

            <button
              className={`scene-thumbnail-choice${
                thumbnailMode === "skip" ? " is-selected" : ""
              }`}
              onClick={() => handleThumbnailModeChange("skip")}
              type="button"
            >
              <span className="scene-thumbnail-choice__eyebrow">Optional</span>
              <strong className="scene-thumbnail-choice__title">
                Skip for Now
              </strong>
              <span className="scene-thumbnail-choice__description">
                Create the scene without a thumbnail.
              </span>
            </button>
          </div>

          {thumbnailFileName ? (
            <p className="field-hint">
              Selected file: <strong>{thumbnailFileName}</strong>
            </p>
          ) : null}
          {errors.thumbnail ? (
            <p className="field-error" role="alert">
              {errors.thumbnail}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  function movePass(passId: ScenePassId, direction: -1 | 1) {
    if (passId === "outputPass") {
      return;
    }

    updateBranch("fx", (currentFx) => {
      const movablePasses = currentFx.passOrder.filter(
        (currentPassId): currentPassId is Exclude<ScenePassId, "outputPass"> =>
          currentPassId !== "outputPass",
      );
      const currentIndex = movablePasses.indexOf(passId);
      const nextIndex = currentIndex + direction;

      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= movablePasses.length
      ) {
        return currentFx;
      }

      const nextPassOrder = [...movablePasses];
      const [movedPass] = nextPassOrder.splice(currentIndex, 1);
      nextPassOrder.splice(nextIndex, 0, movedPass);

      return {
        ...currentFx,
        passOrder: [...nextPassOrder, "outputPass"],
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pendingTagAttachment) {
      setIsSubmitting(true);
      setErrors({});

      try {
        const attachFailures = await attachTagsToScene(
          pendingTagAttachment.sceneId,
          pendingTagAttachment.tagIds,
        );

        if (attachFailures.length > 0) {
          setPendingTagAttachment({
            sceneId: pendingTagAttachment.sceneId,
            tagIds: attachFailures.map((failure) => failure.tagId),
          });
          setErrors({
            form: `Scene created, but we still couldn't attach ${attachFailures
              .map((failure) => failure.tagName)
              .join(", ")}. Submit again to retry attachment for the existing scene. Additional editor changes will not be saved in this retry state.`,
          });
          return;
        }

        setPendingTagAttachment(null);
        navigate("/my-scenes");
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    const trimmedName = name.trim();
    const { errors: nextErrors, parsedSceneData } = validateForm(
      trimmedName,
      sceneDataText,
    );
    const nextThumbnailError =
      thumbnailMode === "upload" ? validateThumbnailFile(thumbnailFile) : null;

    if (nextThumbnailError) {
      nextErrors.thumbnail = nextThumbnailError;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const sanitizedSceneData = sanitizeSceneData(parsedSceneData ?? sceneData);

    setIsSubmitting(true);
    setErrors({});

    try {
      const thumbnailObjectKey =
        thumbnailMode === "upload" && thumbnailFile
          ? await uploadNewSceneThumbnail(authenticatedFetch, thumbnailFile)
          : undefined;

      const response = await authenticatedFetch("/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          sceneData: sanitizedSceneData,
          thumbnailObjectKey,
        }),
      });

      if (!response.ok) {
        const apiError = await parseApiError(response);
        const backendDetails = apiError?.details ?? {};
        setErrors({
          name: backendDetails.name,
          sceneData: backendDetails.sceneData,
          form:
            apiError?.message ?? "Failed to create scene. Please try again.",
        });
        return;
      }

      const createdScenePayload = (await response.json().catch(() => null)) as
        | unknown
        | null;
      const sceneId = parseCreatedSceneId(createdScenePayload);

      if (sceneId === null) {
        setErrors({
          form:
            "Scene was created, but the response did not include the new scene id for tag attachment.",
        });
        return;
      }

      if (selectedTagIds.length > 0) {
        const attachFailures = await attachTagsToScene(sceneId, selectedTagIds);

        if (attachFailures.length > 0) {
          setPendingTagAttachment({
            sceneId,
            tagIds: attachFailures.map((failure) => failure.tagId),
          });
          setErrors({
            form: `Scene created, but we couldn't attach ${attachFailures
              .map((failure) => failure.tagName)
              .join(", ")}. Submit again to retry attachment for the existing scene. Additional editor changes will not be saved in this retry state.`,
          });
          return;
        }
      }

      navigate("/my-scenes");
    } catch (error) {
      setErrors({
        form:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Scene creation is unavailable right now. Please try again in a moment.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthPage
      className="auth-page--wide"
      cardClassName="surface--editor"
      titleId={titleId}
    >
      <AuthPageHeader
        description="Build a scene with curated controls and effect shaping."
        eyebrow="Scene Studio"
        title="Create Scene"
        titleId={titleId}
      />

      <form
        aria-describedby={errors.form ? formErrorId : undefined}
        className="scene-editor-form"
        noValidate
        onSubmit={handleSubmit}
      >
        <div className="scene-editor-layout">
          <div className="scene-editor-main">
            <div className="scene-editor-toolbar">
              <div className="scene-editor-toolbar__controls">
                <div className="scene-editor-toolbar__control-group scene-editor-toolbar__control-group--navigation">
                  <div className="scene-editor-toolbar__control-copy">
                    <span className="scene-editor-toolbar__eyebrow">
                      Navigation
                    </span>
                    <label
                      className="scene-field__label"
                      htmlFor="section-jump"
                    >
                      Jump To Section
                    </label>
                    <p className="scene-editor-toolbar__hint">
                      {currentSectionIndex + 1} of {EDITOR_SECTIONS.length}:{" "}
                      {currentSection.title}
                    </p>
                  </div>

                  <div className="scene-editor-toolbar__navigation-shell">
                    <span
                      aria-hidden="true"
                      className="scene-editor-toolbar__navigation-icon"
                    >
                      <NavigationIcon />
                    </span>
                    <select
                      className="scene-select scene-select--navigation"
                      id="section-jump"
                      onChange={(event) =>
                        handleSectionJump(
                          event.currentTarget.value as EditorSectionId,
                        )
                      }
                      value={sectionMenuValue}
                    >
                      {EDITOR_SECTIONS.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {errors.form ? (
              <div className="form-alert" id={formErrorId} role="alert">
                {errors.form}
              </div>
            ) : null}

            {sectionMenuValue === "details" ? (
              <SceneSection
                description="Start with the saved scene metadata before moving into the engine controls."
                title="Details"
              >
                <div className="scene-editor-stack">
                  {renderSceneNameField()}

                  <div className="field-group">
                    <label htmlFor="description">Description</label>
                    <textarea
                      id="description"
                      onChange={(event) =>
                        setDescription(event.currentTarget.value)
                      }
                      placeholder="Describe the mood, motion, or moment this scene is built for."
                      rows={5}
                      value={description}
                    />
                  </div>

                  <div className="field-group">
                    <label htmlFor="playlists">Playlists</label>
                    <select
                      className="scene-select"
                      id="playlists"
                      onChange={(event) =>
                        setPlaylistValue(event.currentTarget.value)
                      }
                      value={playlistValue}
                    >
                      <option value="">Select playlist</option>
                      {PLAYLIST_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {renderThumbnailField()}
                  {renderTagEditor()}
                </div>

              </SceneSection>
            ) : null}

            {sectionMenuValue === "scene" ? (
              <SceneSection
                description="Choose the visual style, background environment, and overall size of the scene."
                title="Scene"
              >
                <div className="scene-editor-grid scene-editor-grid--3">
                  <SelectField
                    description={
                      selectedShaderScene?.description ??
                      "Custom shader text is currently active."
                    }
                    id="shader"
                    label="Shader"
                    onChange={(nextValue) => {
                      const nextShaderScene = SHADER_SCENES.find(
                        (shaderScene) => shaderScene.id === nextValue,
                      );

                      if (!nextShaderScene) {
                        return;
                      }

                      updateBranch("visualizer", (currentVisualizer) => ({
                        ...currentVisualizer,
                        shader: nextShaderScene.shader,
                      }));
                    }}
                    options={shaderSelection.options}
                    value={shaderSelection.value}
                  />

                  <SelectField
                    description="Pick from the bundled skybox options instead of entering loader-specific values."
                    id="skybox"
                    label="Skybox"
                    onChange={(nextValue) =>
                      updateBranch("visualizer", (currentVisualizer) => ({
                        ...currentVisualizer,
                        skyboxPreset: Number(nextValue),
                      }))
                    }
                    options={SKYBOX_OPTIONS.map((option) => ({
                      label: option.label,
                      value: String(option.value),
                    }))}
                    value={String(sceneModel.visualizer.skyboxPreset)}
                  />

                  <SliderField
                    description="Scale the main geometry authored by the shader."
                    formatValue={(value) => formatFixed(value, 0)}
                    id="scene-scale"
                    label="Scene Scale"
                    max={200}
                    min={1}
                    onChange={(nextValue) =>
                      updateBranch("visualizer", (currentVisualizer) => ({
                        ...currentVisualizer,
                        scale: nextValue,
                      }))
                    }
                    step={1}
                    value={sceneModel.visualizer.scale}
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="shader-source">Custom Shader</label>
                  <textarea
                    className="scene-textarea"
                    id="shader-source"
                    onChange={(event) =>
                      updateBranch("visualizer", (currentVisualizer) => ({
                        ...currentVisualizer,
                        shader: event.currentTarget.value,
                      }))
                    }
                    rows={12}
                    value={sceneModel.visualizer.shader}
                  />
                  <p className="field-hint">
                    This is the actual `visualizer.shader` source that ships in
                    the scene. Choosing a shader above swaps this text.
                  </p>
                </div>
              </SceneSection>
            ) : null}

            {sectionMenuValue === "camera" ? (
              <SceneSection
                description="Set the starting view, framing, and lens settings for the scene."
                title="Camera"
              >
                <div className="scene-editor-grid scene-editor-grid--2">
                  <Vector3Field
                    description="The camera position in the scene."
                    id="camera-position"
                    label="Camera Position"
                    onChange={(nextValue) =>
                      updateBranch("controls", (currentControls) => ({
                        ...currentControls,
                        position0: nextValue,
                      }))
                    }
                    value={sceneModel.controls.position0}
                  />

                  <Vector3Field
                    description="Where the camera points while the scene loads."
                    id="camera-target"
                    label="Camera Target"
                    onChange={(nextValue) =>
                      updateBranch("controls", (currentControls) => ({
                        ...currentControls,
                        target0: nextValue,
                      }))
                    }
                    value={sceneModel.controls.target0}
                  />

                  <SliderField
                    description="How wide the camera lens feels."
                    formatValue={(value) => formatFixed(value, 0)}
                    id="field-of-view"
                    label="FOV"
                    max={359}
                    min={1}
                    onChange={(nextValue) =>
                      updateBranch("intent", (currentIntent) => ({
                        ...currentIntent,
                        fov: nextValue,
                      }))
                    }
                    step={1}
                    value={sceneModel.intent.fov}
                  />

                  <SliderField
                    description="Displayed in degrees while the engine still stores radians."
                    formatValue={formatDegrees}
                    id="camera-tilt"
                    label="Camera Orientation"
                    max={360}
                    min={0}
                    onChange={(nextValue) =>
                      updateBranch("intent", (currentIntent) => ({
                        ...currentIntent,
                        camTilt: toRadians(nextValue),
                      }))
                    }
                    step={1}
                    value={toDegrees(sceneModel.intent.camTilt)}
                  />

                  <NumberField
                    description="Free-form camera zoom for precise framing."
                    id="zoom"
                    label="Zoom"
                    onChange={(nextValue) =>
                      updateBranch("controls", (currentControls) => ({
                        ...currentControls,
                        zoom0: nextValue,
                      }))
                    }
                    step={0.1}
                    value={sceneModel.controls.zoom0}
                  />
                </div>
              </SceneSection>
            ) : null}

            {sectionMenuValue === "motion" ? (
              <SceneSection
                description="Adjust how the scene moves and how strongly it responds to audio and input."
                title="Motion"
              >
                <div className="scene-editor-grid scene-editor-grid--2">
                  <NumberField
                    description="Overall engine time multiplier."
                    id="time-multiplier"
                    label="Time Multiplier"
                    onChange={(nextValue) =>
                      updateBranch("intent", (currentIntent) => ({
                        ...currentIntent,
                        time_multiplier: nextValue,
                      }))
                    }
                    step={0.05}
                    value={sceneModel.intent.time_multiplier}
                  />

                  <SliderField
                    description="Scales the incoming audio signal before the engine applies its response curve."
                    id="audio-gain"
                    label="Audio Gain"
                    max={2}
                    min={0.01}
                    onChange={(nextValue) =>
                      updateBranch("intent", (currentIntent) => ({
                        ...currentIntent,
                        minimizing_factor: nextValue,
                      }))
                    }
                    step={0.01}
                    value={sceneModel.intent.minimizing_factor}
                  />

                  <SliderField
                    description="Shapes how sharply the audio response ramps up. Higher values make peaks more selective."
                    id="audio-curve"
                    label="Audio Curve"
                    max={10}
                    min={1}
                    onChange={(nextValue) =>
                      updateBranch("intent", (currentIntent) => ({
                        ...currentIntent,
                        power_factor: nextValue,
                      }))
                    }
                    step={0.1}
                    value={sceneModel.intent.power_factor}
                  />

                  <SliderField
                    description="Controls how much pointer-down influence lingers after release for shaders that read pointer input."
                    id="pointer-release-hold"
                    label="Pointer Release Hold"
                    max={1}
                    min={0}
                    onChange={(nextValue) =>
                      updateBranch("intent", (currentIntent) => ({
                        ...currentIntent,
                        pointerDownMultiplier: nextValue,
                      }))
                    }
                    step={0.01}
                    value={sceneModel.intent.pointerDownMultiplier}
                  />

                  <SliderField
                    description="How quickly the auto rotation travels when enabled."
                    id="rotation-speed"
                    label="Rotation Speed"
                    max={50}
                    min={0.1}
                    onChange={(nextValue) =>
                      updateBranch("intent", (currentIntent) => ({
                        ...currentIntent,
                        autoRotateSpeed: nextValue,
                      }))
                    }
                    step={0.1}
                    value={sceneModel.intent.autoRotateSpeed}
                  />

                  <SliderField
                    description="Base audio-reactive speed shaping used by the engine."
                    id="base-speed"
                    label="Base Speed"
                    max={0.9}
                    min={0.01}
                    onChange={(nextValue) =>
                      updateBranch("intent", (currentIntent) => ({
                        ...currentIntent,
                        base_speed: nextValue,
                      }))
                    }
                    step={0.01}
                    value={sceneModel.intent.base_speed}
                  />

                  <SliderField
                    description="How quickly the reactive size settles toward its latest value."
                    id="easing-speed"
                    label="Easing Speed"
                    max={0.9}
                    min={0.01}
                    onChange={(nextValue) =>
                      updateBranch("intent", (currentIntent) => ({
                        ...currentIntent,
                        easing_speed: nextValue,
                      }))
                    }
                    step={0.01}
                    value={sceneModel.intent.easing_speed}
                  />

                  <div className="scene-editor-grid__item--full">
                    <ToggleField
                      checked={sceneModel.intent.autoRotate}
                      description="Keep the scene gently rotating on its own."
                      id="auto-rotate"
                      label="Auto Rotate"
                      onChange={(nextValue) =>
                        updateBranch("intent", (currentIntent) => ({
                          ...currentIntent,
                          autoRotate: nextValue,
                        }))
                      }
                    />
                  </div>
                </div>
              </SceneSection>
            ) : null}

            {sectionMenuValue === "effects" ? (
              <SceneSection
                description="Add glow, color treatment, distortion, and other finishing effects."
                title="Effects"
              >
                <div className="scene-effects-grid">
                  <div className="scene-effects-category">
                    <h3 className="scene-effects-category__title">
                      Finish &amp; Output
                    </h3>
                    <div className="scene-effects-category__grid">
                      <EffectCard
                        description="Soft glow for bright edges and highlights."
                        enabled={sceneModel.fx.bloom.enabled}
                        onToggle={(nextValue) =>
                          updateBranch("fx", (currentFx) => ({
                            ...currentFx,
                            bloom: {
                              ...currentFx.bloom,
                              enabled: nextValue,
                            },
                          }))
                        }
                        title="Bloom"
                      >
                        <div className="scene-editor-grid scene-editor-grid--2">
                          <SliderField
                            description="Glow intensity."
                            id="bloom-strength"
                            label="Strength"
                            max={10}
                            min={0}
                            onChange={(nextValue) =>
                              updateBranch("fx", (currentFx) => ({
                                ...currentFx,
                                bloom: {
                                  ...currentFx.bloom,
                                  strength: nextValue,
                                },
                              }))
                            }
                            step={0.1}
                            value={sceneModel.fx.bloom.strength}
                          />
                          <SliderField
                            description="Glow radius spread."
                            id="bloom-radius"
                            label="Radius"
                            max={10}
                            min={-10}
                            onChange={(nextValue) =>
                              updateBranch("fx", (currentFx) => ({
                                ...currentFx,
                                bloom: {
                                  ...currentFx.bloom,
                                  radius: nextValue,
                                },
                              }))
                            }
                            step={0.1}
                            value={sceneModel.fx.bloom.radius}
                          />
                          <SliderField
                            description="Threshold for highlights entering the bloom pass."
                            id="bloom-threshold"
                            label="Threshold"
                            max={10}
                            min={0}
                            onChange={(nextValue) =>
                              updateBranch("fx", (currentFx) => ({
                                ...currentFx,
                                bloom: {
                                  ...currentFx.bloom,
                                  threshold: nextValue,
                                },
                              }))
                            }
                            step={0.1}
                            value={sceneModel.fx.bloom.threshold}
                          />
                        </div>
                      </EffectCard>

                      <EffectCard
                        description="Control the final output pass and its tone-mapping response."
                        enabled={sceneModel.fx.passes.outputPass}
                        onToggle={(nextValue) =>
                          updateBranch("fx", (currentFx) => ({
                            ...currentFx,
                            passes: {
                              ...currentFx.passes,
                              outputPass: nextValue,
                            },
                          }))
                        }
                        footer={
                          <p className="scene-effect-footnote">
                            {selectedToneMapping.description}
                          </p>
                        }
                        title="Output Pass"
                      >
                        <div className="scene-editor-grid scene-editor-grid--2">
                          <SelectField
                            description="Switch between the renderer tone-mapping methods used by the MAGE engine."
                            id="tone-mapping-method"
                            label="Tone Mapping"
                            onChange={(nextValue) =>
                              updateBranch("fx", (currentFx) => ({
                                ...currentFx,
                                toneMapping: {
                                  ...currentFx.toneMapping,
                                  method: Number(nextValue),
                                },
                              }))
                            }
                            options={toneMappingSelection.options}
                            value={toneMappingSelection.value}
                          />
                          <SliderField
                            description="Brighten or darken the post-tonemapped output."
                            id="tone-mapping-exposure"
                            label="Exposure"
                            max={500}
                            min={-500}
                            onChange={(nextValue) =>
                              updateBranch("fx", (currentFx) => ({
                                ...currentFx,
                                toneMapping: {
                                  ...currentFx.toneMapping,
                                  exposure: nextValue,
                                },
                              }))
                            }
                            step={1}
                            value={sceneModel.fx.toneMapping.exposure}
                          />
                        </div>
                      </EffectCard>

                      {additionalPassesByCategory.finish.map(
                        renderAdditionalPassCard,
                      )}
                    </div>
                  </div>

                  <div className="scene-effects-category">
                    <h3 className="scene-effects-category__title">
                      Channel &amp; Motion
                    </h3>
                    <div className="scene-effects-category__grid">
                      <EffectCard
                        description="Shift the red, green, and blue channels apart for chromatic distortion."
                        enabled={sceneModel.fx.passes.rgbShift}
                        onToggle={(nextValue) =>
                          updateBranch("fx", (currentFx) => ({
                            ...currentFx,
                            passes: {
                              ...currentFx.passes,
                              rgbShift: nextValue,
                            },
                          }))
                        }
                        title="RGB Shift"
                      >
                        <div className="scene-editor-grid scene-editor-grid--2">
                          <SliderField
                            description="Offset amount between color channels."
                            formatValue={(value) => formatFixed(value, 3)}
                            id="rgb-shift-amount"
                            label="Shift Amount"
                            max={0.1}
                            min={0}
                            onChange={(nextValue) =>
                              updateBranch("fx", (currentFx) => ({
                                ...currentFx,
                                params: {
                                  ...currentFx.params,
                                  rgbShift: {
                                    ...currentFx.params.rgbShift,
                                    amount: nextValue,
                                  },
                                },
                              }))
                            }
                            step={0.001}
                            value={sceneModel.fx.params.rgbShift.amount}
                          />
                          <SliderField
                            description="Displayed in degrees while the engine stores radians."
                            formatValue={formatDegrees}
                            id="rgb-shift-angle"
                            label="Shift Angle"
                            max={360}
                            min={0}
                            onChange={(nextValue) =>
                              updateBranch("fx", (currentFx) => ({
                                ...currentFx,
                                params: {
                                  ...currentFx.params,
                                  rgbShift: {
                                    ...currentFx.params.rgbShift,
                                    angle: toRadians(nextValue),
                                  },
                                },
                              }))
                            }
                            step={1}
                            value={toDegrees(
                              sceneModel.fx.params.rgbShift.angle,
                            )}
                          />
                        </div>
                      </EffectCard>

                      <EffectCard
                        description="Leave fading trails behind moving geometry."
                        enabled={sceneModel.fx.passes.afterImage}
                        onToggle={(nextValue) =>
                          updateBranch("fx", (currentFx) => ({
                            ...currentFx,
                            passes: {
                              ...currentFx.passes,
                              afterImage: nextValue,
                            },
                          }))
                        }
                        title="Afterimage"
                      >
                        <SliderField
                          description="Higher values keep trails visible for longer."
                          id="trail-fade"
                          label="Trail Fade"
                          max={1}
                          min={0}
                          onChange={(nextValue) =>
                            updateBranch("fx", (currentFx) => ({
                              ...currentFx,
                              params: {
                                ...currentFx.params,
                                afterImage: {
                                  ...currentFx.params.afterImage,
                                  damp: nextValue,
                                },
                              },
                            }))
                          }
                          step={0.01}
                          value={sceneModel.fx.params.afterImage.damp}
                        />
                      </EffectCard>

                      {additionalPassesByCategory.trail.map(
                        renderAdditionalPassCard,
                      )}
                    </div>
                  </div>

                  <div className="scene-effects-category">
                    <h3 className="scene-effects-category__title">
                      Color &amp; Tone
                    </h3>
                    <div className="scene-effects-category__grid">
                      <EffectCard
                        description="Wash the output toward a chosen tint."
                        enabled={sceneModel.fx.passes.colorify}
                        onToggle={(nextValue) =>
                          updateBranch("fx", (currentFx) => ({
                            ...currentFx,
                            passes: {
                              ...currentFx.passes,
                              colorify: nextValue,
                            },
                          }))
                        }
                        title="Colorify"
                      >
                        <div className="scene-field">
                          <div className="scene-field__label-row">
                            <label
                              className="scene-field__label"
                              htmlFor="colorify-color"
                            >
                              Color
                            </label>
                          </div>
                          <p className="scene-field__description">
                            Choose the tint used by the colorify pass.
                          </p>
                          <div className="scene-color-field">
                            <input
                              className="scene-color-field__picker"
                              id="colorify-color"
                              onChange={(event) =>
                                updateBranch("fx", (currentFx) => ({
                                  ...currentFx,
                                  params: {
                                    ...currentFx.params,
                                    colorify: {
                                      ...currentFx.params.colorify,
                                      color: event.currentTarget.value,
                                    },
                                  },
                                }))
                              }
                              type="color"
                              value={sceneModel.fx.params.colorify.color}
                            />
                            <span>
                              {sceneModel.fx.params.colorify.color.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </EffectCard>

                      {additionalPassesByCategory.color.map(
                        renderAdditionalPassCard,
                      )}
                    </div>
                  </div>

                  <div className="scene-effects-category">
                    <h3 className="scene-effects-category__title">
                      Pattern &amp; Structure
                    </h3>
                    <div className="scene-effects-category__grid">
                      <EffectCard
                        description="Mirror the frame into repeating radial segments."
                        enabled={sceneModel.fx.passes.kaleid}
                        onToggle={(nextValue) =>
                          updateBranch("fx", (currentFx) => ({
                            ...currentFx,
                            passes: {
                              ...currentFx.passes,
                              kaleid: nextValue,
                            },
                          }))
                        }
                        title="Kaleidoscope"
                      >
                        <div className="scene-editor-grid scene-editor-grid--2">
                          <SliderField
                            description="The number of mirrored slices in the frame."
                            formatValue={(value) => formatFixed(value, 0)}
                            id="kaleid-sides"
                            label="Segments"
                            max={24}
                            min={1}
                            onChange={(nextValue) =>
                              updateBranch("fx", (currentFx) => ({
                                ...currentFx,
                                params: {
                                  ...currentFx.params,
                                  kaleid: {
                                    ...currentFx.params.kaleid,
                                    sides: Math.round(nextValue),
                                  },
                                },
                              }))
                            }
                            step={1}
                            value={Math.round(
                              sceneModel.fx.params.kaleid.sides,
                            )}
                          />
                          <SliderField
                            description="Rotate the mirrored segment pattern in degrees."
                            formatValue={formatDegrees}
                            id="kaleid-angle"
                            label="Rotation"
                            max={360}
                            min={0}
                            onChange={(nextValue) =>
                              updateBranch("fx", (currentFx) => ({
                                ...currentFx,
                                params: {
                                  ...currentFx.params,
                                  kaleid: {
                                    ...currentFx.params.kaleid,
                                    angle: toRadians(nextValue),
                                  },
                                },
                              }))
                            }
                            step={1}
                            value={toDegrees(sceneModel.fx.params.kaleid.angle)}
                          />
                        </div>
                      </EffectCard>

                      {additionalPassesByCategory.pattern.map(
                        renderAdditionalPassCard,
                      )}
                    </div>
                  </div>
                </div>
              </SceneSection>
            ) : null}

            {sectionMenuValue === "pass-order" ? (
              <SceneSection
                description="Change the order of effects to control how the final image is layered. Output always stays last."
                title="Pass Order"
              >
                <ol className="scene-pass-order">
                  {sceneModel.fx.passOrder.map((passId, index) => {
                    const isOutputPass = passId === "outputPass";

                    return (
                      <li className="scene-pass-order__item" key={passId}>
                        <div className="scene-pass-order__copy">
                          <strong>{PASS_LABELS[passId]}</strong>
                          <span>{describePassState(passId, sceneModel)}</span>
                        </div>
                        <div className="scene-pass-order__actions">
                          <button
                            aria-label={`Move ${PASS_LABELS[passId]} up`}
                            className="scene-order-button"
                            disabled={isOutputPass || index === 0}
                            onClick={() => movePass(passId, -1)}
                            type="button"
                          >
                            Up
                          </button>
                          <button
                            aria-label={`Move ${PASS_LABELS[passId]} down`}
                            className="scene-order-button"
                            disabled={
                              isOutputPass ||
                              index >= sceneModel.fx.passOrder.length - 2
                            }
                            onClick={() => movePass(passId, 1)}
                            type="button"
                          >
                            Down
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </SceneSection>
            ) : null}

            {sectionMenuValue === "advanced" ? (
              <SceneSection
                description="Edit advanced settings, startup values, and raw scene JSON."
                title="Advanced"
              >
                <div className="scene-advanced-stack">
                  <div className="scene-editor-grid scene-editor-grid--2">
                    <NumberField
                      description="Experimental compact scene field exported by the library."
                      id="camera-orientation-mode"
                      label="Camera Orientation Mode"
                      min={0}
                      onChange={(nextValue) =>
                        updateBranch("intent", (currentIntent) => ({
                          ...currentIntent,
                          camOrientationMode: Math.max(
                            0,
                            Math.round(nextValue),
                          ),
                        }))
                      }
                      step={1}
                      value={sceneModel.intent.camOrientationMode}
                    />

                    <NumberField
                      description="Experimental compact scene field exported by the library."
                      id="camera-orientation-speed"
                      label="Camera Orientation Speed"
                      min={0}
                      onChange={(nextValue) =>
                        updateBranch("intent", (currentIntent) => ({
                          ...currentIntent,
                          camOrientationSpeed: nextValue,
                        }))
                      }
                      step={0.1}
                      value={sceneModel.intent.camOrientationSpeed}
                    />
                  </div>

                  <div className="field-group">
                    <label>Runtime State</label>
                    <p className="field-hint">
                      Seed low-level engine values for debugging or for scenes
                      that depend on non-default startup state.
                    </p>
                  </div>
                  <div className="scene-editor-grid scene-editor-grid--3">
                    <NumberField
                      description="Low-level runtime state."
                      id="state-size"
                      label="State Size"
                      onChange={(nextValue) =>
                        updateBranch("state", (currentState) => ({
                          ...currentState,
                          size: nextValue,
                        }))
                      }
                      step={0.01}
                      value={sceneModel.state.size}
                    />
                    <NumberField
                      description="Initial runtime pointer state."
                      id="state-pointer-down"
                      label="Pointer Down"
                      onChange={(nextValue) =>
                        updateBranch("state", (currentState) => ({
                          ...currentState,
                          pointerDown: nextValue,
                        }))
                      }
                      step={0.01}
                      value={sceneModel.state.pointerDown}
                    />
                    <NumberField
                      description="Initial smoothed pointer state."
                      id="state-current-pointer-down"
                      label="Current Pointer"
                      onChange={(nextValue) =>
                        updateBranch("state", (currentState) => ({
                          ...currentState,
                          currPointerDown: nextValue,
                        }))
                      }
                      step={0.01}
                      value={sceneModel.state.currPointerDown}
                    />
                    <NumberField
                      description="Initial runtime audio input."
                      id="state-current-audio"
                      label="Current Audio"
                      onChange={(nextValue) =>
                        updateBranch("state", (currentState) => ({
                          ...currentState,
                          currAudio: nextValue,
                        }))
                      }
                      step={0.01}
                      value={sceneModel.state.currAudio}
                    />
                    <NumberField
                      description="Initial runtime time value."
                      id="state-time"
                      label="State Time"
                      onChange={(nextValue) =>
                        updateBranch("state", (currentState) => ({
                          ...currentState,
                          time: nextValue,
                        }))
                      }
                      step={0.01}
                      value={sceneModel.state.time}
                    />
                    <NumberField
                      description="Initial runtime volume multiplier."
                      id="state-volume"
                      label="Volume Multiplier"
                      onChange={(nextValue) =>
                        updateBranch("state", (currentState) => ({
                          ...currentState,
                          volume_multiplier: nextValue,
                        }))
                      }
                      step={0.01}
                      value={sceneModel.state.volume_multiplier}
                    />
                  </div>

                  <div className="field-group">
                    <div className="scene-advanced-header">
                      <div>
                        <label htmlFor="sceneData">Scene Data JSON</label>
                        <p className="field-hint">
                          Raw scene data stays available here. While the JSON is
                          invalid, the preview keeps the last valid scene
                          state.
                        </p>
                      </div>
                      <button
                        className="scene-secondary-button"
                        onClick={handleFormatJson}
                        type="button"
                      >
                        Format JSON
                      </button>
                    </div>
                    <textarea
                      aria-describedby={
                        errors.sceneData ? "sceneData-error" : "sceneData-hint"
                      }
                      aria-invalid={Boolean(errors.sceneData)}
                      className="scene-textarea scene-textarea--code"
                      id="sceneData"
                      name="sceneData"
                      onChange={(event) =>
                        handleRawSceneDataChange(event.currentTarget.value)
                      }
                      required
                      rows={16}
                      value={sceneDataText}
                    />
                    {errors.sceneData ? (
                      <p
                        className="field-error"
                        id="sceneData-error"
                        role="alert"
                      >
                        {errors.sceneData}
                      </p>
                    ) : (
                      <p className="field-hint" id="sceneData-hint">
                        Structured controls above keep this JSON in sync with
                        the current scene.
                      </p>
                    )}
                  </div>
                </div>
              </SceneSection>
            ) : null}

            <div className="scene-editor-action-bar">
              <div className="scene-editor-action-bar__meta">
                <span className="scene-editor-toolbar__eyebrow">Section</span>
                <strong>{currentSection.title}</strong>
                <span>
                  {currentSectionIndex + 1} of {EDITOR_SECTIONS.length}
                </span>
              </div>

              <div className="scene-editor-action-bar__buttons">
                <button
                  className="scene-secondary-button scene-editor-nav-button"
                  disabled={!previousSection || isSubmitting}
                  onClick={() => handleSectionStep(-1)}
                  type="button"
                >
                  Back
                </button>

                <button
                  className="scene-secondary-button scene-editor-nav-button"
                  disabled={!nextSection || isSubmitting}
                  onClick={() => handleSectionStep(1)}
                  type="button"
                >
                  Next
                </button>

                <button
                  className="demo-link auth-submit scene-editor-submit"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting
                    ? pendingTagAttachment
                      ? "Retrying tag attachment..."
                      : "Creating scene..."
                    : pendingTagAttachment
                      ? "Retry tag attachment"
                      : "Create scene"}
                </button>
              </div>
            </div>
          </div>

          <aside className="scene-editor-preview">
            <section className="surface surface--soft scene-editor-preview__card">
              <div className="scene-editor-preview__header">
                <div>
                  <span className="scene-editor-toolbar__eyebrow">
                    Preview
                  </span>
                  <h2>Live Preview</h2>
                </div>
              </div>

              <MagePlayer
                className="scene-editor-preview__player"
                sceneBlob={previewSceneData}
              />
            </section>
          </aside>
        </div>
      </form>
    </AuthPage>
  );
}
