import { defineConfig } from 'rolldown';

export default defineConfig({
    input: './src/index.ts',
    platform: 'node',
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
