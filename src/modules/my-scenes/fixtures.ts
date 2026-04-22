type DemoSceneThumbnail = {
  background: string
  primary: string
  secondary: string
}

type DemoSceneRequest = {
  name: string
  sceneData: Record<string, unknown>
  thumbnailRef?: string
}

type DemoSceneBlueprint = Omit<DemoSceneRequest, 'thumbnailRef'> & {
  thumbnail?: DemoSceneThumbnail
}

const demoSceneBlueprints: DemoSceneBlueprint[] = [
  {
    name: 'Aurora Drift',
    sceneData: {
      visualizer: {
        shader: 'nebula',
      },
      state: {
        energy: 0.92,
        tempo: 118,
      },
    },
    thumbnail: {
      background: '#06161d',
      primary: '#63f0d6',
      secondary: '#ff7a97',
    },
  },
  {
    name: 'Signal Bloom',
    sceneData: {
      visualizer: {
        shader: 'pulse',
      },
      state: {
        energy: 0.76,
        tempo: 124,
      },
    },
  },
  {
    name: 'Glacier Echo',
    sceneData: {
      visualizer: {
        shader: 'glacier',
      },
      state: {
        energy: 0.58,
        tempo: 96,
      },
    },
    thumbnail: {
      background: '#081820',
      primary: '#7ec8ff',
      secondary: '#f7ff82',
    },
  },
  {
    name: 'Solar Thread',
    sceneData: {
      visualizer: {
        shader: 'ember',
      },
      state: {
        energy: 0.84,
        tempo: 132,
      },
    },
    thumbnail: {
      background: '#15110a',
      primary: '#ffb15a',
      secondary: '#ffd966',
    },
  },
]

function buildDemoThumbnail({ background, primary, secondary }: DemoSceneThumbnail) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'><rect width='320' height='180' fill='${background}'/><circle cx='86' cy='94' r='52' fill='${primary}'/><circle cx='244' cy='66' r='34' fill='${secondary}' fill-opacity='.88'/></svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const demoSceneRequests: DemoSceneRequest[] = demoSceneBlueprints.map(
  ({ thumbnail, ...scene }) => ({
    ...scene,
    ...(thumbnail ? { thumbnailRef: buildDemoThumbnail(thumbnail) } : {}),
  }),
)
