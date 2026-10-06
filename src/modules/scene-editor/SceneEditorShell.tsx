import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { AuthenticatedFetch } from "@auth";
import "./scene-editor-pulse.css";
import { AppIcon, AuthPage, AuthPageHeader, PendingButtonLabel } from "@shared/ui";
import { MagePlayer, SCENE_LIMITS, availabilityTarget as getSceneAvailabilityTarget, listSceneTemplates, readTemplateShaderSource, sceneAvailabilityStore, sceneRecovery, sceneRecoveryKey, useSceneAvailability, type MagePlayerAudioResponseCapabilitiesSnapshot, type MagePlayerPlaybackStatus, type TemplateId } from "@modules/player";
import { type AudioResponseTarget } from "@shared/lib";
import {
  EffectCard,
  NumberField,
  SceneSection,
  SelectField,
  SliderField,
  Vector3Field,
} from "./ui/SceneEditorControls";
import {
  PASS_LABELS,
  SKYBOX_OPTIONS,
  toDegrees,
  toRadians,
  type ScenePassId,
} from "./sceneEditor";
import {
  additionalPassesByCategory,
  initialSceneModel,
} from "./fixtures";
import { SceneEditorDetailsSection } from "./ui/SceneEditorDetailsSection";
import {
  CollapsibleEditorGroup,
  ConfirmSummaryItem,
  ConfirmSummaryPills,
  ConfirmSummarySection,
  FieldGroupLabel,
} from "./ui/SceneEditorLayout";
import { SceneEditorStepper } from "./ui/SceneEditorStepper";
import { BuilderSceneControls } from "./ui/BuilderSceneControls";
import { BUILDER_SHADER_TEMPLATE_VALUE, SceneSetupControls } from "./ui/SceneSetupControls";
import { FieldValidation, SceneEditorFieldErrorsProvider } from "./ui/SceneEditorFieldValidation";
import { builderControlLocation, templateControlLocation } from "./ui/sceneEditorFieldErrors";
import { useSceneEditorPreview } from "./useSceneEditorPreview";
import { useSceneEditorState } from "./useSceneEditorState";
import { useSceneEditorSubmission } from "./useSceneEditorSubmission";
import { createBuilderScene } from "./builderEditor";
import { BeatPreviewControls } from "./ui/BeatPreviewControls";
import { MusicResponseControls, type ClassicMusicResponseSettings } from "./ui/MusicResponseControls";
import { supportedPreviewAudioTargets } from "./musicResponseCapabilities";
import type { SceneEditorInitialState, SceneEditorSubmissionMode } from "./types";
import {
  buildCapturedThumbnailFile,
  getActivePassOrder,
  readEditableSceneData,
  validateThumbnailFile,
} from "./utils";

function formatFixed(value: number, fractionDigits = 2) {
  if (fractionDigits === 0) return value.toFixed(0);
  return value.toFixed(fractionDigits).replace(/0+$/, "").replace(/\.$/, "");
}

function formatDegrees(value: number) {
  return `${Math.round(value)}\u00B0`;
}

function toCameraDegreeValue(radians: number) {
  return Number(toDegrees(radians).toFixed(2));
}

type SceneEditorShellProps = {
  authenticatedFetch: AuthenticatedFetch;
  initialState?: SceneEditorInitialState;
  mode?: SceneEditorSubmissionMode;
  onComplete: () => void;
};

