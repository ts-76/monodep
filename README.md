# monodep

A monorepo dependency analyzer that complements Knip and modernizes depcheck-style checks. monodep focuses on dependency hygiene gaps that are common in real-world workspaces.

## Why monodep?

There are many excellent tools for managing JavaScript dependencies. Here's how monodep compares:

### Positioning

monodep is designed as a **gap-filler**, not a replacement for every tool:

- Use **Knip** as your primary dead-code and unused-export detector.
- Use **monodep** to enforce dependency hygiene that Knip/depcheck typically do not own (dependency type correctness, cross-workspace version consistency, internal workspace protocol correctness, and peer dependency validation).
- If you currently rely on **depcheck-like unused/missing checks**, monodep keeps that baseline while extending it for modern monorepo needs.

| Feature | Knip | depcheck | syncpack | Dependabot | dependency-cruiser | monodep |
|---------|------|----------|----------|------------|--------------------|---------|
| Unused dependencies | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Missing dependencies | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Wrong dependency type (dev vs prod) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Version mismatch across packages | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Outdated dependencies | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Internal package validation (workspace:*) | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Peer dependency validation | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Circular dependencies | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Unused exports/files | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Auto-fix | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Monorepo support | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Plugin ecosystem | ✅ (70+) | ✅ | ❌ | ❌ | ✅ | ❌ |

### monodep Gap-Filling Features

- **Wrong dependency type detection**: Catches dependencies that should be in `devDependencies` but are in `dependencies` (and vice versa).
- **Version mismatch detection**: Finds inconsistent versions of the same dependency across workspaces.
- **Internal package validation**: Ensures internal workspace imports are declared and use `workspace:*` (or `file:`) protocol.
- **Peer dependency validation**: Checks declared peer requirements against what consuming/root packages provide.

### Recommended Usage

- Use **Knip** for dead code detection (unused exports/files/dependencies).
- Use **dependency-cruiser** for circular dependency analysis.
- Use **monodep --only-extras** to run the checks Knip does not target (`wrongType`, `mismatch`, `outdated`, `internal`, `peer`).
- Use monodep standalone when you also want depcheck-style `unused`/`missing` checks in one command.

### Scope Boundaries

To keep expectations clear, monodep currently prioritizes deterministic static analysis and repository metadata.

- **In scope**: package manifest consistency, import-based dependency presence, workspace protocol correctness, peer requirement validation, and registry version freshness checks.
- **Partially in scope**: dynamic/runtime-only dependency resolution patterns (these may need explicit ignores or future advanced detection).
- **Out of scope**: circular dependency graphs, unused exports/files auto-fix workflows.

## Features

- **Monorepo Support**: Automatically detects packages using `package.json` workspaces or `pnpm-workspace.yaml`.
- **Nested Package Handling**: Correctly scans root and sub-packages in isolation, ignoring nested package directories.
- **Dependency Analysis**: Identifies:
  - **Unused dependencies**: Packages listed in `package.json` but not imported in the code.
  - **Missing dependencies**: Packages imported in the code but not listed in `package.json`.
  - **Wrong dependency types**: Dependencies that should be in `devDependencies` but are in `dependencies` (or vice versa).
  - **Outdated dependencies**: Packages with newer versions available on npm.
  - **Version mismatches**: Same dependency with different versions across packages in the monorepo.
  - **Internal package issues**: Internal packages not using `workspace:*` protocol or unlisted internal imports.
  - **Peer dependency issues**: Missing or incompatible peer dependencies in consuming packages.
- **Package Manager Agnostic**: Works with npm, yarn, pnpm, and bun.
- **TypeScript Support**: Parses TypeScript files to extract imports.
- **Configurable**: Supports configuration files to customize behavior.
- **CI/AI Friendly**: Provides compact output mode for automation and AI agents.

## Installation

```bash
npm install -g monodep
```

Or use directly via npx:

```bash
npx monodep
```

