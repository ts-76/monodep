import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import yaml from 'js-yaml';

export interface PackageInfo {
    name: string;
    location: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
}

export class MonorepoManager {
    private rootDir: string;

    constructor(rootDir: string) {
        this.rootDir = path.resolve(rootDir);
    }

    async getPackages(): Promise<PackageInfo[]> {
        const workspacePatterns = await this.getWorkspacePatterns();
        const packageJsonPaths = await glob(
            workspacePatterns.map((p) => path.join(p, 'package.json')),
            {
                cwd: this.rootDir,
                ignore: ['**/node_modules/**'],
                absolute: true,
            }
        );

        // Also include root package.json
        const rootPackageJsonPath = path.join(this.rootDir, 'package.json');
        if (fs.existsSync(rootPackageJsonPath) && !packageJsonPaths.includes(rootPackageJsonPath)) {
            packageJsonPaths.push(rootPackageJsonPath);
        }

        const packages: PackageInfo[] = [];

        for (const pkgPath of packageJsonPaths) {
            try {
                const content = fs.readFileSync(pkgPath, 'utf-8');
                const json = JSON.parse(content);
                packages.push({
                    name: json.name || path.basename(path.dirname(pkgPath)),
                    location: path.dirname(pkgPath),
                    dependencies: json.dependencies || {},
                    devDependencies: json.devDependencies || {},
                    peerDependencies: json.peerDependencies || {},
                });
            } catch (e) {
                console.warn(`Failed to parse ${pkgPath}:`, e);
            }
        }

        return packages;
    }

    private async getWorkspacePatterns(): Promise<string[]> {
        // Check pnpm-workspace.yaml
        const pnpmWorkspacePath = path.join(this.rootDir, 'pnpm-workspace.yaml');
        if (fs.existsSync(pnpmWorkspacePath)) {
            try {
                const content = fs.readFileSync(pnpmWorkspacePath, 'utf-8');
                const doc = yaml.load(content) as { packages?: string[] };
                if (doc && Array.isArray(doc.packages)) {
                    return doc.packages;
                }
            } catch (e) {
                console.warn('Failed to parse pnpm-workspace.yaml:', e);
            }
        }

        // Check package.json workspaces
        const packageJsonPath = path.join(this.rootDir, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const content = fs.readFileSync(packageJsonPath, 'utf-8');
                const json = JSON.parse(content);
                if (Array.isArray(json.workspaces)) {
                    return json.workspaces;
                } else if (json.workspaces && Array.isArray(json.workspaces.packages)) {
                    // Handle yarn object format { packages: [] }
                    return json.workspaces.packages;
                }
            } catch (e) {
                console.warn('Failed to parse package.json:', e);
            }
        }

        // Default to current directory if no workspaces found (single package mode)
        return ['.'];
    }
}
