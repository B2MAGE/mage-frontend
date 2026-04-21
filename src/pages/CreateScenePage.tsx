import type { FormEvent, PropsWithChildren, ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@auth";
import { AuthPage, AuthPageHeader } from "@components/AuthPage";
import { MagePlayer } from "@modules/player";
import {
  EffectCard,
  NumberField,
  SceneSection,
  SelectField,
  SliderField,
  ToggleField,
  Vector3Field,
} from "@components/SceneEditorControls";
import { uploadNewSceneThumbnail } from "@lib/sceneThumbnailUpload";
import { parseApiError } from "@shared/lib";
import {
  fetchAvailableTags,
  type TagResponse,
} from "@lib/api";
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
} from "@lib/sceneEditor";

type CreateSceneFormErrors = Partial<
  Record<"form" | "name" | "newTag" | "sceneData" | "tags" | "thumbnail", string>
>;
type EditorSectionId =
  | "confirm"
  | "details"
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
    id: "confirm",
    title: "Confirm",
  },
];

const initialSceneData = sanitizeSceneData(createDefaultSceneData());
const initialSceneModel = getSceneEditorModel(initialSceneData);
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

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="m9.55 16.65-4.2-4.2 1.4-1.4 2.8 2.8 7.65-7.65 1.4 1.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M11 6h2v8h-2zm0 10h2v2h-2z" fill="currentColor" />
    </svg>
  );
}

function FieldGroupLabel({
  description,
  htmlFor,
  label,
}: {
  description?: string;
  htmlFor?: string;
  label: string;
}) {
  return (
    <div className="scene-field__copy">
      <div className="scene-field__label-row">
        {htmlFor ? (
          <label className="scene-field__label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="scene-field__label">{label}</span>
        )}
      </div>
      {description ? (
        <p className="scene-field__description">{description}</p>
      ) : null}
    </div>
  );
}