### From Source

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```
4. Link globally (optional):
   ```bash
   npm link
   ```

## Usage

### Basic Usage

Run the tool against your project root:

```bash
npx monodep /path/to/your/project
```

Or in the current directory:

```bash
npx monodep .
```

### Options

| Option | Description |
|--------|-------------|
| `--compact` | Output compact log format for AI agents and CI pipelines |
| `--only-extras` | Only run checks not covered by Knip (wrongType, mismatch, outdated, internal, peer) |
| `--no-outdated` | Skip outdated dependency checks for faster execution |
| `--check-installed-peers` | Validate peer requirements from installed dependencies in `node_modules` |
| `--ownership-report` | Show workspace dependency ownership suggestions (informational) |

### Output Example

```text
📦 monodep - Monorepo Dependency Checker

Analyzing project at /path/to/project...
Found 3 packages.

📁 package-a
   /path/to/project/packages/a
   ⚠ Unused dependencies:
     - lodash
   ✗ Missing dependencies:
     - react
   ⚡ Wrong dependency types:
     - chalk: Should be in devDependencies (found in dependencies)
   ⏰ Outdated dependencies:
     - typescript: ^5.0.0 → 5.3.3
   🔗 Internal package issues:
     - @myorg/utils: Should use workspace:* protocol
   👥 Peer dependency issues:
     - react: Missing peer dependency (required by @myorg/ui)

📁 package-b
   /path/to/project/packages/b
   ✓ No issues found.

🔀 Version Mismatches Found:
   lodash:
     - ^4.17.21 in package-a, package-c
     - ^4.17.20 in package-b

──────────────────────────────────────────────────

📊 Summary

   Packages scanned:     3
   Packages with issues: 1

   ⚠ Unused:      1
   ✗ Missing:     1
   ⚡ Wrong type:  1
   ⏰ Outdated:    1
   🔀 Mismatches:  1
   🔗 Internal:    1
   👥 Peer:        1

──────────────────────────────────────────────────

❌ Total issues: 7
```

### Compact Output

For CI pipelines or AI agents, use the `--compact` flag:

```bash
npx monodep . --compact
```

Output:
```text
[monodep] scanned=3 issues=7
[unused] package-a: lodash
[missing] package-a: react
[wrongType] package-a: chalk (dependencies -> devDependencies)
[outdated] package-a: typescript (^5.0.0 -> 5.3.3)
[mismatch] *: lodash (^4.17.21(package-a,package-c) vs ^4.17.20(package-b))
[internal] package-a: @myorg/utils (should use workspace:*)
[peer] package-a: react (missing, required by @myorg/ui)
```

## Knip Integration Mode

If you're already using [Knip](https://knip.dev/) for unused dependency detection, you can run monodep in `--only-extras` mode to avoid duplicate checks:

```bash
# Run only monodep-specific checks
npx monodep . --only-extras

