# Frontend Docs

This directory holds cross-cutting implementation notes for the MAGE frontend. The repository
README covers setup, scripts, and the high-level project overview.

## Start Here

- [frontend-architecture.md](./frontend-architecture.md)  
  Current frontend folder conventions, ownership rules, and dependency direction.

- [../src/modules/README.md](../src/modules/README.md)  
  The module-layer contract and where feature-specific documentation now lives.

## Cross-Cutting Docs

- [auth-verification.md](./auth-verification.md)
  Real register/login/current-user verification and browser smoke checks.

- [deployment.md](./deployment.md)  
  Supported production deployment strategy, reverse-proxy expectations, and container notes.

- [engine-integration.md](./engine-integration.md)  
  Published engine bridge, frontend adapter responsibilities, and package caveats.

- [player-live-settings.md](./player-live-settings.md)
  Audited live editor controls, structural reloads, and isolated update guarantees.

- [theme-system.md](./theme-system.md)  
  Theme registry, provider, CSS structure, and how to add additional themes safely.

## Layer Contracts

- [../src/app/README.md](../src/app/README.md)
- [../src/modules/README.md](../src/modules/README.md)
- [../src/shared/README.md](../src/shared/README.md)
- [../src/theme/README.md](../src/theme/README.md)

## Feature Docs

Feature behavior, request flow, limitations, and public integration notes live in the owning module
README under `src/modules/<feature>/README.md`.
