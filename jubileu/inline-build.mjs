import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(scriptDir, 'dist');
const htmlPath = path.join(dist, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Cache-busting meta tags
html = html.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />\n    <meta http-equiv="Pragma" content="no-cache" />\n    <meta http-equiv="Expires" content="0" />');

const scriptMatch = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
const cssMatch = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (!scriptMatch) throw new Error('script tag not found in dist/index.html');

const escapeScript = (s) => s.replace(/<\/script/gi, '<\\/script');
const escapeStyle = (s) => s.replace(/<\/style/gi, '<\\/style');

const jsRel = scriptMatch[1].replace(/^\//, '');
let js = fs.readFileSync(path.join(dist, jsRel), 'utf8');

// ── WORKER DO NPC: bundle clássico embutido como Blob URL ─────────────────
// O worker (src/npc/npcWorker.ts) roda o WebLLM fora da thread principal. Em
// file:// o Chrome BLOQUEIA module workers (era o "WORKER_MORTO" ao abrir o
// index.html baixado), então aqui o worker é (re)gerado com esbuild como
// script CLÁSSICO autossuficiente (public/npcWorker.js — também servido como
// fallback fora do single-file) e a referência 'npcWorker.js' no bundle vira
// um Blob URL embutido em base64. Assim roda em file://, Vercel, onde for.
esbuild.buildSync({
  entryPoints: [path.join(scriptDir, 'src/npc/npcWorker.ts')],
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
const workerB64 = fs.readFileSync(path.join(scriptDir, 'public', 'npcWorker.js')).toString('base64');
// fallback pra quando o app NÃO é single-file (Vercel servindo dist): garante
// que dist tenha a versão fresca do worker
fs.copyFileSync(path.join(scriptDir, 'public', 'npcWorker.js'), path.join(dist, 'npcWorker.js'));
const workerMarker = '"npcWorker.js"';
if (js.includes(workerMarker)) {
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

const outPath = path.join(scriptDir, '..', process.env.OUT || 'index.html');
fs.writeFileSync(outPath, html);
console.log('Wrote', outPath, 'size:', html.length);
