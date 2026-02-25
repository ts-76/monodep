import { PackageInfo } from './monorepo';
import semver from 'semver';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

export interface PeerIssue {
    packageName: string;
    dependency: string;
    peerDep: string;
    type: 'missing-peer' | 'incompatible-peer' | 'installed-missing-peer' | 'installed-incompatible-peer';
    detail: string;
}

export class PeerChecker {
    private manifestCache = new Map<string, Record<string, unknown>>();

    /**
     * Check peer dependency requirements
     * - Detects missing peer dependencies
     * - Detects incompatible peer dependency versions
     */
    check(packages: PackageInfo[], rootPkg?: PackageInfo): PeerIssue[] {
        const issues: PeerIssue[] = [];

        // Collect all available dependencies from root and workspaces
        const availableDeps = new Map<string, string>();

        // Add root dependencies first (they take precedence)
        if (rootPkg) {
            for (const [name, version] of Object.entries(rootPkg.dependencies || {})) {
                availableDeps.set(name, version);
            }
            for (const [name, version] of Object.entries(rootPkg.devDependencies || {})) {
                if (!availableDeps.has(name)) {
                    availableDeps.set(name, version);
                }
            }
        }

        for (const pkg of packages) {
            const allDeps = {
                ...pkg.dependencies,
                ...pkg.devDependencies,
            };

            // For each dependency, check if its peer dependencies are satisfied
            // Note: We check the peerDependencies declared in the package itself
            // as those are requirements from the package being checked
            const peerDeps = pkg.peerDependencies || {};

            for (const [peerName, peerRange] of Object.entries(peerDeps)) {
                // Skip workspace protocol and file paths
                if (peerRange.startsWith('workspace:') || peerRange.startsWith('file:')) {
                    continue;
                }

                // Check if the peer dependency is provided somewhere
                const providedVersion = allDeps[peerName] || availableDeps.get(peerName);

                if (!providedVersion) {
                    issues.push({
                        packageName: pkg.name,
                        dependency: pkg.name, // The package itself declares this peer
                        peerDep: peerName,
                        type: 'missing-peer',
                        detail: `Peer dependency ${peerName}@${peerRange} is not installed`,
                    });
                } else {
                    // Check version compatibility
                    const cleanProvidedVersion = this.cleanVersion(providedVersion);
                    if (cleanProvidedVersion && !this.satisfies(cleanProvidedVersion, peerRange)) {
                        issues.push({
                            packageName: pkg.name,
                            dependency: pkg.name,
                            peerDep: peerName,
                            type: 'incompatible-peer',
                            detail: `Peer requires ${peerName}@${peerRange} but found ${providedVersion}`,
                        });
                    }
                }
            }
        }

        return issues;
    }

    /**
     * Check dependencies' peer requirements against what's installed
     * This reads the actual node_modules to check if dependencies have their peers satisfied
     */
    async checkInstalledPeers(packages: PackageInfo[], rootPkg?: PackageInfo): Promise<PeerIssue[]> {
        const issues: PeerIssue[] = [];
        const maxResolvedManifests = 2000;
        const timeoutMs = 8000;
        const startedAt = Date.now();
        let resolvedCount = 0;

        for (const pkg of packages) {
            if (Date.now() - startedAt > timeoutMs || resolvedCount >= maxResolvedManifests) {
                break;
            }

            const localProvided = {
                ...pkg.dependencies,
                ...pkg.devDependencies,
                ...pkg.peerDependencies,
                ...pkg.optionalDependencies,
            };

            const rootProvided = rootPkg
                ? {
                    ...rootPkg.dependencies,
                    ...rootPkg.devDependencies,
                    ...rootPkg.peerDependencies,
                    ...rootPkg.optionalDependencies,
                }
                : {};

            const declaredDeps = {
                ...pkg.dependencies,
                ...pkg.devDependencies,
                ...pkg.optionalDependencies,
            };

            const pkgRequire = createRequire(path.join(pkg.location, 'package.json'));

            for (const depName of Object.keys(declaredDeps)) {
                if (Date.now() - startedAt > timeoutMs || resolvedCount >= maxResolvedManifests) {
                    break;
                }

                const manifest = this.resolveInstalledManifest(pkgRequire, depName);
                if (!manifest) {
                    continue;
                }

                resolvedCount++;

                const peerDeps = (manifest.peerDependencies ?? {}) as Record<string, string>;
                for (const [peerName, peerRange] of Object.entries(peerDeps)) {
                    if (peerRange.startsWith('workspace:') || peerRange.startsWith('file:')) {
                        continue;
                    }

                    const providedVersion = localProvided[peerName] ?? rootProvided[peerName];
                    if (!providedVersion) {
                        issues.push({
                            packageName: pkg.name,
                            dependency: depName,
                            peerDep: peerName,
                            type: 'installed-missing-peer',
                            detail: `Installed dependency ${depName} requires peer ${peerName}@${peerRange}, but it is not installed in workspace/root`,
                        });
                        continue;
                    }

                    const cleanProvidedVersion = this.cleanVersion(providedVersion);
                    if (cleanProvidedVersion && !this.satisfies(cleanProvidedVersion, peerRange)) {
                        issues.push({
                            packageName: pkg.name,
                            dependency: depName,
                            peerDep: peerName,
                            type: 'installed-incompatible-peer',
                            detail: `Installed dependency ${depName} requires ${peerName}@${peerRange}, but found ${providedVersion}`,
                        });
                    }
                }
            }
        }

        return issues;
    }

    private resolveInstalledManifest(pkgRequire: NodeJS.Require, depName: string): Record<string, unknown> | null {
        try {
            const resolvedPath = pkgRequire.resolve(`${depName}/package.json`);
            const cached = this.manifestCache.get(resolvedPath);
            if (cached) {
                return cached;
            }

            const content = fs.readFileSync(resolvedPath, 'utf8');
            const parsed = JSON.parse(content) as Record<string, unknown>;
            this.manifestCache.set(resolvedPath, parsed);
            return parsed;
        } catch {
            return null;
        }
    }

    private cleanVersion(version: string): string | null {
        // Remove common prefixes
        if (version.startsWith('workspace:') || version.startsWith('file:')) {
            return null;
        }
        
        // Extract version from range for comparison
        const cleaned = version.replace(/^[\^~>=<]+/, '');
        
        // Handle complex ranges by taking the first version-like part
        const match = cleaned.match(/\d+\.\d+\.\d+/);
        return match ? match[0] : null;
    }

    private satisfies(version: string, range: string): boolean {
        try {
            // Handle common peer dep ranges
            const cleanRange = range
                .replace(/\|\|/g, ' || ')  // Normalize OR operator
                .replace(/\s+/g, ' ')       // Normalize whitespace
                .trim();

            return semver.satisfies(version, cleanRange, { loose: true });
        } catch {
            // If semver can't parse it, assume it's compatible
            return true;
        }
    }
}
