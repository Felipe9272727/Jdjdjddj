import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const htmlPath = path.join(dist, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const scriptMatch = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
const cssMatch = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (!scriptMatch) throw new Error('script tag not found');
if (!cssMatch) throw new Error('css link not found');

const jsRel = scriptMatch[1].replace(/^\//, '');
const cssRel = cssMatch[1].replace(/^\//, '');
const js = fs.readFileSync(path.join(dist, jsRel), 'utf8');
const css = fs.readFileSync(path.join(dist, cssRel), 'utf8');

html = html.replace(scriptMatch[0], `<script type="module">${js}</script>`);
html = html.replace(cssMatch[0], `<style>${css}</style>`);

const outPath = path.resolve('..', 'index.html');
fs.writeFileSync(outPath, html);
console.log('Wrote', outPath, 'size:', html.length);
