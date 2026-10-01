// CENA 6 — O ARQUIVO (andar 8, 6 s em laço). O Arquivista carimba no ritmo (ARQUIVADO!); o Diabrete
// entra na ponta dos pés e rabisca a foto dele, aos risinhos; o Arquivista vira (HMM?) e o Diabrete
// vira CAIXA num pof. A caixa treme, espia… o Arquivista volta a carimbar e o Diabrete sai de fininho.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { RB, Arquivista, DB, Diabrete, arquivo, Mesa8, Foto, RABISCOS, Caixa8 } from '../../../jubileu/src/CarregandoAndares';
import { k, Mangueira } from './rig';
import { andar } from './andar';
import { Palco, Ator, Estouro, Sombra, Peca, Boneco, tremor } from './estilo';

export const DUR = 144;
const PE = 640;
const CARIMBOS = [12, 36, 120];

export function Arquivo() {
  const f = useCurrentFrame();
  // ── Arquivista: sobe o carimbo devagar, desce seco ──
  const carimbo = CARIMBOS.reduce((acc, t) => acc + (f >= t - 8 && f < t + 6 ? k(f, [[t - 8, 0, 'o'], [t - 2, 18, 'xi'], [t, -32, 'b'], [t + 6, 0]]) : 0), 0);
  const olha = k(f, [[0, 0], [66, 0, 'io'], [70, 6, 'x'], [72, 22, 'e'], [84, 16], [100, 16, 'io'], [108, 0]]);
  const amassa = CARIMBOS.some((t) => f >= t && f < t + 3) ? .95 : 1;
  // ── Diabrete: entra na ponta dos pés (f0–32), assenta, rabisca trocando o peso (f36–66), pof (f72), sai (f116–126) ──
  // ponta dos pés de verdade: pés plantados, passos curtos e altos, corpo em surtos (o "sneak" de 1930)
  const ENTRA = { f0: 0, x0: 1570, dir: -1, passo: 105, periodo: 8, chao: PE + 4, altPe: 56, quique: 14, D: .64, surto: .4 };
  const SAI = { f0: 121, x0: 1150, dir: 1, passo: 150, periodo: 1.5, chao: PE + 4, altPe: 40, quique: 10, D: .45, surto: 0 };
  const WD = f < 32 ? andar({ ...ENTRA, f }) : f >= 121 && f < 128 ? andar({ ...SAI, f }) : null;
  const parado = !WD && (f < 72 || f >= 116);
  const balanco = f >= 36 && f < 72 ? Math.sin((f - 36) / 24 * Math.PI * 2) : 0;   // troca o peso de lado
  const dx = WD ? WD.x : 1150 + balanco * 6;
  const visivel = f < 72 || (f >= 116 && f < 128);
  const ri = f >= 36 && f < 66 ? Math.abs(Math.sin(f * .9)) * -6 : 0;
  const dsy = k(f, [[0, 1], [31, 1, 'o'], [32, .88, 'x'], [34, 1.04, 'io'], [36, 1], [68, 1, 'o'], [72, .55, 'x'], [116, 1.5, 'b'], [119, .85, 'io'], [121, .85, 'x'], [123, 1]]);
  const rab = Math.min(3, Math.floor((f - 36) / 10) + 1);
  const caixa = f >= 72 && f < 116;
  const caixaSy = k(f, [[72, .4, 'x'], [76, 1.15, 'b'], [84, 1], [110, 1, 'x'], [116, 1.4, 'o'], [118, 0]]);
  const zip = f >= 121 && f < 128;

  // pernas de mangueira em coordenadas locais (inverso da transformação do Boneco)
  const dR = WD ? (f < 32 ? -12 : 12) : f >= 118 && f < 121 ? -10 : 0, dyB = PE + 8 + ri + (WD ? WD.bob : 0), E = 1.15;
  const local = ([wx, wy]) => { const a = -dR * Math.PI / 180, ux = (wx - dx) / E, uy = (wy - dyB) / E;
    return [90 + ux * Math.cos(a) - uy * Math.sin(a), 280 + ux * Math.sin(a) + uy * Math.cos(a)]; };
  const pe = (lado) => {
    if (WD) { const p = local(lado === 'E' ? WD.peE : WD.peD); return { p, no: lado === 'E' ? WD.noE : WD.noD }; }
    return { p: local(lado === 'E' ? [1150 - 26, PE + 4] : [1150 + 26, PE + 4]), no: true };   // pés fixos no chão
  };
  const dirD = f < 32 ? -1 : 1;
  const perna = (lado) => { const { p, no } = pe(lado), q = [lado === 'E' ? 80 : 100, 150];
    const dob = WD ? -dirD * (no ? 8 : 26) : f >= 31 && f < 36 ? 20 * (lado === 'E' ? -1 : 1) : (lado === 'E' ? -1 : 1) * ((balanco > 0) === (lado === 'E') ? 24 : 4);
    const giro = WD ? dirD * (no ? 15 : 30) : 0;
    return <g key={lado}><Mangueira de={q} ate={p} dobra={dob} larg={26} cor="#1a1220" />
      <g transform={`translate(${p[0]},${p[1]}) rotate(${giro}) scale(${dirD},1)`} stroke="#1a1220" strokeWidth="4">
        <ellipse cx="7" cy="0" rx="15" ry="8" fill="#0b0b0b" /><ellipse cx="11" cy="-3" rx="6" ry="2.5" fill="#fff" opacity=".3" stroke="none" /></g></g>; };
  const pernas = <>{perna(dirD > 0 ? 'E' : 'D')}{perna(dirD > 0 ? 'D' : 'E')}</>;
  const z = k(f, [[0, 1.3, 'io'], [10, 1.36, 'x'], [14, 1.3, 'io'], [30, 1.75, 'io'], [66, 1.8, 'x'], [70, 1.55, 'io'], [84, 2.0, 'io'], [104, 1.35, 'io'], [144, 1.3]]);
  const cx = k(f, [[0, 860, 'io'], [30, 1060, 'io'], [66, 1060, 'x'], [70, 780, 'io'], [84, 1150, 'io'], [104, 900, 'io'], [144, 860]]);
  const cy = k(f, [[0, 450, 'io'], [30, 470, 'io'], [70, 420, 'io'], [84, 560, 'io'], [104, 460, 'io'], [144, 450]]);
  return (
    <Palco f={f} z={z} cx={cx} cy={cy} tx={CARIMBOS.reduce((a, t) => a + tremor(f, t, 5, 5), 0)} fundoCor="#120c08" grade="sepia(.2) contrast(1.06) saturate(.95)">
      <defs><radialGradient id="a8-lz" cx=".5" cy=".55" r=".6"><stop offset="0" stopColor="#ffd98a" stopOpacity=".28" /><stop offset=".6" stopColor="#000" stopOpacity=".1" /><stop offset="1" stopColor="#000" stopOpacity=".65" /></radialGradient></defs>
      {arquivo(1600, 760)}
      <ellipse cx={800} cy={520} rx={560} ry={300} fill="url(#luz)" opacity={.35 + Math.sin(f * .2) * .03} />
      <Sombra x={1150} y={PE + 6} rx={70} />
      <Ator f={f}>
        <Boneco x={760} y={PE - 40} w={240} h={300} esc={1.3} sy={amassa}>
          {Arquivista.bracoE}{Arquivista.corpo}
          <Peca piv={[120, 90]} r={olha}>{Arquivista.cabeca}{f >= 70 && f < 104 && Arquivista.bravo}</Peca>
          <Peca piv={[187, 156]} r={carimbo}>{Arquivista.bracoD}</Peca>
        </Boneco>
        <g transform={`translate(${800 - 300},${PE - 170}) scale(1.3)`}>{Mesa8}</g>
        <g transform={`translate(1000,${PE - 230}) scale(1.2)`}>
          {Foto}
          {f >= 36 && f < 144 && RABISCOS.slice(0, rab).map((d, i) => <path key={i} d={d} transform="translate(0 12)" fill="none" stroke="#e63a2e" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />)}
        </g>
        {visivel && <Boneco x={dx} y={PE + 8 + ri + (WD ? WD.bob : 0)} w={180} h={280} esc={1.15} sy={dsy} r={dR} sx={zip ? 1.5 / Math.sqrt(dsy) : 1 / Math.sqrt(dsy)}>
          {pernas}
          <g stroke="#1a1220" strokeLinejoin="round"><path d="M56,110Q90,94,124,110Q132,160,90,166Q48,160,56,110Z" fill="#1a1220" />
            <g transform={`rotate(${Math.sin(f * .26) * 12} 124 150)`}><path d="M124,150Q166,160,160,120Q156,104,166,98" fill="none" stroke="#1a1220" strokeWidth="6" /><path d="M160,92L176,96L164,108Z" fill="#1a1220" /></g></g>
          <Peca piv={[122, 118]} r={f >= 36 && f < 66 ? Math.sin(f * 1.6) * 28 - 10 : 0}>{Diabrete.braco}</Peca>
          <Peca piv={[90, 100]} r={f >= 36 && f < 66 ? Math.sin(f * .9) * 8 : 0}>{Diabrete.cabeca}</Peca>
        </Boneco>}
        {caixa && <g transform={`translate(1150,${PE + 8}) rotate(${f >= 84 && f < 110 ? Math.sin(f * 1.7) * 2.5 : 0}) scale(${1 / Math.sqrt(caixaSy) * 1.1},${caixaSy * 1.1}) translate(-90,-180)`}>
          {Caixa8}
          {f >= 88 && f < 106 && <g stroke="#1a1220" strokeWidth="4"><circle cx="76" cy="62" r="9" fill="#fff" /><circle cx="104" cy="62" r="9" fill="#fff" /><circle cx={78 + Math.sin(f * .3) * 2} cy="64" r="4" fill="#1a1220" stroke="none" /><circle cx={102 + Math.sin(f * .3) * 2} cy="64" r="4" fill="#1a1220" stroke="none" /></g>}
        </g>}
        {f >= 72 && f < 80 && [0, 1, 2, 3].map((i) => { const t = (f - 72) / 8, a = i * Math.PI / 2 + .6; return <circle key={i} cx={1150 + Math.cos(a) * 90 * t} cy={PE - 100 + Math.sin(a) * 60 * t} r={26 * (1 - t) + 6} fill="#f1e6cc" stroke="#1a1220" strokeWidth="4" opacity={1 - t} />; })}
      </Ator>
      {zip && [0, 1, 2].map((i) => <path key={i} d={`M${dx - 120 - i * 26},${PE - 220 + i * 70}h-${150 - i * 30}`} stroke="#f1e6cc" strokeWidth="7" strokeLinecap="round" opacity=".8" />)}
      {f >= 121 && f < 129 && [0, 1, 2].map((i) => { const t = (f - 121) / 8; return <circle key={i} cx={1150 - 20 - i * 30 - t * 40} cy={PE - t * 30 - i * 8} r={14 + t * 18} fill="#c9b79a" stroke="#1a1220" strokeWidth="3" opacity={(1 - t) * .8} />; })}
      {CARIMBOS.map((t) => <Estouro key={t} x={Math.max(560, cx - 800 / z + 170)} y={300} t="ARQUIVADO!" cor="#f1e6cc" giro={-10} tam={40} esc={k(f, [[t - 1, 0, 'b'], [t + 3, .9, 'h'], [t + 10, .9, 'i'], [t + 13, 0]])} />)}
      <Estouro x={860} y={250} t="HMM?" cor="#9af6ff" giro={8} tam={50} esc={k(f, [[0, 0, 'h'], [70, 0, 'b'], [74, .85, 'h'], [84, .85, 'i'], [88, 0]])} />
      <Estouro x={1150} y={400} t="POF!" cor="#fff3b0" giro={-6} tam={50} esc={k(f, [[0, 0, 'h'], [72, 0, 'b'], [75, .8, 'h'], [82, .8, 'i'], [85, 0]])} />
    </Palco>
  );
}
