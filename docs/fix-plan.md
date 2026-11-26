# monodep review: fix plan (2026-11-26)

Baseline on `origin/main` (9556dfd): `npm test` = 7 tests, 7 pass; `tsc --noEmit` passes; there is no lint script;
`npm audit` reports 0 vulnerabilities.

## Done on `fix/monodep-review-20261126`

| # | Pri | Problem (evidence) | Fix | Test |
|---|-----|--------------------|-----|------|
| 1 | P1 | `monodep --version` printed `1.0.0` (hardcoded in `src/index.ts`) while package.json is `0.2.0` | version inlined from package.json at build time (`rolldown.config.mjs` define) | `test/cli-basics.test.mjs` |
| 2 | P1 | A mistyped or empty directory exited 0 with `scanned=0 issues=0` | exit code 2 and a message on stderr | `test/cli-basics.test.mjs` |
| 3 | P1 | `tsconfig.json` was read with `JSON.parse`, so comments/trailing commas (normal in tsconfig) silently dropped `compilerOptions.types` | parse as JSONC (`confbox`, already a dependency) | `test/analysis.test.mjs` |
| 4 | P1 | Scripts only matched 6 hard-coded tools; `changelogen`, `rolldown`, ... were reported unused (monodep flagged itself) | a declared dependency run as a command in a script (by name, or by a bin name from `node_modules`, behind `npx`/`bunx`/`pnpm exec`) counts as used | `test/analysis.test.mjs` |
| 5 | P1 | `peerDependencies` ranges were compared in the mismatch check, so `>=18` vs `^18.2.0` was a false mismatch | peers are excluded | `test/analysis.test.mjs` |
| 6 | P1 | Outdated check reported git/URL/link specifiers and dist-tags as outdated, and compared an `npm:` alias with the latest of the alias *name* (e.g. `vite` vs `npm:@scope/core@1.4.0`) | specifiers are resolved by `src/specifier.ts`; non-registry specs are skipped; aliases use the aliased package; `MONODEP_REGISTRY` override; 10s request timeout | `test/outdated.test.mjs` (fake registry) |
| 7 | P2 | `import('x').T`, `export type {..} from`, `import x = require()` were not detected; `export type ... from` counted as a runtime import | parser handles all three; export type-from is type-only | `test/analysis.test.mjs` |
| 8 | P2 | Importing the package's own name (self-reference via `exports`) was reported missing | own name is skipped | `test/analysis.test.mjs` |
| 9 | P1 | Output order changed between runs (glob completion order), against the "deterministic for CI diffs" goal | sorted discovery results and per-package lists | `test/determinism.test.mjs` |

Tried and dropped: counting `require.resolve('x')` as a reference. On hono-decks it created false `missing`
reports because verification scripts use it to assert a package is absent. A guard test keeps it uncounted.

## Not done (plan only)

| Pri | Item | Notes | Effort |
|-----|------|-------|--------|
| P1 | Named catalogs: `catalog:name`, `catalogs`, and pnpm-workspace.yaml `catalog` are not resolved (only root package.json `catalog` with the bare `catalog:` spec). Unresolved ones are now skipped in the outdated check but are still compared as raw strings in the mismatch check | resolve via the same lookup in `index.ts` | S-M |
| P1 | Config errors are swallowed: an unreadable config prints a warning and the run continues with defaults, so a broken `.monodeprc` can look like a pass. No schema validation (wrong types crash later) | fail with exit 2 on load errors; validate shape | M |
| P2 | `parse()` instead of `parseAsync()`; unexpected errors give an unhandled-rejection stack | catch at top level, exit 2 | S |
| P2 | Peer dependencies are included in the `unused` check, which flags real peers of plugins/libraries | add a policy option | S |
| P2 | `tsconfig.json` `extends` is not followed (types declared in a base config are missed) | resolve extends chain | M |
| P2 | `tsc` build config says `module: commonjs` while the package is ESM; type check is `tsc --noEmit` only and `build:types` is not part of `npm test` | align tsconfig | S |
| P2 | `npm run lint` is a placeholder; CI (`release.yml`) runs `npm test` only on a tag push, so PRs have no CI | add a PR workflow (needs workflow scope) | S |
| P3 | Dependency updates: rolldown beta.55 -> 1.3.x, commander 15, chalk 6 (major) | separate PR | M |
| P3 | Windows path handling is lower-cased/normalized in places; not exercised by tests | run tests on Windows in CI | M |

## Release

Release is tag-driven (`.github/workflows/release.yml`: `v*` tag push or `workflow_dispatch` on an existing tag; runs
`npm ci && npm test`, then publishes through the trusted publisher). The local branch does not bump the version or
edit CHANGELOG release sections; a patch release after merging is the owner's call.
