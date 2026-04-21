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
