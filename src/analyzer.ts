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

        for (const { file, isDev } of scanResults) {
            const parsedImports = this.parser.parse(file);
            for (const imp of parsedImports) {
                if (imp.startsWith('.')) continue; // Relative import
                if (path.isAbsolute(imp)) continue; // Absolute path (rare in imports)

                const packageName = this.getPackageName(imp);
                if (packageName && !this.builtins.has(packageName)) {
                    if (isDev) {
                        devImports.add(packageName);
                    } else {
                        prodImports.add(packageName);
                    }
                }
            }
        }

        const deps = pkg.dependencies || {};
        const devDeps = pkg.devDependencies || {};
        const peerDeps = pkg.peerDependencies || {};

        const allDeps = { ...deps, ...devDeps, ...peerDeps };

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
}
