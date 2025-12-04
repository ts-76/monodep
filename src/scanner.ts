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
            const isDev =
                file.includes('.test.') ||
                file.includes('.spec.') ||
                file.includes('/test/') ||
                file.includes('/tests/') ||
                file.includes('/__tests__/');
            return { file, isDev };
        });
    }
}