export function SceneEditorShell({
  authenticatedFetch,
  initialState,
  mode = { type: "create" },
  onComplete,
}: SceneEditorShellProps) {
  const isEditMode = mode.type === "edit";
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  const [isNarrowPreviewLayout, setIsNarrowPreviewLayout] = useState(() => (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 900px)").matches
      : false
  ));
  const [previewPlaybackStatus, setPreviewPlaybackStatus] = useState<MagePlayerPlaybackStatus>("paused");
  const [isMusicAdvancedOpen, setIsMusicAdvancedOpen] = useState(false);
  const [passOrderAnnouncement, setPassOrderAnnouncement] = useState("");
  const [draggedPassId, setDraggedPassId] = useState<ScenePassId | null>(null);
  const [dragOverPassId, setDragOverPassId] = useState<ScenePassId | null>(null);
  const previewHideButtonRef = useRef<HTMLButtonElement | null>(null);
  const previewRestoreButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isTemplateSourceVisible, setIsTemplateSourceVisible] = useState(() => {
    const initialDocument = initialState?.sceneData;
    if (!initialDocument || typeof initialDocument !== "object") return false;
    const kind = "kind" in initialDocument ? initialDocument.kind : undefined;
    return kind !== "template" && kind !== "builder";
  });
  const [isBeatSimulated, setIsBeatSimulated] = useState(false);
  const [previewBpm, setPreviewBpm] = useState(120);
  const [audioResponseCapabilities, setAudioResponseCapabilities] = useState<MagePlayerAudioResponseCapabilitiesSnapshot | null>(null);
  const [customTimingDrafts, setCustomTimingDrafts] = useState<Partial<Record<AudioResponseTarget, { attack: number; release: number }>>>({});
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const [isReplacementPending, setIsReplacementPending] = useState(false);
  const [pendingBuilderTemplateId, setPendingBuilderTemplateId] = useState<TemplateId | null>(null);
  const [selectedBuilderObjectId, setSelectedBuilderObjectId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 900px)");
    const syncLayout = () => setIsNarrowPreviewLayout(media.matches);
    syncLayout();
    media.addEventListener?.("change", syncLayout);
    return () => media.removeEventListener?.("change", syncLayout);
  }, []);
  const replacementTriggerRef = useRef<HTMLButtonElement | null>(null);
  const replacementCancelRef = useRef<HTMLButtonElement | null>(null);
  const builderTemplateCancelRef = useRef<HTMLButtonElement | null>(null);
  const importCancelRef = useRef<HTMLButtonElement | null>(null);
  const {
    canResetAudioResponse,
    availableTags,
    canCreateTagFromSearch,
    currentSection,
    currentSectionIndex,
    description,
    errors,
    filteredSelectableTags,
    formErrorId,
    handleCameraAdvancedToggle,
    handleAudioResponseModeChange,
    handleAudioResponseConfigChange,
    handleAudioResponseReset,
    handleCreateTag,
    handleFormatJson,
    handleAddBuilderObject,
    handleDuplicateBuilderObject,
    handleRemoveBuilderObject,
    handleSwitchBuilderToCustom,
    handleSwitchToBuilder,
    handleSwitchToTemplate,
    handleUpdateBuilderObject,
    handleMotionAdvancedToggle,
    handleNameChange,
    handleRawSceneDataChange,
    handleShaderSourceChange,
    handleSectionJump,
    handleTagSearchChange,
    handleThumbnailCapture,
    isCameraAdvancedEnabled,
    isConfirmJsonOpen,
    isCreatingTag,
    isExactMatchedTagSelected,
    isMotionAdvancedEnabled,
    isSubmitting,
    isTagDropdownOpen,
    movePass,
    movePassTo,
    name,
    normalizedTagSearchValue,
    openTagDropdown,
    pendingRetryTags,
    pendingTagAttachment,
    playlistValue,
    reloadAvailableTags,
    sceneData,
    sceneDataText,
    sectionIssuesById,
    sectionMenuValue,
    selectableTags,
    selectedTagIds,
    selectedTags,
    setDescription,
    setErrors,
    setIsConfirmJsonOpen,
    setIsSubmitting,
    setPendingTagAttachment,
    setPlaylistValue,
    tagDropdownRef,
    tagSearchInputId,
    tagSearchValue,
    tagsError,
    tagsLoading,
    thumbnailFile,
    thumbnailPreviewUrl,
    titleId,
    toggleTagSelection,
    updateBranch,
    isTemplate,
    isBuilder,
    isUnmodifiedBuilderCustom,
    templateDocument,
    builderDocument,
    templateFieldErrors,
    editorAudioResponseMode,
    editorAudioResponseConfig,
    handleTemplateSelection,
    editorSections,
    pendingTemplateImport,
    confirmTemplateImport,
    cancelTemplateImport,
  } = useSceneEditorState({
    authenticatedFetch,
    initialState,
    titleId: isEditMode ? "edit-scene-title" : "create-scene-title",
  });
  useEffect(() => {
    if (!builderDocument) {
      setSelectedBuilderObjectId(null);
      return;
    }
    if (selectedBuilderObjectId && builderDocument.objects.some(object => object.id === selectedBuilderObjectId)) return;
    setSelectedBuilderObjectId(builderDocument.objects[0]?.id ?? null);
  }, [builderDocument, selectedBuilderObjectId]);
  const availabilityTarget = useMemo(() => getSceneAvailabilityTarget(mode.type === 'edit' ? mode.sceneId : undefined, sceneData), [mode, sceneData]);
  const availability = useSceneAvailability(availabilityTarget);
  const customCodeAvailability = useSceneAvailability('custom');
  useEffect(() => { if (isReplacementPending) replacementCancelRef.current?.focus(); }, [isReplacementPending]);
  useEffect(() => { if (pendingBuilderTemplateId) builderTemplateCancelRef.current?.focus(); }, [pendingBuilderTemplateId]);
  useEffect(() => { if (pendingTemplateImport) importCancelRef.current?.focus(); }, [pendingTemplateImport]);
  function cancelImportedTemplate() {
    cancelTemplateImport();
    requestAnimationFrame(() => document.getElementById('sceneData')?.focus());
  }
  function cancelTemplateReplacement() {
    setIsReplacementPending(false);
    requestAnimationFrame(() => replacementTriggerRef.current?.focus());
  }
  useEffect(() => {
    if ((!isTemplate && !isBuilder) || !errors.fields) return;
    const location = Object.keys(errors.fields).map(path => isBuilder ? builderControlLocation(path) : templateControlLocation(path)).find(value => value !== null);
    if (!location) return;
    if (isBuilder && 'objectIndex' in location && typeof location.objectIndex === 'number') {
      setSelectedBuilderObjectId(builderDocument?.objects[location.objectIndex]?.id ?? null);
    }
    handleSectionJump(location.section);
    const frame = requestAnimationFrame(() => {
      const input = document.getElementById(`${location.id}-number`) ?? document.getElementById(location.id);
      input?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [builderDocument, errors.fields, handleSectionJump, isBuilder, isTemplate]);
  useEffect(() => {
    if (editorScrollRef.current) editorScrollRef.current.scrollTop = 0;
  }, [sectionMenuValue]);
  const {
    previewSceneData,
    previewOriginalSceneData,
    previewError,
    sceneModel,
    selectedToneMapping,
    toneMappingSelection,
  } = useSceneEditorPreview({ sceneData });
  // The editor unwraps custom documents for form fields. Preserve the saved
  // envelope's recovery identity until the user changes its actual source.
  const recoverySceneData = useMemo(() => {
    const original = initialState?.sceneData;
    if (original && previewOriginalSceneData
      && sceneRecoveryKey(readEditableSceneData(original)) === sceneRecoveryKey(previewOriginalSceneData)) return original;
    return previewOriginalSceneData;
  }, [initialState?.sceneData, previewOriginalSceneData]);
  const canPreviewScene = !!previewSceneData;
  const sceneDraftError = sectionIssuesById.confirm ?? previewError;
  const studioSectionIssuesById = useMemo(() => {
    const nextIssues = { ...sectionIssuesById };
    const fieldIssues = { ...templateFieldErrors, ...errors.fields };

    for (const [path, message] of Object.entries(fieldIssues)) {
      const location = isBuilder ? builderControlLocation(path) : templateControlLocation(path);
      if (location && !nextIssues[location.section]) nextIssues[location.section] = message;
    }

    return nextIssues;
  }, [errors.fields, isBuilder, sectionIssuesById, templateFieldErrors]);
  const enabledEffectCount = Number(sceneModel.fx.bloom.enabled) + Object.entries(sceneModel.fx.passes)
    .filter(([key, enabled]) => key !== 'outputPass' && enabled).length;
  const effectBudgetFull = enabledEffectCount >= SCENE_LIMITS.optionalEffects;
  const activePassOrder = getActivePassOrder(sceneModel.fx.passOrder, sceneModel.fx);
  const movablePassOrder = activePassOrder.filter((passId) => passId !== "outputPass");
  function passAtPointer(event: ReactPointerEvent<HTMLElement>) {
    const passId = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-pass-id]")?.dataset.passId as ScenePassId | undefined;
    return passId && movablePassOrder.some((movablePassId) => movablePassId === passId) ? passId : null;
  }
  function clearPassDrag() {
    setDraggedPassId(null);
    setDragOverPassId(null);
  }
  function handlePassPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!draggedPassId) return;
    event.preventDefault();
    const targetPassId = passAtPointer(event);
    setDragOverPassId(targetPassId === draggedPassId ? null : targetPassId);
  }
  function handlePassPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (!draggedPassId) return;
    const targetPassId = passAtPointer(event);
    if (targetPassId && targetPassId !== draggedPassId) {
      movePassTo(draggedPassId, targetPassId);
      setPassOrderAnnouncement(
        `Moved ${PASS_LABELS[draggedPassId]} to position ${movablePassOrder.findIndex((passId) => passId === targetPassId) + 1}.`,
      );
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    clearPassDrag();
  }
  const usesMappedAudio = editorAudioResponseMode === "mapped-v1";
  const usesModernAudio = editorAudioResponseMode === "transient-v1" || usesMappedAudio;
  const audioResponseConfig = editorAudioResponseConfig;
  // Keep controls steady through response edits, but never display the prior
  // shader's movement list while a different shader is compiling.
  const supportedAudioTargets = useMemo(() => supportedPreviewAudioTargets(
    audioResponseCapabilities, previewSceneData, sceneData,
  ), [audioResponseCapabilities, previewSceneData, sceneData]);
  const captureFramePreviewRef = useRef<(() => Promise<string | null>) | null>(
    null,
  );
  const registerCaptureFramePreview = useCallback((nextCapture: (() => Promise<string | null>) | null) => {
    captureFramePreviewRef.current = nextCapture;
  }, []);
  const thumbnailCaptureInFlightRef = useRef(false);
  const thumbnailCaptureGenerationRef = useRef(0);
  const [isCapturingThumbnail, setIsCapturingThumbnail] = useState(false);

  useEffect(() => {
    thumbnailCaptureGenerationRef.current += 1;
    thumbnailCaptureInFlightRef.current = false;
    setIsCapturingThumbnail(false);
  }, [sceneDraftError, previewOriginalSceneData]);

  useEffect(() => {
    const unsubscribe = sceneAvailabilityStore.subscribe(availabilityTarget, () => {
      const availability = sceneAvailabilityStore.getSnapshot(availabilityTarget);
      if (!availability.allowed && availability.code !== 'CHECKING') {
        thumbnailCaptureGenerationRef.current += 1;
        thumbnailCaptureInFlightRef.current = false;
        setIsCapturingThumbnail(false);
      }
    });
    return () => {
      unsubscribe();
      thumbnailCaptureGenerationRef.current += 1;
      thumbnailCaptureInFlightRef.current = false;
    };
  }, [availabilityTarget]);

  async function captureThumbnailFromPreview() {
    if (!canPreviewScene) throw new Error("Load a valid scene before capturing a new thumbnail.");
    if (sceneDraftError) throw new Error("Fix the scene settings before capturing a thumbnail.");
    const generation = thumbnailCaptureGenerationRef.current;
    if (!sceneAvailabilityStore.isAllowed(availabilityTarget)) {
      throw new Error("Thumbnail capture is unavailable while scene playback is paused.");
    }
    if (!captureFramePreviewRef.current) {
      throw new Error(
        "Wait for the live preview to finish loading before capturing a thumbnail.",
      );
    }

    const capturedPreviewUrl = await captureFramePreviewRef.current();

    if (generation !== thumbnailCaptureGenerationRef.current || !sceneAvailabilityStore.isAllowed(availabilityTarget)) {
      throw new Error("Thumbnail capture was cancelled because scene availability changed.");
    }

    if (!capturedPreviewUrl) {
      throw new Error(
        "We couldn't capture the current preview frame. Let the preview finish loading and try again.",
      );
    }

    const capturedThumbnailFile = buildCapturedThumbnailFile(capturedPreviewUrl);
    const thumbnailError = validateThumbnailFile(capturedThumbnailFile);

    if (thumbnailError) {
      throw new Error(thumbnailError);
    }

    handleThumbnailCapture(capturedThumbnailFile, capturedPreviewUrl);
    return capturedThumbnailFile;
  }

  async function handleThumbnailCaptureRequest() {
    if (thumbnailCaptureInFlightRef.current || !sceneAvailabilityStore.isAllowed(availabilityTarget)) {
      return;
    }

    thumbnailCaptureInFlightRef.current = true;
    const generation = thumbnailCaptureGenerationRef.current;
    setIsCapturingThumbnail(true);

    try {
      await captureThumbnailFromPreview();
    } catch (error) {
      if (generation !== thumbnailCaptureGenerationRef.current) return;
      setErrors((currentErrors) => ({
        ...currentErrors,
        form: undefined,
        thumbnail:
          error instanceof Error && error.message.trim()
            ? error.message
            : "The live preview could not be captured right now. Please try again.",
      }));
    } finally {
      if (generation === thumbnailCaptureGenerationRef.current) {
        thumbnailCaptureInFlightRef.current = false;
        setIsCapturingThumbnail(false);
      }
    }
  }

  function renderAdditionalPassCard(passConfig: {
    description: string;
    flag: keyof typeof sceneModel.fx.passes;
    passId: keyof typeof PASS_LABELS;
  }) {
    return (
      <EffectCard
        description={passConfig.description}
        enabled={sceneModel.fx.passes[passConfig.flag]}
        toggleDisabled={effectBudgetFull && !sceneModel.fx.passes[passConfig.flag]}
        key={String(passConfig.flag)}
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

  function handleDescriptionChange(nextDescription: string) {
    setDescription(nextDescription);
    setErrors((currentErrors) => ({
      ...currentErrors,
      description: undefined,
      form: undefined,
    }));
  }

  function renderCameraAdvancedFields() {
    return (
      <div className="camera-controls__advanced-fields">
        <NumberField
          description="Choose how the camera interprets its orientation value (0–2)."
          id="camera-orientation-mode"
          label="Camera Orientation Mode"
          min={0}
          max={2}
          onChange={(nextValue) =>
            updateBranch("intent", (currentIntent) => ({
              ...currentIntent,
              camOrientationMode: nextValue,
            }))
          }
          step={1}
          value={sceneModel.intent.camOrientationMode}
        />

        <NumberField
          description="Set how quickly automatic camera orientation changes."
          id="camera-orientation-speed"
          label="Camera Orientation Speed"
          min={0}
          max={10}
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

  function handleClassicSettingChange(key: keyof ClassicMusicResponseSettings, value: number) {
    if (key === "responseOffset") {
      updateBranch("state", current => ({ ...current, volume_multiplier: value }));
      return;
    }
    const intentKeys = { inputGain: "minimizing_factor", peakEmphasis: "power_factor", restingResponse: "base_speed", smoothing: "easing_speed" } as const;
    updateBranch("intent", current => ({ ...current, [intentKeys[key]]: value }));
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
              {isTemplate || isBuilder ? `Raw scene data stays available here. While the JSON is invalid, the preview keeps the last valid ${isBuilder ? 'Builder scene' : 'template'}.`
                : 'Your custom code and settings stay available here for editing or download. Valid changes are previewed in the separate player when playback is available.'}
            </p>
          </div>
          <button
            className="scene-secondary-button"
            onClick={handleFormatJson}
            type="button"
          >
            Format JSON
          </button>
          <button className="scene-secondary-button" type="button" onClick={() => {
            const url = URL.createObjectURL(new Blob([sceneDataText], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = mode.type === 'edit' ? `scene-${mode.sceneId}.json` : 'scene-draft.json';
            link.click();
            URL.revokeObjectURL(url);
          }}>Download scene JSON</button>
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
        {pendingTemplateImport ? <div role="alertdialog" aria-modal="false" aria-labelledby="import-template-title"
          aria-describedby="import-template-description" onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); cancelImportedTemplate(); }
          }}>
          <h3 id="import-template-title">Replace your custom scene?</h3>
          <p className="field-hint" id="import-template-description">The imported template replaces your custom code and settings. Your name, description, and tags stay. Cancel to keep your custom draft.</p>
          <div className="scene-inline-actions">
            <button className="scene-secondary-button" type="button" onClick={confirmTemplateImport}>Replace custom scene</button>
            <button className="scene-secondary-button" type="button" ref={importCancelRef} onClick={cancelImportedTemplate}>Cancel</button>
          </div>
        </div> : null}
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

  const { handleSubmit } = useSceneEditorSubmission({
    authenticatedFetch,
    availableTags,
    captureThumbnailIfMissing: captureThumbnailFromPreview,
    description,
    mode,
    name,
    onComplete,
    pendingTagAttachment,
    sceneData,
    sceneDataText,
    selectedTagIds,
    setErrors: (nextErrors) => {
      setErrors(nextErrors);
      if (typeof nextErrors === "function") return;
      if (nextErrors.name || nextErrors.description || nextErrors.thumbnail || nextErrors.tags) {
        handleSectionJump("details");
      } else if (nextErrors.sceneData) {
        handleSectionJump("confirm");
        setIsConfirmJsonOpen(true);
      }
      if (editorScrollRef.current && Object.keys(nextErrors).length > 0) {
        editorScrollRef.current.scrollTop = 0;
      }
    },
    setIsSubmitting,
    setPendingTagAttachment,
    tagsError,
    tagsLoading,
    thumbnailFile,
  });

  const isCustomCreation = !isTemplate && !isBuilder;
  const isCustomCodeAvailable = customCodeAvailability.allowed;
  const templateCatalog = useMemo(() => listSceneTemplates(), []);
  const matchingCustomTemplate = useMemo(() => {
    if (!isCustomCreation) return null;
    const source = sceneModel.visualizer.shader.trim();
    return templateCatalog.find(template => readTemplateShaderSource({
      templateId: template.templateId as TemplateId,
      templateVersion: template.templateVersion as 1,
    }).trim() === source) ?? null;
  }, [isCustomCreation, sceneModel.visualizer.shader, templateCatalog]);
  const previousCustomCreationRef = useRef(isCustomCreation);
  useEffect(() => {
    if (isCustomCreation && !previousCustomCreationRef.current) setIsTemplateSourceVisible(true);
    previousCustomCreationRef.current = isCustomCreation;
  }, [isCustomCreation]);
  useEffect(() => {
    if (!isCustomCodeAvailable && !isCustomCreation && isTemplateSourceVisible) {
      setIsTemplateSourceVisible(false);
    }
  }, [isCustomCodeAvailable, isCustomCreation, isTemplateSourceVisible]);
  const isCustomCodeVisible = !isBuilder && isTemplateSourceVisible;
  const customCodeAvailabilityMessage = isCustomCodeAvailable ? null
    : customCodeAvailability.code === 'CHECKING'
      ? 'Checking whether Custom Code is available.'
      : isCustomCreation
        ? 'Custom Code is disabled for MAGE. This scene’s code is preserved but locked. Switch to Builder to replace it.'
        : 'Custom Code is disabled for MAGE. Use a template or Builder.';
  const templateSelectValue = isBuilder
    ? BUILDER_SHADER_TEMPLATE_VALUE
    : templateDocument?.templateId ?? matchingCustomTemplate?.templateId ?? "custom";
  const shaderEditor = (
    <div className="field-group">
      <FieldGroupLabel
        description={isTemplate ? "Edit this template's shader code to make a custom scene. Your effects, camera, and music settings stay."
          : "Edit the scene's shader source directly. Changes switch the selection to Custom Shader."}
        htmlFor="shader-source" label="Custom Shader" />
      <textarea className="scene-textarea" id="shader-source" rows={12}
        aria-describedby={!isCustomCodeAvailable ? 'advanced-creation-hint' : undefined}
        readOnly={!isCustomCodeAvailable}
        onChange={event => handleShaderSourceChange(event.currentTarget.value)}
        value={templateDocument ? readTemplateShaderSource(templateDocument) : sceneModel.visualizer.shader} />
    </div>
  );
  function switchToDefaultBuilder() {
    // Choosing Builder is an explicit request to start the known, bounded
    // default document. Let that click retry a matching recovery marker left by
    // an earlier local build or renderer failure instead of opening on a stale
    // Playback paused panel.
    const nextBuilder = createBuilderScene();
    const recoveryKey = sceneRecoveryKey(nextBuilder, mode.type === "edit" ? mode.sceneId : undefined);
    const recoveryBlock = recoveryKey ? sceneRecovery.getBlock(recoveryKey) : null;
    if (recoveryKey && recoveryBlock) {
      if (recoveryBlock.reason === "stopped") sceneRecovery.resumeStoppedScene(recoveryKey, recoveryBlock.at);
      else sceneRecovery.retry(recoveryKey);
    }
    handleSwitchToBuilder();
    setIsTemplateSourceVisible(false);
    setIsReplacementPending(false);
  }
  function focusTemplateSelect() {
    requestAnimationFrame(() => document.getElementById('template-templateId')?.focus());
  }
  function cancelBuilderTemplateReplacement() {
    setPendingBuilderTemplateId(null);
    focusTemplateSelect();
  }
  function trapModalFocus(event: React.KeyboardEvent<HTMLElement>, onEscape: () => void) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ));
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function hidePreview() {
    setIsPreviewCollapsed(true);
    requestAnimationFrame(() => {
      if (window.matchMedia?.("(min-width: 901px)").matches) {
        previewRestoreButtonRef.current?.focus();
      }
    });
  }

  function showPreview() {
    setIsPreviewCollapsed(false);
    requestAnimationFrame(() => previewHideButtonRef.current?.focus());
  }
  function handleSharedTemplateChange(templateId: string) {
    if (isBuilder) {
      const template = templateCatalog.find(option => option.templateId === templateId);
      if (template) setPendingBuilderTemplateId(template.templateId as TemplateId);
      return;
    }
    handleTemplateSelection(templateId);
    if (isCustomCreation) setIsTemplateSourceVisible(true);
  }
  function confirmBuilderTemplateReplacement() {
    if (!pendingBuilderTemplateId) return;
    const templateId = pendingBuilderTemplateId;
    setPendingBuilderTemplateId(null);
    handleSwitchToTemplate(templateId);
    setIsTemplateSourceVisible(false);
    focusTemplateSelect();
  }
  const creationMode = (
    <section className="scene-creation-mode" aria-labelledby="scene-creation-mode-title">
      <h3 className="scene-effects-category__title" id="scene-creation-mode-title">Creation mode</h3>
      <div className="scene-creation-mode__options" role="group" aria-labelledby="scene-creation-mode-title">
        <button className="scene-secondary-button" type="button" aria-pressed={isBuilder} ref={replacementTriggerRef}
          onClick={() => {
            if (isBuilder) return;
            if (isCustomCreation && !matchingCustomTemplate && !isUnmodifiedBuilderCustom) {
              setIsReplacementPending(true);
              return;
            }
            switchToDefaultBuilder();
          }}>Builder</button>
        <button className="scene-secondary-button" type="button" aria-pressed={isCustomCodeVisible}
          disabled={!isCustomCodeAvailable}
          title={customCodeAvailabilityMessage ?? undefined}
          onClick={() => {
            if (isBuilder) {
              handleSwitchBuilderToCustom();
              setIsTemplateSourceVisible(true);
            } else setIsTemplateSourceVisible(current => !current);
          }} aria-describedby="advanced-creation-hint">Custom Code</button>
      </div>
      <p className="field-hint" id="advanced-creation-hint">{customCodeAvailabilityMessage ?? (isBuilder
        ? 'Builder starts with an editable object scene. Choose a premade template above to replace this draft after confirmation, or open its generated shader in Custom Code.'
        : isCustomCodeVisible ? 'Custom Code keeps the current shader source. Choose another template above to replace the source with that template.'
          : 'Leave both options off to use the selected template as-is.')}</p>
    </section>
  );
  const replacementDialog = isCustomCreation && isReplacementPending ? (
    <div className="scene-editor-modal-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) cancelTemplateReplacement();
    }}>
      <section className="scene-editor-modal" role="alertdialog" aria-modal="true" aria-labelledby="replace-custom-title"
        aria-describedby="replace-custom-description" onKeyDown={event => trapModalFocus(event, cancelTemplateReplacement)}>
        <h2 id="replace-custom-title">Switch to Builder?</h2>
        <p id="replace-custom-description">Your edited custom shader code and scene settings will be replaced by the default Builder scene. Your name, description, tags, and selected music will stay.</p>
        <div className="auth-actions">
          <button className="scene-editor-confirm-submit" type="button" onClick={switchToDefaultBuilder}>Switch to Builder</button>
          <button className="scene-secondary-button" type="button" ref={replacementCancelRef} onClick={cancelTemplateReplacement}>Cancel</button>
        </div>
      </section>
    </div>
  ) : null;
  const pendingBuilderTemplate = pendingBuilderTemplateId
    ? templateCatalog.find(template => template.templateId === pendingBuilderTemplateId) ?? null
    : null;
  const builderTemplateReplacementDialog = isBuilder && pendingBuilderTemplate ? (
    <div className="scene-editor-modal-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) cancelBuilderTemplateReplacement();
    }}>
      <section className="scene-editor-modal" role="alertdialog" aria-modal="true" aria-labelledby="replace-builder-title"
        aria-describedby="replace-builder-description" onKeyDown={event => trapModalFocus(event, cancelBuilderTemplateReplacement)}>
        <h2 id="replace-builder-title">Replace your Builder scene?</h2>
        <p id="replace-builder-description">Switching to {pendingBuilderTemplate.label} discards every Builder object and any unsaved Builder changes. This cannot be undone.</p>
        <div className="auth-actions">
          <button className="scene-editor-confirm-submit" type="button" onClick={confirmBuilderTemplateReplacement}>Use {pendingBuilderTemplate.label}</button>
          <button className="scene-secondary-button" type="button" ref={builderTemplateCancelRef} onClick={cancelBuilderTemplateReplacement}>Cancel</button>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <AuthPage
      className="auth-page--wide scene-editor-page"
      cardClassName="surface--editor"
      titleId={titleId}
    >
      <AuthPageHeader
        description={
          isEditMode
            ? "Refine the saved scene details and preview the current scene configuration."
            : "Shape the visual, tune how it moves, add effects, then preview everything live before publishing."
        }
        eyebrow="Scene Studio"
        title={isEditMode ? "Edit your scene" : "Create a scene"}
        titleId={titleId}
      />

      <form
        aria-describedby={errors.form ? formErrorId : undefined}
        className="scene-editor-form"
        noValidate
        onSubmit={handleSubmit}
      >
        <div className={`scene-editor-layout${isPreviewCollapsed ? " scene-editor-layout--preview-hidden" : ""}`}>
          <aside className="scene-editor-stepper-rail">
            <div className="scene-editor-stepper-rail__label">Scene setup</div>
            <div className="scene-editor-toolbar">
              <div className="scene-editor-toolbar__controls">
                <div className="scene-editor-toolbar__control-group scene-editor-toolbar__control-group--navigation">
                  <SceneEditorStepper
                    sections={editorSections}
                    currentSection={currentSection}
                    currentSectionIndex={currentSectionIndex}
                    sectionIssuesById={studioSectionIssuesById}
                    onSectionJump={handleSectionJump}
                  />
                </div>
              </div>
            </div>
          </aside>

          <SceneEditorFieldErrorsProvider fields={isTemplate || isBuilder ? { ...templateFieldErrors, ...errors.fields } : {}} mode={isBuilder ? 'builder' : 'template'}>
          <div className="scene-editor-main" ref={editorScrollRef}>
            {errors.form ? (
              <div className="form-alert" id={formErrorId} role="alert">
                {errors.form}
              </div>
            ) : null}

            {sectionMenuValue === "scene" ? <SceneSection
              description="Choose the scene-wide look first, then use a template as-is, build with objects, or edit the current shader code."
              title="Scene"
            >
              <section className="scene-settings-group" aria-labelledby="scene-settings-title">
                <h3 className="scene-effects-category__title" id="scene-settings-title">Scene settings</h3>
                <SceneSetupControls
                  fields={{ ...templateFieldErrors, ...errors.fields }}
                  isBuilder={isBuilder}
                  isTemplateDisabled={isCustomCreation && !isCustomCodeAvailable}
                  templateDisabledDescription={isCustomCreation && !isCustomCodeAvailable
                    ? 'This custom scene is locked while Custom Code is disabled. Switch to Builder to replace it.'
                    : undefined}
                  onScaleChange={nextValue => updateBranch("visualizer", current => ({ ...current, scale: nextValue }))}
                  onSkyboxChange={nextValue => updateBranch("visualizer", current => ({ ...current, skyboxPreset: nextValue }))}
                  onTemplateChange={handleSharedTemplateChange}
                  scale={sceneModel.visualizer.scale}
                  skybox={sceneModel.visualizer.skyboxPreset}
                  templateId={templateSelectValue}
                />
              </section>
              {creationMode}
              {isBuilder && builderDocument ? <BuilderSceneControls
                  document={builderDocument}
                  selectedObjectId={selectedBuilderObjectId}
                  onSelectObject={setSelectedBuilderObjectId}
                  onAddObject={handleAddBuilderObject}
                  onDuplicateObject={handleDuplicateBuilderObject}
                  onRemoveObject={handleRemoveBuilderObject}
                  onUpdateObject={handleUpdateBuilderObject}
                /> : null}
              {isCustomCodeVisible ? shaderEditor : null}
            </SceneSection> : null}

            {sectionMenuValue === "details" ? (
              <SceneEditorDetailsSection
                availableTags={availableTags}
                canCreateTagFromSearch={canCreateTagFromSearch}
                description={description}
                errors={errors}
                filteredSelectableTags={filteredSelectableTags}
                isCapturingThumbnail={isCapturingThumbnail}
                isCreatingTag={isCreatingTag}
                isExactMatchedTagSelected={isExactMatchedTagSelected}
                isSubmitting={isSubmitting}
                isTagDropdownOpen={isTagDropdownOpen}
                name={name}
                normalizedTagSearchValue={normalizedTagSearchValue}
                pendingRetryTags={pendingRetryTags}
                pendingTagAttachment={pendingTagAttachment}
                playlistValue={playlistValue}
                selectableTags={selectableTags}
                selectedTags={selectedTags}
                tagDropdownRef={tagDropdownRef}
                tagSearchInputId={tagSearchInputId}
                tagSearchValue={tagSearchValue}
                tagsError={tagsError}
                tagsLoading={tagsLoading}
                thumbnailPreviewUrl={thumbnailPreviewUrl}
                isThumbnailCaptureAvailable={canPreviewScene && availability.allowed && !sceneDraftError}
                onCreateTag={handleCreateTag}
                onDescriptionChange={handleDescriptionChange}
                onNameChange={handleNameChange}
                onOpenTagDropdown={openTagDropdown}
                onPlaylistValueChange={setPlaylistValue}
                onReloadAvailableTags={reloadAvailableTags}
                onTagSearchChange={handleTagSearchChange}
                onThumbnailCaptureRequest={() => {
                  void handleThumbnailCaptureRequest();
                }}
                onToggleTagSelection={toggleTagSelection}
              />
            ) : null}

            {sectionMenuValue === "camera" ? (
              <SceneSection
                description="Set the starting view, framing, and lens settings for the scene."
                title="Camera"
              >
                <div className="camera-controls">
                  <section className="camera-controls__group" aria-labelledby="camera-starting-view-title">
                    <div className="camera-controls__group-heading">
                      <h3 id="camera-starting-view-title">Starting view</h3>
                      <p>Choose where the camera begins and what it points toward.</p>
                    </div>
                    <div className="camera-controls__surface camera-controls__vectors">
                      <Vector3Field
                        min={-1000} max={1000}
                        description="Where the camera begins in the scene."
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
                        min={-1000} max={1000}
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
                    </div>
                  </section>

                  <section className="camera-controls__group" aria-labelledby="camera-framing-title">
                    <div className="camera-controls__group-heading">
                      <h3 id="camera-framing-title">Framing &amp; lens</h3>
                    </div>
                    <div className="camera-controls__surface camera-controls__lens">
                      <SliderField
                        description="How wide the camera lens feels."
                        formatValue={(value) => formatFixed(value, 0)}
                        id="field-of-view"
                        label="FOV"
                        max={179}
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
                        formatValue={(value) => formatDegrees(value)}
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
                        value={toCameraDegreeValue(sceneModel.intent.camTilt)}
                      />

                      <NumberField
                        description="Set camera zoom from 0.01 to 100."
                        min={0.01} max={100}
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
                  </section>

                  <section className="camera-controls__group camera-controls__movement" aria-labelledby="camera-movement-title">
                    <div className="camera-controls__group-heading">
                      <h3 id="camera-movement-title">Camera movement</h3>
                    </div>
                    <EffectCard title="Automatic orbit" toggleLabel="Automatic orbit" enabled={sceneModel.intent.autoRotate}
                      description="Let the camera travel around the scene on its own."
                      onToggle={value => updateBranch("intent", current => ({ ...current, autoRotate: value }))}
                    >
                      <SliderField
                        id="rotation-speed" label="Orbit speed" min={0.1} max={50} step={0.1}
                        description="How quickly the camera moves around the scene."
                        value={sceneModel.intent.autoRotateSpeed}
                        onChange={value => updateBranch("intent", current => ({ ...current, autoRotateSpeed: value }))}
                      />
                    </EffectCard>
                  </section>

                  <div className="camera-controls__advanced">
                    <CollapsibleEditorGroup
                      hideLabel="Hide advanced camera controls"
                      id="camera-advanced-options"
                      isOpen={isCameraAdvancedEnabled}
                      onToggle={() =>
                        handleCameraAdvancedToggle(!isCameraAdvancedEnabled)
                      }
                      showLabel="Show advanced camera controls"
                    >
                      {renderCameraAdvancedFields()}
                    </CollapsibleEditorGroup>
                  </div>
                </div>
              </SceneSection>
            ) : null}

            {sectionMenuValue === "motion" ? (
              <SceneSection description="Set the animation, then choose how it responds to music." title="Motion">
                <div className="motion-controls">
                  <section className="motion-controls__group motion-controls__animation" aria-labelledby="animation-title">
                    <div className="motion-controls__group-heading">
                      <h3 id="animation-title">Animation</h3>
                    </div>
                    <div className="motion-controls__surface">
                      <NumberField
                        id="time-multiplier" label="Animation speed" step={0.05}
                        min={0} max={10}
                        description="Speed up or slow down the scene’s animation. Music playback stays at its original speed."
                        value={sceneModel.intent.time_multiplier}
                        onChange={value => updateBranch("intent", current => ({ ...current, time_multiplier: value }))}
                      />
                      <CollapsibleEditorGroup
                        id="animation-advanced-options" isOpen={isMotionAdvancedEnabled}
                        showLabel="Show advanced animation controls" hideLabel="Hide advanced animation controls"
                        onToggle={() => handleMotionAdvancedToggle(!isMotionAdvancedEnabled)}
                      >
                        <NumberField
                          id="state-time" label="Starting animation time" step={0.01}
                          min={0} max={86400}
                          description="Choose where in its animation the scene begins."
                          value={sceneModel.state.time}
                          onChange={value => updateBranch("state", current => ({ ...current, time: value }))}
                        />
                      </CollapsibleEditorGroup>
                    </div>
                  </section>
                  <MusicResponseControls
                    mode={editorAudioResponseMode}
                    idPrefix="music-response"
                    config={audioResponseConfig}
                    supportedTargets={supportedAudioTargets}
                    onModeChange={nextMode => handleAudioResponseModeChange(nextMode, supportedAudioTargets ?? undefined)}
                    onConfigChange={handleAudioResponseConfigChange}
                    onReset={handleAudioResponseReset}
                    canReset={canResetAudioResponse}
                    isAdvancedOpen={isMusicAdvancedOpen}
                    onAdvancedToggle={() => setIsMusicAdvancedOpen(open => !open)}
                    customTimingDrafts={customTimingDrafts}
                    onCustomTimingDraftsChange={setCustomTimingDrafts}
                    classicSettings={{ inputGain: sceneModel.intent.minimizing_factor, peakEmphasis: sceneModel.intent.power_factor,
                      restingResponse: sceneModel.intent.base_speed, smoothing: sceneModel.intent.easing_speed,
                      responseOffset: sceneModel.state.volume_multiplier }}
                    onClassicSettingChange={handleClassicSettingChange}
                  />
                  <section className="motion-controls__group motion-controls__preview" aria-labelledby="preview-tools-title">
                    <div className="motion-controls__group-heading">
                      <h3 id="preview-tools-title">Preview tools</h3>
                    </div>
                    <BeatPreviewControls enabled={isBeatSimulated} bpm={previewBpm}
                      onEnabledChange={setIsBeatSimulated} onBpmChange={setPreviewBpm} />
                  </section>
                </div>
              </SceneSection>
            ) : null}

            {sectionMenuValue === "effects" ? (
              <SceneSection
                description="Add glow, color treatment, distortion, and other finishing effects."
                title="Effects"
              >
                <div className="scene-effects-status" role="status" aria-live="polite">
                  <span>Up to {SCENE_LIMITS.optionalEffects} optional effects can be enabled. Output Pass does not count toward the limit.</span>
                  <strong>{enabledEffectCount}/{SCENE_LIMITS.optionalEffects} enabled</strong>
                </div>
                {effectBudgetFull ? (
                  <p className="scene-effects-limit" role="alert">
                    You have reached the {SCENE_LIMITS.optionalEffects}-effect limit. Turn off an optional effect to enable another.
                  </p>
                ) : null}
                <div className="scene-effects-grid">
                  <div className="scene-effects-category">
                    <h3 className="scene-effects-category__title">
                      Core
                    </h3>
                    <div className="scene-effects-category__grid">
                      <EffectCard
                        description="Soft glow for bright edges and highlights."
                        enabled={sceneModel.fx.bloom.enabled}
                        toggleDisabled={effectBudgetFull && !sceneModel.fx.bloom.enabled}
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
                        note="Does not count toward effect limit"
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
                            max={10}
                            min={0}
                            onChange={(nextValue) =>
                              updateBranch("fx", (currentFx) => ({
                                ...currentFx,
                                toneMapping: {
                                  ...currentFx.toneMapping,
                                  exposure: nextValue,
                                },
                              }))
                            }
                            step={0.1}
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
                      Motion &amp; glitch
                    </h3>
                    <div className="scene-effects-category__grid">
                      <EffectCard
                        description="Shift the red, green, and blue channels apart for chromatic distortion."
                        enabled={sceneModel.fx.passes.rgbShift}
                        toggleDisabled={effectBudgetFull && !sceneModel.fx.passes.rgbShift}
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
                            value={toDegrees(sceneModel.fx.params.rgbShift.angle)}
                          />
                        </div>
                      </EffectCard>

                      <EffectCard
                        description="Leave fading trails behind moving geometry."
                        enabled={sceneModel.fx.passes.afterImage}
                        toggleDisabled={effectBudgetFull && !sceneModel.fx.passes.afterImage}
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
                      Color &amp; style
                    </h3>
                    <div className="scene-effects-category__grid">
                      <EffectCard
                        description="Wash the output toward a chosen tint."
                        enabled={sceneModel.fx.passes.colorify}
                        toggleDisabled={effectBudgetFull && !sceneModel.fx.passes.colorify}
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
                        <FieldValidation id="colorify-color"><div className="scene-field">
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
                              aria-invalid={Boolean(templateFieldErrors['settings.tint.color'] || errors.fields?.['settings.tint.color'])}
                              aria-describedby={templateFieldErrors['settings.tint.color'] || errors.fields?.['settings.tint.color'] ? 'colorify-color-error' : undefined}
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
                        </div></FieldValidation>
                      </EffectCard>

                      {additionalPassesByCategory.color.map(
                        renderAdditionalPassCard,
                      )}
                    </div>
                  </div>

                  <div className="scene-effects-category">
                    <h3 className="scene-effects-category__title">
                      Pattern &amp; screen
                    </h3>
                    <div className="scene-effects-category__grid">
                      <EffectCard
                        description="Mirror the frame into repeating radial segments."
                        enabled={sceneModel.fx.passes.kaleid}
                        toggleDisabled={effectBudgetFull && !sceneModel.fx.passes.kaleid}
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
                            value={Math.round(sceneModel.fx.params.kaleid.sides)}
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
                description="Move passes up or down to change how the final image is layered. Output always stays last."
                title="Pass Order"
              >
                <div className="scene-pass-order__summary" role="status">
                  <span><strong>{activePassOrder.length} active {activePassOrder.length === 1 ? "pass" : "passes"}</strong> · Disabled passes are hidden.</span>
                  <span className="scene-pass-order__direction">Top → Bottom</span>
                </div>
                <FieldValidation id="scene-pass-order">
                  <div className="scene-pass-order__surface" id="scene-pass-order" tabIndex={-1}>
                    {activePassOrder.length ? (
                      <ol aria-label="Active effect pass order" className="scene-pass-order">
                        {activePassOrder.map((passId, index) => {
                          const isOutputPass = passId === "outputPass";
                          const movableIndex = passId === "outputPass"
                            ? -1
                            : movablePassOrder.indexOf(passId);

                          return (
                            <li
                              className={`scene-pass-order__item${isOutputPass ? " scene-pass-order__item--pinned" : ""}${draggedPassId === passId ? " scene-pass-order__item--dragging" : ""}${dragOverPassId === passId ? " scene-pass-order__item--drag-target" : ""}`}
                              data-pass-id={passId}
                              key={passId}
                            >
                              <span
                                aria-label={isOutputPass ? undefined : `Drag ${PASS_LABELS[passId]} to reorder`}
                                className="scene-pass-order__grip"
                                onPointerCancel={isOutputPass ? undefined : clearPassDrag}
                                onPointerDown={isOutputPass ? undefined : (event) => {
                                  if (event.button !== 0) return;
                                  event.currentTarget.setPointerCapture(event.pointerId);
                                  setDraggedPassId(passId);
                                  setDragOverPassId(null);
                                }}
                                onPointerMove={isOutputPass ? undefined : handlePassPointerMove}
                                onPointerUp={isOutputPass ? undefined : handlePassPointerUp}
                                title={isOutputPass ? "Output always stays last" : "Drag to reorder"}
                              >
                                <AppIcon aria-hidden="true" name="grip-vertical" size={14} />
                              </span>
                              <span className="scene-pass-order__index" aria-label={`Position ${index + 1}`}>
                                {index + 1}
                              </span>
                              <div className="scene-pass-order__copy">
                                <strong>{PASS_LABELS[passId]}</strong>
                                <span>{isOutputPass ? "Enabled · Always last" : "Enabled"}</span>
                              </div>
                              {isOutputPass ? null : (
                                <div className="scene-pass-order__actions">
                                  <button
                                    aria-label={`Move ${PASS_LABELS[passId]} up`}
                                    className="scene-order-button"
                                    disabled={movableIndex === 0}
                                    onClick={() => {
                                      movePass(passId, -1);
                                      setPassOrderAnnouncement(`Moved ${PASS_LABELS[passId]} up to position ${index}.`);
                                    }}
                                    type="button"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    aria-label={`Move ${PASS_LABELS[passId]} down`}
                                    className="scene-order-button"
                                    disabled={movableIndex === movablePassOrder.length - 1}
                                    onClick={() => {
                                      movePass(passId, 1);
                                      setPassOrderAnnouncement(`Moved ${PASS_LABELS[passId]} down to position ${index + 2}.`);
                                    }}
                                    type="button"
                                  >
                                    ↓
                                  </button>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    ) : (
                      <div className="scene-pass-order__empty" role="status">
                        <strong>No active passes</strong>
                        <span>Enable an effect to add it to the active stack.</span>
                      </div>
                    )}
                  </div>
                </FieldValidation>
                <p className="scene-pass-order__announcement" role="status" aria-live="polite">{passOrderAnnouncement}</p>
              </SceneSection>
            ) : null}

            {sectionMenuValue === "confirm" ? (
              <SceneSection
                className="scene-editor-section--confirm"
                description={
                  isEditMode
                    ? "Review the scene setup before updating it and expand the raw JSON only if you need a final low-level check."
                    : "Review every saved value, then create the scene. You can still jump back to any section."
                }
                title="Confirm"
                stepNumber={currentSectionIndex + 1}
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
                        value="Not available"
                      />
                      <ConfirmSummaryItem
                        label="Thumbnail"
                        value={
                          thumbnailPreviewUrl
                            ? "Captured from live preview"
                            : "Not captured yet"
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
                        label={isBuilder ? "Builder" : isTemplate ? "Template" : "Shader"}
                        value={isBuilder ? `${builderDocument?.objects.length ?? 0} object${builderDocument?.objects.length === 1 ? '' : 's'}`
                          : isTemplate ? listSceneTemplates().find(template => template.templateId === templateDocument?.templateId)?.label ?? "Template"
                            : matchingCustomTemplate?.label ?? "Custom Shader"}
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
                      {sceneModel.intent.camOrientationMode !== initialSceneModel.intent.camOrientationMode || sceneModel.intent.camOrientationSpeed !== initialSceneModel.intent.camOrientationSpeed ? (
                        <ConfirmSummaryItem
                          label="Advanced Camera"
                          value={
                            "Mode " +
                            sceneModel.intent.camOrientationMode +
                            ", Speed " +
                            formatFixed(sceneModel.intent.camOrientationSpeed)
                          }
                        />
                      ) : null}
                      <ConfirmSummaryItem label="Automatic orbit" value={sceneModel.intent.autoRotate ? "On" : "Off"} />
                      {sceneModel.intent.autoRotate ? <ConfirmSummaryItem label="Orbit speed" value={formatFixed(sceneModel.intent.autoRotateSpeed)} /> : null}
                    </ConfirmSummarySection>

                    <ConfirmSummarySection title="Motion & Effects">
                      <ConfirmSummaryItem
                        label="Animation speed"
                        value={formatFixed(sceneModel.intent.time_multiplier)}
                      />
                      {usesModernAudio ? (
                        <ConfirmSummaryItem label="Audio Response" value={usesMappedAudio ? "Audio mappings" : "Beat detection"} />
                      ) : <>
                      <ConfirmSummaryItem
                        label="Input gain"
                        value={formatFixed(sceneModel.intent.minimizing_factor)}
                      />
                      <ConfirmSummaryItem
                        label="Peak emphasis"
                        value={formatFixed(sceneModel.intent.power_factor)}
                      />
                      </>}
                      <ConfirmSummaryItem label="Starting animation time" value={formatFixed(sceneModel.state.time)} />
                      {!usesModernAudio ? <>
                        <ConfirmSummaryItem label="Resting response" value={formatFixed(sceneModel.intent.base_speed)} />
                        <ConfirmSummaryItem label="Smoothing" value={formatFixed(sceneModel.intent.easing_speed)} />
                        <ConfirmSummaryItem label="Response offset" value={formatFixed(sceneModel.state.volume_multiplier)} />
                      </> : null}
                      <ConfirmSummaryItem
                        label="Tone Mapping"
                        value={selectedToneMapping.label}
                      />
                      <ConfirmSummaryItem
                        label="Exposure"
                        value={formatFixed(sceneModel.fx.toneMapping.exposure)}
                      />
                      <ConfirmSummaryItem
                        label="Active Pass Order"
                        value={
                          <ConfirmSummaryPills
                            emptyLabel="No active effect passes"
                            values={activePassOrder.map((passId) => PASS_LABELS[passId])}
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
                <div className="scene-editor-confirm-actions">
                  <button aria-busy={isSubmitting} className="scene-editor-confirm-submit" disabled={isSubmitting} type="submit">
                    <PendingButtonLabel
                      pending={isSubmitting}
                      pendingLabel={pendingTagAttachment ? "Retrying tag attachment..." : isEditMode ? "Updating scene..." : "Creating scene..."}
                    >
                      {pendingTagAttachment ? "Retry tag attachment" : isEditMode ? "Update scene" : "Create scene"}
                    </PendingButtonLabel>
                  </button>
                </div>
              </SceneSection>
            ) : null}
          </div>

          </SceneEditorFieldErrorsProvider>

          <aside
            aria-hidden={isPreviewCollapsed && !isNarrowPreviewLayout ? true : undefined}
            aria-labelledby="scene-editor-live-preview-title"
            className={`scene-editor-preview${isPreviewCollapsed ? " is-collapsed" : ""}`}
            inert={isPreviewCollapsed && !isNarrowPreviewLayout}
          >
            <section className="surface surface--soft scene-editor-preview__card">
              <div className="scene-editor-preview__header">
                <div className="scene-editor-preview__title">
                  <span
                    aria-live="polite"
                    className="scene-editor-preview__live-dot"
                    data-status={previewPlaybackStatus}
                    role="status"
                    title={previewPlaybackStatus === "playing"
                      ? "Preview playing"
                      : previewPlaybackStatus === "paused"
                        ? "Preview paused"
                        : "Preview unavailable"}
                  >
                    <span className="scene-editor-preview__status">
                      {previewPlaybackStatus === "playing"
                        ? "Preview playing"
                        : previewPlaybackStatus === "paused"
                          ? "Preview paused"
                          : "Preview unavailable"}
                    </span>
                  </span>
                  <h2 id="scene-editor-live-preview-title">Live Preview</h2>
                </div>
                <div className="scene-editor-preview__actions">
                  <button
                    aria-controls="scene-editor-live-preview"
                    aria-expanded={!isPreviewCollapsed}
                    aria-label={isPreviewCollapsed ? "Show preview" : "Hide preview"}
                    className="scene-editor-preview__icon-button scene-editor-preview__visibility-button"
                    onClick={isPreviewCollapsed ? showPreview : hidePreview}
                    ref={previewHideButtonRef}
                    title={isPreviewCollapsed ? "Show preview" : "Hide preview"}
                    type="button"
                  >
                    <span className="scene-editor-preview__desktop-chevron">
                      <AppIcon name="chevron-right" size={15} />
                    </span>
                    <span className="scene-editor-preview__mobile-chevron">
                      <AppIcon name={isPreviewCollapsed ? "chevron-down" : "chevron-up"} size={15} />
                    </span>
                  </button>
                </div>
              </div>

              <div id="scene-editor-live-preview" className="scene-editor-preview__content">
              {sceneDraftError ? <p className="field-error" role="status">{sceneDraftError} {canPreviewScene ? 'The preview shows your last valid settings.' : 'Fix these settings before continuing.'}</p> : null}
              {canPreviewScene ? <MagePlayer
                audioMode="single"
                renderProfile="preview"
                className="scene-editor-preview__player"
                initialPlayback="playing"
                onCaptureFramePreviewChange={registerCaptureFramePreview}
                onPlaybackStatusChange={setPreviewPlaybackStatus}
                sceneBlob={previewSceneData}
                recoverySceneBlob={recoverySceneData ?? undefined}
                posterUrl={thumbnailPreviewUrl}
                onAudioResponseCapabilitiesChange={setAudioResponseCapabilities}
                sceneKey={mode.type === 'edit' ? mode.sceneId : undefined}
                simulatedBeat={{ enabled: isBeatSimulated, bpm: previewBpm }}
              /> : null}
              </div>
            </section>
          </aside>

        </div>
        <button
          aria-controls="scene-editor-live-preview"
          aria-expanded={!isPreviewCollapsed}
          className="scene-editor-preview-restore"
          hidden={!isPreviewCollapsed}
          onClick={showPreview}
          ref={previewRestoreButtonRef}
          type="button"
        >
          <AppIcon name="chevron-left" size={13} />
          <span>Show preview</span>
        </button>
      </form>
      {replacementDialog}
      {builderTemplateReplacementDialog}
    </AuthPage>
  );
}
