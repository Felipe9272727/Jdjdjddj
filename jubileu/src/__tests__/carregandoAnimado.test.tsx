/**
 * A tela de carregamento padrão (CarregandoAnimado) é feita para rodar no compositor enquanto a thread
 * principal está presa num gl.compile. Estes testes guardam o que isso exige do CSS gerado.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CarregandoAnimado } from '../CarregandoAnimado';

const html = renderToStaticMarkup(<CarregandoAnimado rotulo="Carregando o Andar 13…" progresso={0.5} />);
const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
const quadros = [...css.matchAll(/@keyframes ([\w-]+)\{((?:[\d.]+%\{[^{}]*\})+)\}/g)].map((m) => ({
  nome: m[1],
  passos: [...m[2].matchAll(/([\d.]+)%\{([^{}]*)\}/g)].map((p) => ({ pct: +p[1], decl: p[2] })),
}));
// só as animações da cena (as da barra e dos pontinhos são `cn-…`, também só transform/opacity)
const daCena = quadros.filter((q) => /^[mo]-/.test(q.nome));

const norm = (v: string) => v.replace(/rotate\((-?[\d.e+-]+)deg\)/g, (_, a) => `rotate(${(((+a % 360) + 360) % 360).toFixed(2)}deg)`);

describe('CarregandoAnimado', () => {
  it('gera as animações da cena', () => {
    expect(daCena.length).toBeGreaterThan(60);
  });

  it('anima só transform e opacity (compositor), nunca layout nem pintura', () => {
    for (const q of quadros) {
      for (const p of q.passos) {
        const props = p.decl.split(';').filter(Boolean).map((d) => d.slice(0, d.indexOf(':')));
        for (const prop of props) expect(['transform', 'opacity', 'animation-timing-function'], `${q.nome}: ${prop}`).toContain(prop);
      }
    }
    // e as transições da barra e do fade também
    for (const m of css.matchAll(/transition:([^;}]*)/g)) expect(m[1], m[0]).toMatch(/^\s*(opacity|transform)\b/);
  });

  it('nenhuma animação é definida duas vezes (classe repetida = uma peça roubando a animação da outra)', () => {
    const nomes = quadros.map((q) => q.nome);
    expect(nomes.filter((n, i) => nomes.indexOf(n) !== i)).toEqual([]);
  });

  it('toda classe animada existe no DOM', () => {
    const classes = new Set([html, renderToStaticMarkup(<CarregandoAnimado />)].flatMap((h) => [...h.matchAll(/class="([^"]*)"/g)]).flatMap((m) => m[1].split(/\s+/)));
    for (const m of css.matchAll(/\.cna \.([\w-]+)\{[^}]*animation:/g)) expect(classes.has(m[1]), m[1]).toBe(true);
  });

  it('cada laço fecha no quadro em que começa (sem salto visível na emenda)', () => {
    const opac = new Map(daCena.filter((q) => q.nome.startsWith('o-')).map((q) => [q.nome.slice(2), q]));
    const semDecl = (d: string) => norm(d.replace(/;animation-timing-function:[^;]*/, ''));
    for (const q of daCena) {
      const a = q.passos[0], z = q.passos[q.passos.length - 1];
      expect(a.pct).toBe(0);
      expect(z.pct).toBe(100);
      // exceção: a peça pode saltar na emenda se estiver invisível (opacidade 0) nas duas pontas, como as partículas
      const o = q.nome.startsWith('m-') ? opac.get(q.nome.slice(2)) : undefined;
      if (o && o.passos[0].decl.includes('opacity:0') && o.passos[o.passos.length - 1].decl.includes('opacity:0')) continue;
      expect(semDecl(z.decl), q.nome).toBe(semDecl(a.decl));
    }
  });

  it('o rótulo termina em pontinhos animados só quando termina em reticências', () => {
    expect(html).toContain('class="pt"');
    expect(renderToStaticMarkup(<CarregandoAnimado rotulo="Pronto" />)).not.toContain('class="pt"');
    expect(renderToStaticMarkup(<CarregandoAnimado rotulo="Baixando..." />)).toContain('class="pt"');
  });

  it('progresso é limitado a 0..1 e sem ele a barra é indeterminada', () => {
    expect(renderToStaticMarkup(<CarregandoAnimado progresso={3} />)).toContain('aria-valuenow="100"');
    expect(renderToStaticMarkup(<CarregandoAnimado progresso={-1} />)).toContain('aria-valuenow="0"');
    const sem = renderToStaticMarkup(<CarregandoAnimado />);
    expect(sem).toContain('fi ind');
    expect(sem).not.toContain('aria-valuenow');
  });

  it('com visivel={false} desde o início não monta nada', () => {
    expect(renderToStaticMarkup(<CarregandoAnimado visivel={false} />)).toBe('');
  });

  it('congelar põe a cena parada naquele instante da rodada', () => {
    const h = renderToStaticMarkup(<CarregandoAnimado congelar={2.3} />);
    expect(h).toContain('--off:-2.3s');
    expect(h).toContain('cna cg');
  });
});
