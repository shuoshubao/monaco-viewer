import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: './src/content.js',
            output: {
                format: 'iife',
                entryFileNames: 'content.js'
            }
        }
    }
});
