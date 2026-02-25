import { PackageInfo } from './monorepo';

export type OwnershipPolicy = 'root-shared' | 'workspace-explicit';

export interface OwnershipIssue {
    dependency: string;
    type: 'root-shared-candidate' | 'workspace-explicit-candidate';
    usage: 'prod' | 'dev' | 'mixed';
    packages: string[];
    detail: string;
}

export class OwnershipChecker {
    check(
        packages: PackageInfo[],
        rootDir: string,
        prodImportsByPackage: Map<string, Set<string>>,
        devImportsByPackage: Map<string, Set<string>>,
        policy: OwnershipPolicy
    ): OwnershipIssue[] {
        const rootPkg = packages.find((pkg) => pkg.location === rootDir);
        const workspacePackages = packages.filter((pkg) => pkg.location !== rootDir);
        const declarationsByPackage = new Map<string, Set<string>>();

        for (const pkg of packages) {
            const declared = new Set<string>([
                ...Object.keys(pkg.dependencies || {}),
                ...Object.keys(pkg.devDependencies || {}),
                ...Object.keys(pkg.peerDependencies || {}),
                ...Object.keys(pkg.optionalDependencies || {}),
            ]);
            declarationsByPackage.set(pkg.name, declared);
        }

        const depUsage = new Map<string, { prod: Set<string>; dev: Set<string> }>();

        for (const pkg of workspacePackages) {
            const prodDeps = prodImportsByPackage.get(pkg.name) || new Set<string>();
            const devDeps = devImportsByPackage.get(pkg.name) || new Set<string>();

            for (const dep of prodDeps) {
                if (!depUsage.has(dep)) {
                    depUsage.set(dep, { prod: new Set<string>(), dev: new Set<string>() });
                }
                depUsage.get(dep)!.prod.add(pkg.name);
            }

            for (const dep of devDeps) {
                if (!depUsage.has(dep)) {
                    depUsage.set(dep, { prod: new Set<string>(), dev: new Set<string>() });
                }
                depUsage.get(dep)!.dev.add(pkg.name);
            }
        }

        const rootDeclarations = rootPkg
            ? declarationsByPackage.get(rootPkg.name) || new Set<string>()
            : new Set<string>();

        const issues: OwnershipIssue[] = [];

        for (const [dependency, usage] of depUsage.entries()) {
            const consumerPackages = new Set<string>([...usage.prod, ...usage.dev]);
            const consumers = [...consumerPackages].sort();

            if (consumers.length === 0) {
                continue;
            }

            const usageKind: OwnershipIssue['usage'] = usage.prod.size > 0 && usage.dev.size > 0
                ? 'mixed'
                : usage.prod.size > 0
                    ? 'prod'
                    : 'dev';

            if (policy === 'root-shared') {
                if (consumers.length >= 2 && !rootDeclarations.has(dependency)) {
                    issues.push({
                        dependency,
                        type: 'root-shared-candidate',
                        usage: usageKind,
                        packages: consumers,
                        detail: `Used by ${consumers.length} workspaces (${consumers.join(', ')}). Consider declaring at root for shared ownership policy.`,
                    });
                }
                continue;
            }

            if (rootDeclarations.has(dependency)) {
                const missingLocalDeclaration = consumers.filter((pkgName) => {
                    const declared = declarationsByPackage.get(pkgName);
                    return !declared || !declared.has(dependency);
                });

                if (missingLocalDeclaration.length > 0) {
                    issues.push({
                        dependency,
                        type: 'workspace-explicit-candidate',
                        usage: usageKind,
                        packages: missingLocalDeclaration,
                        detail: `Root declares ${dependency}, but workspace-explicit policy prefers local declarations in: ${missingLocalDeclaration.join(', ')}.`,
                    });
                }
            }
        }

        return issues.sort((a, b) => a.dependency.localeCompare(b.dependency));
    }
}
