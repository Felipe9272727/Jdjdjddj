// CENA 5 — O CONVÉS (andar 7, 6 s em laço). O navio joga no mar; o Capitão gira o timão com o corpo
// todo e gargalha (HAR HAR!); uma onda passa por cima do TROCO-64, que esfregava o convés (SPLASH!);
// uma gaivota leva o tricórnio — double-take — e no fim ele cai de volta na cabeça do Capitão.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { P64 } from '../../../jubileu/src/CarregandoAnimado';
import { CB, Capitao, mar, ondas, conves, TIMAO, gaivota } from '../../../jubileu/src/CarregandoAndares';
import { k, Robo } from './rig';
import { Palco, Ator, Estouro, Sombra, Peca, Boneco, tremor } from './estilo';

export const DUR = 144;
const PE = 690;

export function Conves() {
  const f = useCurrentFrame();
  const balanco = Math.sin(f / 144 * Math.PI * 2) * 2.2; // o navio jogando (fecha o laço)
  // ── Capitão ──
  const ri = f >= 40 && f < 58;
  const pulinho = ri ? Math.abs(Math.sin((f - 40) * Math.PI / 6)) * -16 : 0;
  const capSy = ri ? 1 + Math.sin((f - 40) * Math.PI / 3) * .06 : k(f, [[0, 1], [84, 1, 'x'], [86, 1.12, 'b'], [96, 1]]);
  const giro = k(f, [[0, 0, 'io'], [18, 200, 'io'], [26, 160, 'io'], [40, 380, 'io'], [100, 330, 'io'], [144, 720]]);
  const chapeu = f < 84 ? { x: 0, y: 0, r: 0, o: 1 } : f < 112 ? { x: 0, y: 0, r: 0, o: 0 }
    : f < 128 ? { o: 0, x: 0, y: 0, r: 0 } : { x: 0, y: k(f, [[128, -520, 'i'], [139, 0, 'h'], [144, 0]]), r: k(f, [[128, 40], [139, 0]]), o: 1 };
  const amassa = f >= 139 && f < 144 ? 1 - Math.sin((f - 139) / 5 * Math.PI) * .2 : 1;
  // ── TROCO-64: esfrega no ritmo, a onda o derruba (f56), sacode a água, volta a esfregar ──
  const derrubado = f >= 56 && f < 96;
  const esfrega = !derrubado ? Math.sin(f * Math.PI / 12) : 0;
  const m = { x: 420 + esfrega * 22 + (derrubado ? k(f, [[56, 0, 'x'], [64, -110, 'o'], [96, -40]]) : 0), y: PE, esc: 1.2,
    r: derrubado ? k(f, [[56, 0, 'x'], [60, -40, 'b'], [70, -70], [86, -60, 'io'], [96, 0]]) : esfrega * 6,
    sy: derrubado && f < 62 ? .82 : 1, cara: derrubado ? 'x' : f >= 96 && f < 112 ? 's' : 'f', cab: f >= 96 && f < 112 ? Math.sin(f * 2) * 14 : esfrega * 5,
    bE: { a: derrubado ? 160 : 70 + esfrega * 20, d: 12 }, bD: { a: derrubado ? 150 : 40 + esfrega * 20, d: 12 }, pE: { a: derrubado ? 30 : 8 }, pD: { a: derrubado ? -20 : 8 } };
  // a onda: sobe atrás da amurada, quebra por cima do 64 e escorre
  const onda = k(f, [[0, 0], [46, 0, 'i'], [56, 1, 'o'], [70, .3, 'io'], [84, 0]]);
  // a gaivota: entra em mergulho, pega o chapéu (f84) e sobe
  const gv = { x: k(f, [[0, 1900], [70, 1900, 'i'], [84, 1060, 'o'], [112, 160]]), y: k(f, [[0, 120], [70, 120, 'i'], [84, 300, 'o'], [112, -120]]) };

  const z = k(f, [[0, 1.2, 'io'], [38, 1.25, 'x'], [42, 1.55, 'io'], [54, 1.5, 'x'], [58, 1.6, 'io'], [74, 1.3, 'io'], [86, 1.55, 'io'], [100, 1.2, 'io'], [128, 1.2, 'io'], [138, 1.5, 'io'], [144, 1.2]]);
  const cx = k(f, [[0, 760, 'io'], [42, 1040, 'io'], [54, 1040, 'x'], [58, 460, 'io'], [74, 600, 'io'], [86, 1040, 'io'], [100, 760, 'io'], [128, 900, 'io'], [138, 1040, 'io'], [144, 760]]);
  const cy = k(f, [[0, 420, 'io'], [42, 400, 'io'], [58, 450, 'io'], [86, 360, 'io'], [144, 420]]);
  return (
    <Palco f={f} z={z} cx={cx} cy={cy} tx={tremor(f, 56, 14, 10)} ty={tremor(f, 56, 10, 10)} fundoCor="#8fc3e6" grade="sepia(.1) contrast(1.05) saturate(1.1)">
      {mar(1600, 760)}
      {[['#3d8cbd', .44, 3.4], ['#2c7aad', .5, 2.6], ['#22689a', .56, 2]].map(([cor, y, p], i) =>
        <g key={i} transform={`translate(${Math.sin(f / 144 * Math.PI * 2 * (i + 1)) * 30},${Math.cos(f / 144 * Math.PI * 2 * (i + 1)) * 4})`}>{ondas(1600, 760, y, cor)}</g>)}
      <g transform={`rotate(${balanco} 800 760)`}>
        {conves(1600, 760)}
        {/* a onda grande quebrando por cima da amurada */}
        {onda > .01 && <g transform={`translate(420,${PE - 60}) scale(${.6 + onda * .7},${onda * 1.4})`}>
          <path d="M-300,40Q-260,-180,-60,-220Q120,-250,200,-120Q150,-150,90,-110Q160,-40,120,40Z" fill="#2c7aad" stroke="#1a1220" strokeWidth="6" strokeLinejoin="round" />
          <path d="M-60,-220Q120,-250,200,-120Q150,-150,90,-110" fill="none" stroke="#e8f6ff" strokeWidth="14" strokeLinecap="round" />
        </g>}
        <Sombra x={1040} y={PE + 6} rx={110} /><Sombra x={m.x} y={PE + 6} rx={70} />
        <Ator f={f}>
          <g transform={`translate(900,${PE - 150}) rotate(${giro}) scale(1.25) translate(-60,-60)`}>{TIMAO}</g>
          <Boneco x={1080} y={PE + 12 + pulinho} w={260} h={360} esc={1.15} sy={capSy * amassa} sx={1 / Math.sqrt(capSy)} r={ri ? Math.sin((f - 40) * .9) * 4 : Math.sin(giro * Math.PI / 180) * 4}>
            <Peca piv={[57, 151]} r={k(f, [[0, -40], [18, -10, 'io'], [26, -40], [40, -10], [84, -10, 'x'], [86, 80, 'b'], [100, 60], [128, -40]])}>{Capitao.bracoE}</Peca>
            {Capitao.corpo}
            <Peca piv={[203, 151]} r={ri ? 70 + Math.sin(f * 1.1) * 25 : k(f, [[0, 40], [18, 10, 'io'], [26, 40], [40, 10], [100, 110, 'io'], [114, 60], [128, 40]])}>{Capitao.bracoD}</Peca>
            <Peca piv={[130, 120]} r={k(f, [[0, 0], [84, 0, 'x'], [87, 14, 'e'], [100, 6], [128, -10], [144, 0]])}>
              {Capitao.cabeca}{(ri || f >= 139) && Capitao.riso}
              <Peca piv={[130, 65]} x={chapeu.x} y={chapeu.y} r={chapeu.r} o={chapeu.o} sy={amassa}>{Capitao.chapeu}</Peca>
            </Peca>
          </Boneco>
          <Robo pose={m} pal={P64} k={0} armaD="esfregao" />
          {/* gotas pingando do 64 */}
          {f >= 64 && f < 112 && [0, 1, 2].map((i) => { const t = ((f + i * 7) % 16) / 16; return <path key={i} d={`M${m.x - 40 + i * 40},${PE - 260 + t * 140}q8,14,0,20q-8,-6,0,-20Z`} fill="#9ad6ff" stroke="#1a1220" strokeWidth="3" opacity={1 - t} />; })}
        </Ator>
      </g>
      <g transform={`translate(${gv.x},${gv.y}) scale(1.6)`}>
        <g transform={`translate(-50,-30) scale(1,${Math.abs(Math.sin(f * .6)) * .6 + .4})`}>{gaivota}</g>
        {f >= 84 && f < 112 && <g transform="translate(-30,-10) scale(.45)">{Capitao.chapeu}</g>}
      </g>
      <Estouro x={1100} y={240} t="HAR HAR!" cor="#fff3b0" giro={6} tam={48} esc={k(f, [[0, 0, 'h'], [40, 0, 'b'], [45, 1, 'h'], [56, 1, 'i'], [60, 0]])} />
      <Estouro x={460} y={330} t="SPLASH!" cor="#bfe9ff" giro={-8} esc={k(f, [[0, 0, 'h'], [55, 0, 'b'], [59, 1.1, 'h'], [70, 1.1, 'i'], [74, 0]])} />
    </Palco>
  );
}
