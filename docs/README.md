# Frontend Docs

This directory holds focused implementation notes for the MAGE frontend. The repository README covers setup, scripts, and the high-level project overview. These docs are meant to answer feature-specific questions without forcing readers to scan route code first.

## Documents

- [create-scene-page.md](./create-scene-page.md)  
  Scene editor structure, submission flow, and current persistence limits.

- [deployment.md](./deployment.md)  
  Supported production deployment strategy, reverse-proxy expectations, and container notes.

- [engine-integration.md](./engine-integration.md)  
  Published engine bridge, frontend adapter responsibilities, and package caveats.

- [frontend-architecture.md](./frontend-architecture.md)  
  Initial modular-monolith folder conventions, ownership rules, and migration direction.

- [login-page.md](./login-page.md)  
  Login flow behavior, session handling, and backend request shape.

- [player-component.md](./player-component.md)  
  `MagePlayer` usage, scene blob expectations, and integration rules.

- [registration-page.md](./registration-page.md)  
  Registration flow behavior, redirect path, and backend request shape.

- [settings-page.md](./settings-page.md)  
  Profile edit flow, theme selection behavior, and authenticated update request shape.

- [theme-system.md](./theme-system.md)  
  Theme registry, provider, CSS structure, and how to add additional themes safely.
