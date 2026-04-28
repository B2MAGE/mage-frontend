# Modules Layer

The `modules/` directory is the long-term home for vertical feature slices.

Target examples include:

- `auth/`
- `discovery/`
- `home/`
- `my-scenes/`
- `player/`
- `scene-detail/`
- `scene-editor/`
- `settings/`

Each module should eventually own its route-facing logic, data access, UI, tests, and internal helpers. Cross-module imports should go through stable public entrypoints once those modules are introduced.

## Module Contract

Each module should provide:

- an `index.ts` that defines the supported public API
- a lightweight `README.md` that explains public exports, responsibilities, integration rules, and any route-level behavior the module owns
- route-facing entrypoints that stay thin and delegate real behavior to module-local helpers
- tests and fixture builders colocated with the owning module

Internal files are private by default. If another area needs something, expose it from the module entrypoint first.

## Allowed Dependencies

Modules may depend on:

- `@shared/*`
- `@theme`
- other modules' public entrypoints such as `@modules/player`
- stable aliases that intentionally point at module boundaries, such as `@auth`

Modules should not depend on:

- `@app`
- another module's deep internal path
- another module's implementation files bypassing its entrypoint

If two modules need the same low-level primitive, move that primitive to `shared/`. If the behavior is still domain-specific, keep it in the owning module.

Testing follows the same boundary:

- prefer colocated module specs over oversized app-level test files
- keep complex fixture builders in module-local `test-fixtures.ts` or `test-fixtures.tsx`
- use `src/shared/test/` only for helpers that are genuinely reused across modules

## Boundary Change Rules

When reshaping an existing surface:

1. identify the owning feature slice
2. create or extend that module's `index.ts` and `README.md`
3. move the route-facing page/component into the module first
4. pull loaders, selectors, fixtures, and UI down into the module instead of leaving them split across generic folders
5. rewire external imports to `@modules/<module-name>`
6. delete the old files after the new boundary is stable

The theming system remains a dedicated top-level boundary in `src/theme/`, but it should be treated with the same public-API expectations as a feature module.

Current module-owned feature slices include:

- `auth/`
- `discovery/`
- `home/`
- `my-scenes/`
- `player/`
- `scene-detail/`
- `scene-editor/`
- `settings/`

New feature work should start here or in `shared/`, not in new top-level source buckets.

Import modules through `@modules/<module-name>`. Do not reach into `@modules/<module-name>/...` from another area; expose what is needed from the module's `index.ts`.
