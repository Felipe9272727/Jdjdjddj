// CENA 7 — O CÉU (andar 12, 6 s em laço). A cidade nas nuvens ao pôr do sol; o TROCO-63 cruza no
// biplano; a Cabeça de quepe RECUA e incha (antecipação) e cospe; o biplano mergulha (UFA!), faz um
// looping, desvia do segundo cuspe e escapa pela direita.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ZB, Cabeca, BP, Biplano, ceu, nuvem } from '../../../jubileu/src/CarregandoAndares';
import { k } from './rig';
import { Palco, Ator, Estouro, Peca, Boneco, tremor } from './estilo';

export const DUR = 144;
const CUSPES = [52, 104];

export function Ceu() {
  const f = useCurrentFrame();
  // ── a Cabeça: flutua; recua inchando e dá o bote em cada cuspe ──
  const bote = (t) => k(f, [[t - 20, 0, 'io'], [t - 2, 1, 'x'], [t + 2, -1, 'e'], [t + 16, 0]]);
  const b = CUSPES.reduce((a, t) => a + (f >= t - 20 && f < t + 16 ? bote(t) : 0), 0);
  const boca = CUSPES.reduce((a, t) => a + (f >= t - 14 && f < t + 18 ? k(f, [[t - 14, 0, 'b'], [t - 8, 1, 'h'], [t + 10, 1, 'i'], [t + 18, 0]]) : 0), 0);
  // ── o biplano: caminho em arcos (mergulho, looping, esquiva, fuga) ──
  const caminho = (g) => {
    const loop = g >= 70 && g < 96 ? (g - 70) / 26 : 0;
    return [k(g, [[0, -200, 'l'], [48, 520, 'io'], [58, 640, 'io'], [70, 820, 'io'], [96, 860, 'io'], [104, 980, 'io'], [114, 1080, 'i'], [144, 1900]]),
      k(g, [[0, 260, 'io'], [48, 230, 'i'], [58, 470, 'o'], [70, 330, 'h'], [96, 330, 'io'], [104, 230, 'io'], [114, 400, 'io'], [144, 200]]) - (loop ? Math.sin(loop * Math.PI) * 220 : 0) + (loop ? (1 - Math.cos(loop * Math.PI * 2)) * 30 : 0)];
  };
  const [px, py] = caminho(f);
  const pr = k(f, [[0, -6], [48, -6, 'i'], [54, 30, 'o'], [62, -14, 'io'], [70, -10, 'l'], [96, -370, 'io'], [104, -366, 'io'], [108, -330, 'io'], [114, -380, 'io'], [144, -372]]);

  const z = k(f, [[0, 1.2, 'io'], [30, 1.45, 'io'], [52, 1.5, 'x'], [58, 1.25, 'io'], [70, 1.1, 'io'], [96, 1.1, 'io'], [104, 1.35, 'io'], [144, 1.2]]);
  const cx = k(f, [[0, 500, 'io'], [30, 760, 'io'], [52, 760, 'x'], [58, 660, 'io'], [70, 820, 'io'], [104, 880, 'io'], [130, 1100, 'io'], [144, 500]]);
  const cy = k(f, [[0, 360, 'io'], [30, 360, 'io'], [70, 330, 'io'], [144, 360]]);
  return (
    <Palco f={f} z={z} cx={cx} cy={cy} tx={CUSPES.reduce((a, t) => a + tremor(f, t, 8, 6), 0)} fundoCor="#3a2f66" grade="sepia(.08) contrast(1.05) saturate(1.1)">
      <defs><linearGradient id="a12-ceu" x2="0" y2="1"><stop offset="0" stopColor="#3a2f66" /><stop offset=".55" stopColor="#c86a7a" /><stop offset="1" stopColor="#ffb56a" /></linearGradient></defs>
      {ceu(1600, 760)}
      {[[120, 90, 1.2, 30], [1260, 170, 1.4, -30], [900, 30, 1, 20], [500, 120, .9, -20]].map(([x, y, s, d], i) =>
        <g key={i} transform={`translate(${x + Math.sin(f / 144 * Math.PI * 2) * d},${y}) scale(${s})`}>{nuvem}</g>)}
      <Ator f={f}>
        <Boneco x={760} y={520 + Math.sin(f / 144 * Math.PI * 2) * 10} w={420} h={440} esc={1.05} sx={1 + b * .08} sy={1 - b * .06} r={b * 6}>
          <Peca piv={[210, 320]} o={boca}>{Cabeca.goela}</Peca>
          {Cabeca.boca}
          <Peca piv={[210, 290]} y={boca * 22}>{Cabeca.mandibula}</Peca>
          {Cabeca.cranio}
        </Boneco>
        {/* os cuspes: nascem espremidos, esticam no voo */}
        {CUSPES.map((t, i) => f >= t && f < t + 18 ? (() => { const u = (f - t) / 18, sx = i ? 1 : -1;
          return <g key={t} transform={`translate(${760 + sx * 520 * u},${430 + 60 * u}) rotate(${u * 360 * sx}) scale(${.5 + u * .8},${.4 + u * .6})`}>
            <circle r="30" fill="#7dd35a" stroke="#1a1220" strokeWidth="6" /><circle cx="-9" cy="-9" r="8" fill="#c6f5a8" /></g>; })() : null)}
        <g transform={`translate(${px},${py}) rotate(${pr}) scale(1.15) translate(-140,-88)`}>
          {Biplano.corpo}
          <g transform={`translate(262,88) scale(1,${Math.abs(Math.sin(f * 1.3))}) translate(-262,-88)`}>{Biplano.helice}</g>
        </g>
      </Ator>
      {/* rastro de fumaça do biplano */}
      {/* rastro de fumaça: cada bolinha fica onde a cauda do avião ESTEVE (e cresce, e some) */}
      {Array.from({ length: 10 }, (_, i) => { const g = f - (i + 1) * 2; if (g < 0) return null; const [x, y] = caminho(g), a = k(g, [[0, -6], [48, -6, 'i'], [54, 30, 'o'], [62, -14, 'io'], [70, -10, 'l'], [96, -370, 'io'], [104, -366, 'io'], [108, -330, 'io'], [114, -380, 'io'], [144, -372]]) * Math.PI / 180;
        return <circle key={i} cx={x - Math.cos(a) * 150} cy={y - Math.sin(a) * 150 + i * 1.5} r={10 + i * 3} fill="#fde9ef" opacity={.55 - i * .05} />; })}
      <Estouro x={680} y={560} t="UFA!" cor="#fff3b0" giro={-8} tam={50} esc={k(f, [[0, 0, 'h'], [60, 0, 'b'], [64, .9, 'h'], [74, .9, 'i'], [78, 0]])} />
      <Estouro x={1080} y={250} t="ERROU!" cor="#ffe14a" giro={8} tam={44} esc={k(f, [[0, 0, 'h'], [110, 0, 'b'], [114, .85, 'h'], [124, .85, 'i'], [128, 0]])} />
    </Palco>
  );
}