function CollapsibleEditorGroup({
  children,
  hideLabel,
  id,
  isOpen,
  onToggle,
  showLabel,
}: PropsWithChildren<{
  hideLabel?: string;
  id: string;
  isOpen: boolean;
  onToggle: () => void;
  showLabel?: string;
}>) {
  return (
    <section className="scene-editor-collapsible">
      <button
        aria-controls={id}
        aria-expanded={isOpen}
        className="scene-editor-collapsible__toggle"
        onClick={onToggle}
        type="button"
      >
        {isOpen ? hideLabel ?? "Hide Advanced" : showLabel ?? "Show Advanced"}
      </button>

      {isOpen ? (
        <div className="scene-editor-collapsible__content" id={id}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function ConfirmSummarySection({
  children,
  title,
}: PropsWithChildren<{
  title: string;
}>) {
  return (
    <section className="scene-confirm-section">
      <h3 className="scene-confirm-section__title">{title}</h3>
      <dl className="scene-confirm-section__list">{children}</dl>
    </section>
  );
}

function ConfirmSummaryItem({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="scene-confirm-section__item">
      <dt className="scene-confirm-section__term">{label}</dt>
      <dd className="scene-confirm-section__value">{value}</dd>
    </div>
  );
}

function ConfirmSummaryPills({
  emptyLabel,
  values,
}: {
  emptyLabel: string;
  values: string[];
}) {
  if (values.length === 0) {
    return <span>{emptyLabel}</span>;
  }

  return (
    <span className="scene-confirm-pills">
      {values.map((value) => (
        <span className="scene-confirm-pill" key={value}>
          {value}
        </span>
      ))}
    </span>
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
  const nameError = validateSceneName(name);
  const { error: sceneDataError, parsedSceneData } =
    validateSceneDataText(sceneDataText);

  if (nameError) {
    errors.name = nameError;
  }

  if (sceneDataError) {
    errors.sceneData = sceneDataError;
  }

  return {
    errors,
    parsedSceneData,
  };
}

function validateSceneName(name: string) {
  if (!name.trim()) {
    return "Scene name is required.";
  }

  if (name.trim().length < 2) {
    return "Scene name must be at least 2 characters.";
  }

  return null;
}

function validateSceneDataText(sceneDataText: string) {
  if (!sceneDataText.trim()) {
    return {
      error: "Scene data is required.",
      parsedSceneData: null,
    };
  }

  try {
    return {
      error: null,
      parsedSceneData: parseSceneDataJson(sceneDataText.trim()),
    };
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message.trim()
          ? error.message
          : "Scene data must be valid JSON.",
      parsedSceneData: null,
    };
  }
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

function buildEffectiveSceneData(
  sourceSceneData: SceneData,
  {
    isCameraAdvancedEnabled,
    isMotionAdvancedEnabled,
  }: {
    isCameraAdvancedEnabled: boolean;
    isMotionAdvancedEnabled: boolean;
  },
) {
  let nextSceneData = sourceSceneData;

  if (!isCameraAdvancedEnabled) {
    nextSceneData = mergeSceneEditorBranch(nextSceneData, "intent", {
      ...getSceneEditorModel(nextSceneData).intent,
      camOrientationMode: initialSceneModel.intent.camOrientationMode,
      camOrientationSpeed: initialSceneModel.intent.camOrientationSpeed,
    });
  }

  if (!isMotionAdvancedEnabled) {
    nextSceneData = mergeSceneEditorBranch(
      nextSceneData,
      "state",
      initialSceneModel.state,
    );
  }

  return sanitizeSceneData(nextSceneData);
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
  const [isActionBarStuck, setIsActionBarStuck] = useState(false);
  const [isCameraAdvancedEnabled, setIsCameraAdvancedEnabled] = useState(false);
  const [isMotionAdvancedEnabled, setIsMotionAdvancedEnabled] = useState(false);
  const [cameraAdvancedDraft, setCameraAdvancedDraft] = useState(() => ({
    camOrientationMode: initialSceneModel.intent.camOrientationMode,
    camOrientationSpeed: initialSceneModel.intent.camOrientationSpeed,
  }));
  const [motionRuntimeDraft, setMotionRuntimeDraft] = useState(
    () => initialSceneModel.state,
  );
  const [isConfirmJsonOpen, setIsConfirmJsonOpen] = useState(false);
  const [pendingTagAttachment, setPendingTagAttachment] =
    useState<PendingTagAttachment | null>(null);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement | null>(null);
  const thumbnailFileInputRef = useRef<HTMLInputElement | null>(null);
  const actionBarSentinelRef = useRef<HTMLDivElement | null>(null);

  const formErrorId = useId();
  const tagSearchInputId = useId();
  const thumbnailInputId = useId();
  const titleId = "create-scene-title";

  const sceneModel = useMemo(() => getSceneEditorModel(sceneData), [sceneData]);
  const previewSceneData = useMemo(
    () =>
      buildEffectiveSceneData(sceneData, {
        isCameraAdvancedEnabled,
        isMotionAdvancedEnabled,
      }),
    [sceneData, isCameraAdvancedEnabled, isMotionAdvancedEnabled],
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
  const detailsSectionIssueMessages = [
    validateSceneName(name),
    thumbnailMode === "upload" ? validateThumbnailFile(thumbnailFile) : null,
  ].filter((message): message is string => Boolean(message));
  const confirmSectionIssueMessage = validateSceneDataText(sceneDataText).error;
  const sectionIssuesById: Partial<Record<EditorSectionId, string | null>> = {
    confirm: confirmSectionIssueMessage,
    details:
      detailsSectionIssueMessages.length > 0
        ? detailsSectionIssueMessages.join(" ")
        : null,
  };

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

  useEffect(() => {
    const sentinel = actionBarSentinelRef.current;

    if (!sentinel || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsActionBarStuck(entry.intersectionRatio < 1);
      },
      {
        threshold: 1,
      },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, []);

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

  function handleCameraAdvancedToggle(nextValue: boolean) {
    if (nextValue) {
      setIsCameraAdvancedEnabled(true);
      updateBranch("intent", (currentIntent) => ({
        ...currentIntent,
        camOrientationMode: cameraAdvancedDraft.camOrientationMode,
        camOrientationSpeed: cameraAdvancedDraft.camOrientationSpeed,
      }));
      return;
    }

    setCameraAdvancedDraft({
      camOrientationMode: sceneModel.intent.camOrientationMode,
      camOrientationSpeed: sceneModel.intent.camOrientationSpeed,
    });
    setIsCameraAdvancedEnabled(false);
    updateBranch("intent", (currentIntent) => ({
      ...currentIntent,
      camOrientationMode: initialSceneModel.intent.camOrientationMode,
      camOrientationSpeed: initialSceneModel.intent.camOrientationSpeed,
    }));
  }

  function handleMotionAdvancedToggle(nextValue: boolean) {
    if (nextValue) {
      setIsMotionAdvancedEnabled(true);
      updateBranch("state", () => motionRuntimeDraft);
      return;
    }

    setMotionRuntimeDraft(sceneModel.state);
    setIsMotionAdvancedEnabled(false);
    updateBranch("state", () => initialSceneModel.state);
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
      applySceneData(
        buildEffectiveSceneData(parsedSceneData, {
          isCameraAdvancedEnabled,
          isMotionAdvancedEnabled,
        }),
      );
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
        <FieldGroupLabel htmlFor="name" label="Scene Name" />
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
          <FieldGroupLabel label="Tags" />
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
        <FieldGroupLabel htmlFor={thumbnailInputId} label="Thumbnail" />
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

  function renderCameraAdvancedFields() {
    return (
      <div className="scene-editor-grid">
        <NumberField
          description="Experimental compact scene field exported by the library."
          id="camera-orientation-mode"
          label="Camera Orientation Mode"
          min={0}
          onChange={(nextValue) =>
            updateBranch("intent", (currentIntent) => ({
              ...currentIntent,
              camOrientationMode: Math.max(0, Math.round(nextValue)),
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
    );
  }

  function renderRuntimeStateFields() {
    return (
      <div className="scene-editor-grid">
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
    );
  }

  function renderRawSceneDataEditor() {
    return (
      <div className="field-group">
        <div className="scene-advanced-header">
          <div>
            <FieldGroupLabel
              description="Inspect and edit the raw scene JSON directly."
              htmlFor="sceneData"
              label="Scene Data JSON"
            />
            <p className="field-hint">
              Raw scene data stays available here. While the JSON is invalid,
              the preview keeps the last valid scene state.
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
          onChange={(event) => handleRawSceneDataChange(event.currentTarget.value)}
          required
          rows={16}
          value={sceneDataText}
        />
        {errors.sceneData ? (
          <p className="field-error" id="sceneData-error" role="alert">
            {errors.sceneData}
          </p>
        ) : (
          <p className="field-hint" id="sceneData-hint">
            Structured controls above keep this JSON in sync with the current
            scene.
          </p>
        )}
      </div>
    );
  }

  function formatOptionalText(value: string) {
    return value.trim() ? value.trim() : "Not set";
  }

  function formatVectorSummary(value: { x: number; y: number; z: number }) {
    return (
      <span className="scene-confirm-vector">
        {(["x", "y", "z"] as const).map((axis) => (
          <span className="scene-confirm-vector__item" key={axis}>
            <span className="scene-confirm-vector__axis">
              {axis.toUpperCase()}
            </span>
            <span className="scene-confirm-vector__value">
              {formatFixed(value[axis])}
            </span>
          </span>
        ))}
      </span>
    );
  }

  function formatRuntimeStateSummary() {
    const runtimeStatePairs: Array<[string, number, number]> = [
      ["Size", sceneModel.state.size, initialSceneModel.state.size] as [
        string,
        number,
        number,
      ],
      [
        "Pointer",
        sceneModel.state.pointerDown,
        initialSceneModel.state.pointerDown,
      ] as [string, number, number],
      [
        "Current Pointer",
        sceneModel.state.currPointerDown,
        initialSceneModel.state.currPointerDown,
      ] as [string, number, number],
      [
        "Current Audio",
        sceneModel.state.currAudio,
        initialSceneModel.state.currAudio,
      ] as [string, number, number],
      ["Time", sceneModel.state.time, initialSceneModel.state.time] as [
        string,
        number,
        number,
      ],
      [
        "Volume",
        sceneModel.state.volume_multiplier,
        initialSceneModel.state.volume_multiplier,
      ] as [string, number, number],
    ].filter(([, value, initialValue]) => value !== initialValue);

    if (runtimeStatePairs.length === 0) {
      return "Default";
    }

    return runtimeStatePairs
      .map(([label, value]) => `${label} ${formatFixed(value)}`)
      .join(" • ");
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

    const sanitizedSceneData = buildEffectiveSceneData(parsedSceneData ?? sceneData, {
      isCameraAdvancedEnabled,
      isMotionAdvancedEnabled,
    });

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
                  <nav
                    aria-label="Section navigation"
                    className="scene-editor-stepper"
                  >
                    <ol className="scene-editor-stepper__list">
                      {EDITOR_SECTIONS.map((section, index) => {
                        const isActive = section.id === currentSection.id;
                        const isPrevious = index < currentSectionIndex;
                        const issueMessage = sectionIssuesById[section.id];
                        const hasIssues = Boolean(issueMessage);
                        const isInvalid = isPrevious && hasIssues;
                        const isComplete = isPrevious && !hasIssues;

                        return (
                          <li
                            className="scene-editor-stepper__item"
                            key={section.id}
                          >
                            <button
                              aria-current={isActive ? "step" : undefined}
                              className={
                                isActive
                                  ? "scene-editor-stepper__button scene-editor-stepper__button--active"
                                  : isInvalid
                                    ? "scene-editor-stepper__button scene-editor-stepper__button--invalid"
                                  : isComplete
                                    ? "scene-editor-stepper__button scene-editor-stepper__button--complete"
                                    : "scene-editor-stepper__button"
                              }
                              onClick={() => handleSectionJump(section.id)}
                              title={isInvalid ? issueMessage ?? undefined : undefined}
                              type="button"
                            >
                              <span className="scene-editor-stepper__label">
                                {section.title}
                              </span>
                              <span
                                aria-hidden="true"
                                className="scene-editor-stepper__marker"
                              >
                                {isInvalid ? <AlertIcon /> : isComplete ? <CheckIcon /> : null}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </nav>
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
                    <FieldGroupLabel htmlFor="description" label="Description" />
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
                    <FieldGroupLabel htmlFor="playlists" label="Playlists" />
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
                <div className="scene-editor-grid">
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
                  <FieldGroupLabel
                    description="Edit the actual shader source saved into visualizer.shader for this scene."
                    htmlFor="shader-source"
                    label="Custom Shader"
                  />
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
                </div>
              </SceneSection>
            ) : null}

            {sectionMenuValue === "camera" ? (
              <SceneSection
                description="Set the starting view, framing, and lens settings for the scene."
                title="Camera"
              >
                <div className="scene-editor-stack">
                  <div className="scene-editor-grid">
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

                  <CollapsibleEditorGroup
                    hideLabel="Disable Advanced"
                    id="camera-advanced-options"
                    isOpen={isCameraAdvancedEnabled}
                    onToggle={() =>
                      handleCameraAdvancedToggle(!isCameraAdvancedEnabled)
                    }
                    showLabel="Enable Advanced"
                  >
                    {renderCameraAdvancedFields()}
                  </CollapsibleEditorGroup>
                </div>
              </SceneSection>
            ) : null}

            {sectionMenuValue === "motion" ? (
              <SceneSection
                description="Adjust how the scene moves and how strongly it responds to audio and input."
                title="Motion"
              >
                <div className="scene-editor-stack">
                  <div className="scene-editor-grid">
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

                  <CollapsibleEditorGroup
                    hideLabel="Disable Advanced"
                    id="motion-runtime-state"
                    isOpen={isMotionAdvancedEnabled}
                    onToggle={() =>
                      handleMotionAdvancedToggle(!isMotionAdvancedEnabled)
                    }
                    showLabel="Enable Advanced"
                  >
                    {renderRuntimeStateFields()}
                  </CollapsibleEditorGroup>
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
                          <div className="scene-pass-order__header">
                            <strong>{PASS_LABELS[passId]}</strong>
                            <span className="scene-pass-order__index">
                              {index + 1}
                            </span>
                          </div>
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

            {sectionMenuValue === "confirm" ? (
              <SceneSection
                description="Review the scene setup before creating it and expand the raw JSON only if you need a final low-level check."
                title="Confirm"
              >
                <div className="scene-editor-stack">
                  <div className="scene-confirm-summary">
                    <ConfirmSummarySection title="Details">
                      <ConfirmSummaryItem
                        label="Scene Name"
                        value={formatOptionalText(name)}
                      />
                      <ConfirmSummaryItem
                        label="Description"
                        value={formatOptionalText(description)}
                      />
                      <ConfirmSummaryItem
                        label="Playlist"
                        value={
                          playlistValue
                            ? PLAYLIST_OPTIONS.find(
                                (option) => option.value === playlistValue,
                              )?.label ?? playlistValue
                            : "Not set"
                        }
                      />
                      <ConfirmSummaryItem
                        label="Thumbnail"
                        value={
                          thumbnailMode === "upload"
                            ? thumbnailFileName || "Upload selected"
                            : "Skipped"
                        }
                      />
                      <ConfirmSummaryItem
                        label="Tags"
                        value={
                          <ConfirmSummaryPills
                            emptyLabel="None selected"
                            values={selectedTags.map((tag) => tag.name)}
                          />
                        }
                      />
                    </ConfirmSummarySection>

                    <ConfirmSummarySection title="Visual Setup">
                      <ConfirmSummaryItem
                        label="Shader"
                        value={selectedShaderScene?.label ?? "Custom Shader"}
                      />
                      <ConfirmSummaryItem
                        label="Skybox"
                        value={
                          SKYBOX_OPTIONS.find(
                            (option) =>
                              option.value === sceneModel.visualizer.skyboxPreset,
                          )?.label ?? String(sceneModel.visualizer.skyboxPreset)
                        }
                      />
                      <ConfirmSummaryItem
                        label="Scale"
                        value={formatFixed(sceneModel.visualizer.scale, 0)}
                      />
                    </ConfirmSummarySection>

                    <ConfirmSummarySection title="Camera">
                      <ConfirmSummaryItem
                        label="Position"
                        value={formatVectorSummary(sceneModel.controls.position0)}
                      />
                      <ConfirmSummaryItem
                        label="Target"
                        value={formatVectorSummary(sceneModel.controls.target0)}
                      />
                      <ConfirmSummaryItem
                        label="FOV"
                        value={formatFixed(sceneModel.intent.fov, 0)}
                      />
                      <ConfirmSummaryItem
                        label="Orientation"
                        value={formatDegrees(toDegrees(sceneModel.intent.camTilt))}
                      />
                      <ConfirmSummaryItem
                        label="Zoom"
                        value={formatFixed(sceneModel.controls.zoom0)}
                      />
                      {isCameraAdvancedEnabled ? (
                        <ConfirmSummaryItem
                          label="Advanced Camera"
                          value={"Mode " + sceneModel.intent.camOrientationMode + ", Speed " + formatFixed(
                            sceneModel.intent.camOrientationSpeed,
                          )}
                        />
                      ) : null}
                    </ConfirmSummarySection>

                    <ConfirmSummarySection title="Motion & Effects">
                      <ConfirmSummaryItem
                        label="Time Multiplier"
                        value={formatFixed(sceneModel.intent.time_multiplier)}
                      />
                      <ConfirmSummaryItem
                        label="Audio Gain"
                        value={formatFixed(sceneModel.intent.minimizing_factor)}
                      />
                      <ConfirmSummaryItem
                        label="Audio Curve"
                        value={formatFixed(sceneModel.intent.power_factor)}
                      />
                      <ConfirmSummaryItem
                        label="Auto Rotate"
                        value={sceneModel.intent.autoRotate ? "On" : "Off"}
                      />
                      {isMotionAdvancedEnabled ? (
                        <ConfirmSummaryItem
                          label="Runtime Seed"
                          value={formatRuntimeStateSummary()}
                        />
                      ) : null}
                      <ConfirmSummaryItem
                        label="Tone Mapping"
                        value={selectedToneMapping.label}
                      />
                      <ConfirmSummaryItem
                        label="Exposure"
                        value={formatFixed(sceneModel.fx.toneMapping.exposure)}
                      />
                      <ConfirmSummaryItem
                        label="Enabled Passes"
                        value={
                          <ConfirmSummaryPills
                            emptyLabel="No effect passes enabled"
                            values={sceneModel.fx.passOrder
                              .filter(
                                (passId) =>
                                  describePassState(passId, sceneModel) ===
                                  "Enabled",
                              )
                              .map((passId) => PASS_LABELS[passId])}
                          />
                        }
                      />
                    </ConfirmSummarySection>
                  </div>

                  <CollapsibleEditorGroup
                    hideLabel="Hide Raw JSON"
                    id="confirm-raw-json"
                    isOpen={isConfirmJsonOpen}
                    onToggle={() =>
                      setIsConfirmJsonOpen((currentValue) => !currentValue)
                    }
                    showLabel="Show Raw JSON"
                  >
                    {renderRawSceneDataEditor()}
                  </CollapsibleEditorGroup>
                </div>
              </SceneSection>
            ) : null}

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
                initialPlayback="playing"
                sceneBlob={previewSceneData}
              />
            </section>
          </aside>

          <div
            className={
              isActionBarStuck
                ? "scene-editor-action-bar scene-editor-action-bar--stuck"
                : "scene-editor-action-bar"
            }
          >
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

          <div
            aria-hidden="true"
            className="scene-editor-action-bar-sentinel"
            ref={actionBarSentinelRef}
          />
        </div>
      </form>
    </AuthPage>
  );
}
