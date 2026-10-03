import { build } from 'vite'
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { LIVE_CHECK_PARENT_ORIGIN, LIVE_CHECK_RENDERER_URL, renderLiveCheckDocument } from '../deployment/isolated-renderer/live-check-page.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outDir = resolve(root, 'dist-player-check')
const isolationDirectory = resolve(root, 'src/modules/player/isolation').replaceAll('\\', '/')
const allowedModules = new Set([
  'src/modules/player/isolation/live-check/main.ts',
  'src/modules/player/isolation/live-check/musicCheck.ts',
  'src/modules/player/isolation/live-check/testRhythm.ts',
  'src/modules/player/isolation/live-check/boundaryCheck.ts',
  'src/modules/player/isolation/isolatedPlayer.ts',
  'src/modules/player/isolation/parentAudio.ts',
  'src/modules/player/isolation/playbackHost.ts',
  'src/modules/player/isolation/playbackProtocol.ts',
  'src/modules/player/isolation/rendererHost.ts',
  'src/modules/player/isolation/protocol.ts',
  'src/modules/player/isolation/capture.ts',
  'src/modules/player/policy/sceneValidation.ts',
  'src/modules/player/policy/renderBudget.ts',
  'src/modules/player/templates/sceneContract.ts',
  'src/modules/player/templates/templateSettings.ts',
  'src/modules/player/templates/resolveScene.ts',
  'src/modules/player/templates/templateRegistry.ts',
  'src/modules/player/templates/versions/v1/definitions.ts',
  'contracts/scenes/scene-limits.v1.json',
  'node_modules/@notrac/mage/dist/audio-analysis.js',
  'node_modules/@notrac/mage/dist/audio-response.js',
].map(path => resolve(root, path).replaceAll('\\', '/')))
const integrityOf = body => `sha384-${createHash('sha384').update(body).digest('base64')}`

await build({
  root,
  configFile: false,
  envDir: false,
  publicDir: false,
  envPrefix: '__MAGE_PLAYER_CHECK_NO_CLIENT_ENV__',
  define: {
    __MAGE_PLAYER_CHECK_PARENT_ORIGIN__: JSON.stringify(LIVE_CHECK_PARENT_ORIGIN),
    __MAGE_PLAYER_CHECK_RENDERER_URL__: JSON.stringify(LIVE_CHECK_RENDERER_URL),
    'import.meta.env': JSON.stringify({ MODE: 'production', PROD: true, DEV: false, BASE_URL: '/player-check/' }),
  },
  plugins: [{
    name: 'live-player-check-boundary',
    generateBundle(_options, bundle) {
      const outputs = Object.values(bundle)
      if (outputs.length !== 1 || outputs[0].type !== 'chunk' || outputs[0].imports.length || outputs[0].dynamicImports.length) {
        throw new Error('Live check must contain exactly one self-contained script.')
      }
      for (const id of Object.keys(outputs[0].modules)) {
        if (!allowedModules.has(id.replaceAll('\\', '/'))) throw new Error(`Main app, auth, and engine imports are forbidden in the live check: ${id}`)
      }
    },
  }],
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    lib: { entry: resolve(isolationDirectory, 'live-check/main.ts'), name: 'MageLivePlayerCheck', formats: ['iife'] },
    rollupOptions: { output: { entryFileNames: 'assets/check-[hash].js', inlineDynamicImports: true } },
  },
})

const assets = await readdir(resolve(outDir, 'assets'))
if (assets.length !== 1 || !/^check-[a-zA-Z0-9_-]+\.js$/.test(assets[0])) throw new Error('Unexpected live-check assets.')
const scriptPath = `assets/${assets[0]}`
const script = await readFile(resolve(outDir, scriptPath))
const style = await readFile(resolve(isolationDirectory, 'live-check/style.css'))
const stylePath = `assets/check-${createHash('sha256').update(style).digest('hex').slice(0, 16)}.css`
await writeFile(resolve(outDir, stylePath), style)
await writeFile(resolve(outDir, 'index.html'), renderLiveCheckDocument({ scriptPath, scriptIntegrity: integrityOf(script), stylePath, styleIntegrity: integrityOf(style) }))
console.log(`Live check built for ${LIVE_CHECK_PARENT_ORIGIN}/player-check/ using ${LIVE_CHECK_RENDERER_URL}. Copy ${outDir} into the app artifact's player-check directory.`)
