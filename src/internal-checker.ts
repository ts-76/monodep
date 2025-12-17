import { PackageInfo } from './monorepo';

export interface InternalIssue {
    packageName: string;
    dependency: string;
    type: 'not-workspace' | 'unlisted-internal' | 'invalid-version';
    detail: string;
}

export class InternalChecker {
    /**
     * Check internal package references within a monorepo
     * - Detects when workspace packages use fixed versions instead of workspace:*
     * - Detects when workspace packages are imported but not listed in dependencies
     */
    check(packages: PackageInfo[], usedImports: Map<string, Set<string>>): InternalIssue[] {
        const issues: InternalIssue[] = [];
        
        // Build a set of all package names in the monorepo
        const workspacePackageNames = new Set(packages.map(p => p.name));

        for (const pkg of packages) {
            const allDeps = {
                ...pkg.dependencies,
                ...pkg.devDependencies,
                ...pkg.peerDependencies,
                ...pkg.optionalDependencies,
            };

            // Check 1: Workspace packages should use workspace: protocol
            for (const [depName, version] of Object.entries(allDeps)) {
                if (workspacePackageNames.has(depName)) {
                    // This is an internal package reference
                    if (!version.startsWith('workspace:') && !version.startsWith('file:')) {
                        issues.push({
                            packageName: pkg.name,
                            dependency: depName,
                            type: 'not-workspace',
                            detail: `Should use "workspace:*" instead of "${version}"`,
                        });
                    }
                }
            }

            // Check 2: Internal packages used in code but not listed in dependencies
            const importsForPkg = usedImports.get(pkg.name);
            if (importsForPkg) {
                for (const imp of importsForPkg) {
                    if (workspacePackageNames.has(imp) && imp !== pkg.name) {
                        // This is an internal package that is imported
                        if (!allDeps[imp]) {
                            issues.push({
                                packageName: pkg.name,
                                dependency: imp,
                                type: 'unlisted-internal',
                                detail: `Internal package is imported but not listed in dependencies`,
                            });
                        }
                    }
                }
            }
        }

        return issues;
    }
}
