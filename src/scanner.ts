import { glob } from 'glob';
import path from 'path';

export interface ScanResult {
    file: string;
    isDev: boolean;
}

export class Scanner {
    async scan(directory: string, additionalIgnore: string[] = []): Promise<ScanResult[]> {
        const files = await glob('**/*.{ts,tsx,js,jsx,mjs,cjs}', {
            cwd: directory,
            ignore: [
                '**/node_modules/**',
                '**/dist/**',
                '**/build/**',
                '**/*.d.ts',
                '**/fixtures/**',
                '**/coverage/**',
                ...additionalIgnore,
            ],
            absolute: true,
        });

        return files.map((file) => {
            // Normalize separators so path checks are OS-independent
            const normalized = file.split(path.sep).join('/');

            const isDev =
                /\.(test|spec)\.[cm]?[tj]sx?$/.test(normalized) ||
                /\.(stories|story)\.[cm]?[tj]sx?$/.test(normalized) ||
                /\/(test|tests|spec|specs|__tests__|__mocks__|__fixtures__|e2e|cypress)\//.test(normalized) ||
                /\/\.storybook\//.test(normalized) ||
                /\/(setup|setupTests|testSetup)\.[cm]?[tj]sx?$/.test(normalized) ||
                /\.config\.[cm]?[tj]s$/.test(normalized);
            return { file, isDev };
        });
    }
}
