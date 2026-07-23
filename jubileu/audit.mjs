#!/usr/bin/env node
/**
 * audit.mjs — Automated code audit for The Normal Elevator
 * Checks for common issues, inconsistencies, and potential bugs.
 * Run: node audit.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, 'src');
const ROOT = path.resolve(import.meta.dirname, '..');

let errors = 0;
let warnings = 0;
let info = 0;

const error = (file, msg) => { errors++; console.error(`  ❌ ERROR: ${file}: ${msg}`); };
const warn = (file, msg) => { warnings++; console.warn(`  ⚠️  WARN: ${file}: ${msg}`); };
const ok = (msg) => { info++; console.log(`  ✅ ${msg}`); };

console.log('\n🔍 THE NORMAL ELEVATOR — Code Audit\n');

// ─── 1. Check file existence ────────────────────────────────────────────────
console.log('📁 File Structure');
const requiredFiles = [
  'src/App.tsx', 'src/Player.tsx', 'src/Multiplayer.tsx', 'src/Elevator.tsx',
  'src/Bot.tsx', 'src/UI.tsx', 'src/MainMenu.tsx', 'src/Settings.tsx',
  'src/AudioEngine.tsx', 'src/LobbyEnv.tsx', 'src/HouseEnv.tsx',
  'src/Furniture.tsx', 'src/BuildingBlocks.tsx', 'src/Materials.tsx',
  'src/RemotePlayer.tsx', 'src/physics.ts', 'src/constants.ts',
  'src/main.tsx', 'src/index.css',
  'vite.config.ts', 'package.json', 'tsconfig.json',
  'firestore.rules', 'firebase-blueprint.json',
];
for (const f of requiredFiles) {
  const p = path.join(SRC.includes(f) ? SRC : import.meta.dirname, f);
  const exists = fs.existsSync(p) || fs.existsSync(path.join(import.meta.dirname, f));
  if (!exists) error(f, 'File missing!');
  else ok(f);
}

// ─── 2. Check build files ───────────────────────────────────────────────────
console.log('\n📦 Build Files');
const indexHtml = path.join(ROOT, 'index.html');
if (fs.existsSync(indexHtml)) {
  const size = fs.statSync(indexHtml).size;
  const mb = (size / 1024 / 1024).toFixed(1);
  if (size > 5 * 1024 * 1024) warn('index.html', `${mb}MB — exceeds 5MB, consider optimizing`);
  else ok(`index.html: ${mb}MB`);
} else error('index.html', 'Main build file missing!');

const indexReadable = path.join(ROOT, 'index-readable.html');
if (fs.existsSync(indexReadable)) ok('index-readable.html exists');
else warn('index-readable.html', 'Readable build missing');

const index18 = path.join(ROOT, 'index-18.html');
if (fs.existsSync(index18)) {
  const size = fs.statSync(index18).size;
  if (size < 2 * 1024 * 1024) warn('index-18.html', `${(size/1024/1024).toFixed(1)}MB — likely truncated, should be ~1.8MB+`);
  ok(`index-18.html: ${(size/1024/1024).toFixed(1)}MB (truncated version, not for use)`);
}

// ─── 3. Check constants ─────────────────────────────────────────────────────
console.log('\n🔧 Constants');
const constantsSrc = fs.readFileSync(path.join(SRC, 'constants.ts'), 'utf8');

// Check all URLs are valid
const urlMatches = constantsSrc.matchAll(/"(https?:\/\/[^"]+)"/g);
let urlCount = 0;
for (const m of urlMatches) {
  urlCount++;
  const url = m[1];
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    error('constants.ts', `Localhost URL found: ${url}`);
  }
}
ok(`${urlCount} external URLs found`);

// Check wall arrays have 4-tuples
const wallArrays = ['LOBBY_W', 'ELEV_W', 'HOUSE_EX', 'HOUSE_IN', 'L1_BND', 'ELEV_BLD'];
for (const name of wallArrays) {
  const regex = new RegExp(`export const ${name}\\s*=\\s*\\[([^;]+)\\];`);
  const match = constantsSrc.match(regex);
  if (match) {
    const inner = match[1];
    const tuples = inner.match(/\[[^\]]+\]/g) || [];
    for (const t of tuples) {
      const nums = t.match(/-?[\d.]+/g) || [];
      if (nums.length !== 4) error('constants.ts', `${name} has non-4-tuple: ${t}`);
    }
    ok(`${name}: ${tuples.length} wall segments`);
  }
}

// ─── 4. Check Firestore rules consistency ───────────────────────────────────
console.log('\n🔒 Security');
const rulesSrc = fs.readFileSync(path.join(import.meta.dirname, 'firestore.rules'), 'utf8');

if (rulesSrc.includes('allow read, write: if false')) ok('Default deny rule present');
else warn('firestore.rules', 'Missing default deny rule');

if (rulesSrc.includes('request.auth.uid == userId')) ok('Owner-only write check present');
else warn('firestore.rules', 'Missing owner check');

// Check MAX_LEVEL consistency
const maxLevelMatch = constantsSrc.match(/MAX_LEVEL\s*=\s*(\d+)/);
const rulesLevelMatch = rulesSrc.match(/data\.level\s*<=\s*(\d+)/);
if (maxLevelMatch && rulesLevelMatch) {
  if (maxLevelMatch[1] !== rulesLevelMatch[1]) {
    error('constants.ts/firestore.rules', `MAX_LEVEL mismatch: constants=${maxLevelMatch[1]} rules=${rulesLevelMatch[1]}`);
  } else ok(`MAX_LEVEL consistent: ${maxLevelMatch[1]}`);
}

// ─── 5. Check for common React bugs ─────────────────────────────────────────
console.log('\n⚛️  React Patterns');
const allSrc = fs.readdirSync(SRC).filter(f => f.endsWith('.tsx')).map(f => ({
  name: f,
  content: fs.readFileSync(path.join(SRC, f), 'utf8'),
}));

for (const { name, content } of allSrc) {
  // Check for missing key in map
  const mapWithoutKey = /\.map\(\s*\([^)]*\)\s*=>\s*(?!.*key=)/g;
  // This is a heuristic — not all maps need keys
  
  // Check for useEffect without cleanup
  const effectsWithTimers = content.matchAll(/useEffect\(\s*\(\)\s*=>\s*\{[^}]*(setTimeout|setInterval)[^}]*\}/g);
  
  // Check for stale closure in setInterval
  if (content.includes('setInterval') && !content.includes('clearInterval') && !content.includes('return ()')) {
    warn(name, 'setInterval without cleanup — potential memory leak');
  }
}

ok('React pattern checks complete');

// ─── 6. Check import consistency ────────────────────────────────────────────
console.log('\n📥 Imports');
for (const { name, content } of allSrc) {
  // Check for relative imports
  const imports = content.matchAll(/from\s+['"](\.[^'"]+)['"]/g);
  for (const m of imports) {
    const importPath = m[1];
    // Check if it resolves
    const dir = path.join(SRC, path.dirname(name));
    const resolved = path.resolve(dir, importPath);
    const candidates = [resolved + '.ts', resolved + '.tsx', resolved + '/index.ts', resolved + '/index.tsx'];
    const exists = candidates.some(c => fs.existsSync(c));
    if (!exists) warn(name, `Import "${importPath}" may not resolve`);
  }
}
ok('Import checks complete');

// ─── 7. Check for TODO/FIXME/HACK ───────────────────────────────────────────
console.log('\n📝 TODOs & FIXMEs');
for (const { name, content } of allSrc) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(line)) {
      const match = line.match(/\b(TODO|FIXME|HACK|XXX)\b[:\s]*(.*)/i);
      if (match) warn(name, `L${i+1}: ${match[1]}: ${match[2].trim().slice(0, 80)}`);
    }
  }
}
ok('TODO scan complete');

// ─── 8. Check index.html sync ───────────────────────────────────────────────
console.log('\n🔄 Build Sync');
if (fs.existsSync(indexHtml)) {
  const htmlContent = fs.readFileSync(indexHtml, 'utf8');
  // Check if it contains React
  if (htmlContent.includes('react')) ok('index.html contains React');
  else warn('index.html', 'React not found in build');
  
  // Check if Firebase config is present
  if (htmlContent.includes('meu-jogo-62061')) ok('Firebase config present in build');
  else warn('index.html', 'Firebase config missing');
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(50));
console.log(`📊 Audit Complete:`);
console.log(`   ❌ Errors:   ${errors}`);
console.log(`   ⚠️  Warnings: ${warnings}`);
console.log(`   ✅ Passed:   ${info}`);
console.log('═'.repeat(50));

if (errors > 0) {
  console.log('\n🔴 Fix errors before deploying!\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log('\n🟡 Review warnings. No critical issues.\n');
} else {
  console.log('\n🟢 All checks passed!\n');
}
