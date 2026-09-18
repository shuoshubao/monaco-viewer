import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: './src/content.js',
            output: {
                format: 'iife',
                entryFileNames: 'content.js',
                assetFileNames: assetInfo => {
                    if (assetInfo.name?.endsWith('.css')) return 'content.css';
                    return '[name][extname]';
                }
            }
        }
    }
});
