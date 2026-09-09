import { readFileSync as readFloor10Asset } from 'node:fs';
import { resolve as resolveFloor10Asset } from 'node:path';
import type { Plugin as Floor10AssetPlugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

/** Copy only runtimes that the real Nilo module can request; models stay remote. */
const floor10RuntimeAssets = {
  name: 'floor10-runtime-assets',
  generateBundle(this: { emitFile: (asset: { type: 'asset'; fileName: string; source: string | Uint8Array }) => void }) {
    const copyTree = (dir: string, prefix: string) => {
      if (!path.isAbsolute(dir)) return;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const file = path.join(dir, entry.name);
        const rel = path.join(prefix, entry.name).replaceAll('\\', '/');
        if (entry.isDirectory()) copyTree(file, rel);
        else this.emitFile({ type: 'asset', fileName: rel, source: fs.readFileSync(file) });
      }
    };
    copyTree(path.join(root, 'public', 'wllama-relaxed'), 'wllama-relaxed');
    copyTree(path.join(root, 'public', 'wllama-espec'), 'wllama-espec');
    const worker = path.join(root, 'public', 'npcWorker.js');
    try { this.emitFile({ type: 'asset', fileName: 'npcWorker.js', source: fs.readFileSync(worker) }); } catch { /* optional */ }
  },
};

export default defineConfig({
  root,
  base: './',
  plugins: [floor10ConversationAssets(), floor10RuntimeAssets, react()],
  // Keep the module graph independent, but preserve optional Nilo runtime
  // files (wllama wasm/worker and externally hosted GGUF models) when present.
  publicDir: 'public',
  resolve: {
    alias: { '@': root },
  },
  build: {
    copyPublicDir: false,
    outDir: path.resolve(root, 'dist-floor10'),
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      input: path.resolve(root, 'floor10.html'),
      output: { inlineDynamicImports: true, compact: false },
    },
  },
});

// Public runtime modules must bypass Vite's ?import transform in development.
function floor10ConversationAssets(): Floor10AssetPlugin {
  let assetRoot = '';
  const routes = new Set([
    '/wllama-relaxed/index.js',
    '/wllama-relaxed/wasm/wllama.wasm',
    '/wllama-espec/index.js',
    '/wllama-espec/wllama.wasm',
  ]);
  return {
    name: 'floor10-conversation-assets',
    configResolved(config) { assetRoot = config.publicDir || ''; },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const route = (req.url || '').split('?')[0];
        if (!assetRoot || !routes.has(route) || !['GET', 'HEAD'].includes(req.method || '')) return next();
        try {
          const bytes = readFloor10Asset(resolveFloor10Asset(assetRoot, route.slice(1)));
          res.statusCode = 200;
          res.setHeader('Content-Type', route.endsWith('.wasm') ? 'application/wasm' : 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Content-Length', bytes.byteLength);
          res.end(req.method === 'HEAD' ? undefined : bytes);
        } catch (error) { next(error); }
      });
    },
  };
}
