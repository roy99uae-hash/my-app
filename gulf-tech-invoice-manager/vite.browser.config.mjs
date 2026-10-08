/**
 * Build configuration for the offline browser edition.
 * Produces dist-browser/index.html, which scripts/build-browser-zip.mjs then inlines
 * into a single self-contained file that opens from disk with no server or internet.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { browserAliases } from './browser/aliases.mjs';

export default defineConfig({
  root: 'browser',
  base: './',
  plugins: [react()],
  resolve: { alias: browserAliases },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env': '{}',
  },
  build: {
    outDir: '../dist-browser',
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { output: { codeSplitting: false } },
  },
});
