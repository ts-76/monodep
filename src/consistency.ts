import { PackageInfo } from './monorepo';

export interface MismatchResult {
    dependency: string;
    versions: {
        version: string;
        packages: string[];
    }[];
}

export class ConsistencyChecker {
    check(packages: PackageInfo[]): MismatchResult[] {
        const dependencyMap = new Map<string, Map<string, string[]>>();

        for (const pkg of packages) {
            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };

            for (const [dep, version] of Object.entries(allDeps)) {
                // Skip workspace protocols and file paths as they are local
                if (version.startsWith('workspace:') || version.startsWith('file:')) {
                    continue;
                }

                if (!dependencyMap.has(dep)) {
                    dependencyMap.set(dep, new Map());
                }

                const versionMap = dependencyMap.get(dep)!;
                if (!versionMap.has(version)) {
                    versionMap.set(version, []);
                }
                versionMap.get(version)!.push(pkg.name);
            }
        }

        const mismatches: MismatchResult[] = [];

        for (const [dep, versionMap] of dependencyMap.entries()) {
            if (versionMap.size > 1) {
                const versions = Array.from(versionMap.entries()).map(([version, pkgs]) => ({
                    version,
                    packages: pkgs,
                }));
                mismatches.push({ dependency: dep, versions });
            }
        }

        return mismatches;
    }
}
