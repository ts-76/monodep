# monodep

A dependency check tool designed for monorepos. It analyzes your project to find unused, missing, misplaced, and outdated dependencies, supporting nested packages and various package managers.

## Why monodep?

There are many excellent tools for managing JavaScript dependencies. Here's how monodep compares:

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

### monodep-Specific Features

- **Wrong dependency type detection**: Identifies when a production dependency should be in devDependencies (e.g., test utilities in dependencies) or vice versa.
- **Version mismatch detection**: Finds when the same package has different versions across your monorepo packages.
- **Internal package validation**: Ensures internal workspace packages use `workspace:*` protocol and are properly referenced.
- **Peer dependency validation**: Validates that peer dependencies are properly provided by host packages.

### Recommended Usage

- Use **Knip** for dead code detection (unused exports, files, dependencies)
- Use **dependency-cruiser** for circular dependency detection
- Use **monodep** with `--only-extras` for wrongType, mismatch, outdated, internal, and peer checks
- Or use **monodep** standalone for complete dependency analysis

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
  "checkOutdated": true
}
```

| Option | Type | Description |
|--------|------|-------------|
| `ignorePatterns` | `string[]` | Glob patterns for files/directories to ignore during scanning |
| `ignoreDependencies` | `string[]` | Dependencies to exclude from unused/missing checks |
| `skipPackages` | `string[]` | Package names to skip entirely |
| `checkOutdated` | `boolean` | Enable/disable outdated dependency checking (default: `true`) |

## How it Works

1. **Monorepo Detection**: It looks for `workspaces` in `package.json` or `packages` in `pnpm-workspace.yaml` to identify all packages in the monorepo.
2. **File Scanning**: For each package, it scans for source files (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`), excluding `node_modules`, `dist`, `build`, and nested sub-packages.
3. **Import Parsing**: It parses the source files using TypeScript's parser to find all import statements.
4. **Dependency Comparison**: It compares the found imports against the `dependencies`, `devDependencies`, and `peerDependencies` listed in the package's `package.json`.
5. **Type Classification**: It detects whether imports are used in production code or test files to identify wrong dependency types.
6. **Version Checking**: It queries the npm registry to find the latest versions of dependencies. Optimized with deduplication, caching, and parallel requests (max 10 concurrent) to minimize registry load.
7. **Consistency Check**: It compares dependency versions across all packages to find mismatches.

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
