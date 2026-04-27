import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(scriptDir, 'dist');
const htmlPath = path.join(dist, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const scriptMatch = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
const cssMatch = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (!scriptMatch) throw new Error('script tag not found in dist/index.html');

const escapeScript = (s) => s.replace(/<\/script/gi, '<\\/script');
const escapeStyle = (s) => s.replace(/<\/style/gi, '<\\/style');

const jsRel = scriptMatch[1].replace(/^\//, '');
const js = fs.readFileSync(path.join(dist, jsRel), 'utf8');
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

const outPath = path.join(scriptDir, '..', 'index.html');
fs.writeFileSync(outPath, html);
console.log('Wrote', outPath, 'size:', html.length);
