import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(scriptDir, 'dist-floor10');
const htmlPath = path.join(dist, 'floor10.html');
// The repository artifact lives beside jubileu/ so CI can upload one stable
// root-level folder without touching the main site's dist/index.html.
const outPath = path.resolve(scriptDir, '..', process.env.FLOOR10_OUT ?? 'floor10-preview/index.html');
if (!fs.existsSync(htmlPath)) throw new Error('dist-floor10/floor10.html não existe; rode Vite primeiro.');

let html = fs.readFileSync(htmlPath, 'utf8');
const script = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/i);
if (!script) throw new Error('script module não encontrado em dist-floor10/floor10.html.');
const assetPath = path.resolve(dist, script[1].replace(/^\.\//, '').replace(/^\//, ''));
let js = fs.readFileSync(assetPath, 'utf8');
const escapeScript = (value) => value.replace(/<\/script/gi, '<\\/script');
const escapeStyle = (value) => value.replace(/<\/style/gi, '<\\/style');

html = html.replace(script[0], () => '');
html = html.replace(/<link rel="modulepreload"[^>]*>/gi, '');
for (const css of [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gi)]) {
  const cssFile = path.resolve(dist, css[1].replace(/^\.\//, '').replace(/^\//, ''));
  html = html.replace(css[0], () => `<style>${escapeStyle(fs.readFileSync(cssFile, 'utf8'))}</style>`);
}
if (!html.includes('</body>')) throw new Error('HTML sem </body>; recusando gerar preview quebrado.');
html = html.replace('</body>', () => `<script>${escapeScript(js)}</script>\n</body>`);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);

// Preserve public assets alongside the single HTML. The generated entry chunk
// is already inlined; wasm/workers remain ordinary files and GGUF models stay
// external/cacheable, which matches the runtime's existing base paths.
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const copied = [];
for (const file of walk(dist)) {
  if (path.resolve(file) === path.resolve(assetPath) || path.resolve(file) === path.resolve(htmlPath)) continue;
  const relative = path.relative(dist, file);
  const target = path.join(path.dirname(outPath), relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
  copied.push(relative);
}
const count = (pattern) => copied.filter((file) => pattern.test(file)).length;
console.log(`Wrote ${outPath} (${html.length} bytes); copied ${copied.length} asset(s); wllama=${count(/wllama/i)}, wasm=${count(/\.wasm$/i)}, models=${count(/\.gguf$/i)}, workers=${count(/worker/i)}`);
