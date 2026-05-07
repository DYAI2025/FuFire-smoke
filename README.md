# FuFirE API Testing Platform

Adaptive test platform validating the FuFirE astrology API for schema, semantic, numerical, and narrative drift — beyond mere HTTP status checks.

## Plan

Full implementation plan: [`../docs/plans/2026-05-07-fufire-smoketest-platform.md`](../docs/plans/2026-05-07-fufire-smoketest-platform.md)

## Stack

TypeScript 5.x on Bun >= 1.1 (no build step), Vitest, AJV, fast-check, bun:sqlite, Allure.

## Quickstart

```bash
bun install
bun test
bun run typecheck
```

## Architecture Decisions

See [`docs/adr/`](docs/adr/) — start with [ADR 0001](docs/adr/0001-stack-typescript-vs-python.md) on stack selection.

## Layout

`apps/` (runner CLI, dashboard), `packages/` (core, openapi, runtime, generators, semantic, regression, monitoring), `tests/`, `specs/`, `snapshots/`, `fixtures/`, `configs/`, `scripts/`.
