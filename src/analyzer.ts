import path from 'path';
import { PackageInfo } from './monorepo';
import { Scanner } from './scanner';
import { Parser } from './parser';
import module from 'module';

export interface AnalysisResult {
    package: PackageInfo;
    unused: string[];
    missing: string[];
    wrongType: {
        dependency: string;
        expected: 'dependencies' | 'devDependencies';
        actual: 'dependencies' | 'devDependencies';
    }[];
    dynamicCandidates: {
        file: string;
        line: number;
        expression: string;
    }[];
    prodImports: Set<string>;
    devImports: Set<string>;
}

export class Analyzer {
    private scanner: Scanner;
    private parser: Parser;
    private builtins: Set<string>;

    constructor() {
        this.scanner = new Scanner();
        this.parser = new Parser();
        this.builtins = new Set(module.builtinModules);
    }

    async analyze(pkg: PackageInfo, ignorePatterns: string[] = [], ignoreDependencies: string[] = []): Promise<AnalysisResult> {
        const scanResults = await this.scanner.scan(pkg.location, ignorePatterns);

        const prodImports = new Set<string>();
        const devImports = new Set<string>();
        const dynamicCandidates: AnalysisResult['dynamicCandidates'] = [];

        for (const { file, isDev } of scanResults) {
            const parsedImports = this.parser.parse(file);

            for (const candidate of parsedImports.dynamicCandidates) {
                dynamicCandidates.push({
                    file,
                    line: candidate.line,
                    expression: candidate.expression,
                });
            }

            // Runtime (value) imports
            for (const imp of parsedImports.valueImports) {
                if (imp.startsWith('.')) continue; // Relative import
                if (path.isAbsolute(imp)) continue; // Absolute path (rare in imports)

                if (this.isRuntimeBuiltinImportSpecifier(imp)) continue;

                const normalizedImport = this.normalizeImportSpecifier(imp);

                const packageName = this.getPackageName(normalizedImport);
                if (packageName && !this.builtins.has(packageName)) {
                    if (isDev) {
                        devImports.add(packageName);
                    } else {
                        prodImports.add(packageName);
                    }
                }
            }

            // Type-only imports are treated as dev-time
            for (const imp of parsedImports.typeOnlyImports) {
                if (imp.startsWith('.')) continue;
                if (path.isAbsolute(imp)) continue;

                if (this.isRuntimeBuiltinImportSpecifier(imp)) continue;

                const normalizedImport = this.normalizeImportSpecifier(imp);
                const packageName = this.getPackageName(normalizedImport);
                if (packageName && !this.builtins.has(packageName)) {
                    // If already counted as prod import, keep it there
                    if (!prodImports.has(packageName)) {
                        devImports.add(packageName);
                    }
                }
            }
        }

        const deps = pkg.dependencies || {};
        const devDeps = pkg.devDependencies || {};
        const peerDeps = pkg.peerDependencies || {};
        const optionalDeps = pkg.optionalDependencies || {};

        const allDeps = { ...deps, ...devDeps, ...peerDeps, ...optionalDeps };

        const unused: string[] = [];
        for (const dep of Object.keys(allDeps)) {
            // Ignore @types packages for unused check as they might be used implicitly
            if (dep.startsWith('@types/')) continue;
            if (ignoreDependencies.includes(dep)) continue;

            if (!prodImports.has(dep) && !devImports.has(dep)) {
                unused.push(dep);
            }
        }

        const missing: string[] = [];
        const allImports = new Set([...prodImports, ...devImports]);

        for (const imp of allImports) {
            if (ignoreDependencies.includes(imp)) continue;
            if (!allDeps[imp]) {
                missing.push(imp);
            }
        }

        const wrongType: AnalysisResult['wrongType'] = [];

        // Check for devDependencies used in prod code
        for (const dep of Object.keys(devDeps)) {
            if (prodImports.has(dep)) {
                if (dep.startsWith('@types/')) continue;
                if (peerDeps[dep]) continue; // peer deps are expected to be provided by consumer
                wrongType.push({
                    dependency: dep,
                    expected: 'dependencies',
                    actual: 'devDependencies',
                });
            }
        }

        // Check for dependencies used ONLY in dev code
        for (const dep of Object.keys(deps)) {
            if (devImports.has(dep) && !prodImports.has(dep)) {
                // Skip if it's a type package, they are often in dependencies for library authors
                if (dep.startsWith('@types/')) continue;
                // Skip if peer dependency (library authors keep it in peer deps)
                if (peerDeps[dep]) continue;

                wrongType.push({
                    dependency: dep,
                    expected: 'devDependencies',
                    actual: 'dependencies',
                });
            }
        }

        return {
            package: pkg,
            unused,
            missing,
            wrongType,
            dynamicCandidates,
            prodImports,
            devImports,
        };
    }

    private getPackageName(importPath: string): string | null {
        if (importPath.startsWith('@')) {
            const parts = importPath.split('/');
            if (parts.length >= 2) {
                return `${parts[0]}/${parts[1]}`;
            }
        } else {
            const parts = importPath.split('/');
            if (parts.length >= 1) {
                return parts[0];
            }
        }
        return null;
    }

    private normalizeImportSpecifier(importPath: string): string {
        // Treat `node:`-prefixed specifiers as Node built-ins.
        // Normalizing here ensures `node:path` becomes `path`, etc.
        if (importPath.startsWith('node:')) {
            return importPath.slice('node:'.length);
        }
        return importPath;
    }

    private isRuntimeBuiltinImportSpecifier(importPath: string): boolean {
        // Bun runtime built-ins (e.g. `bun:test`, `bun:sqlite`) should not be treated
        // as external npm dependencies.
        if (importPath === 'bun') return true;
        if (importPath.startsWith('bun:')) return true;
        return false;
    }
}
