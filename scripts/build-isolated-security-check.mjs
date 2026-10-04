import { build } from 'vite'
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { assertSecurityCheckBundle } from '../deployment/isolated-renderer/security-check-build-policy.mjs'
import { SECURITY_CHECK_PARENT_ORIGIN, SECURITY_CHECK_RENDERER_URL, renderSecurityCheckDocument } from '../deployment/isolated-renderer/security-check-page.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outDir = resolve(root, 'dist-player-check/security')
const integrityOf = body => `sha384-${createHash('sha384').update(body).digest('base64')}`

await build({
  root, configFile: false, envDir: false, publicDir: false, envPrefix: '__MAGE_SECURITY_CHECK_NO_CLIENT_ENV__',
  define: { 'import.meta.env': JSON.stringify({ MODE: 'production', PROD: true, DEV: false, BASE_URL: '/player-check/security/' }) },
  plugins: [{ name: 'fixed-security-check-boundary', generateBundle(_options, bundle) { assertSecurityCheckBundle(bundle, root) } }],
  build: {
    outDir, emptyOutDir: true, target: 'es2022', sourcemap: false,
    lib: { entry: resolve(root, 'scripts/isolated-security-live.ts'), name: 'MageFixedSecurityCheck', formats: ['iife'] },
    rollupOptions: { output: { entryFileNames: 'assets/security-[hash].js', inlineDynamicImports: true } },
  },
})

const assets = await readdir(resolve(outDir, 'assets'))
if (assets.length !== 1 || !/^security-[a-zA-Z0-9_-]+\.js$/.test(assets[0])) throw new Error('Unexpected security-check assets.')
const scriptPath = `assets/${assets[0]}`
const script = await readFile(resolve(outDir, scriptPath))
const style = await readFile(resolve(root, 'scripts/isolated-security-check.css'))
const stylePath = `assets/security-${createHash('sha256').update(style).digest('hex').slice(0, 16)}.css`
const html = renderSecurityCheckDocument({ scriptPath, scriptIntegrity: integrityOf(script), stylePath, styleIntegrity: integrityOf(style) })
await writeFile(resolve(outDir, stylePath), style)
await writeFile(resolve(outDir, 'index.html'), html)
await writeFile(resolve(outDir, 'build-manifest.json'), JSON.stringify({ version: 1, parentOrigin: SECURITY_CHECK_PARENT_ORIGIN, rendererUrl: SECURITY_CHECK_RENDERER_URL,
  files: {
    'index.html': { integrity: integrityOf(html), contentType: 'text/html; charset=utf-8' },
    [scriptPath]: { integrity: integrityOf(script), contentType: 'text/javascript; charset=utf-8' },
    [stylePath]: { integrity: integrityOf(style), contentType: 'text/css; charset=utf-8' },
  },
}, null, 2) + '\n')
console.log(`Fixed security check built for ${SECURITY_CHECK_PARENT_ORIGIN}/player-check/security/. No renderer or release setting was changed.`)
