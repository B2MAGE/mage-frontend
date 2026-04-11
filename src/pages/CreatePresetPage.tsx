import type { FormEvent } from "react";
import { useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AuthPage, AuthPageHeader } from "../components/AuthPage";
import { MagePlayer } from "../components/MagePlayer";
import {
  EffectCard,
  NumberField,
  PresetSection,
  SelectField,
  SliderField,
  ToggleField,
  Vector3Field,
} from "../components/PresetEditorControls";
import { parseApiError } from "../lib/authForm";
import {
  createDefaultSceneData,
  getSceneEditorModel,
  mergeSceneEditorBranch,
  parseSceneDataJson,
  PASS_LABELS,
  prettyPrintSceneData,
  sanitizeSceneData,
  SHADER_PRESETS,
  SKYBOX_OPTIONS,
  TONE_MAPPING_OPTIONS,
  toDegrees,
  toRadians,
  type PersistedPassFlag,
  type PresetPassId,
  type PresetSceneData,
  type SceneEditorModel,
} from "../lib/presetEditor";

type CreatePresetFormErrors = Partial<
  Record<"form" | "name" | "sceneData", string>
>;
type EditorSectionId =
  | "advanced"
  | "camera"
  | "effects"
  | "motion"
  | "pass-order"
  | "scene";
type EffectCategoryId = "color" | "finish" | "pattern" | "trail";
type ThumbnailMode = "auto" | "upload";

type AdditionalPassConfig = {
  category: EffectCategoryId;
  description: string;
  flag: PersistedPassFlag;
  passId: PresetPassId;
};

type EditorSectionConfig = {
  id: EditorSectionId;
  title: string;
};

