#!/usr/bin/env node
/**
 * bug-hunter.mjs — Targeted bug detection for The Normal Elevator
 * Checks for known bug patterns that have been found in this project.
 * Run: node bug-hunter.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, 'src');

let issues = 0;
const found = (severity, file, line, msg) => {
  issues++;
  const icon = severity === 'critical' ? '🔴' : severity === 'warning' ? '🟡' : '🔵';
  console.log(`  ${icon} ${file}:${line} — ${msg}`);
};

console.log('\n🐛 BUG HUNTER — Known Pattern Detection\n');

const files = fs.readdirSync(SRC)
  .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
  .map(f => ({ name: f, lines: fs.readFileSync(path.join(SRC, f), 'utf8').split('\n') }));

for (const { name, lines } of files) {
  lines.forEach((line, i) => {
    const ln = i + 1;

    // 1. Dollar-sign patterns in strings (inline-build expansion bug)
    if (/(["'`])[^"'`]*\$[{&`'][^"'`]*\1/.test(line) && !line.includes('//')) {
      if (name !== 'inline-build.mjs') {
        found('warning', name, ln, 'Dollar-sign pattern in string — may break inline-build expansion');
      }
    }

    // 2. Missing type="module" guard
    if (line.includes('<script') && !line.includes('type=') && !line.includes('//')) {
      found('critical', name, ln, 'Script tag without type attribute — inline-build strips type="module"');
    }

    // 3. Hardcoded localhost
    if (/localhost:\d+|127\.0\.0\.1/.test(line)) {
      found('warning', name, ln, 'Hardcoded localhost URL');
    }

    // 4. console.log in production code (not in Bot which uses it for API)
    if (line.includes('console.log') && !name.includes('Bot') && !name.includes('Multiplayer') && !line.includes('//')) {
      found('info', name, ln, 'console.log in production code');
    }

    // 5. useEffect without cleanup for timers
    if (line.includes('setInterval') || line.includes('setTimeout')) {
      // Check if we're inside a useEffect
      let inEffect = false;
      for (let j = i; j >= Math.max(0, i - 20); j--) {
        if (lines[j].includes('useEffect')) { inEffect = true; break; }
      }
      if (inEffect) {
        // Check if cleanup exists
        let hasCleanup = false;
        for (let j = i; j < Math.min(lines.length, i + 10); j++) {
          if (lines[j].includes('return ()') || lines[j].includes('clearInterval') || lines[j].includes('clearTimeout')) {
            hasCleanup = true; break;
          }
        }
        if (!hasCleanup) {
          found('warning', name, ln, 'Timer in useEffect without visible cleanup');
        }
      }
    }

    // 6. Missing key in .map()
    if (line.includes('.map(') && i + 5 < lines.length) {
      const block = lines.slice(i, Math.min(i + 10, lines.length)).join(' ');
      if (!block.includes('key=') && !block.includes('key :')) {
        found('warning', name, ln, '.map() without key prop in JSX');
      }
    }

    // 7. Deprecated three.js patterns
    if (line.includes('geometry.dispose') || line.includes('material.dispose')) {
      found('info', name, ln, 'Manual dispose — r3f handles this automatically');
    }

    // 8. Potential memory leak: event listener without cleanup
    if (line.includes('addEventListener') && !line.includes('removeEventListener')) {
      let inCleanup = false;
      for (let j = i; j >= Math.max(0, i - 30); j--) {
        if (lines[j].includes('removeEventListener') || lines[j].includes('return ()')) {
          inCleanup = true; break;
        }
      }
      if (!inCleanup) {
        found('warning', name, ln, 'addEventListener without matching removeEventListener');
      }
    }

    // 9. Division by zero risk
    if (/\/\s*(dist|d|len|distance|delta)/.test(line) && !line.includes('> 0') && !line.includes('> 1e-') && !line.includes('!== 0')) {
      found('info', name, ln, 'Division by variable without zero-check');
    }

    // 10. Firebase config hardcoded (should be in env or config)
    if (line.includes('AIzaSy') || line.includes('firebaseapp.com')) {
      found('info', name, ln, 'Firebase credential in source (normal for client-side, but verify)');
    }

    // 11. Empty catch block
    if (line.includes('catch') && (line.includes('{}') || line.includes('{ }'))) {
      found('warning', name, ln, 'Empty catch block — errors silently swallowed');
    }

    // 12. == instead of ===
    if (/[^=!]==[^=]/.test(line) && !line.includes('//') && !line.includes('!==')) {
      found('info', name, ln, 'Loose equality (==) — prefer strict (===)');
    }
  });
}

// Check inline-build for known issues
console.log('\n🔨 Inline Build');
const buildScript = path.join(import.meta.dirname, 'inline-build.mjs');
if (fs.existsSync(buildScript)) {
  const buildSrc = fs.readFileSync(buildScript, 'utf8');
  if (!buildSrc.includes('</body>')) found('critical', 'inline-build.mjs', 0, 'Missing </body> anchor check');
  else ok('inline-build.mjs: </body> anchor check present');
  
  if (buildSrc.includes('escapeScript')) ok('inline-build.mjs: JS escaping present');
  else found('critical', 'inline-build.mjs', 0, 'Missing JS escaping — dollar patterns will break');
}

function ok(msg) { console.log(`  ✅ ${msg}`); }

console.log(`\n${'═'.repeat(50)}`);
console.log(`🐛 Found ${issues} potential issues`);
console.log('═'.repeat(50));
if (issues === 0) console.log('\n🟢 No known bug patterns detected!\n');
