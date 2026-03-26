import path from 'path';
import fs from 'fs';
import { glob } from 'tinyglobby';
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
        const configImports = await this.collectConfigDependencies(pkg.location, ignorePatterns);

        for (const { file, isDev } of scanResults) {
            const parsedImports = this.parser.parse(file);

            // Runtime (value) imports
            for (const imp of parsedImports.valueImports) {
                if (imp.startsWith('.')) continue; // Relative import
                if (path.isAbsolute(imp)) continue; // Absolute path (rare in imports)
                if (this.isVirtualImportSpecifier(imp)) continue;

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
                if (this.isVirtualImportSpecifier(imp)) continue;

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
        const usedImports = new Set([...prodImports, ...devImports, ...configImports]);

        const unused: string[] = [];
        for (const dep of Object.keys(allDeps)) {
            // Ignore @types packages for unused check as they might be used implicitly
            if (dep.startsWith('@types/')) continue;
            if (ignoreDependencies.includes(dep)) continue;

            if (!usedImports.has(dep)) {
                unused.push(dep);
            }
        }

        const missing: string[] = [];
        const allImports = usedImports;

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

    private isVirtualImportSpecifier(importPath: string): boolean {
        // Runtime/virtual module schemes are not npm package names.
        // e.g. cloudflare:workers, node:path, data:..., file:...
        return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(importPath);
    }

    private async collectConfigDependencies(packageLocation: string, ignorePatterns: string[] = []): Promise<Set<string>> {
        const dependencies = new Set<string>();
        const bunfigPath = path.join(packageLocation, 'bunfig.toml');
        const packageJsonPath = path.join(packageLocation, 'package.json');
        const tsconfigPath = path.join(packageLocation, 'tsconfig.json');
        const normalizedIgnorePatterns = ignorePatterns.map((pattern) =>
            pattern.split(path.sep).join('/').replace(/\\/g, '/')
        );

        if (fs.existsSync(bunfigPath)) {
            try {
                const content = fs.readFileSync(bunfigPath, 'utf-8');

                const scannerMatch = content.match(/(^|\n)\s*scanner\s*=\s*["']([^"']+)["']/m);
                if (scannerMatch?.[2]) {
                    dependencies.add(scannerMatch[2]);
                }
            } catch (e) {
                console.warn(`Failed to parse ${bunfigPath}:`, e);
            }
        }

        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
                    scripts?: Record<string, string>;
                };

                const scriptsText = Object.values(packageJson.scripts || {}).join(' \n ');
                const cliToolMappings: Record<string, RegExp> = {
                    vite: /(^|\s|&&|\|\|)vite(\s|$)/,
                    wrangler: /(^|\s|&&|\|\|)wrangler(\s|$)/,
                    'cross-env': /(^|\s|&&|\|\|)cross-env(\s|$)/,
                    typescript: /(^|\s|&&|\|\|)tsc(\s|$)/,
                    tsdown: /(^|\s|&&|\|\|)tsdown(\s|$)/,
                    tailwindcss: /(^|\s|&&|\|\|)tailwindcss(\s|$)/,
                };

                for (const [dep, pattern] of Object.entries(cliToolMappings)) {
                    if (pattern.test(scriptsText)) {
                        dependencies.add(dep);
                    }
                }
            } catch (e) {
                console.warn(`Failed to parse ${packageJsonPath}:`, e);
            }
        }

        if (fs.existsSync(tsconfigPath)) {
            dependencies.add('typescript');

            try {
                const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8')) as {
                    compilerOptions?: { types?: string[] };
                };

                for (const typePkg of tsconfig.compilerOptions?.types || []) {
                    const normalizedTypePkg = this.getPackageName(typePkg) || typePkg;
                    dependencies.add(normalizedTypePkg);
                }
            } catch {
                // tsconfig may contain comments; ignore parse failures
            }
        }

        try {
            const cssFiles = await glob(['**/*.css'], {
                cwd: packageLocation,
                ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.wrangler/**', ...normalizedIgnorePatterns],
                absolute: true,
            });

            for (const cssFile of cssFiles) {
                const content = fs.readFileSync(cssFile, 'utf-8');

                const pluginRegex = /@plugin\s+["']([^"']+)["']/g;
                let pluginMatch: RegExpExecArray | null;
                while ((pluginMatch = pluginRegex.exec(content)) !== null) {
                    const dep = this.getPackageName(pluginMatch[1]) || pluginMatch[1];
                    if (dep) dependencies.add(dep);
                }

                const importRegex = /@import\s+["']([^"']+)["']/g;
                let importMatch: RegExpExecArray | null;
                while ((importMatch = importRegex.exec(content)) !== null) {
                    const specifier = importMatch[1];
                    if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
                    const dep = this.getPackageName(specifier) || specifier;
                    if (dep) dependencies.add(dep);
                }
            }
        } catch {
            // Ignore CSS scanning failures
        }

        return dependencies;
    }
}
