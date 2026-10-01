// CENA 0 — A BRIGA DO SAGUÃO (6 s em laço). DING: o TROCO-63 (chave inglesa) e o robô-segurança
// (cassetete) gingam; o segurança erra o golpe, o 63 acerta (CLANG); o 64 joga a casca de banana,
// o segurança escorrega, voa e cai (THUD); o 63 comemora, DING de novo, e o segurança levanta zonzo.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { P63, PSG, P64, OURO } from '../../../jubileu/src/CarregandoAnimado';
import { k, Robo } from './rig';
import { Palco, Saguao, Papel, Ator, Estouro, Sombra, Cortinas, Atendente, EstiloCaretas, tremor } from './estilo';
import { Banana } from '../../../jubileu/src/CarregandoAnimado';

export const DUR = 144;
const PE = 700; // linha dos pés

export function Briga() {
  const f = useCurrentFrame();
  const ginga = (fase) => Math.abs(Math.sin((f + fase) * Math.PI / 12)) * -8;   // pulinho de boxe, 12 quadros
  const lutando = (f >= 6 && f < 30) || (f >= 124);

  // ── TROCO-63 ──
  const ax = k(f, [[0, 640], [46, 640, 'o'], [52, 600, 'b'], [56, 720, 'o'], [64, 690, 'io'], [104, 690, 'io'], [124, 640]]);
  const aSy = k(f, [[0, 1], [38, 1, 'o'], [42, .7, 'b'], [48, 1, 'io'], [50, 1, 'o'], [54, .88, 'x'], [56, 1.12, 'b'], [62, 1, 'h'], [104, 1, 'o'], [108, .85, 'x'], [112, 1.2, 'b'], [120, 1]]);
  const aR = k(f, [[0, 0], [46, 0, 'o'], [52, -14, 'x'], [56, 16, 'b'], [64, 0]]);
  const aY = PE + (lutando ? ginga(0) : 0) - (f >= 108 && f < 120 ? Math.sin((f - 108) / 12 * Math.PI) * 70 : 0);
  const a = { x: ax, y: aY, esc: 1.15, sy: aSy, sx: 1 / Math.sqrt(aSy), r: aR, cab: k(f, [[0, 0], [42, -10, 'b'], [50, 0], [56, 12, 'e'], [70, 0]]),
    cara: f >= 42 && f < 48 ? 's' : f >= 56 && f < 124 ? 'f' : 'n',
    bD: { a: k(f, [[0, 120], [46, 120, 'o'], [52, 170, 'x'], [56, 60, 'b'], [64, 90, 'io'], [104, 90, 'o'], [110, 170, 'b'], [124, 120]]), d: 18 },
    bE: { a: k(f, [[0, 40], [104, 40, 'o'], [110, 160, 'b'], [124, 40]]), d: 14 },
    pE: { a: lutando ? 12 : k(f, [[30, 12], [42, 30, 'b'], [48, 12]]) }, pD: { a: lutando ? 12 : k(f, [[30, 12], [42, 30, 'b'], [48, 12]]) } };

  // ── SEGURANÇA ──
  // escorregão de cartum: take (f84–86), chute para cima (f86–89), suspenso pedalando (f91–96), queda seca, THUD f99
  const ee = (a, b) => Math.min(1, Math.max(0, (f - a) / (b - a)));
  const take = f >= 84 && f < 86, chute = f >= 86 && f < 89, voa = f >= 89 && f < 99, eC = ee(86, 89);
  const gx = k(f, [[0, 960], [30, 960, 'o'], [40, 900, 'b'], [56, 990, 'x'], [64, 960, 'io'], [84, 960, 'h'], [96, 940, 'i'], [99, 900, 'x'], [102, 880, 'o'], [124, 880, 'io'], [144, 960]]);
  const pend = k(f, [[0, 0], [86, 0, 'o'], [89, 60, 'x'], [91, 160, 'h'], [96, 160, 'xi'], [99, 0]]);
  const gY = PE + (lutando ? ginga(6) : 0) - pend;
  const gR = k(f, [[0, 0], [30, 0, 'o'], [36, 12, 'x'], [42, -18, 'b'], [50, 0], [56, -10, 'e'], [70, 0], [86, 0, 'o'], [89, 80, 'o'], [96, 86, 'i'], [99, 95, 'b'], [103, 90, 'h'], [118, 90, 'io'], [124, 62, 'o'], [129, -12, 'b'], [136, 0]]);
  const gSy = k(f, [[0, 1], [56, .8, 'b'], [62, 1], [98, 1, 'l'], [99, .7, 'b'], [107, 1]]);
  const g = { x: gx, y: gY - 84 * Math.abs(Math.sin(gR * Math.PI / 180)) * (f >= 86 ? 1 : 0), perfil: take || chute, dir: -1, esc: 1.22, sy: gSy, sx: 1 / Math.sqrt(gSy), r: gR, cab: k(f, [[0, 0], [56, 22, 'e'], [72, 0], [104, 0], [108, 12], [114, -12], [120, 12], [126, 0]]),
    cara: f >= 56 && f < 72 ? 'x' : f >= 84 && f < 99 ? 's' : f >= 99 && f < 132 ? 'x' : 'n',
    bE: take ? { a: 150, d: 14 } : chute || voa ? { a: 170, d: 14 } : { a: k(f, [[0, 150], [30, 150, 'o'], [36, 190, 'x'], [42, 40, 'b'], [50, 120], [84, 120, 'o'], [99, 160], [104, 120, 'io'], [144, 150]]), d: 16 },
    bD: take ? { a: 140, d: 14 } : chute || voa ? { a: 160 + Math.sin(f * 1.6) * 20, d: 14 } : { a: k(f, [[0, 30], [84, 30, 'o'], [99, 160], [104, 60, 'io'], [144, 30]]), d: 14 },
    pE: take || chute ? { alvo: [990, PE - 30 * eC], d: 20 } : voa ? { a: 40 + Math.sin(f * 2.2) * 35 } : { a: 10 },
    pD: take ? { alvo: [935, PE], d: 10 } : chute ? { alvo: [935 - 30 * eC, PE - 210 * eC], d: 6 } : voa ? { a: -30 - Math.sin(f * 2.2) * 35 } : { a: 10 } };

  // ── TROCO-64 torcendo (bandeira na direita, banana na esquerda até jogar) ──
  const jogou = f >= 72;
  const m = { x: 400, y: PE - 10 - Math.abs(Math.sin(f * Math.PI / 10)) * (f < 64 || f >= 104 ? 14 : 0) - (f >= 104 && f < 124 ? Math.sin((f - 104) / 20 * Math.PI) * 60 : 0),
    esc: 1, cara: f >= 84 && f < 124 ? 'f' : 'n', cab: Math.sin(f * .3) * 6,
    bD: { a: 150 + Math.sin(f * .6) * 25, d: Math.sin(f * .6) * 20 },
    bE: { a: k(f, [[0, 30], [62, 30, 'o'], [68, -40, 'x'], [72, 140, 'b'], [80, 40]]), d: 16 }, pE: { a: 8 }, pD: { a: 8 } };
  // a casca: voa em arco da mão do 64 até o pé do segurança, e é chutada para trás
  const bt = Math.min(1, Math.max(0, (f - 72) / 12));
  const bx = 430 + (935 - 430) * bt, by = PE - 120 + (120 - 4) * bt - Math.sin(bt * Math.PI) * 220;

  // ── atendente: DING no começo e no fim do round ──
  const ding = (t0) => k(f, [[t0 - 4, 0, 'o'], [t0, -70, 'xi'], [t0 + 2, 10, 'b'], [t0 + 10, 0]]);
  const at = { x: 1330, y: PE + 10, esc: .78, braco: f < 60 ? ding(4) : ding(118), sino: Math.max(0, 1 - Math.abs(f - 6) / 3) + Math.max(0, 1 - Math.abs(f - 120) / 3),
    cab: k(f, [[0, 0], [30, -6], [56, -12, 'b'], [70, -4], [100, 8, 'b'], [124, 0]]), cara: f >= 56 && f < 66 ? 's' : f >= 100 && f < 112 ? 's' : 'n',
    corpoY: f >= 56 && f < 64 ? -6 : f >= 100 && f < 108 ? -8 : 0 };

  // ── câmera ──
  const z = k(f, [[0, 1.35, 'io'], [10, 1.25, 'io'], [40, 1.35, 'x'], [56, 1.55, 'io'], [64, 1.3, 'io'], [70, 1.25, 'io'], [84, 1.2, 'io'], [102, 1.3, 'io'], [118, 1.25, 'io'], [144, 1.35]]);
  const cx = k(f, [[0, 1150, 'io'], [10, 820, 'io'], [56, 850, 'io'], [66, 640, 'io'], [78, 820, 'io'], [102, 980, 'io'], [118, 900, 'io'], [144, 1150]]);
  const cy = k(f, [[0, 480, 'io'], [10, 470, 'io'], [84, 470, 'io'], [92, 400, 'io'], [102, 470, 'io'], [144, 480]]);
  const tx = tremor(f, 56, 12, 8) + tremor(f, 99, 18, 12), ty = tremor(f, 99, 10, 12);

  return (
    <Palco f={f} z={z} cx={cx} cy={cy} tx={tx} ty={ty} frente={<Cortinas px={(800 - cx) * .35} />}>
      <EstiloCaretas />
      <Saguao />
      <Papel />
      <Sombra x={a.x} y={PE + 8} rx={70} /><Sombra x={gx} y={PE + 8} rx={voa ? 36 : 80} /><Sombra x={400} y={PE + 2} rx={60} />
      <Ator f={f}>
        <Robo pose={m} pal={P64} k={0} armaD="f" armaE={jogou ? null : 'banana'} />
        <Robo pose={g} pal={PSG} k={2} armaE="b" />
        <Robo pose={a} pal={P63} k={1} armaD="c" />
        {f >= 72 && f < 110 && <g transform={`translate(${f < 84 ? bx : 935 - (f - 84) * 12},${f < 84 ? by : PE - 4 - Math.sin(Math.min(1, (f - 84) / 14) * Math.PI) * 90}) rotate(${f * 40})`}><Banana /></g>}
        <Atendente pose={at} />
      </Ator>
      {/* estrelinhas de tontura */}
      {((f >= 58 && f < 72) || (f >= 106 && f < 134)) && [0, 1, 2].map((i) => { const ang = f * .35 + i * 2.1, sr = Math.sin(gR * Math.PI / 180), hx = (f < 80 ? gx : gx + sr * 230) + Math.cos(ang) * 60, hy = (f < 80 ? PE - 330 : g.y - Math.cos(gR * Math.PI / 180) * 260) + Math.sin(ang) * 14;
        return <path key={i} transform={`translate(${hx},${hy})`} d="M0,-14L4,-4L14,-4L6,3L9,13L0,7L-9,13L-6,3L-14,-4L-4,-4Z" fill="#ffe14a" stroke="#1a1220" strokeWidth="3" />; })}
      {/* risco do golpe que errou */}
      {f >= 40 && f < 46 && <path d="M860,420Q780,520,850,620" fill="none" stroke="#fff" strokeWidth="12" strokeLinecap="round" opacity=".85" />}
      <Estouro x={1330} y={460} t="DING!" cor="#ffe14a" giro={6} tam={46} esc={k(f, [[0, 0, 'b'], [6, .9, 'h'], [16, .9, 'i'], [20, 0, 'h'], [117, 0, 'b'], [121, .9, 'h'], [132, .9, 'i'], [136, 0]])} />
      <Estouro x={980} y={300} t="CLANG!" cor="#fff3b0" giro={-8} esc={k(f, [[0, 0, 'h'], [55, 0, 'b'], [59, 1, 'h'], [68, 1, 'i'], [72, 0]])} />
      <Estouro x={gx - 40} y={PE - 300} t="THUD!" cor="#ffb347" giro={8} esc={k(f, [[0, 0, 'h'], [98, 0, 'b'], [102, 1, 'h'], [111, 1, 'i'], [115, 0]])} />
    </Palco>
  );
}
