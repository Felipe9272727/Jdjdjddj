/**
 * dialogue-engine.ts — Undertale-style dialogue parser & player.
 *
 * Inline tags supported in the source string:
 *   {p}        — pause for 350ms (short)
 *   {p:N}      — pause for N milliseconds
 *   {y:text}   — yellow highlight (FFD54F)
 *   {r:text}   — red highlight (FF6B6B)
 *   {b:text}   — blue highlight (7FB3FF)
 *   {g:text}   — green highlight (8BD17C)
 *   {f:text}   — faded/grey text (888)
 *   {s:text}   — shake effect (rendered via CSS class)
 *   ^^         — page break (player must press Z/click to continue)
 *   *          — Undertale narrator marker (kept literal — render with proper indent)
 *
 * The parser produces an array of "tokens" which the typewriter walks through
 * one character at a time, applying the active tag styling and emitting pauses.
 */

export type Mood = 'idle' | 'talk' | 'wink' | 'sweat' | 'concerned';

export type Token =
  | { kind: 'char'; ch: string; color?: string; shake?: boolean }
  | { kind: 'newline' }
  | { kind: 'pause'; ms: number }
  | { kind: 'page' };

const COLOR_MAP: Record<string, string> = {
  y: '#FFD54F',
  r: '#FF6B6B',
  b: '#7FB3FF',
  g: '#8BD17C',
  f: '#888',
};

/** Tokenize a dialogue string into renderable tokens. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let activeColor: string | undefined;
  let activeShake = false;

  while (i < text.length) {
    const ch = text[i];

    // Page break ^^
    if (ch === '^' && text[i + 1] === '^') {
      tokens.push({ kind: 'page' });
      i += 2;
      continue;
    }

    // Tag: {p}, {p:N}, {y:...}, {r:...}, etc.
    if (ch === '{') {
      const close = text.indexOf('}', i);
      if (close > -1) {
        const inner = text.slice(i + 1, close);
        // Pause: {p} or {p:N}
        if (inner === 'p') {
          tokens.push({ kind: 'pause', ms: 350 });
          i = close + 1;
          continue;
        }
        const pauseMatch = /^p:(\d+)$/.exec(inner);
        if (pauseMatch) {
          tokens.push({ kind: 'pause', ms: parseInt(pauseMatch[1], 10) });
          i = close + 1;
          continue;
        }
        // Color/effect with content: {y:text}, {r:text}, {s:text}
        const tagMatch = /^([yrbgfs]):(.*)$/s.exec(inner);
        if (tagMatch) {
          const [, tag, content] = tagMatch;
          const prevColor = activeColor;
          const prevShake = activeShake;
          if (tag === 's') activeShake = true;
          else activeColor = COLOR_MAP[tag];
          // Recurse-tokenize the content with active styling
          for (const innerCh of content) {
            if (innerCh === '\n') tokens.push({ kind: 'newline' });
            else tokens.push({ kind: 'char', ch: innerCh, color: activeColor, shake: activeShake });
          }
          activeColor = prevColor;
          activeShake = prevShake;
          i = close + 1;
          continue;
        }
      }
    }

    if (ch === '\n') {
      tokens.push({ kind: 'newline' });
      i++;
      continue;
    }

    tokens.push({ kind: 'char', ch, color: activeColor, shake: activeShake });
    i++;
  }

  return tokens;
}

/** Split a token stream into pages.
 *
 * Two passes:
 *   1. Honor explicit `^^` page tokens.
 *   2. Auto-paginate any page that has too many newlines so it can't
 *      overflow the fixed-height dialog box. Splits at newline
 *      boundaries to avoid breaking mid-sentence.
 */
const MAX_NEWLINES_PER_PAGE = 5;

function paginateByNewlines(page: Token[], maxNl: number): Token[][] {
  const out: Token[][] = [];
  let current: Token[] = [];
  let nls = 0;
  for (const t of page) {
    current.push(t);
    if (t.kind === 'newline') {
      nls++;
      if (nls >= maxNl) {
        // Drop a trailing newline at the page break — the next page
        // already starts on a new line visually.
        if (current[current.length - 1].kind === 'newline') current.pop();
        out.push(current);
        current = [];
        nls = 0;
      }
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

export function splitPages(tokens: Token[]): Token[][] {
  const explicit: Token[][] = [[]];
  for (const t of tokens) {
    if (t.kind === 'page') explicit.push([]);
    else explicit[explicit.length - 1].push(t);
  }
  const out: Token[][] = [];
  for (const p of explicit) {
    if (p.length === 0) continue;
    out.push(...paginateByNewlines(p, MAX_NEWLINES_PER_PAGE));
  }
  return out.filter((p) => p.length > 0);
}

/** Count "real" characters in a page (excluding pauses/newlines) for completion check. */
export function charCount(page: Token[]): number {
  return page.filter((t) => t.kind === 'char').length;
}
