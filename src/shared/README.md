# Shared Layer

The `shared/` directory is reserved for true cross-cutting frontend code.

Expected subareas:

- `ui/` for reusable UI primitives
- `lib/` for generic utilities
- `styles/` for shared style foundations
- `test/` for cross-cutting test helpers only

Feature-specific helpers should stay inside their owning module instead of being added here by default.

Import shared code through `@shared/*` so it is obvious that the dependency is cross-cutting rather than feature-owned.

Current shared surfaces include:

- `@shared/lib` for class-name helpers, API error parsing, formatting helpers, local-storage helpers, and lightweight validation rules
- `@shared/ui` for reusable form fields/notices, selectable chips, surface-card wrappers, table sort buttons, editor field shells, and pagination icon buttons
- `@shared/test` for cross-cutting test setup such as auth/session and HTTP response helpers

Usage conventions:

- add code here only when it is genuinely reused across multiple features
- keep feature-specific business logic in the owning module even if it renders through shared UI primitives
- prefer wrapping existing visual patterns here instead of duplicating the same low-level markup across modules

Import rules:

- `shared/` may be consumed by `app/`, feature modules, and dedicated boundaries such as `theme/`
- `shared/` should not import `@app`, `@modules/*`, or route-specific files
- if a helper needs feature-specific nouns, API contracts, or route behavior to make sense, it probably belongs in a module instead
