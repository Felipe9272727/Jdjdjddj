// CENA 2 — A MALA FUJONA (6 s em laço). O atendente grita (MINHA MALA!), o carrinho de malas
// atravessa o saguão chacoalhando; o segurança pisa na casca de banana, voa e cai (THUD); o TROCO-63
// chega correndo, pula nas malas (TCHAN!) e surfa… até o carrinho dar ré e levá-lo embora (IIIHAAA!).
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { P63, PSG, Banana } from '../../../jubileu/src/CarregandoAnimado';
import { Carrinho, Malas as MalasArte, Chapeleira, Roda } from '../../../jubileu/src/CarregandoCenas';
import { k, Robo } from './rig';
import { andar } from './andar';
import { Palco, Saguao, Papel, Ator, Estouro, Fala, Sombra, Cortinas, Atendente, EstiloCaretas, Peca, tremor } from './estilo';

export const DUR = 144;
const PE = 700;

export function Malas() {
  const f = useCurrentFrame();
  // ── o carrinho (caixa 360×320, base em PE+24) ──
  const cxC = k(f, [[0, -260, 'i'], [40, 520, 'l'], [70, 860, 'o'], [84, 900, 'b'], [92, 880, 'h'], [112, 880, 'o'], [118, 910, 'xi'], [136, -420, 'h'], [144, -260]]);
  const andando = (f < 84) || (f >= 118 && f < 136);
  const sacode = andando ? Math.sin(f * 1.9) * 3 : 0;
  const rodas = cxC * 1.6;
  const carR = k(f, [[0, 0], [84, 0, 'x'], [86, -8, 'e'], [100, 0, 'h'], [112, 0, 'o'], [118, 7, 'h'], [136, 7, 'io'], [144, 0]]) + sacode * .6;
  const chapeu = andando ? -Math.abs(Math.sin(f * .45)) * 26 : k(f, [[84, 0, 'o'], [88, -60, 'i'], [96, 0, 'b'], [104, 0]]);

  // ── segurança: marcha para a esquerda, pisa na casca (f50), voa e cai (THUD f68), zonzo, volta ──
  const gx = k(f, [[0, 1140, 'l'], [50, 820, 'l'], [58, 790, 'o'], [68, 640, 'h'], [112, 640, 'io'], [144, 1140]]);
  const voa = f >= 56 && f < 68, escorrega = f >= 50 && f < 58, sE = Math.min(1, Math.max(0, (f - 50) / 6));
  const gY = PE - (voa ? Math.sin((f - 56) / 12 * Math.PI) * 190 : 0) - (f < 50 || f >= 116 ? Math.abs(Math.sin(f * Math.PI / 8)) * 8 : 0);
  const gR = k(f, [[0, 0], [50, 0, 'x'], [56, 34, 'l'], [68, 95, 'b'], [72, 90, 'h'], [100, 90, 'io'], [106, 62, 'o'], [111, -12, 'b'], [117, 0]]);
  const gSy = k(f, [[0, 1], [67, 1, 'l'], [68, .7, 'b'], [76, 1]]);
  const passo = (f < 50 || f >= 116) ? Math.sin(f * Math.PI / 8) * 24 : 0;
  // marcha do segurança com pé plantado (ida até a casca; volta zonzo, mais rápido)
  const GI = { f0: 0, x0: 1140, dir: -1, passo: 64, periodo: 10, chao: PE, altPe: 26, quique: 9, surto: 0, D: .55 };
  const GV = { f0: 116, x0: 640, dir: 1, passo: 72, periodo: 4, chao: PE, altPe: 20, quique: 6, surto: 0, D: .5 };
  const WG = f < 50 ? andar({ ...GI, f }) : f >= 116 ? andar({ ...GV, f }) : null;
  const g = { x: WG ? WG.x : gx, y: WG ? PE + WG.bob : gY - 66 * Math.abs(Math.sin(gR * Math.PI / 180)), esc: 1.2, r: WG ? (f < 50 ? 6 : 8 + Math.sin(f * .5) * 7 * Math.max(0, 1 - (f - 116) / 20)) : gR, sy: gSy, sx: 1 / Math.sqrt(gSy), cab: f >= 70 && f < 110 ? Math.sin(f * .4) * 14 : 0,
    perfil: !!WG || escorrega, dir: f < 56 ? -1 : 1,
    cara: f >= 51 && f < 68 ? 's' : f >= 68 && f < 112 ? 'x' : 'b',
    bE: { a: voa ? 170 : escorrega ? 20 + 150 * sE : 20 + passo * .6, d: 14 }, bD: { a: voa ? 160 : escorrega ? 20 + 130 * sE : 20 - passo * .6, d: 14 },
    pE: WG ? { alvo: WG.peE, d: WG.noE ? 10 : 30 } : escorrega ? { alvo: [849 - 60 * sE, PE - 50 * Math.max(0, sE - .5)], d: 24 } : { a: voa ? 50 : passo }, pD: WG ? { alvo: WG.peD, d: WG.noD ? 10 : 30 } : escorrega ? { alvo: [785 - 150 * (1 - (1 - sE) ** 2), PE - 110 * sE ** 1.6], d: 6 } : { a: voa ? -40 : -passo } };
  if (WG) { g.bE = { a: 18 + WG.bracoE * .8, d: 16 }; g.bD = { a: 18 + WG.bracoD * .8, d: 16 }; }

  // ── TROCO-63: entra correndo (f30–60), agacha, pula nas malas (f72→84), surfa, é levado de ré ──
  const sobre = f >= 84;
  const xParou = andar({ f: 64, f0: 22, x0: 1800, dir: -1, passo: 70, periodo: 4, chao: PE, surto: 0, D: .42 }).x;
  const ax = sobre ? cxC + 10 : k(f, [[0, 1800, 'h'], [64, xParou, 'o'], [68, xParou - 14, 'h'], [72, xParou - 14, 'o'], [84, 890]]);
  const salto = f >= 72 && f < 84 ? Math.sin((f - 72) / 12 * Math.PI) * 170 : 0;
  const aBase = sobre ? PE - 138 + sacode - (f < 112 ? Math.abs(Math.sin(f * Math.PI / 10)) * 10 : 0) : k(f, [[0, PE], [72, PE, 'l'], [84, PE - 138]]);
  const aSy = k(f, [[0, 1], [64, 1, 'o'], [70, .75, 'x'], [73, 1.2, 'io'], [83, 1, 'l'], [84, .72, 'b'], [92, 1]]);
  const corre = f >= 22 && f < 64;
  const WA = corre ? andar({ f, f0: 22, x0: 1800, dir: -1, passo: 70, periodo: 4, chao: PE, altPe: 34, quique: 12, surto: 0, D: .42 }) : null;
  const a = { x: WA ? WA.x : ax, y: WA ? PE + WA.bob : aBase - salto, esc: 1.1, perfil: corre, dir: -1, sy: aSy, sx: 1 / Math.sqrt(aSy), r: sobre ? (f >= 112 ? 18 : -6 + Math.sin(f * .3) * 5) : corre ? -12 : 0,
    cara: f >= 112 ? 's' : sobre ? 'f' : 'n', cab: sobre && f < 112 ? Math.sin(f * .5) * 8 : 0,
    bD: { a: sobre ? (f < 112 ? 150 + Math.sin(f * .55) * 22 : 170 + Math.sin(f * 1.5) * 30) : corre ? 40 + Math.sin(f * .8) * 50 : 20, d: 18 },
    bE: { a: sobre ? (f < 112 ? 110 : 150 + Math.sin(f * 1.4) * 40) : corre ? 40 - Math.sin(f * .8) * 50 : 20, d: 16 },
    pE: WA ? { alvo: WA.peE, d: WA.noE ? 12 : 34 } : { a: sobre ? 18 : 8 }, pD: WA ? { alvo: WA.peD, d: WA.noD ? 12 : 34 } : { a: sobre ? 18 : 8 } };
  if (WA) { a.bE = { a: 40 + WA.bracoE * 1.8, d: 22 }; a.bD = { a: 40 + WA.bracoD * 1.8, d: 22 }; }

  // ── atendente: grita apontando, depois suspira ──
  const at = { x: 250, y: PE + 10, esc: .8, braco: k(f, [[0, 10, 'o'], [3, -130, 'b'], [30, -130, 'io'], [40, 0, 'h'], [114, 0, 'o'], [118, -140, 'b'], [138, -140, 'io'], [144, 10]]) + (f < 30 ? Math.sin(f * .7) * 12 : 0),
    cab: k(f, [[0, -10], [40, 10], [70, 18], [100, 10], [118, -14], [140, -10]]), cara: f < 32 || (f >= 116 && f < 140) ? 's' : f >= 90 && f < 112 ? 'y' : 'n' };

  const z = k(f, [[0, 1.4, 'io'], [16, 1.25, 'io'], [48, 1.3, 'x'], [52, 1.45, 'io'], [64, 1.3, 'io'], [78, 1.3, 'io'], [84, 1.55, 'b'], [100, 1.35, 'io'], [118, 1.15, 'io'], [144, 1.4]]);
  const cx = k(f, [[0, 380, 'io'], [20, 520, 'io'], [50, 720, 'io'], [70, 900, 'io'], [86, 920, 'io'], [118, 820, 'io'], [136, 560, 'io'], [144, 380]]);
  const cy = k(f, [[0, 470, 'io'], [56, 500, 'io'], [66, 530, 'io'], [78, 520, 'io'], [86, 440, 'io'], [118, 450, 'io'], [144, 470]]);

  return (
    <Palco f={f} z={z} cx={cx} cy={cy} tx={tremor(f, 68, 16, 10) + tremor(f, 84, 10, 8)} ty={tremor(f, 68, 8, 10)} frente={<Cortinas px={(800 - cx) * .35} />}>
      <EstiloCaretas />
      <Saguao />
      <Papel />
      <Sombra x={gx} y={PE + 8} rx={voa ? 50 : 80} /><Sombra x={cxC} y={PE + 26} rx={170} ry={18} />
      {!sobre && <Sombra x={ax} y={PE + 8} rx={salto > 40 ? 40 : 70} />}
      <Ator f={f}>
        <Atendente pose={at} />
        {/* a casca no chão, até ser pisada (e chutada) */}
        {f < 50 && <g transform={`translate(785,${PE - 6}) scale(1.4)`}><Banana /></g>}
        {f >= 50 && f < 66 && <g transform={`translate(${785 + (f - 50) * 30},${PE - 6 - Math.sin((f - 50) / 16 * Math.PI) * 160}) rotate(${(f - 50) * 45}) scale(1.4)`}><Banana /></g>}
        {!(f >= 54 && f < 116) && <Robo pose={g} pal={PSG} k={2} armaE="b" />}
        <g transform={`translate(${cxC},${PE + 24}) rotate(${carR}) translate(-180,-320)`}>
          <Peca piv={[70, 290]} r={rodas}><Roda x={70} /></Peca>
          <Peca piv={[290, 290]} r={rodas}><Roda x={290} /></Peca>
          <Carrinho /><MalasArte />
          <Peca y={chapeu} piv={[144, 152]} r={chapeu * .4}><Chapeleira /></Peca>
        </g>
        {f >= 54 && f < 116 && <Robo pose={g} pal={PSG} k={2} armaE="b" />}
        <Robo pose={a} pal={P63} k={1} armaD="c" />
      </Ator>
      {((f >= 70 && f < 110)) && [0, 1, 2].map((i) => { const ang = f * .35 + i * 2.1; return <path key={i} transform={`translate(${gx + 190 + Math.cos(ang) * 60},${PE - 70 + Math.sin(ang) * 14})`} d="M0,-14L4,-4L14,-4L6,3L9,13L0,7L-9,13L-6,3L-14,-4L-4,-4Z" fill="#ffe14a" stroke="#1a1220" strokeWidth="3" />; })}
      <Fala x={330} y={300} t="MINHA MALA!" w={340} esc={k(f, [[0, 0, 'b'], [5, 1, 'h'], [30, 1, 'i'], [34, 0, 'h'], [117, 0, 'b'], [122, 1, 'h'], [138, 1, 'i'], [142, 0]])} />
      <Estouro x={700} y={520} t="THUD!" cor="#ffb347" giro={-8} esc={k(f, [[0, 0, 'h'], [67, 0, 'b'], [71, 1, 'h'], [80, 1, 'i'], [84, 0]])} />
      <Estouro x={1080} y={360} t="TCHAN!" cor="#fff3b0" giro={8} esc={k(f, [[0, 0, 'h'], [83, 0, 'b'], [87, 1, 'h'], [100, 1, 'i'], [104, 0]])} />
      <Fala x={cxC + 160} y={260} t="IIIIHAAA!" w={300} esc={k(f, [[0, 0, 'h'], [118, 0, 'b'], [122, 1, 'h'], [134, 1, 'i'], [137, 0]])} />
    </Palco>
  );
}