const EDITOR_SECTIONS: EditorSectionConfig[] = [
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

const passFlagsById: Partial<Record<PresetPassId, PersistedPassFlag>> = {
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

function buildShaderOptions(currentShader: string) {
  const matchedPreset = SHADER_PRESETS.find(
    (preset) => preset.shader.trim() === currentShader.trim(),
  );
  const options = SHADER_PRESETS.map((preset) => ({
    label: preset.label,
    value: preset.id,
  }));

  if (!matchedPreset) {
    options.unshift({
      label: "Custom Shader",
      value: "custom",
    });
  }

  return {
    matchedPreset,
    options,
    value: matchedPreset?.id ?? "custom",
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

function describePassState(passId: PresetPassId, sceneModel: SceneEditorModel) {
  if (passId === "outputPass") {
    return "Fixed last";
  }

  if (passId === "bloom") {
    return sceneModel.fx.bloom.enabled ? "Enabled" : "Disabled";
  }

  const flag = passFlagsById[passId];

  if (!flag) {
    return "Order only";
  }

  return sceneModel.fx.passes[flag] ? "Enabled" : "Disabled";
}

function validateForm(name: string, sceneDataText: string) {
  const errors: CreatePresetFormErrors = {};
  let parsedSceneData: PresetSceneData | null = null;

  if (!name.trim()) {
    errors.name = "Preset name is required.";
  } else if (name.trim().length < 2) {
    errors.name = "Preset name must be at least 2 characters.";
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

export function CreatePresetPage() {
  const { authenticatedFetch } = useAuth();
  const navigate = useNavigate();

  const [sectionMenuValue, setSectionMenuValue] =
    useState<EditorSectionId>("scene");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailMode, setThumbnailMode] = useState<ThumbnailMode>("auto");
  const [thumbnailFileName, setThumbnailFileName] = useState("");
  const [playlistValue, setPlaylistValue] = useState("");
  const [sceneData, setSceneData] = useState<PresetSceneData>(initialSceneData);
  const [sceneDataText, setSceneDataText] = useState(() =>
    prettyPrintSceneData(initialSceneData),
  );
  const [errors, setErrors] = useState<CreatePresetFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const thumbnailFileInputRef = useRef<HTMLInputElement | null>(null);

  const formErrorId = useId();
  const thumbnailInputId = useId();
  const titleId = "create-preset-title";
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
  const selectedShaderPreset = shaderSelection.matchedPreset;
  const selectedToneMapping =
    toneMappingSelection.matchedOption ?? TONE_MAPPING_OPTIONS[0];

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

  function clearErrors(...fields: Array<"form" | "name" | "sceneData">) {
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

  function applySceneData(nextSceneData: PresetSceneData) {
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
    setThumbnailFileName(nextFile.name);
  }

  function handleSectionJump(nextSectionId: EditorSectionId) {
    setSectionMenuValue(nextSectionId);
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

  function movePass(passId: PresetPassId, direction: -1 | 1) {
    if (passId === "outputPass") {
      return;
    }

    updateBranch("fx", (currentFx) => {
      const movablePasses = currentFx.passOrder.filter(
        (currentPassId): currentPassId is Exclude<PresetPassId, "outputPass"> =>
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

    const trimmedName = name.trim();
    const { errors: nextErrors, parsedSceneData } = validateForm(
      trimmedName,
      sceneDataText,
    );

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const sanitizedSceneData = sanitizeSceneData(parsedSceneData ?? sceneData);

    setIsSubmitting(true);
    setErrors({});

    try {
      const response = await authenticatedFetch("/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          sceneData: sanitizedSceneData,
        }),
      });

      if (!response.ok) {
        const apiError = await parseApiError(response);
        const backendDetails = apiError?.details ?? {};
        setErrors({
          name: backendDetails.name,
          sceneData: backendDetails.sceneData,
          form:
            apiError?.message ?? "Failed to create preset. Please try again.",
        });
        return;
      }

      navigate("/my-presets");
    } catch {
      setErrors({
        form: "Preset creation is unavailable right now. Please try again in a moment.",
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
        description="Build a preset with curated scene controls and effect shaping."
        eyebrow="Preset Studio"
        title="Create Preset"
        titleId={titleId}
      />

      <form
        aria-describedby={errors.form ? formErrorId : undefined}
        className="preset-editor-form"
        noValidate
        onSubmit={handleSubmit}
      >
        <div className="preset-editor-layout">
          <div className="preset-editor-main">
            <div className="preset-editor-toolbar">
              <div className="field-group preset-editor-toolbar__name">
                <label htmlFor="name">Preset Name</label>
                <input
                  id="name"
                  minLength={2}
                  name="name"
                  onChange={(event) =>
                    handleNameChange(event.currentTarget.value)
                  }
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

              <div className="preset-editor-toolbar__metadata">
                <div className="field-group">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    onChange={(event) =>
                      setDescription(event.currentTarget.value)
                    }
                    placeholder="Describe the mood, motion, or moment this preset is built for."
                    rows={5}
                    value={description}
                  />
                </div>

                <div className="field-group">
                  <label htmlFor={thumbnailInputId}>Thumbnail</label>
                  <div className="preset-thumbnail-picker">
                    <input
                      accept="image/*"
                      aria-label="Upload thumbnail file"
                      className="preset-thumbnail-input"
                      id={thumbnailInputId}
                      onChange={(event) =>
                        handleThumbnailFileChange(event.currentTarget.files)
                      }
                      ref={thumbnailFileInputRef}
                      type="file"
                    />

                    <div className="preset-thumbnail-picker__grid">
                      <button
                        className={`preset-thumbnail-choice${
                          thumbnailMode === "upload" ? " is-selected" : ""
                        }`}
                        onClick={handleThumbnailUploadClick}
                        type="button"
                      >
                        <span className="preset-thumbnail-choice__eyebrow">
                          Upload
                        </span>
                        <strong className="preset-thumbnail-choice__title">
                          Upload File
                        </strong>
                        <span className="preset-thumbnail-choice__description">
                          Bring in a custom still from your device.
                        </span>
                      </button>

                      <button
                        className={`preset-thumbnail-choice${
                          thumbnailMode === "auto" ? " is-selected" : ""
                        }`}
                        onClick={() => handleThumbnailModeChange("auto")}
                        type="button"
                      >
                        <span className="preset-thumbnail-choice__eyebrow">
                          Quick Pick
                        </span>
                        <strong className="preset-thumbnail-choice__title">
                          Auto-generated
                        </strong>
                        <span className="preset-thumbnail-choice__description">
                          Start from a generated cover treatment.
                        </span>
                      </button>
                    </div>

                    {thumbnailFileName ? (
                      <p className="field-hint">
                        Selected file: <strong>{thumbnailFileName}</strong>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="field-group">
                  <label htmlFor="playlists">Playlists</label>
                  <select
                    className="preset-select"
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
              </div>

              <div className="preset-editor-toolbar__controls">
                <div className="preset-editor-toolbar__control-group preset-editor-toolbar__control-group--navigation">
                  <div className="preset-editor-toolbar__control-copy">
                    <span className="preset-editor-toolbar__eyebrow">
                      Navigation
                    </span>
                    <label
                      className="preset-field__label"
                      htmlFor="section-jump"
                    >
                      Jump To Section
                    </label>
                  </div>

                  <div className="preset-editor-toolbar__navigation-shell">
                    <span
                      aria-hidden="true"
                      className="preset-editor-toolbar__navigation-icon"
                    >
                      <NavigationIcon />
                    </span>
                    <select
                      className="preset-select preset-select--navigation"
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

            {sectionMenuValue === "scene" ? (
              <PresetSection
                description="Visual identity, environment, and scale."
                title="Scene"
              >
                <div className="preset-editor-grid preset-editor-grid--3">
                  <SelectField
                    description={
                      selectedShaderPreset?.description ??
                      "Custom shader text is currently active."
                    }
                    id="shader"
                    label="Shader"
                    onChange={(nextValue) => {
                      const nextShaderPreset = SHADER_PRESETS.find(
                        (preset) => preset.id === nextValue,
                      );

                      if (!nextShaderPreset) {
                        return;
                      }

                      updateBranch("visualizer", (currentVisualizer) => ({
                        ...currentVisualizer,
                        shader: nextShaderPreset.shader,
                      }));
                    }}
                    options={shaderSelection.options}
                    value={shaderSelection.value}
                  />

                  <SelectField
                    description="Pick from the bundled skybox presets instead of entering loader-specific values."
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
              </PresetSection>
            ) : null}

            {sectionMenuValue === "camera" ? (
              <PresetSection
                description="Position, framing, and lens."
                title="Camera"
              >
                <div className="preset-editor-grid preset-editor-grid--2">
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
                    description="Where the camera points while the preset loads."
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
                    label="Field of View"
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
                    label="Camera Tilt"
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
              </PresetSection>
            ) : null}

            {sectionMenuValue === "motion" ? (
              <PresetSection
                description="Rotation and visual shaping."
                title="Motion"
              >
                <div className="preset-editor-grid preset-editor-grid--2">
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
                    description="This shapes and distorts the visual more than it changes speed."
                    id="base-speed"
                    label="Distortion"
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

                  <div className="preset-editor-grid__item--full">
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
              </PresetSection>
            ) : null}

            {sectionMenuValue === "effects" ? (
              <PresetSection
                description="Post-processing and final image shaping."
                title="Effects"
              >
                <div className="preset-effects-grid">
                  <div className="preset-effects-category">
                    <h3 className="preset-effects-category__title">
                      Finish &amp; Output
                    </h3>
                    <div className="preset-effects-category__grid">
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
                        <div className="preset-editor-grid preset-editor-grid--2">
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
                        description="Choose the final output roll-off using named tone-mapping options."
                        footer={
                          <p className="preset-effect-footnote">
                            {selectedToneMapping.description}
                          </p>
                        }
                        title="Tone Mapping"
                      >
                        <div className="preset-editor-grid preset-editor-grid--2">
                          <SelectField
                            description="Switch between filmic output curves without using numeric ids."
                            id="tone-mapping-method"
                            label="Method"
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

                  <div className="preset-effects-category">
                    <h3 className="preset-effects-category__title">
                      Channel &amp; Motion
                    </h3>
                    <div className="preset-effects-category__grid">
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
                        <div className="preset-editor-grid preset-editor-grid--2">
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

                  <div className="preset-effects-category">
                    <h3 className="preset-effects-category__title">
                      Color &amp; Tone
                    </h3>
                    <div className="preset-effects-category__grid">
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
                        <div className="preset-field">
                          <div className="preset-field__label-row">
                            <label
                              className="preset-field__label"
                              htmlFor="colorify-color"
                            >
                              Color
                            </label>
                          </div>
                          <p className="preset-field__description">
                            Choose the tint used by the colorify pass.
                          </p>
                          <div className="preset-color-field">
                            <input
                              className="preset-color-field__picker"
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

                  <div className="preset-effects-category">
                    <h3 className="preset-effects-category__title">
                      Pattern &amp; Structure
                    </h3>
                    <div className="preset-effects-category__grid">
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
                        <div className="preset-editor-grid preset-editor-grid--2">
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
              </PresetSection>
            ) : null}

            {sectionMenuValue === "pass-order" ? (
              <PresetSection
                description="Reorder the effect stack to control how the image is built. Output stays pinned last."
                title="Pass Order"
              >
                <ol className="preset-pass-order">
                  {sceneModel.fx.passOrder.map((passId, index) => {
                    const isOutputPass = passId === "outputPass";

                    return (
                      <li className="preset-pass-order__item" key={passId}>
                        <div className="preset-pass-order__copy">
                          <strong>{PASS_LABELS[passId]}</strong>
                          <span>{describePassState(passId, sceneModel)}</span>
                        </div>
                        <div className="preset-pass-order__actions">
                          <button
                            aria-label={`Move ${PASS_LABELS[passId]} up`}
                            className="preset-order-button"
                            disabled={isOutputPass || index === 0}
                            onClick={() => movePass(passId, -1)}
                            type="button"
                          >
                            Up
                          </button>
                          <button
                            aria-label={`Move ${PASS_LABELS[passId]} down`}
                            className="preset-order-button"
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
              </PresetSection>
            ) : null}

            {sectionMenuValue === "advanced" ? (
              <PresetSection
                description="Raw engine controls and scene data."
                title="Advanced"
              >
                <div className="preset-advanced-stack">
                  <div className="field-group">
                    <label>Motion Tuning</label>
                    <p className="field-hint">
                      Lower-level motion controls that stay out of the main
                      authoring flow.
                    </p>
                  </div>

                  <div className="preset-editor-grid preset-editor-grid--2">
                    <NumberField
                      description="Overall engine time multiplier."
                      id="time-speed"
                      label="Time Speed"
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
                      description="How quickly movement eases toward its target."
                      id="smoothness"
                      label="Smoothness"
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

                    <SliderField
                      description="Compresses the movement range for tighter motion."
                      id="compression"
                      label="Compression"
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
                      description="Boosts the overall energy of the response."
                      id="intensity"
                      label="Intensity"
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
                      description="Extra motion added during interaction or pointer pressure."
                      id="interaction-boost"
                      label="Interaction Boost"
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
                  </div>

                  <div className="field-group">
                    <label htmlFor="shader-source">Custom Shader</label>
                    <textarea
                      className="preset-textarea"
                      id="shader-source"
                      onChange={(event) =>
                        updateBranch("visualizer", (currentVisualizer) => ({
                          ...currentVisualizer,
                          shader: event.currentTarget.value,
                        }))
                      }
                      rows={10}
                      value={sceneModel.visualizer.shader}
                    />
                    <p className="field-hint">
                      Use this only when the preset needs shader code beyond the
                      curated presets.
                    </p>
                  </div>

                  <div className="preset-editor-grid preset-editor-grid--3">
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
                    <div className="preset-advanced-header">
                      <div>
                        <label htmlFor="sceneData">Scene Data JSON</label>
                        <p className="field-hint">
                          Raw scene data stays available here. While the JSON is
                          invalid, the preview keeps the last valid preset
                          state.
                        </p>
                      </div>
                      <button
                        className="preset-secondary-button"
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
                      className="preset-textarea preset-textarea--code"
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
                        the current preset.
                      </p>
                    )}
                  </div>
                </div>
              </PresetSection>
            ) : null}

            <button
              className="demo-link auth-submit preset-editor-submit"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Creating preset..." : "Create preset"}
            </button>
          </div>

          <aside className="preset-editor-preview">
            <section className="surface surface--soft preset-editor-preview__card">
              <div className="preset-editor-preview__header">
                <div>
                  <span className="preset-editor-toolbar__eyebrow">
                    Preview
                  </span>
                  <h2>Live Preview</h2>
                </div>
              </div>

              <MagePlayer
                className="preset-editor-preview__player"
                sceneBlob={previewSceneData}
              />
            </section>
          </aside>
        </div>
      </form>
    </AuthPage>
  );
}
