import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const sourceBoundaryRoots = [
  'app',
  'auth',
  'components',
  'lib',
  'modules',
  'pages',
  'shared',
  'test',
  'theme',
]

const crossLayerRelativeImportRegex = `^(?:\\.\\.\\/)+(?:${sourceBoundaryRoots.join('|')})(?:\\/.*)?$`
const deepModuleImportRegex = '^@modules\\/[^/]+\\/.+$'

export default defineConfig([
  globalIgnores(['dist', 'dist-isolated-renderer', 'dist-isolated-renderer-production', 'dist-player-check', '.local/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: crossLayerRelativeImportRegex,
              message:
                'Cross-layer imports must use the configured source alias instead of a parent-relative path.',
            },
            {
              regex: deepModuleImportRegex,
              message:
                'Import modules through their public entrypoint (`@modules/<module-name>`), not internal files.',
            },
          ],
        },
      ],
    },
  },
  // This separately bundled child cannot use the app's module barrel: that would
  // pull authentication and parent-player code across the renderer boundary.
  { files: ['src/isolated-renderer/**/*.ts'], rules: { 'no-restricted-imports': 'off' } },
])
