import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(scriptDir, '..');
const dist = path.join(scriptDir, 'dist');
const htmlPath = path.join(dist, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// ── O CARIMBO DO BUILD ────────────────────────────────────────────────────
// Duas perguntas dependem dele, e as duas custavam 84 MB para serem
// respondidas: "o que está no ar mudou?" (Service Worker) e "o endereço fixo
// tem este mesmo commit?" (origemEstavel.ts). Com o version.json ao lado do
// index.html, as duas custam ~100 bytes.
// A IDENTIDADE É O CONTEÚDO, NÃO O COMMIT.
//
// Usar o SHA do HEAD parece óbvio e está errado por dois lados: na hora em que
// o build roda, o commit que vai ao ar ainda não existe (o index.html é gerado
// ANTES de ser commitado), então o carimbo já nasce apontando para o commit
// anterior — e o Service Worker concluiria "não mudou nada" servindo o build
// velho para sempre. E o inverso também: rebuildar sem mexer no código geraria
// um commit novo e cobraria 84 MB por nada.
//
// O hash do próprio HTML não erra nos dois casos: mesmo código, mesmo id.
// `commit`/`built` continuam no arquivo, mas só para leitura humana — quem
// compara (o worker e o origemEstavel) usa `build`.
const git = (args, alternativa) => {
  try {
    return execFileSync('git', args, { cwd: scriptDir, encoding: 'utf8' }).trim() || alternativa;
  } catch {
    return alternativa;
  }
};
const MARCA_CARIMBO = '__TNE_BUILD_STAMP__';
const carimbo = {
  build: '', // preenchido com o hash do conteúdo, no fim do arquivo
  commit: git(['rev-parse', '--short', 'HEAD'], 'sem-git'),
  ref: git(['rev-parse', '--abbrev-ref', 'HEAD'], ''),
  built: new Date().toISOString(),
};

// AS META-TAGS DE `no-store` SAÍRAM.
//
// Elas mandavam o navegador jogar fora um arquivo de 84 MB a cada abertura —
// era literalmente uma instrução para rebaixar tudo sempre. Existiam para
// resolver "mudei o código e não aparece", e esse problema agora é resolvido
// pelo commit no version.json: o Service Worker só baixa quando o commit no ar
// difere do que está guardado. Frescura sem pagar 84 MB por abertura.
html = html.replace(
  '<meta charset="UTF-8" />',
  '<meta charset="UTF-8" />\n'
  // O carimbo entra como MARCADOR e só vira JSON depois do hash: se o horário
  // da geração participasse do hash, dois builds do mesmo código dariam ids
  // diferentes e o jogador pagaria 84 MB por rebuild.
  + `    <script>window.__TNE_BUILD__=${MARCA_CARIMBO};</script>\n`
  + '    <link rel="manifest" href="/manifest.webmanifest" />\n'
  // "Adicionar à tela inicial" é o que faz o Chrome conceder armazenamento
  // persistente no Android — sem isso os 4,2 GB continuam despejáveis.
  + '    <meta name="mobile-web-app-capable" content="yes" />\n'
  + '    <meta name="apple-mobile-web-app-capable" content="yes" />\n'
  + '    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />\n'
  + '    <link rel="apple-touch-icon" href="/icon-192.png" />',
);

const scriptMatch = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
const cssMatch = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (!scriptMatch) throw new Error('script tag not found in dist/index.html');

const escapeScript = (s) => s.replace(/<\/script/gi, '<\\/script');
const escapeStyle = (s) => s.replace(/<\/style/gi, '<\\/style');

const jsRel = scriptMatch[1].replace(/^\//, '');
let js = fs.readFileSync(path.join(dist, jsRel), 'utf8');

// ── WLLAMA ESPECULATIVO: ESM + WASM DENTRO DO SINGLE-FILE ────────────────
// O runtime recompilado começou como dois arquivos na raiz. Isso funciona num
// host público comum, mas não num preview protegido da Vercel quando o Service
// Worker já tem o jogo: o HTML abre do cache e o import dinâmico novo recebe
// um redirect de autenticação, que o navegador relata apenas como "Failed to
// fetch dynamically imported module".
//
// O jogo sempre foi single-file; estes dois também precisam ser. O pacote só
// vira Blob URL quando `?especulativa` é usado, então sem a flag não criamos um
// runtime WASM extra na memória. Os arquivos externos continuam na raiz como
// fallback para Vite/dev e para diagnosticar o build.
const pastaEspeculativa = path.join(raiz, 'wllama-espec');
const esmEspeculativo = path.join(pastaEspeculativa, 'index.js');
const wasmEspeculativo = path.join(pastaEspeculativa, 'wllama.wasm');
if (!fs.existsSync(esmEspeculativo) || !fs.existsSync(wasmEspeculativo)) {
  throw new Error('wllama-espec incompleto — index.js e wllama.wasm precisam andar juntos.');
}
const pacoteEspeculativo = {
  esm: fs.readFileSync(esmEspeculativo, 'utf8'),
  wasmBase64: fs.readFileSync(wasmEspeculativo).toString('base64'),
};
js = `globalThis.__TNE_WLLAMA_ESPEC__=Object.freeze(${JSON.stringify(pacoteEspeculativo)});\n${js}`;

// ── WORKER DO NPC: bundle clássico embutido como Blob URL ─────────────────
// O worker (src/npc/npcWorker.ts) roda o WebLLM fora da thread principal. Em
// file:// o Chrome BLOQUEIA module workers (era o "WORKER_MORTO" ao abrir o
// index.html baixado), então aqui o worker é (re)gerado com esbuild como
// script CLÁSSICO autossuficiente (public/npcWorker.js — também servido como
// fallback fora do single-file) e a referência 'npcWorker.js' no bundle vira
// um Blob URL embutido em base64. Assim roda em file://, Vercel, onde for.
// O Andar 10 roda no wllama (CPU) desde que o motor WebGPU foi aposentado, e o
// fonte do worker saiu junto com ele. Este passo agora só existe para o caso de
// o WebLLM voltar: sem o arquivo, ele é pulado em vez de quebrar o build.
const workerEntry = path.join(scriptDir, 'src/npc/npcWorker.ts');
const temWorker = fs.existsSync(workerEntry);
let workerB64 = '';
if (temWorker) {
  esbuild.buildSync({
    entryPoints: [workerEntry],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    // minificado: o worker embutido soma ~4MB no single-file em vez de ~9MB —
    // e a Vercel Hobby tem limite de 100MB por deploy, então cada MB conta.
    // (o bundle principal continua legível, como o projeto gosta)
    minify: true,
    outfile: path.join(scriptDir, 'public', 'npcWorker.js'),
    logLevel: 'silent',
  });
  workerB64 = fs.readFileSync(path.join(scriptDir, 'public', 'npcWorker.js')).toString('base64');
  // fallback pra quando o app NÃO é single-file (Vercel servindo dist): garante
  // que dist tenha a versão fresca do worker
  fs.copyFileSync(path.join(scriptDir, 'public', 'npcWorker.js'), path.join(dist, 'npcWorker.js'));
}
const workerMarker = '"npcWorker.js"';
if (temWorker && js.includes(workerMarker)) {
  const workerBlobBuilder = '(URL.createObjectURL(new Blob([Uint8Array.from(atob(__NPC_WORKER_B64__),(c)=>c.charCodeAt(0))],{type:"text/javascript"})))';
  js = `const __NPC_WORKER_B64__="${workerB64}";\n` + js.split(workerMarker).join(workerBlobBuilder);
} else {
  // O Floor 10 atual importa wllamaEngine (CPU), então o Rollup remove
  // llmEngine/npcWorker (WebGPU) do bundle. Não há referência para substituir
  // e, portanto, nada precisa ser embutido. Se o WebGPU voltar a ser usado, o
  // marcador reaparece e o caminho acima continua funcionando.
  console.log('npcWorker.js ausente do chunk (motor WebGPU não utilizado); pulando embed.');
}
// Remove the external script tag from <head>.
// Use a function replacement to prevent JS's $& / $' / $` special patterns
// inside the bundle from being expanded by String.prototype.replace().
html = html.replace(scriptMatch[0], () => '');

// Insert the inlined script just before </body> so the DOM (#root) exists
// when the script runs — inline scripts in <head> lack implicit defer.
const inlinedJs = escapeScript(js);
if (!html.includes('</body>')) {
  throw new Error('</body> not found in dist/index.html — refusing to write a broken bundle.');
}
html = html.replace('</body>', () => `<script>${inlinedJs}</script>\n  </body>`);

// Remove modulepreload link tags — they point to external assets that don't
// exist in a standalone file and cause load errors when opened via file://.
html = html.replace(/<link rel="modulepreload"[^>]*>/gi, '');

if (cssMatch) {
  const cssRel = cssMatch[1].replace(/^\//, '');
  const css = fs.readFileSync(path.join(dist, cssRel), 'utf8');
  const inlinedCss = escapeStyle(css);
  html = html.replace(cssMatch[0], () => `<style>${inlinedCss}</style>`);
}

// O hash sai do HTML AINDA COM O MARCADOR no lugar do carimbo — inclusive com
// o `built` já dentro dele. Se o hash fosse tirado do arquivo final, o próprio
// horário da geração mudaria o hash e todo rebuild cobraria 84 MB do jogador.
// Com o marcador, dois builds do mesmo código dão exatamente o mesmo id.
if (!html.includes(MARCA_CARIMBO)) {
  throw new Error('o marcador do carimbo não está no HTML — o build ficaria sem identidade.');
}
const idDoBuild = createHash('sha256').update(html).digest('hex').slice(0, 12);
carimbo.build = idDoBuild;
html = html.replace(MARCA_CARIMBO, () => JSON.stringify(carimbo));

const outPath = path.join(scriptDir, '..', process.env.OUT || 'index.html');
fs.writeFileSync(outPath, html);
console.log('Wrote', outPath, 'size:', html.length, 'build:', idDoBuild);

// ── O QUE A VERCEL PRECISA ENCONTRAR NA RAIZ ──────────────────────────────
// A Vercel publica a raiz do repositório como site estático: o que não estiver
// aqui, não existe no ar. O `/coi-serviceworker.js` era registrado pelo
// main.tsx e devolvia 404 em produção — ou seja, o worker nunca rodou lá.
// Copiar deixou de ser opcional quando ele passou a ser também quem guarda o
// jogo.
for (const arquivo of [
  'coi-serviceworker.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
]) {
  const origem = path.join(scriptDir, 'public', arquivo);
  if (!fs.existsSync(origem)) {
    console.warn('AVISO: public/' + arquivo + ' não existe; nada copiado para a raiz.');
    continue;
  }
  fs.copyFileSync(origem, path.join(raiz, arquivo));
}

fs.writeFileSync(path.join(raiz, 'version.json'), JSON.stringify(carimbo, null, 2) + '\n');
console.log('Wrote version.json', carimbo.commit, carimbo.ref);
