import { lilconfig } from 'lilconfig';

export interface DepcheckConfig {
    ignorePatterns?: string[];
    ignoreDependencies?: string[];
    skipPackages?: string[];
    checkOutdated?: boolean;
    dynamicImportPolicy?: 'off' | 'warn' | 'strict';
    checkInstalledPeers?: boolean;
    ownershipReport?: boolean;
    ownershipPolicy?: 'root-shared' | 'workspace-explicit';
}

export class ConfigLoader {
    async load(rootDir: string): Promise<DepcheckConfig> {
        const explorer = lilconfig('monodep', {
            stopDir: rootDir,
        });

        try {
            const result = await explorer.search(rootDir);
            if (result && result.config) {
                // console.log(`Loaded config from ${result.filepath}`);
                return result.config as DepcheckConfig;
            }
        } catch (e) {
            console.warn('Failed to load config:', e);
        }

        return {};
    }
}
