import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthenticatedFetch } from "@auth";
import "./scene-editor-pulse.css";
import { AppIcon, AuthPage, AuthPageHeader, PendingButtonLabel } from "@shared/ui";
import { MagePlayer, SCENE_LIMITS, availabilityTarget as getSceneAvailabilityTarget, listSceneTemplates, readTemplateShaderSource, sceneAvailabilityStore, sceneRecoveryKey, useSceneAvailability, type MagePlayerAudioResponseCapabilitiesSnapshot } from "@modules/player";
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
import { TemplateSceneControls } from "./ui/TemplateSceneControls";
import { FieldValidation, SceneEditorFieldErrorsProvider } from "./ui/SceneEditorFieldValidation";
import { templateControlLocation } from "./ui/sceneEditorFieldErrors";
import { useSceneEditorPreview } from "./useSceneEditorPreview";
import { useSceneEditorState } from "./useSceneEditorState";
import { useSceneEditorSubmission } from "./useSceneEditorSubmission";
import { BeatPreviewControls } from "./ui/BeatPreviewControls";
import { MusicResponseControls, type ClassicMusicResponseSettings } from "./ui/MusicResponseControls";
import type { SceneEditorInitialState, SceneEditorSubmissionMode } from "./types";
import {
  buildCapturedThumbnailFile,
  describePassState,
  getVisiblePassOrder,
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
  const [isTemplateSourceVisible, setIsTemplateSourceVisible] = useState(false);
  const [isBeatSimulated, setIsBeatSimulated] = useState(false);
  const [previewBpm, setPreviewBpm] = useState(120);
  const [audioResponseCapabilities, setAudioResponseCapabilities] = useState<MagePlayerAudioResponseCapabilitiesSnapshot | null>(null);
  const [customTimingDrafts, setCustomTimingDrafts] = useState<Partial<Record<AudioResponseTarget, { attack: number; release: number }>>>({});
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const [replacementTemplateId, setReplacementTemplateId] = useState(() => listSceneTemplates()[0].templateId);
  const [isReplacementPending, setIsReplacementPending] = useState(false);
  const replacementTriggerRef = useRef<HTMLButtonElement | null>(null);
  const replacementCancelRef = useRef<HTMLButtonElement | null>(null);
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
    handleMotionAdvancedToggle,
    handleNameChange,
    handleRawSceneDataChange,
    handleShaderSelection,
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
    templateDocument,
    templateFieldErrors,
    editorAudioResponseMode,
    editorAudioResponseConfig,
    handleTemplateSelection,
    updateTemplateValue,
    editorSections,
    pendingTemplateImport,
    confirmTemplateImport,
    cancelTemplateImport,
  } = useSceneEditorState({
    authenticatedFetch,
    initialState,
    titleId: isEditMode ? "edit-scene-title" : "create-scene-title",
  });
  const availabilityTarget = useMemo(() => getSceneAvailabilityTarget(mode.type === 'edit' ? mode.sceneId : undefined, sceneData), [mode, sceneData]);
  const availability = useSceneAvailability(availabilityTarget);
  useEffect(() => { if (isReplacementPending) replacementCancelRef.current?.focus(); }, [isReplacementPending]);
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
    if (!isTemplate || !errors.fields) return;
    const location = Object.keys(errors.fields).map(templateControlLocation).find(value => value !== null);
    if (!location) return;
    handleSectionJump(location.section);
    const frame = requestAnimationFrame(() => {
      const input = document.getElementById(`${location.id}-number`) ?? document.getElementById(location.id);
      input?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [errors.fields, handleSectionJump, isTemplate]);
  useEffect(() => {
    if (editorScrollRef.current) editorScrollRef.current.scrollTop = 0;
  }, [sectionMenuValue]);
  const {
    previewSceneData,
    previewOriginalSceneData,
    previewError,
    sceneModel,
    selectedShaderScene,
    selectedToneMapping,
    shaderSelection,
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
  const enabledEffectCount = Number(sceneModel.fx.bloom.enabled) + Object.entries(sceneModel.fx.passes)
    .filter(([key, enabled]) => key !== 'outputPass' && enabled).length;
  const effectBudgetFull = enabledEffectCount >= SCENE_LIMITS.optionalEffects;
  const visiblePassOrder = getVisiblePassOrder(sceneModel.fx.passOrder);
  const usesMappedAudio = editorAudioResponseMode === "mapped-v1";
  const usesModernAudio = editorAudioResponseMode === "transient-v1" || usesMappedAudio;
  const audioResponseConfig = editorAudioResponseConfig;
  // Keep controls steady through response edits, but never display the prior
  // shader's movement list while a different shader is compiling.
  const supportedAudioTargets = !isTemplate ? audioResponseConfig.mappings.map(mapping => mapping.target) : audioResponseCapabilities
    && audioResponseCapabilities.sceneBlob.kind === 'template'
    && audioResponseCapabilities.sceneBlob.templateId === templateDocument?.templateId
    && audioResponseCapabilities.sceneBlob.templateVersion === templateDocument?.templateVersion
    ? audioResponseCapabilities.capabilities.supportedTargets : null;
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
      <div className="scene-editor-grid">
        <NumberField
          description="Experimental compact scene field exported by the library."
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
          description="Experimental compact scene field exported by the library."
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
              {isTemplate ? 'Raw scene data stays available here. While the JSON is invalid, the preview keeps the last valid template.'
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

  const isAdvancedCreation = !isTemplate || isTemplateSourceVisible;
  const shaderEditor = (
    <div className="field-group">
      <FieldGroupLabel
        description={isTemplate ? "Edit this template's shader code to make a custom scene. Your effects, camera, and music settings stay."
          : "Edit the scene's shader source directly. Changes switch the selection to Custom Shader."}
        htmlFor="shader-source" label="Custom Shader" />
      <textarea className="scene-textarea" id="shader-source" rows={12}
        onChange={event => handleShaderSourceChange(event.currentTarget.value)}
        value={templateDocument ? readTemplateShaderSource(templateDocument) : sceneModel.visualizer.shader} />
    </div>
  );
  const creationMode = (
    <section className="scene-creation-mode" aria-labelledby="scene-creation-mode-title">
      <h3 className="scene-effects-category__title" id="scene-creation-mode-title">Creation mode</h3>
      <div className="scene-creation-mode__options" role="group" aria-labelledby="scene-creation-mode-title">
        <button className="scene-secondary-button" type="button" aria-pressed={!isAdvancedCreation} ref={replacementTriggerRef}
          onClick={() => { if (!isTemplate) setIsReplacementPending(true); else setIsTemplateSourceVisible(false); }}>Basic</button>
        <button className="scene-secondary-button" type="button" aria-pressed={isAdvancedCreation}
          onClick={() => setIsTemplateSourceVisible(true)} aria-describedby="advanced-creation-hint">Advanced</button>
      </div>
      <p className="field-hint" id="advanced-creation-hint">{isTemplate ? 'Basic uses a template. Advanced lets you edit its shader code.'
        : 'This scene uses custom shader code. Switching to Basic replaces it with a template.'}</p>
      {!isTemplate && isReplacementPending ? (
        <section role="alertdialog" aria-modal="false" aria-labelledby="replace-custom-title" aria-describedby="replace-custom-description"
          onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancelTemplateReplacement(); } }}>
          <h3 id="replace-custom-title">Replace this custom scene?</h3>
          <p className="field-hint" id="replace-custom-description">This replaces your custom code and settings with the selected template. Your name, description, and tags stay. Cancel to keep your current draft.</p>
          <SelectField id="replacement-template" label="Start from a template" value={replacementTemplateId}
            options={listSceneTemplates().map(template => ({ value: template.templateId, label: template.label }))}
            onChange={setReplacementTemplateId} />
          <div className="auth-actions">
            <button className="scene-secondary-button" type="button" onClick={() => {
              handleTemplateSelection(replacementTemplateId, true);
              setIsReplacementPending(false);
              setIsTemplateSourceVisible(false);
            }}>Replace custom scene</button>
            <button className="scene-secondary-button" type="button" ref={replacementCancelRef} onClick={cancelTemplateReplacement}>Cancel</button>
          </div>
        </section>
      ) : null}
    </section>
  );

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
        <div className="scene-editor-layout">
          <aside className="scene-editor-stepper-rail">
            <div className="scene-editor-stepper-rail__label">Scene setup</div>
            <div className="scene-editor-toolbar">
              <div className="scene-editor-toolbar__controls">
                <div className="scene-editor-toolbar__control-group scene-editor-toolbar__control-group--navigation">
                  <SceneEditorStepper
                    sections={editorSections}
                    currentSection={currentSection}
                    currentSectionIndex={currentSectionIndex}
                    sectionIssuesById={sectionIssuesById}
                    onSectionJump={handleSectionJump}
                  />
                </div>
              </div>
            </div>
          </aside>

          <SceneEditorFieldErrorsProvider fields={isTemplate ? { ...templateFieldErrors, ...errors.fields } : {}}>
          <div className="scene-editor-main" ref={editorScrollRef}>
            {errors.form ? (
              <div className="form-alert" id={formErrorId} role="alert">
                {errors.form}
              </div>
            ) : null}

            {isTemplate && templateDocument ? <TemplateSceneControls section={sectionMenuValue} document={templateDocument}
              creationMode={creationMode} fields={{ ...templateFieldErrors, ...errors.fields }} onTemplateChange={handleTemplateSelection} onChange={updateTemplateValue} /> : null}

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

            {sectionMenuValue === "scene" && !isTemplate ? (
              <SceneSection
                description="Choose a bundled shader, environment, and overall scale. Editing the source makes this a custom shader."
                title="Scene"
              >
                {creationMode}
                <div className="scene-editor-grid">
                  <SelectField
                    description={
                      selectedShaderScene?.description ??
                      "Custom shader text is currently active."
                    }
                    id="shader"
                    label="Shader"
                    onChange={handleShaderSelection}
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

              </SceneSection>
            ) : null}

            {sectionMenuValue === "scene" && isAdvancedCreation ? shaderEditor : null}

            {sectionMenuValue === "camera" ? (
              <SceneSection
                description="Set the starting view, framing, and lens settings for the scene."
                title="Camera"
              >
                <div className="scene-editor-stack">
                  <div className="scene-editor-grid">
                    <Vector3Field
                      min={-1000} max={1000}
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
                      value={toDegrees(sceneModel.intent.camTilt)}
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

                  <section className="scene-effects-category" aria-labelledby="camera-movement-title">
                    <h3 className="scene-effects-category__title" id="camera-movement-title">Camera movement</h3>
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
              </SceneSection>
            ) : null}

            {sectionMenuValue === "motion" ? (
              <SceneSection description="Set the animation, then choose how it responds to music." title="Motion">
                <div className="scene-editor-stack">
                  <section className="scene-effects-category" aria-labelledby="animation-title">
                    <h3 className="scene-effects-category__title" id="animation-title">Animation</h3>
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
                    customTimingDrafts={customTimingDrafts}
                    onCustomTimingDraftsChange={setCustomTimingDrafts}
                    classicSettings={{ inputGain: sceneModel.intent.minimizing_factor, peakEmphasis: sceneModel.intent.power_factor,
                      restingResponse: sceneModel.intent.base_speed, smoothing: sceneModel.intent.easing_speed,
                      responseOffset: sceneModel.state.volume_multiplier }}
                    onClassicSettingChange={handleClassicSettingChange}
                    previewTools={
                      <section className="scene-effects-category" aria-labelledby="preview-tools-title">
                        <h3 className="scene-effects-category__title" id="preview-tools-title">Preview tools</h3>
                        <BeatPreviewControls enabled={isBeatSimulated} bpm={previewBpm}
                          onEnabledChange={setIsBeatSimulated} onBpmChange={setPreviewBpm} />
                      </section>
                    }
                  />
                </div>
              </SceneSection>
            ) : null}

            {sectionMenuValue === "effects" ? (
              <SceneSection
                description="Add glow, color treatment, distortion, and other finishing effects."
                title="Effects"
              >
                <p className="field-hint" role="status">{enabledEffectCount} of {SCENE_LIMITS.optionalEffects} optional effects enabled, including bloom. {effectBudgetFull ? 'Turn an effect off before enabling another.' : 'Output does not count toward this limit.'}</p>
                <div className="scene-effects-grid">
                  <div className="scene-effects-category">
                    <h3 className="scene-effects-category__title">
                      Finish &amp; Output
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
                      Channel &amp; Motion
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
                      Color &amp; Tone
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
                      Pattern &amp; Structure
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
                <FieldValidation id="scene-pass-order"><ol className="scene-pass-order" id="scene-pass-order" tabIndex={-1}>
                  {visiblePassOrder.map((passId, index) => {
                    const isOutputPass = passId === "outputPass";

                    return (
                      <li className="scene-pass-order__item" key={passId}>
                        <AppIcon
                          className="scene-pass-order__grip"
                          name="grip-vertical"
                          size={16}
                        />
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
                              index >= visiblePassOrder.length - 2
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
                </ol></FieldValidation>
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
                        label={isTemplate ? "Template" : "Shader"}
                        value={isTemplate ? listSceneTemplates().find(template => template.templateId === templateDocument?.templateId)?.label ?? "Template" : selectedShaderScene?.label ?? "Custom Shader"}
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
                        label="Enabled Passes"
                        value={
                          <ConfirmSummaryPills
                            emptyLabel="No effect passes enabled"
                            values={visiblePassOrder
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

          <aside className={`scene-editor-preview${isPreviewCollapsed ? " is-collapsed" : ""}`}>
            <section className="surface surface--soft scene-editor-preview__card">
              <div className="scene-editor-preview__header">
                <div>
                  <span className="scene-editor-toolbar__eyebrow">Preview</span>
                  <h2>Live Preview</h2>
                </div>
                <button
                  aria-controls="scene-editor-live-preview"
                  aria-expanded={!isPreviewCollapsed}
                  className="scene-editor-preview__collapse"
                  onClick={() => setIsPreviewCollapsed((collapsed) => !collapsed)}
                  type="button"
                >
                  {isPreviewCollapsed ? "Expand" : "Collapse"}
                </button>
              </div>

              <div id="scene-editor-live-preview" className="scene-editor-preview__content">
              {sceneDraftError ? <p className="field-error" role="status">{sceneDraftError} {canPreviewScene ? 'The preview shows your last valid settings.' : 'Fix these settings before continuing.'}</p> : null}
              {canPreviewScene ? <MagePlayer
                audioMode="single"
                renderProfile="preview"
                className="scene-editor-preview__player"
                initialPlayback="playing"
                onCaptureFramePreviewChange={registerCaptureFramePreview}
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
      </form>
    </AuthPage>
  );
}
