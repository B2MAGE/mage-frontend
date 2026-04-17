declare module '@mage/engine' {
  export type MageEngine = {
    dispose: () => void
    getEngineTime?: () => number
    loadPreset: (scene: unknown) => unknown
    setEngineTime?: (time: number) => boolean
    start: () => void
  }

  export function initMAGE(config: {
    autoStart?: boolean
    canvas: HTMLCanvasElement
    log?: boolean
    withControls?: boolean
  }): MageEngine
}
