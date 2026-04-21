# App Layer

The `app/` directory owns frontend-wide composition concerns.

Use this layer for:

- provider composition
- route composition
- app bootstrap helpers
- app-level shell wiring that is not owned by a single feature

Do not put feature-specific UI or data logic here. That code should move into `modules/` as slices are created.
