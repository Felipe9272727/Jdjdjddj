import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({mode: _mode}) => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    assetsInclude: ['**/*.glb', '**/*.hdr'],
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      minify: false,
      // Inline ALL assets as base64 data-URIs so the single index.html
      // is fully self-contained (no external texture/model files needed).
      assetsInlineLimit: 20_000_000, // 20 MB — covers all PBR textures + GLB models
      rollupOptions: {
        output: {
          // Preserve readable variable names in the bundle
          compact: false,
          // Emit ONE self-contained chunk (no code-splitting). The game ships
          // as a single inlined index.html and inline-build.mjs only inlines the
          // main chunk — any split chunk (the creator previews, or Rapier's WASM)
          // would 404 in the standalone file, and a main chunk that `export`s to
          // split chunks can't be wrapped in a classic <script>. One chunk = no
          // top-level export + every dynamic import folded in (offline-safe).
          inlineDynamicImports: true,
        },
      },
    },
  };
});
