import { defineConfig } from 'rolldown';

export default defineConfig({
    input: './src/index.ts',
    platform: 'node',
    output: {
        dir: './dist',
        entryFileNames: 'index.js',
        minify: true,
    },
});
