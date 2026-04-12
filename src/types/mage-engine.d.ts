declare module '@mage/engine' {
  export type MageEngine = {
    dispose: () => void
    loadPreset: (preset: unknown) => unknown
    start: () => void
  }

  export function initMAGE(config: {
    autoStart?: boolean
    canvas: HTMLCanvasElement
    log?: boolean
    withControls?: boolean
  }): MageEngine
}
