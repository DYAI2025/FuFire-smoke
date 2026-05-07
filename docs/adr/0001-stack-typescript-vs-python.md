# ADR 0001 — Test-Platform Stack: TypeScript + Bun vs Python

- **Status:** Accepted
- **Date:** 2026-05-07
- **Decision-Owner:** FuFirE Smoke-Test Platform team

## Context

The System Under Test (SUT) is **FuFirE** — a Python/FastAPI astrology engine exposing `/v1/*` endpoints. We need a dedicated test platform that validates schema, semantics, numerical drift, and narrative drift beyond plain HTTP-status checks. The platform must run in CI on every push, on schedule, and ad-hoc against the live API. A core architectural concern is whether SUT and tests share a runtime — sharing reduces glue but creates accidental coupling, hides protocol-level bugs, and pulls test code into the SUT release cycle.

## Options considered

### (a) TypeScript + AJV + Vitest (on Bun)

- AJV is the reference JSON-Schema validator (Draft-07/2020-12) with the strongest ecosystem of formats, keywords, and ergonomic error reports.
- Vitest provides a modern test runner with snapshot, parametrization, and watch mode.
- Bun runs TypeScript natively, no build step, fast install, native `fetch` and `bun:sqlite`.
- `fast-check` for property-based testing is industry-strength.
- Allure-Vitest reporter is mature and produces drillable HTML reports.

### (b) Python + Schemathesis + pytest

- Schemathesis derives property tests from OpenAPI directly.
- Same language as SUT means easy import of internal helpers — but that is precisely the coupling we want to avoid.
- pytest ecosystem is mature; reporting via Allure-pytest exists.
- Risk of accidental shared dependencies pulling test failures into SUT release blockers.

### (c) Hybrid

- TypeScript for protocol/schema/snapshots; Python (Schemathesis) bolted on as an external CLI for OpenAPI-derived fuzzing.
- Captures Schemathesis upside without giving up TS strengths.
- Two toolchains to maintain.

## Decision

Adopt **TypeScript on Bun (Option a)**, with the door open to invoking Schemathesis as a side validator (a thin slice of Option c) if a gap appears in property generation.

Reasons, in priority order:

1. **Schema-first validation is the platform's core**, and AJV is the strongest JSON-Schema validator on any platform.
2. **Explicit decoupling of test platform and SUT** reduces accidental coupling, prevents test code drifting into the FuFirE release process, and surfaces protocol-level bugs that a same-language client would mask.
3. **Bun runs TypeScript without a build step**, with fast cold-starts (`bun install` + `bunx vitest run`) — a strong fit for CI cron and local iteration.
4. **Allure-Vitest reporting** is mature and gives investigators drillable failure context.
5. **`fast-check` for property tests** covers the boundary, chaos, and fuzzing generators we need without dragging in Hypothesis from the SUT side.

## Trade-offs

- Two toolchains to maintain (Python SUT, TS test platform). Mitigated by treating the boundary as an HTTP contract, not a code contract.
- Engineers contributing tests need TypeScript fluency. Mitigated by strict tsconfig and clear package boundaries (`apps/*`, `packages/*`).
- Bun is younger than Node; mitigated by pinning `bun-version: latest` in CI via `oven-sh/setup-bun@v2` and locking exact dep versions in `bun.lock`.

## Consequences

- All test-platform source is TypeScript under `apps/` and `packages/`; the SUT under `FuFirE/` is never modified by this repo.
- Lockfile is `bun.lock` (text-format, committed).
- CI uses `oven-sh/setup-bun@v2` and runs `bun install --frozen-lockfile`, `bun run typecheck`, `bun test`.
- Test data and snapshots persist in SQLite via `bun:sqlite` plus filesystem under `snapshots/`.
- Allure raw output lands in `reports/raw`, generated HTML under `reports/html` (gitignored).
- Optional Schemathesis stays an out-of-band CLI invocation if/when needed; not a runtime dependency.
