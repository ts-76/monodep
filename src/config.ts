import { lilconfig } from 'lilconfig';

export interface DepcheckConfig {
    ignorePatterns?: string[];
    ignoreDependencies?: string[];
    skipPackages?: string[];
    checkOutdated?: boolean;
}

export class ConfigLoader {
    async load(rootDir: string): Promise<DepcheckConfig> {
        const explorer = lilconfig('mdepcheck', {
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
