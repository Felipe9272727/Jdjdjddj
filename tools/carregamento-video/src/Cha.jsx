// CENA 3 — A TRÉGUA DO CHÁ (6 s em laço). Jogo de cartas tenso: o TROCO-64 espia por trás do
// segurança e sopra as cartas para o 63, que bate a carta (BATI!); o segurança desconfia, vira e pega
// o 64 (HÃ?), incha de raiva e VIRA A MESA (CRASH) por cima do 63. A câmera foge para o atendente
// (que acorda do cochilo) e, fora de quadro, a mesa volta arrumada para o laço recomeçar.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { P63, PSG, P64, OURO } from '../../../jubileu/src/CarregandoAnimado';
import { Mesa, Carta } from '../../../jubileu/src/CarregandoCenas';
import { k, Robo } from './rig';
import { Palco, Saguao, Papel, Ator, Estouro, Fala, Sombra, Cortinas, Atendente, EstiloCaretas, tremor } from './estilo';

export const DUR = 144;
const PE = 700;
const VOO = [[-520, -420, -540], [-260, -620, 380], [40, -700, -320], [300, -560, 460], [560, -380, -400], [-80, -300, 720]];

export function Cha() {
  const f = useCurrentFrame();
  const arrumado = f < 86 || f >= 136; // fora de quadro, a mesa volta de pé
  // ── a mesa (caixa 360×260 com pernas até 256; base em PE+14) ──
  const bate = k(f, [[0, 0], [42, 0, 'x'], [43, -10, 'b'], [48, 0]]);
  const mesaR = arrumado ? 0 : k(f, [[86, 0, 'o'], [88, 6, 'x'], [96, -130, 'i'], [104, -178, 'b'], [112, -175]]);
  const mesaX = arrumado ? 0 : k(f, [[86, 0, 'o'], [104, -230]]), mesaY = arrumado ? bate : k(f, [[86, 0, 'o'], [94, -150, 'i'], [104, 40, 'b'], [112, 36]]);

  // ── TROCO-63: risadinha contida, BATE a carta (f40), leva a mesa na cara (f96) ──
  const vira = f >= 92 && f < 136;
  const a = { x: 540 + (vira ? k(f, [[92, 0, 'x'], [100, -70, 'b'], [110, -60]]) : 0), y: PE - (f >= 34 && f < 40 ? 8 : 0), esc: 1.15,
    r: vira ? k(f, [[92, 0, 'x'], [100, -30, 'b'], [110, -24]]) : f >= 40 && f < 44 ? 8 : 0,
    sy: k(f, [[0, 1], [34, 1, 'o'], [38, 1.08, 'x'], [41, .86, 'b'], [48, 1], [92, 1, 'x'], [94, .8, 'b'], [104, 1]]),
    cab: f >= 14 && f < 34 ? Math.sin(f * 1.2) * 4 : vira ? -16 : 0,
    cara: vira ? 'x' : f >= 14 && f < 60 ? 'f' : 'n',
    bD: { a: k(f, [[0, 60], [30, 60, 'o'], [36, 165, 'x'], [41, 60, 'b'], [48, 60], [92, 60, 'x'], [96, 170, 'b'], [130, 60]]), d: 18 },
    bE: { a: vira ? 160 : 50, d: 14 }, pE: { a: 8 }, pD: { a: 8 } };

  // ── segurança: cartas na mão; desconfia (f50), double-take (f62, HÃ?), incha (f70–84), vira a mesa (f86) ──
  const raiva = f >= 70 && f < 86 ? Math.sin(f * 2.4) * 3 : 0;
  const gInf = k(f, [[0, 1], [70, 1, 'i'], [84, 1.12, 'x'], [87, .96, 'b'], [100, 1]]);
  const g = { x: 1060 + raiva, y: PE, esc: 1.2 * gInf, sy: k(f, [[0, 1], [84, 1, 'x'], [86, 1.12, 'b'], [96, 1]]),
    r: k(f, [[0, 0], [84, 0, 'o'], [86, 5, 'x'], [88, -14, 'b'], [100, -6], [136, 0]]),
    cab: k(f, [[0, 0], [48, 0, 'io'], [58, 10, 'h'], [60, 0, 'x'], [63, 30, 'e'], [70, 22], [86, -6], [120, 0]]),
    cara: f >= 60 && f < 70 ? 's' : f >= 70 && f < 136 ? 'b' : 'n',
    bE: { a: k(f, [[0, 60], [84, 60, 'o'], [86, 30, 'x'], [89, 175, 'b'], [100, 150], [136, 60]]), d: 14 },
    bD: { a: k(f, [[0, 60], [84, 60, 'o'], [86, 30, 'x'], [89, 175, 'b'], [100, 150], [136, 60]]), d: 14 }, pE: { a: 10 }, pD: { a: 10 } };

  // ── TROCO-64: espia e faz sinais; pego, congela e se esconde atrás do segurança ──
  const sinal = f < 56 ? Math.sin(f * .5) : 0;
  const m = { x: k(f, [[0, 1240], [6, 1210, 'b'], [62, 1210, 'x'], [66, 1200, 'io'], [74, 1290, 'b'], [136, 1290, 'io'], [144, 1240]]), y: PE - 30, esc: .95,
    sy: k(f, [[0, 1], [62, 1, 'x'], [64, .8, 'b'], [72, 1]]), cab: f < 56 ? sinal * 12 : 0,
    cara: f >= 62 && f < 80 ? 's' : 'f',
    bD: { a: f < 56 ? 150 + sinal * 30 : k(f, [[56, 150], [64, 30, 'x']]), d: sinal * 20 }, bE: { a: f < 56 ? 100 - sinal * 40 : 30, d: 14 }, pE: { a: 6 }, pD: { a: 6 } };

  // ── atendente: serve o chá, cochila (cabeceia), acorda no CRASH ──
  const dorme = f >= 50 && f < 88;
  const at = { x: 1420, y: PE + 10, esc: .8, cab: dorme ? -12 + (Math.floor(f / 14) % 2 ? -6 : 0) : f >= 88 && f < 110 ? 8 : 0,
    cara: dorme ? 'b' : f >= 88 && f < 116 ? 's' : 'n', corpoY: f >= 88 && f < 96 ? -8 : 0,
    braco: k(f, [[0, -70], [40, -70, 'io'], [50, 0], [88, 0, 'x'], [92, -150, 'b'], [116, -150, 'io'], [130, 0]]) };

  const z = k(f, [[0, 1.3, 'io'], [10, 1.55, 'io'], [30, 1.6, 'io'], [40, 1.75, 'x'], [48, 1.5, 'io'], [58, 1.5, 'x'], [62, 1.75, 'io'], [76, 1.85, 'io'], [86, 1.25, 'x'], [112, 1.25, 'io'], [122, 1.6, 'io'], [144, 1.3]]);
  const cx = k(f, [[0, 820, 'io'], [10, 1150, 'io'], [26, 600, 'io'], [48, 700, 'io'], [58, 1100, 'x'], [76, 1080, 'io'], [86, 800, 'x'], [112, 800, 'io'], [122, 1380, 'io'], [138, 1380, 'io'], [144, 820]]);
  const cy = k(f, [[0, 470, 'io'], [76, 430, 'io'], [86, 420, 'io'], [122, 500, 'io'], [144, 470]]);

  return (
    <Palco f={f} z={z} cx={cx} cy={cy} tx={tremor(f, 42, 8, 6) + tremor(f, 88, 20, 14)} ty={tremor(f, 88, 10, 14)} frente={<Cortinas px={(800 - cx) * .35} />}>
      <EstiloCaretas />
      <Saguao />
      <Papel />
      <Sombra x={a.x} y={PE + 8} rx={70} /><Sombra x={1060} y={PE + 8} rx={80} /><Sombra x={800} y={PE + 16} rx={150} ry={18} />
      <Ator f={f}>
        <Robo pose={m} pal={P64} k={0} />
        <Robo pose={g} pal={PSG} k={2} />
        <Robo pose={a} pal={P63} k={1} armD={null} />
        <g transform={`translate(${800 + mesaX},${PE + 14 + mesaY}) rotate(${mesaR}) scale(.95) translate(-180,-256)`}><Mesa /></g>
        {/* as cartas voando na virada */}
        {!arrumado && f < 128 && VOO.map(([x, y, r], i) => { const t = Math.min(1, (f - 86) / 30);
          return <g key={i} transform={`translate(${800 + x * t * .7},${PE - 150 + y * Math.sin(t * Math.PI * .9) * .7 + t * t * 300}) rotate(${r * t})`} opacity={1 - Math.max(0, (f - 118) / 10)}><g transform="translate(-30,-40)"><Carta n={i} /></g></g>; })}
        <Atendente pose={at} maoExtra={null} />
      </Ator>
      <Fala x={560} y={260} t="BATI!" w={240} esc={k(f, [[0, 0, 'h'], [40, 0, 'b'], [44, 1, 'h'], [56, 1, 'i'], [60, 0]])} />
      <Estouro x={1060} y={240} t="HÃ?" cor="#9af6ff" giro={-10} tam={50} esc={k(f, [[0, 0, 'h'], [61, 0, 'b'], [65, .85, 'h'], [76, .85, 'i'], [80, 0]])} />
      <Estouro x={800} y={300} t="CRASH!" cor="#fff3b0" giro={6} tam={60} esc={k(f, [[0, 0, 'h'], [87, 0, 'b'], [91, 1.15, 'h'], [104, 1.15, 'i'], [108, 0]])} />
      {f >= 88 && f < 120 && <text x="1440" y="300" textAnchor="middle" fontFamily="'Luckiest Guy',Impact" fontSize="40" fill="#fff3b0" stroke="#1a1220" strokeWidth="6" paintOrder="stroke">!!</text>}
    </Palco>
  );
}
