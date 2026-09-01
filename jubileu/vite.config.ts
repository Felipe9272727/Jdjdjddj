import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
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

// ── O MOTOR DA CASA PRECISA SER SERVIDO À MÃO NO `npm run dev` ────────────
//
// `public/wllama-relaxed/index.js` é o motor que roda o granite 3x mais rápido
// que o do CDN, e `wllamaEngine.ts` o carrega com `import(/* @vite-ignore */
// '/wllama-relaxed/index.js')`. Em produção isso funciona: o arquivo é copiado
// para `dist/` e o navegador o importa como qualquer script estático.
//
// No servidor de desenvolvimento, NÃO. O Vite vê um `import()` de um caminho
// que mora em `public/`, acrescenta `?import` ao pedido e recusa com 500:
//
//     Failed to load url /wllama-relaxed/index.js (resolved id: …).
//     This file is in /public and will be copied as-is during build without
//     going through the plugin transforms, and therefore should not be
//     imported from source code. It can only be referenced via HTML tags.
//
// O que o jogador vê disso, no Andar 10 inteiro:
//
//     Falha ao carregar granite-4.0-h-tiny 7B-A1B localmente:
//     Failed to fetch dynamically imported module: …/wllama-relaxed/index.js?import
//     Nenhum outro modelo foi ativado.
//
// Ou seja: o Nilo não fala UMA palavra em desenvolvimento. Só a bancada que
// abre o jogo de verdade (`bancada-navegador/andar-10-real.mjs`) encontrou
// isso — os 1.617 testes de unidade e o `tsc` passavam, porque nenhum deles
// pede um módulo ao servidor.
//
// A saída é entregar o arquivo antes de o Vite analisar o pedido. Middlewares
// registrados aqui correm ANTES dos internos, então o 500 nunca chega a
// existir; o `?import` é ignorado e os bytes saem crus, com o tipo certo e com
// os cabeçalhos de isolamento que o wasm com threads exige.
function motorDaCasa(): Plugin {
  const RAIZ = '/wllama-relaxed/';
  return {
    name: 'tne-motor-da-casa',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith(RAIZ)) return next();
        const arquivo = path.join(__dirname, 'public', decodeURIComponent(url));
        // `path.join` já normaliza `..`; a checagem abaixo é o que impede um
        // pedido a `/wllama-relaxed/../../etc/passwd` de sair da pasta.
        if (!arquivo.startsWith(path.join(__dirname, 'public', RAIZ))) return next();
        if (!fs.existsSync(arquivo) || !fs.statSync(arquivo).isFile()) return next();
        res.setHeader('Content-Type', url.endsWith('.js') ? 'text/javascript'
          : url.endsWith('.wasm') ? 'application/wasm'
          : 'application/octet-stream');
        // O `server.headers` do Vite é aplicado por um middleware interno, que
        // não roda mais depois que este responde. Sem estes dois o navegador
        // perde o isolamento cross-origin e o wasm com threads não sobe.
        for (const [k, v] of Object.entries(crossOriginIsolationHeaders)) res.setHeader(k, v);
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        fs.createReadStream(arquivo).pipe(res);
      });
    },
  };
}

export default defineConfig(({mode: _mode}) => {
  return {
    plugins: [react(), tailwindcss(), carimbar(), motorDaCasa()],
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
