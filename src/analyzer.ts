import path from 'path';
import fs from 'fs';
import { glob } from 'tinyglobby';
import { PackageInfo } from './monorepo';
import { Scanner } from './scanner';
import { Parser } from './parser';
import module from 'module';
import { parseJSONC } from 'confbox';

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
        const configImports = await this.collectConfigDependencies(pkg, ignorePatterns);
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
                if (this.isVirtualImportSpecifier(imp)) continue;

                if (this.isRuntimeBuiltinImportSpecifier(imp)) continue;

                const normalizedImport = this.normalizeImportSpecifier(imp);

                const packageName = this.getPackageName(normalizedImport);
                if (packageName && packageName !== pkg.name && !this.builtins.has(packageName)) {
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
                if (packageName && packageName !== pkg.name && !this.builtins.has(packageName)) {
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

        unused.sort();
        missing.sort();
        wrongType.sort((a, b) => a.dependency.localeCompare(b.dependency));

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

    private isVirtualImportSpecifier(importPath: string): boolean {
        // Runtime/virtual module schemes are not npm package names.
        // e.g. cloudflare:workers, node:path, data:..., file:...
        return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(importPath);
    }

    /**
     * Find declared dependencies that scripts run as commands, either by package name
     * (`rolldown -c`) or by one of the package's bin names read from node_modules.
     */
    private collectScriptCommandDependencies(pkg: PackageInfo, scripts: string[]): Set<string> {
        const found = new Set<string>();
        const declared = new Set([
            ...Object.keys(pkg.dependencies || {}),
            ...Object.keys(pkg.devDependencies || {}),
            ...Object.keys(pkg.peerDependencies || {}),
            ...Object.keys(pkg.optionalDependencies || {}),
        ]);
        if (declared.size === 0) return found;

        const commands = new Set<string>();
        for (const script of scripts) {
            for (const segment of script.split(/&&|\|\||[;|\n]/)) {
                const tokens = segment.trim().split(/\s+/).filter(Boolean);
                let i = 0;
                const skipEnvAssignments = () => {
                    while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
                };
                skipEnvAssignments();
                // Wrappers that run another command: npx/bunx/pnpx [flags] cmd, pnpm exec|dlx cmd, ...
                const wrapperWithSubcommand = new Set(['pnpm', 'yarn', 'npm', 'bun']);
                if (tokens[i] && ['npx', 'bunx', 'pnpx'].includes(tokens[i])) {
                    i++;
                    while (i < tokens.length && tokens[i].startsWith('-')) i++;
                } else if (tokens[i] && wrapperWithSubcommand.has(tokens[i]) && ['exec', 'dlx', 'x'].includes(tokens[i + 1])) {
                    i += 2;
                    while (i < tokens.length && tokens[i].startsWith('-')) i++;
                }
                skipEnvAssignments();
                if (i < tokens.length) {
                    const command = tokens[i].replace(/^["']|["']$/g, '').replace(/^(\.\/)?node_modules\/\.bin\//, '');
                    if (command) commands.add(command);
                }
            }
        }
        if (commands.size === 0) return found;

        for (const dep of declared) {
            if (commands.has(dep)) {
                found.add(dep);
                continue;
            }
            for (const bin of this.readInstalledBinNames(pkg.location, dep)) {
                if (commands.has(bin)) {
                    found.add(dep);
                    break;
                }
            }
        }
        return found;
    }

    private readInstalledBinNames(packageLocation: string, dep: string): string[] {
        let dir = packageLocation;
        for (;;) {
            const manifestPath = path.join(dir, 'node_modules', dep, 'package.json');
            if (fs.existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
                        bin?: string | Record<string, string>;
                    };
                    if (typeof manifest.bin === 'string') {
                        return [dep.split('/').pop() as string];
                    }
                    return Object.keys(manifest.bin || {});
                } catch {
                    return [];
                }
            }
            const parent = path.dirname(dir);
            if (parent === dir) return [];
            dir = parent;
        }
    }

    private async collectConfigDependencies(pkg: PackageInfo, ignorePatterns: string[] = []): Promise<Set<string>> {
        const packageLocation = pkg.location;
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

                for (const dep of this.collectScriptCommandDependencies(pkg, Object.values(packageJson.scripts || {}))) {
                    dependencies.add(dep);
                }
            } catch (e) {
                console.warn(`Failed to parse ${packageJsonPath}:`, e);
            }
        }

        if (fs.existsSync(tsconfigPath)) {
            dependencies.add('typescript');

            try {
                const tsconfig = parseJSONC(fs.readFileSync(tsconfigPath, 'utf-8')) as {
                    compilerOptions?: { types?: string[] };
                };

                for (const typePkg of tsconfig.compilerOptions?.types || []) {
                    const normalizedTypePkg = this.getPackageName(typePkg) || typePkg;
                    dependencies.add(normalizedTypePkg);
                }
            } catch {
                // A tsconfig that cannot be parsed even as JSONC is ignored
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
