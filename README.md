# mdepcheck

A dependency check tool designed for monorepos. It analyzes your project to find unused and missing dependencies, supporting nested packages and various package managers.

## Features

- **Monorepo Support**: Automatically detects packages using `package.json` workspaces or `pnpm-workspace.yaml`.
- **Nested Package Handling**: Correctly scans root and sub-packages in isolation, ignoring nested package directories.
- **Dependency Analysis**: Identifies:
  - **Unused dependencies**: Packages listed in `package.json` but not imported in the code.
  - **Missing dependencies**: Packages imported in the code but not listed in `package.json`.
- **Package Manager Agnostic**: Works with npm, yarn, pnpm, and bun.
- **TypeScript Support**: Parses TypeScript files to extract imports.

## Installation

You can install it globally or use it via `npx` (once published) or run from source.

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
mdepcheck /path/to/your/project
```

If you linked it globally:

```bash
mdepcheck .
```

### Output Example

```text
Analyzing project at /path/to/project...
Found 3 packages.

Scanning package-a (/path/to/project/packages/a)...
  Unused dependencies:
    - lodash
  Missing dependencies:
    - react

Scanning package-b (/path/to/project/packages/b)...
  No issues found.

All checks passed!
```

## How it Works

1. **Monorepo Detection**: It looks for `workspaces` in `package.json` or `packages` in `pnpm-workspace.yaml` to identify all packages in the monorepo.
2. **File Scanning**: For each package, it scans for source files (`.ts`, `.tsx`, `.js`, `.jsx`, etc.), excluding `node_modules`, `dist`, and nested sub-packages.
3. **Import Parsing**: It parses the source files to find all import statements.
4. **Dependency Comparison**: It compares the found imports against the `dependencies`, `devDependencies`, and `peerDependencies` listed in the package's `package.json`.

## License

MIT