# Combine with compact output for CI
npx monodep . --only-extras --compact
```

This mode skips unused/missing dependency detection (which Knip handles) and focuses on:
- **wrongType**: Dependencies in wrong section (devDependencies vs dependencies)
- **mismatch**: Version inconsistencies across packages
- **outdated**: Packages with newer versions available
- **internal**: Internal workspace package reference issues
- **peer**: Peer dependency validation issues

## Configuration

Create a configuration file in your project root. Supported formats:

- `.monodeprc`
- `.monodeprc.json`
- `.monodeprc.yaml`
- `.monodeprc.yml`
- `.monodeprc.js`
- `.monodeprc.cjs`
- `monodep.config.js`
- `monodep.config.cjs`

### Configuration Options

```json
{
  "ignorePatterns": ["**/generated/**", "**/fixtures/**"],
  "ignoreDependencies": ["some-optional-peer-dep"],
  "skipPackages": ["@myorg/internal-tools"],
  "checkOutdated": true,
  "dynamicImportPolicy": "off",
  "checkInstalledPeers": false,
  "ownershipReport": false,
  "ownershipPolicy": "root-shared"
}
```

| Option | Type | Description |
|--------|------|-------------|
| `ignorePatterns` | `string[]` | Glob patterns for files/directories to ignore during scanning |
| `ignoreDependencies` | `string[]` | Dependencies to exclude from unused/missing checks |
| `skipPackages` | `string[]` | Package names to skip entirely |
| `checkOutdated` | `boolean` | Enable/disable outdated dependency checking (default: `true`) |
| `dynamicImportPolicy` | `'off' \| 'warn' \| 'strict'` | Dynamic import candidate handling (`off`: hidden, `warn`: report only, `strict`: report + non-zero exit) |
| `checkInstalledPeers` | `boolean` | Enable installed peer verification (default: `false`) |
| `ownershipReport` | `boolean` | Enable ownership report output (default: `false`) |
| `ownershipPolicy` | `'root-shared' \| 'workspace-explicit'` | Ownership preference used by `--ownership-report` |

## Detection Logic

### Target Files

monodep detects dependency usage from these files in each package:

- **Source files**: `**/*.{ts,tsx,js,jsx,mjs,cjs}`
  - Excludes `node_modules`, `dist`, `build`, `coverage`, `fixtures`, `*.d.ts`, and nested workspace package paths.
- **CSS files**: `**/*.css`
  - Scans `@plugin "..."` and `@import "..."` directives for package usage.
- **Package config**: `package.json`
  - Scans `scripts` for common CLI tools (e.g. `vite`, `wrangler`, `cross-env`, `tsc`, `tsdown`, `tailwindcss`).
- **TypeScript config**: `tsconfig.json`
  - Reads `compilerOptions.types` and maps entries like `vite/client` to package name `vite`.
  - If `tsconfig.json` exists, `typescript` is treated as toolchain usage.
- **Bun config**: `bunfig.toml`
  - Scans `install.security.scanner` (e.g. `@socketsecurity/bun-security-scanner`).

### Detection Rules

- **Import parsing**:
  - Runtime imports are treated as production usage.
  - `import type` and type-only imports are treated as development usage.
- **Ignored import specifiers**:
  - Relative paths (`./`, `../`) and absolute file paths.
  - Runtime/builtin schemes and virtual modules such as `bun:*`, `node:*`, `cloudflare:*`, `data:*`, `file:*`.
- **Unused dependencies**:
  - A dependency is `unused` if it is not referenced by source imports or config-derived usage.
- **Missing dependencies**:
  - A referenced package is `missing` if it is not listed in `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies`.
- **Wrong dependency type**:
  - `devDependencies` used in production code should move to `dependencies`.
  - `dependencies` used only in dev context should move to `devDependencies`.
- **Catalog/version resolution**:
  - `catalog:` is resolved using root `package.json` `catalog` before outdated/mismatch checks.
  - `workspace:` and `file:` specs are excluded from outdated/mismatch checks.
- **Outdated dependencies**:
  - Compares declared semver range against npm latest version.
  - Reports only when latest does not satisfy the declared range.
- **Version mismatch**:
  - Compares normalized versions across packages and reports when the same dependency has multiple distinct versions.

## How it Works

1. **Monorepo detection**: Reads `workspaces` from `package.json` (or `pnpm-workspace.yaml`) and resolves package boundaries.
2. **Per-package scan**: Collects dependency usage from source files and config files listed in **Detection Logic**.
3. **Usage analysis**: Classifies references into production/dev usage and applies ignore rules (including virtual module specifiers).
4. **Dependency checks**: Computes `unused`, `missing`, and `wrongType` by comparing detected usage with declared dependencies.
5. **Cross-package checks**: Resolves `catalog:` values, runs `outdated` checks against npm, and reports version `mismatch`, internal, and peer issues.

For exact file patterns and matching rules, see **Detection Logic** above.

## Performance

The outdated dependency check requires network requests to the npm registry. To optimize performance:

- **Deduplication**: Same packages across multiple workspaces are only checked once
- **Parallel requests**: Up to 10 concurrent requests with rate limiting
- **Caching**: Version information is cached during execution
- **Skip option**: Use `--no-outdated` to skip version checks entirely for fastest execution

```bash
# Fast mode (skip outdated checks)
npx monodep . --no-outdated

# Full check with outdated detection
npx monodep .
```

## Exit Codes

| Code | Description |
|------|-------------|
| `0` | No issues found |
| `1` | One or more issues detected |

## License

MIT
