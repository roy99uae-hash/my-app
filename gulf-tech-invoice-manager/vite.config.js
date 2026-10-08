import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The renderer is built to static files in dist/ and served by Electron through
// the app:// protocol, so relative asset paths are used.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
