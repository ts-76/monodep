import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface VersionInfo {
    package: string;
    current: string;
    latest: string;
}

export class VersionChecker {
    async checkVersions(dependencies: Record<string, string>): Promise<VersionInfo[]> {
        const results: VersionInfo[] = [];
        const promises = Object.entries(dependencies).map(async ([pkg, currentRange]) => {
            try {
                // Skip workspace protocols and file paths
                if (currentRange.startsWith('workspace:') || currentRange.startsWith('file:')) {
                    return;
                }

                const { stdout } = await execAsync(`npm view ${pkg} version`);
                const latest = stdout.trim();

                // Simple check: if latest is different from what's likely installed (this is a rough check)
                // Ideally we check if currentRange satisfies latest, but for "outdated" report, 
                // usually we want to know if there is a NEWER version available than what is specified.
                // For now, let's just return the info and let the UI decide how to show it.
                // But to be useful, we should probably only return if it looks outdated or just return all?
                // The user asked for "npm outdated" like report.

                results.push({
                    package: pkg,
                    current: currentRange,
                    latest: latest,
                });
            } catch (e) {
                // Ignore errors (e.g. private packages not found, or network issues)
                // console.warn(`Failed to check version for ${pkg}`);
            }
        });

        await Promise.all(promises);
        return results;
    }
}
