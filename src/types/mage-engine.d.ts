declare module '@mage-engine' {
  export type MageInitOptions = {
    canvas?: HTMLCanvasElement | null
    withControls?: boolean
    autoStart?: boolean
    options?: {
      log?: boolean
    }
  }

  export type MagePresetOptions = {
    includeState?: boolean
    includeSettings?: boolean
    includeThumbnail?: boolean
    thumbnailWidth?: number
    thumbnailHeight?: number
    thumbnailType?: string
    thumbnailQuality?: number
    schema?: string
  }

  export type MageEngineApi = {
    start(): void
    stop?(): void
    play(): void
    pause(): void
    loadAudio(filePath?: string): void
    loadPreset(presetInput: string | Record<string, unknown>): unknown
    toPreset(options?: MagePresetOptions): unknown
    dispose(): void
  }

  export function initMAGE(options?: MageInitOptions): {
    engine: MageEngineApi
    controls: unknown
  }

  export function applyEmbeddedPreset(engine: MageEngineApi, presetId: number): boolean
}
