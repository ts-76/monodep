import { readFileSync } from 'node:fs';
import { defineConfig } from 'rolldown';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
    input: './src/index.ts',
    platform: 'node',
    // Inline the package version so `--version` always matches package.json
    transform: {
        define: {
            __MONODEP_VERSION__: JSON.stringify(pkg.version),
        },
    },
    // Exclude npm packages from the bundle
    // Users will install them via npm when installing this package
    external: (id) => {
        // Bundle local modules (relative imports and absolute paths)
        if (id.startsWith('.') || id.startsWith('/') || /^[A-Za-z]:/.test(id)) {
            return false;
        }
        // Exclude Node.js built-in modules
        if (id.startsWith('node:')) {
            return true;
        }
        // Exclude npm packages (anything else)
        return true;
    },
    output: {
        dir: './dist',
        entryFileNames: 'index.js',
        minify: true,
        // Add shebang for CLI execution via npx
        banner: '#!/usr/bin/env node',
    },
});
