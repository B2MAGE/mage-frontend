# Modules Layer

The `modules/` directory is the long-term home for vertical feature slices.

Target examples include:

- `auth/`
- `discovery/`
- `my-scenes/`
- `player/`
- `scene-detail/`
- `scene-editor/`
- `settings/`
- `theme/`

Each module should eventually own its route-facing logic, data access, UI, tests, and internal helpers. Cross-module imports should go through stable public entrypoints once those modules are introduced.

Testing follows the same boundary:

- prefer colocated module specs over oversized app-level test files
- keep complex fixture builders in module-local `test-fixtures.ts` or `test-fixtures.tsx`
- use `src/shared/test/` only for helpers that are genuinely reused across modules

Current module-owned feature slices include:

- `auth/`
- `discovery/`
- `my-scenes/`
- `player/`
- `scene-detail/`
- `scene-editor/`
- `settings/`

Import modules through `@modules/<module-name>`. Do not reach into `@modules/<module-name>/...` from another area; expose what is needed from the module's `index.ts`.
