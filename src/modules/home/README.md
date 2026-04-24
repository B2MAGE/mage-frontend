# Home Module

This directory is the dedicated frontend-owned boundary for the `/` homepage surface.

## Public API

Import route-facing homepage behavior through `@modules/home`.

Exports:

- `HomePage`

## Internal Responsibilities

- `HomePage.tsx`
  Route-facing React boundary for the guest homepage hero and the authenticated handoff into discovery.

## Integration Rules

1. Route wiring should import `HomePage` from `@modules/home`.
2. Authenticated homepage behavior may hand off into discovery, but that orchestration still belongs to this module.
3. Guest hero copy and preview-player embedding should stay here instead of being pushed into `app/`.
