import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // .glb / .hdr aren't in Vite's built-in asset list, so without this the
  // transform tries to parse a GLB as JS and fails the moment a test imports a
  // module that (transitively) imports one — e.g. constants.ts now pulls the
  // bundled character GLBs in. Treat them as assets (resolve to a URL string).
  assetsInclude: ['**/*.glb', '**/*.hdr'],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.*', 'src/main.tsx'],
    },
  },
});
