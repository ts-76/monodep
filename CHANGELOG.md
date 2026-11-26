# Changelog

All notable changes to this project will be documented in this file.

## v0.3.0

[compare changes](https://github.com/ts-76/monodep/compare/v0.2.0...v0.3.0)

- Report the `package.json` version from `--version` instead of a hardcoded `1.0.0`.
- Exit 2 when the target directory does not exist or contains no `package.json`. Those cases previously exited 0.
- Parse `tsconfig.json` as JSONC so comments and trailing commas keep `compilerOptions.types`.
- Treat a declared dependency run from `scripts` (by package name or installed bin name, including `npx`, `bunx`, and `pnpm exec`) as used.
- Recognize `import('x').T`, `export type { } from`, and `import x = require()` as usage. An `export type` from a module is type-only.
- Do not report a package that imports its own name as missing.
- Do not compare `peerDependencies` ranges in the version-mismatch check.
- Skip git, URL, `link:`, and dist-tag specifiers in the outdated check, resolve `npm:` aliases to the aliased package, and honor `MONODEP_REGISTRY` with a 10 second registry timeout.
- Do not treat `require.resolve()` as a dependency reference.
- Sort package discovery and per-package issue lists so repeated runs print a stable report.

## v0.2.0

[compare changes](https://github.com/ts-76/monodep/compare/v0.1.12...v0.2.0)

- Add configurable dynamic-import, installed-peer, and dependency ownership checks.
- Use the declared globbing dependency for source scanning.
- Include the MIT license in the npm package.

## v0.1.12

[compare changes](https://github.com/ts-76/monodep/compare/v0.1.11...v0.1.12)

### 🚀 Enhancements

- Add production and development imports tracking to analysis results ([c56ac51](https://github.com/ts-76/monodep/commit/c56ac51))

## v0.1.11

[compare changes](https://github.com/ts-76/monodep/compare/v0.1.10...v0.1.11)

### 🩹 Fixes

- Move typescript back to dependencies for runtime parsing ([3db6511](https://github.com/ts-76/monodep/commit/3db6511))
- Set package version to 0.1.10 ([5405363](https://github.com/ts-76/monodep/commit/5405363))

### ❤️ Contributors

- Tsukuruhito <ts.createlink@gmail.com>

## v0.1.10

[compare changes](https://github.com/ts-76/monodep/compare/list...v0.1.10)

### 📦 Build

- Configure rolldown to exclude external modules and add a shebang, and update package.json's bin entry and dev dependencies. ([a689ce4](https://github.com/ts-76/monodep/commit/a689ce4))

### ❤️ Contributors

- Tsukuruhito <ts.createlink@gmail.com>

## v0.1.9

[compare changes](https://github.com/ts-76/monodep/compare/v0.1.8...v0.1.9)

### 🚀 Enhancements

- Add `Scanner` class to glob source files and identify development-related files. ([7472c81](https://github.com/ts-76/monodep/commit/7472c81))

### 🩹 Fixes

- Analyze ([e17ef44](https://github.com/ts-76/monodep/commit/e17ef44))

### ❤️ Contributors

- Tsukuruhito <ts.createlink@gmail.com>

## v0.1.8

[compare changes](https://github.com/ts-76/monodep/compare/v0.1.7...v0.1.8)

### 🩹 Fixes

- Update repository URL in package.json to reflect correct GitHub link ([32b6237](https://github.com/ts-76/monodep/commit/32b6237))

### 🏡 Chore

- **release:** V0.1.7 ([9a39e25](https://github.com/ts-76/monodep/commit/9a39e25))

### ❤️ Contributors

- Tsukuruhito <ts.createlink@gmail.com>
- Ts-76 <ts.createlink@gmail.com>

## v0.1.7

[compare changes](https://github.com/ts-76/mdepcheck/compare/v0.1.6...v0.1.7)

### 🚀 Enhancements

- Add --no-outdated option to skip outdated dependency checks and improve version fetching performance ([51a8a28](https://github.com/ts-76/mdepcheck/commit/51a8a28))

### ❤️ Contributors

- Ts-76 <ts.createlink@gmail.com>

## v0.1.6

[compare changes](https://github.com/ts-76/mdepcheck/compare/v0.1.5...v0.1.6)

### 🚀 Enhancements

- Rename package to monodep and add internal/peer dependency checks ([1cf83d9](https://github.com/ts-76/mdepcheck/commit/1cf83d9))

### 🏡 Chore

- **release:** V0.1.5 ([da15b99](https://github.com/ts-76/mdepcheck/commit/da15b99))

### ❤️ Contributors

- Ts-76 <ts.createlink@gmail.com>

## v0.1.5

[compare changes](https://github.com/ts-76/mdepcheck/compare/v0.1.4...v0.1.5)

### 📖 Documentation

- Update README to include new dependency checks and usage examples ([6f6624d](https://github.com/ts-76/mdepcheck/commit/6f6624d))

### ❤️ Contributors

- Ts-76 <ts.createlink@gmail.com>

## v0.1.4

[compare changes](https://github.com/ts-76/mdepcheck/compare/v0.1.3...v0.1.4)

### 🩹 Fixes

- Package.json ([aa1ce07](https://github.com/ts-76/mdepcheck/commit/aa1ce07))

### ❤️ Contributors

- Ts-76 <ts.createlink@gmail.com>

## v0.1.3

[compare changes](https://github.com/ts-76/mdepcheck/compare/v0.1.2...v0.1.3)

### 🩹 Fixes

- Package.json ([f63dac2](https://github.com/ts-76/mdepcheck/commit/f63dac2))

### ❤️ Contributors

- Ts-76 <ts.createlink@gmail.com>

## v0.1.2

[compare changes](https://github.com/ts-76/mdepcheck/compare/v0.1.1...v0.1.2)

### 🩹 Fixes

- Package-name ([417f72a](https://github.com/ts-76/mdepcheck/commit/417f72a))

### ❤️ Contributors

- Ts-76 <ts.createlink@gmail.com>

## v0.1.1


### 🚀 Enhancements

- Implement dependency checking tool to identify unused, missing, wrong-type, and outdated dependencies in monorepos. ([02e9fee](https://github.com/ts-76/mdepcheck/commit/02e9fee))
- Prepare for initial npm release with publishing metadata, type declarations, and an automated GitHub Actions workflow. ([7ef5308](https://github.com/ts-76/mdepcheck/commit/7ef5308))

### ❤️ Contributors

- Tsukuruhito <ts.createlink@gmail.com>
- Ts-76 <ts.createlink@gmail.com>

## v0.1.0

- Initial release
