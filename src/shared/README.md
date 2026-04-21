# Shared Layer

The `shared/` directory is reserved for true cross-cutting frontend code.

Expected subareas:

- `ui/` for reusable UI primitives
- `lib/` for generic utilities
- `styles/` for shared style foundations
- `test/` for cross-cutting test helpers only

Feature-specific helpers should stay inside their owning module instead of being added here by default.

Import shared code through `@shared/*` so it is obvious that the dependency is cross-cutting rather than feature-owned.
