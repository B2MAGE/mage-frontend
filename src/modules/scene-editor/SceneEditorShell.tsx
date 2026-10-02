import { useEffect, useRef, useState } from "react";
import type { AuthenticatedFetch } from "@auth";
import "./scene-editor-pulse.css";
import { AppIcon, AuthPage, AuthPageHeader, PendingButtonLabel } from "@shared/ui";
import { MagePlayer } from "@modules/player";
import {
  EffectCard,
  NumberField,
  SceneSection,
  SelectField,
  SliderField,
  ToggleField,
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
import { useSceneEditorPreview } from "./useSceneEditorPreview";
import { useSceneEditorState } from "./useSceneEditorState";
import { useSceneEditorSubmission } from "./useSceneEditorSubmission";
import { BeatPreviewControls } from "./ui/BeatPreviewControls";
import type { SceneEditorInitialState, SceneEditorSubmissionMode } from "./types";
import {
  buildCapturedThumbnailFile,
  describePassState,
  getVisiblePassOrder,
  validateThumbnailFile,
} from "./utils";

function formatFixed(value: number, fractionDigits = 2) {
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
  const [isBeatSimulated, setIsBeatSimulated] = useState(false);
  const [previewBpm, setPreviewBpm] = useState(120);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const {
    availableTags,
    canCreateTagFromSearch,
    currentSection,
    currentSectionIndex,
    description,
    errors,
    filteredSelectableTags,
    formErrorId,
    handleCameraAdvancedToggle,
    handleCreateTag,
    handleFormatJson,
    handleMotionAdvancedToggle,
    handleNameChange,
    handleRawSceneDataChange,
    handleShaderSelection,
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
  } = useSceneEditorState({
    authenticatedFetch,
    initialState,
    titleId: isEditMode ? "edit-scene-title" : "create-scene-title",
  });
  useEffect(() => {
    if (editorScrollRef.current) editorScrollRef.current.scrollTop = 0;
  }, [sectionMenuValue]);
  const {
    previewSceneData,
    sceneModel,
    selectedShaderScene,
    selectedToneMapping,
    shaderSelection,
    toneMappingSelection,
  } = useSceneEditorPreview({
    isCameraAdvancedEnabled,
    isMotionAdvancedEnabled,
    sceneData,
  });
  const visiblePassOrder = getVisiblePassOrder(sceneModel.fx.passOrder);
  const usesMappedAudio = sceneData.audioResponse === "mapped-v1";
  const usesModernAudio = sceneData.audioResponse === "transient-v1" || usesMappedAudio;
  const captureFramePreviewRef = useRef<(() => Promise<string | null>) | null>(
    null,
  );
  const thumbnailCaptureInFlightRef = useRef(false);
  const [isCapturingThumbnail, setIsCapturingThumbnail] = useState(false);

  async function captureThumbnailFromPreview() {
    if (!captureFramePreviewRef.current) {
      throw new Error(
        "Wait for the live preview to finish loading before capturing a thumbnail.",
      );
    }

    const capturedPreviewUrl = await captureFramePreviewRef.current();

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
    if (thumbnailCaptureInFlightRef.current) {
      return;
    }

    thumbnailCaptureInFlightRef.current = true;
    setIsCapturingThumbnail(true);

    try {
      await captureThumbnailFromPreview();
    } catch (error) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        form: undefined,
        thumbnail:
          error instanceof Error && error.message.trim()
            ? error.message
            : "The live preview could not be captured right now. Please try again.",
      }));
    } finally {
      thumbnailCaptureInFlightRef.current = false;
      setIsCapturingThumbnail(false);
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
        {!usesModernAudio ? <NumberField
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
        /> : null}
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
    ].filter(([label, value, initialValue]) => value !== initialValue && (!usesModernAudio || label !== "Volume"));

    if (runtimeStatePairs.length === 0) {
      return "Default";
    }

    return runtimeStatePairs
      .map(([label, value]) => `${label} ${formatFixed(value)}`)
      .join(" • ");
  }

  const { handleSubmit } = useSceneEditorSubmission({
    authenticatedFetch,
    availableTags,
    captureThumbnailIfMissing: captureThumbnailFromPreview,
    description,
    isCameraAdvancedEnabled,
    isMotionAdvancedEnabled,
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
                    currentSection={currentSection}
                    currentSectionIndex={currentSectionIndex}
                    sectionIssuesById={sectionIssuesById}
                    onSectionJump={handleSectionJump}
                  />
                </div>
              </div>
            </div>
          </aside>

          <div className="scene-editor-main" ref={editorScrollRef}>
            {errors.form ? (
              <div className="form-alert" id={formErrorId} role="alert">
                {errors.form}
              </div>
            ) : null}

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

            {sectionMenuValue === "scene" ? (
              <SceneSection
                description="Choose a bundled shader, environment, and overall scale. Editing the source makes this a custom shader."
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

                <div className="field-group">
                  <FieldGroupLabel
                    description="Edit the scene's shader source directly. Changes switch the selection to Custom Shader."
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
                  <BeatPreviewControls
                    enabled={isBeatSimulated}
                    bpm={previewBpm}
                    onEnabledChange={setIsBeatSimulated}
                    onBpmChange={setPreviewBpm}
                  />
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

                    {usesModernAudio ? (
                      <p className="scene-editor-grid__item--full">
                        {usesMappedAudio ? "This scene uses saved audio mappings." : "This scene uses automatic beat detection and release."} Legacy audio gain, curve, base speed, easing, and volume controls do not apply.
                      </p>
                    ) : <>
                    <SliderField
                      description="Audio sensitivity: how strongly the scene picks up music before its response curve."
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
                    </>}

                  </div>

                  <div className="scene-editor-grid">
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

                    {!usesModernAudio ? <>
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
                      description="Reaction smoothing: lower values follow the beat quickly; higher values ease into each change."
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
                    </> : null}

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
                            value={toDegrees(sceneModel.fx.params.rgbShift.angle)}
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
                <ol className="scene-pass-order">
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
                </ol>
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
                          value={
                            "Mode " +
                            sceneModel.intent.camOrientationMode +
                            ", Speed " +
                            formatFixed(sceneModel.intent.camOrientationSpeed)
                          }
                        />
                      ) : null}
                    </ConfirmSummarySection>

                    <ConfirmSummarySection title="Motion & Effects">
                      <ConfirmSummaryItem
                        label="Time Multiplier"
                        value={formatFixed(sceneModel.intent.time_multiplier)}
                      />
                      {usesModernAudio ? (
                        <ConfirmSummaryItem label="Audio Response" value={usesMappedAudio ? "Audio mappings" : "Beat detection"} />
                      ) : <>
                      <ConfirmSummaryItem
                        label="Audio Gain"
                        value={formatFixed(sceneModel.intent.minimizing_factor)}
                      />
                      <ConfirmSummaryItem
                        label="Audio Curve"
                        value={formatFixed(sceneModel.intent.power_factor)}
                      />
                      </>}
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
              <MagePlayer
                className="scene-editor-preview__player"
                initialPlayback="playing"
                onCaptureFramePreviewChange={(nextCapture) => {
                  captureFramePreviewRef.current = nextCapture;
                }}
                sceneBlob={previewSceneData}
                sceneKey={mode.type === 'edit' ? `edit:${mode.sceneId}` : 'create'}
                simulatedBeat={{ enabled: isBeatSimulated, bpm: previewBpm }}
              />
              </div>
            </section>
          </aside>

        </div>
      </form>
    </AuthPage>
  );
}
