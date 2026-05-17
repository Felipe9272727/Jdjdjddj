import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({mode: _mode}) => {
  return {
    // Base path for GitHub Pages deployment (repo name).
    // When serving locally or from root, use '/'.
    base: process.env.VITE_BASE || '/Jdjdjddj/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    assetsInclude: ['**/*.glb'],
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      minify: false,
      // Let Vite decide: small assets (<4KB) inline as data-URIs,
      // large assets (textures, GLB models) become separate files.
      // This keeps the JS bundle small for GitHub Pages deployment.
      assetsInlineLimit: 4096,
      rollupOptions: {
        output: {
          // Preserve readable variable names in the bundle
          compact: false,
        },
      },
    },
  };
});
