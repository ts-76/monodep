# monodep Improvement Plan

This plan targets the concept goal: **fill Knip gaps and provide an extended depcheck-like workflow for monorepos**.

## Goals

- Improve detection quality for hard real-world cases.
- Keep false positives manageable with explicit heuristics and config controls.
- Add checks that monorepo teams repeatedly need in CI.

## Phase 0: Test and verification baseline

### Problem

The repository has no automated regression tests, so acceptance criteria are difficult to verify in CI.

### Implementation

1. Add a minimal Node test runner setup (`node --test`) for integration-style CLI checks.
2. Add fixture projects under `fixtures/` for deterministic behavior.
3. Add smoke assertions for compact output stability (deterministic ordering and tags).

### Acceptance Criteria

- `npm test` runs in CI without extra global tools.
- At least one fixture-based regression test exists for each newly added issue type.
- Build + test commands are documented in README contributor section (or existing usage section).

## Phase 1: Dynamic import visibility

### Problem

Static import parsing misses dynamic patterns such as `import(pkgName)` or template-based requires.

### Implementation

1. Extend `Parser` to collect a third category: `dynamicCandidates`.
2. Add non-literal `import()` and `require()` pattern collection with source location.
3. Add report category `dynamic` in normal and compact output.
4. Add config option `dynamicImportPolicy` with values:
   - `off` (default: no report)
   - `warn` (report candidates)
   - `strict` (treat as blocking issues for exit code)
5. Include source references in reports (file path and line) for each candidate.

### Acceptance Criteria

- Dynamic candidates are visible with file references.
- Existing `unused/missing` behavior remains unchanged when policy is `off`.
- Compact output includes `[dynamic]` lines in `warn`/`strict`.
- In `warn`, dynamic issues are informational (do not change exit code).
- In `strict`, dynamic issues are blocking (non-zero exit when present).

## Phase 2: Workspace dependency ownership insight

### Problem

In monorepos, root dependencies are often shared. Teams need guidance on dependency ownership and relocation.

### Implementation

1. Build a usage map: dependency -> packages importing it.
2. Add root ownership report category:
   - root-only but used by many packages
   - workspace-local dependency duplicated at root
3. Add optional `--ownership-report` flag.
4. Add `ownershipPolicy` config to define team preference:
   - `root-shared`
   - `workspace-explicit`
5. Distinguish prod usage from dev usage in report output.

### Acceptance Criteria

- Report explains *why* ownership is flagged.
- No default-breaking behavior without `--ownership-report`.
- Output is deterministic for CI diffs.
- Policy semantics are explicit and testable:
  - `root-shared`: prefers shared root placement for common dependencies.
  - `workspace-explicit`: prefers explicit per-workspace declarations.

## Phase 3: Installed peer dependency verification

### Problem

Current peer checks only use declared manifests; they do not verify installed packages' actual peer constraints.

### Implementation

1. Implement `PeerChecker.checkInstalledPeers`.
2. Resolve installed packages via targeted resolution (prefer `createRequire`/`require.resolve`) instead of broad glob over all `node_modules`.
3. Compare installed dependency graph against peer requirements.
4. Add `--check-installed-peers` flag to keep network/filesystem overhead optional.
5. Add safety boundaries: max resolved packages, max depth, timeout guard, and cache.

### Acceptance Criteria

- Detect missing/incompatible peer constraints from installed packages.
- Graceful fallback when `node_modules` is absent.
- Performance remains acceptable on medium monorepos (documented baseline and command used).
- Issue attribution is explicit (which workspace/root is responsible).

## Cross-cutting tasks

1. Add fixtures for each phase under `fixtures/`.
2. Add regression tests for false-positive-prone patterns.
3. Update README examples and `--only-extras` positioning text when new categories are added.
4. Add migration notes in CHANGELOG for new flags/config options.
5. Keep compact output ordering deterministic for CI diffs.

## Proposed Delivery Order

1. Phase 0 (verification baseline)
2. Phase 1 (high value, low blast radius)
3. Phase 3 (high correctness impact)
4. Phase 2 (policy-heavy; best after richer signals exist)
