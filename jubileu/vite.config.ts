import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {execSync} from 'child_process';
import {createHash} from 'crypto';
import {defineConfig, type Plugin} from 'vite';

// ── O CARIMBO DO BUILD, QUE NUNCA EXISTIU ─────────────────────────────────
//
// `origemEstavel.ts` lê `globalThis.__TNE_BUILD__` e busca `/version.json` no
// endereço fixo para comparar as duas pontas. Escrevi este comentário depois de
// descobrir que NINGUÉM escrevia o global e NINGUÉM gerava o arquivo: o
// `grep -rn "__TNE_BUILD__\s*="` no projeto inteiro voltava vazio, e
// `https://<fixo>/version.json` respondia NOT_FOUND. Os dois lados sempre
// disseram "build desconhecido", e o aviso que existe justamente para
// responder "qual versão eu estou rodando?" respondia "não sei".
//
// O preço disso foi medido em conversa: três rodadas seguidas de "continua
// mostrando o LFM", "agora foi mas deu erro", "eu já estou no último commit" —
// e nenhuma das duas pontas conseguia dizer qual código estava no aparelho. Eu
// deduzi o build pelo NÚMERO DE MB no card, porque era a única pista.
//
// `build` é o hash do conteúdo, e não o commit: o comentário do `BuildStamp`
// explica por quê — o build nasce antes do commit que o publica.
function carimboDoBuild(): {build: string; commit: string; ref: string; built: string} {
  const gitSeguro = (cmd: string, padrao = '') => {
    try {
      return execSync(cmd, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
    } catch {
      // Sem git (tarball, container de CI enxuto) o carimbo não morre: as
      // variáveis da Vercel cobrem, e o hash do conteúdo cobre sozinho.
      return padrao;
    }
  };
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8)
    ?? gitSeguro('git rev-parse --short=8 HEAD');
  const ref = process.env.VERCEL_GIT_COMMIT_REF
    ?? gitSeguro('git rev-parse --abbrev-ref HEAD');
  return {
    build: createHash('sha256').update(`${commit}|${ref}|${process.env.VERCEL_DEPLOYMENT_ID ?? ''}`)
      .digest('hex').slice(0, 12),
    commit,
    ref,
    built: new Date().toISOString(),
  };
}

function carimbar(): Plugin {
  const stamp = carimboDoBuild();
  return {
    name: 'tne-carimbo-do-build',
    // O global entra no <head>, ANTES do bundle: `buildLocal()` é chamado na
    // primeira renderização do aviso, e um script no fim do body chegaria
    // tarde.
    transformIndexHtml() {
      return [{
        tag: 'script',
        injectTo: 'head-prepend' as const,
        children: `globalThis.__TNE_BUILD__=${JSON.stringify(stamp)};`,
      }];
    },
    // E o arquivo, que é como a OUTRA origem responde a mesma pergunta. Sem
    // ele o endereço fixo é sempre "desconhecido" e o aviso nunca sabe se
    // saltar vale a pena.
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(stamp, null, 2),
      });
    },
  };
}

const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig(({mode: _mode}) => {
  return {
    plugins: [react(), tailwindcss(), carimbar()],
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
      headers: crossOriginIsolationHeaders,
    },
    preview: {
      headers: crossOriginIsolationHeaders,
    },
    build: {
      minify: false,
      // Inline ALL assets as base64 data-URIs so the single index.html
      // is fully self-contained (no external texture/model files needed).
      // 25 MB so the largest character GLB (blocky-character ~21.8 MB) inlines
      // too — any asset left over the limit emits as a separate file and 404s
      // in the standalone single-file build.
      assetsInlineLimit: 25_000_000, // 25 MB — covers all PBR textures + GLB models
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
