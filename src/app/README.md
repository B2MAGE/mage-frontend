# App Layer

The `app/` directory owns frontend-wide composition concerns.

Use this layer for:

- provider composition
- route composition
- app bootstrap helpers
- app-level shell wiring that is not owned by a single feature

Do not put feature-specific UI or data logic here. That code belongs in the owning module.

## Import Rules

- `app/` may depend on `@modules/*`, `@shared/*`, and `@theme`
- top-level bootstrap files such as `src/App.tsx` and `src/main.tsx` may depend on `@app`
- feature modules and shared helpers should not depend on `@app`

## Composition Checklist

When changing app-level wiring, keep only composition in `app/`:

- provider mounting
- route wiring
- shell-level handoff between modules

If a file starts accumulating feature state, loaders, selectors, or feature-specific rendering, it belongs in the owning module instead.
