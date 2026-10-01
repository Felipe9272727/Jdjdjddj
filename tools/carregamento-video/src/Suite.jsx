// CENA 4 — SUÍTE 612 (andar 6, 6 s em laço). Refeita no gauntlet (crítica do DeepSeek, nota 4,0):
// geografia FIXA (porta, cama, janela não mudam), câmera quase parada sem cortar ninguém, o Aurélio
// numa ESCADA de aproximação (longe → perto → do lado) que só anda no escuro, relâmpago por
// INVERSÃO DE VALOR (o fundo estoura, os personagens ficam silhueta com contorno frio), luz motivada
// (abajur visível atrás do hóspede), hóspede com poses de verdade (ponta dos pés, susto assimétrico,
// medo que não passa, fuga com smear) e o laço fechando em íris, como no cinema de 1930.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { quarto, chuva, cortina } from '../../../jubileu/src/CarregandoAndares';
import { k } from './rig';
import { Palco, Ator, Fala, Sombra, tremor } from './estilo';
import { HospedeRig, AurelioRig } from './gente';

export const DUR = 144;
const RAIOS = [48, 100];
/** Clarão: 1 quadro aceso, 1 apagado, 1 aceso (piscada elétrica) e 5 de decaimento. */
const clarao = (f) => RAIOS.reduce((m, t) => Math.max(m, f === t || f === t + 2 ? 1 : f === t + 1 ? 0 : f > t + 2 && f <= t + 7 ? 1 - (f - t - 2) / 6 : 0), 0);

export function Suite() {
  const f = useCurrentFrame();
  const fl = clarao(f);
  // ── o Aurélio: escada de aproximação, só se move no escuro ──
  const degrau = f < RAIOS[0] ? 0 : f < RAIOS[1] ? 1 : 2;
  // a escada: longe e pequeno no fundo → no meio → do lado do hóspede, grande, na frente
  const aur = [{ x: 1250, esc: .72, y: 590 }, { x: 1010, esc: 1.0, y: 650 }, { x: 790, esc: 1.3, y: 712 }][degrau];
  // cada aparição, uma pose: de pé e reto; inclinado espiando; curvado sobre o hóspede, chamando com a garra
  const POSES = [{ r: 0, cab: -4, bE: { a: 6, d: 6 }, bD: { a: 6, d: 6 } },
                 { r: -6, cab: -18, bE: { a: 10, d: 10 }, bD: { a: 40, d: 30, c: 120 } },
                 { r: -14, cab: -24, bD: { a: 14, d: 10 }, bE: { a: k(f, [[RAIOS[1], 50, 'io'], [114, 105, 'b'], [134, 100]]) + Math.sin(f * .45) * 6, d: -34, c: 150 } }];
  const aurelio = { x: aur.x, y: aur.y, esc: aur.esc, resp: Math.sin(f * .12) * .012, olhos: Math.max(fl, degrau === 2 ? .8 : .2), garra: degrau === 2, ...POSES[degrau] };

  // ── o hóspede ──
  const fase = f < RAIOS[0] ? 'entra' : f < 74 ? 'susto1' : f < RAIOS[1] ? 'arrisca' : f < 112 ? 'susto2' : 'foge';
  const x = k(f, [[0, 230, 'io'], [46, 500, 'h'], [50, 500, 'o'], [60, 470, 'io'], [74, 440, 'io'], [100, 560, 'h'], [112, 560, 'o'], [114, 600, 'xi'], [132, 220, 'h'], [144, 230]]);
  const yP = k(f, [[0, 520, 'io'], [46, 650, 'h'], [112, 650, 'xi'], [132, 520, 'h'], [144, 520]]);
  const esc = k(f, [[0, .92, 'io'], [46, 1.15, 'h'], [112, 1.15, 'xi'], [132, .92, 'h'], [144, .92]]);
  const pontaDosPes = fase === 'entra' || fase === 'arrisca';
  const p = Math.sin(f * (fase === 'foge' ? .95 : .33));
  const quica = pontaDosPes ? -Math.abs(p) * 14 - 8 : 0;
  const pulo = k(f, [[0, 0], [RAIOS[0], 0, 'x'], [RAIOS[0] + 2, 6, 'x'], [RAIOS[0] + 3, -70, 'o'], [RAIOS[0] + 10, 0, 'b'], [RAIOS[1], 0, 'x'], [RAIOS[1] + 2, 10, 'x'], [RAIOS[1] + 3, -170, 'o'], [RAIOS[1] + 12, 0, 'b']]);
  const sy = k(f, [[0, 1], [RAIOS[0], 1, 'x'], [RAIOS[0] + 2, .82, 'x'], [RAIOS[0] + 4, 1.2, 'io'], [RAIOS[0] + 10, .88, 'b'], [RAIOS[0] + 16, 1], [RAIOS[1], 1, 'x'], [RAIOS[1] + 2, .74, 'x'], [RAIOS[1] + 4, 1.4, 'io'], [RAIOS[1] + 11, .86, 'b'], [112, 1, 'x'], [113, .85, 'h'], [115, 1]]);
  const smear = f === 113 || f === 114 ? 1.25 : 1;
  const susto = fase === 'susto1' && f < 62 || fase === 'susto2';
  const treme = (fase === 'susto1' && f >= 56) || fase === 'arrisca' ? Math.sin(f * 3.1) * 2.5 : 0;
  const hosp = { x: x + treme, y: yP + quica + pulo, esc, sy, sx: smear / Math.sqrt(sy), r: fase === 'foge' ? -18 : susto ? -12 : pontaDosPes ? p * 3 + 4 : -4,
    cab: susto ? 10 : fase === 'arrisca' ? -8 + Math.sin(f * .6) * 3 : pontaDosPes ? -6 : 0,
    cara: susto ? 'susto' : f >= 56 ? 'medo' : 'cauto', suor: f >= 56,
    bE: susto ? { a: 150, d: -20 } : fase === 'foge' ? { a: 90 + p * 70, d: 10 } : { a: 40 + p * 10, d: 34, c: 62 },
    bD: susto ? { a: 60, d: 30 } : fase === 'foge' ? { a: 90 - p * 70, d: 10 } : { a: 50 - p * 10, d: 34, c: 62 },
    pE: fase === 'foge' ? { a: p * 50, d: 10 } : susto ? { a: 26, d: 14 } : pontaDosPes ? { a: p * 20, giro: 28 } : { a: 4 },
    pD: fase === 'foge' ? { a: -p * 50, d: 10 } : susto ? { a: -8, d: 26 } : pontaDosPes ? { a: -p * 20, giro: 28 } : { a: 4 } };

  // ── câmera quase parada: um empurrão lento na tensão, tranco no trovão ──
  const z = 1.1; // câmera TRAVADA: a régua do quarto não muda; quem chega perto é o Aurélio
  const cx = 760;
  const cy = 410;
  // íris: abre no começo, fecha no fim em cima dos olhos do Aurélio (lá, no escuro, ele volta para longe)
  const iris = f < 8 ? k(f, [[0, 0, 'o'], [8, 1300]]) : f >= 132 ? k(f, [[132, 1300, 'o'], [143, 0]]) : 1300;
  const irisC = f < 8 ? [230, 400] : [aur.x - 4, 668 - 300 * aur.esc];
  return (
    <Palco f={f} z={z} cx={cx} cy={cy} tx={tremor(f, RAIOS[0] + 4, 7, 10) + tremor(f, RAIOS[1] + 4, 9, 10)} fundoCor="#0b0806" grade="sepia(.16) contrast(1.08) saturate(.92)">
      <defs>
        <pattern id="a6-pp" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M40,10L56,40L40,70L24,40Z" fill="none" stroke="#4a3b2c" strokeWidth="4" /><circle cx="40" cy="40" r="5" fill="#4a3b2c" /><circle cx="0" cy="0" r="4" fill="#45372a" /><circle cx="80" cy="80" r="4" fill="#45372a" /></pattern>
        <pattern id="a6-tb" width="160" height="40" patternUnits="userSpaceOnUse"><path d="M0,39H160M80,0V40" stroke="#1d140d" strokeWidth="3" /></pattern>
        <linearGradient id="a6-nt" x2="0" y2="1"><stop offset="0" stopColor="#0b1424" /><stop offset="1" stopColor="#1d2b48" /></linearGradient>
        <radialGradient id="abajur"><stop offset="0" stopColor="#ffcf7a" stopOpacity=".7" /><stop offset=".5" stopColor="#e4a94a" stopOpacity=".22" /><stop offset="1" stopColor="#e4a94a" stopOpacity="0" /></radialGradient>
        {/* o clarão: o FUNDO estoura (valores sobem), os personagens ficam como estão */}
        <filter id="estoura"><feComponentTransfer>
          {['R', 'G', 'B'].map((c, i) => React.createElement(`feFunc${c}`, { key: c, type: 'linear', slope: 1 + fl * 4, intercept: fl * (.5 + i * .02) }))}
        </feComponentTransfer></filter>
        {/* no clarão os personagens viram SILHUETA (quase pretos) contra o fundo estourado, com um fio de luz fria só do lado da janela */}
        <filter id="aroAurelio" x="-20%" y="-20%" width="140%" height="140%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="g" /><feGaussianBlur in="g" stdDeviation="4" result="b" />
          <feFlood floodColor="#8fb0e8" floodOpacity=".45" /><feComposite in2="b" operator="in" result="aro" />
          <feMerge><feMergeNode in="aro" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="silhueta" x="-20%" y="-20%" width="140%" height="140%">
          <feComponentTransfer in="SourceGraphic" result="esc">{['R', 'G', 'B'].map((c) => React.createElement(`feFunc${c}`, { key: c, type: 'linear', slope: Math.max(0, 1 - fl * 1.1), intercept: fl * .03 }))}</feComponentTransfer>
          <feMorphology in="SourceAlpha" operator="erode" radius="2" result="d" /><feOffset in="d" dx="-5" dy="2" result="o" /><feComposite in="d" in2="o" operator="out" result="borda" />
          <feFlood floodColor="#e8f1ff" floodOpacity={fl * .4} /><feComposite in2="borda" operator="in" result="aro" />
          <feMerge><feMergeNode in="esc" /><feMergeNode in="aro" /></feMerge>
        </filter>
      </defs>
      <g filter={fl > 0 ? 'url(#estoura)' : undefined}>
        {quarto(1600, 760)}
        <g transform={`translate(0,${(f * 9) % 60 - 30})`}>{chuva(1600, 760)}</g>
        <g opacity=".5" transform={`translate(${40 + (f * 3) % 20},${(f * 14) % 60 - 60}) skewX(-8)`}>{chuva(1600, 760)}</g>
        <g transform={`translate(880,150) skewX(${Math.sin(f * .08) * 4 + fl * 8})`}><g transform="scale(1.1)">{cortina(-1)}</g></g>
        <g transform={`translate(1350,150) skewX(${-Math.sin(f * .08) * 4 - fl * 8})`}><g transform="scale(1.1)">{cortina(1)}</g></g>
        {/* o abajur no criado-mudo: a fonte da luz, ATRÁS do hóspede */}
        <ellipse cx={520} cy={430} rx={420} ry={300} fill="url(#abajur)" opacity={f % 37 === 0 ? .4 : 1} />
        <g stroke="#1a1220" strokeWidth="5" strokeLinejoin="round">
          <rect x="478" y="380" width="84" height="122" rx="6" fill="#4a3424" /><path d="M478,420H562M478,460H562" strokeWidth="3" />
          <path d="M520,380V340" strokeWidth="7" /><path d="M492,340H548L536,300H504Z" fill="#f2d79a" />
        </g>
      </g>
      <Sombra x={aur.x} y={672} rx={60 * aur.esc} o={.55} /><Sombra x={x} y={yP + 4} rx={46 * esc} ry={12} o={.4} />
      <g filter={fl > 0 ? 'url(#silhueta)' : undefined}>
        <Ator f={f} luz={false}>
          <g filter={fl > 0 ? undefined : 'url(#aroAurelio)'}><AurelioRig pose={aurelio} f={f} /></g>
          <HospedeRig pose={hosp} />
        </Ator>
      </g>
      <Ator f={f} luz={false}><Fala x={aur.x - 260} y={250} t="VOCÊ TAMBÉM?" w={420} tam={50} cauda={.86} esc={k(f, [[0, 0, 'h'], [108, 0, 'b'], [113, 1, 'h'], [130, 1, 'i'], [134, 0]])} /></Ator>
      {/* fuga: riscos de velocidade e poeira atrás dele */}
      {fase === 'foge' && f < 132 && <g>{[0, 1, 2].map((i) => <path key={i} d={`M${x + 70},${yP - 200 + i * 50}h${120 + i * 40}`} stroke="#fff3b0" strokeWidth="8" strokeLinecap="round" opacity=".8" />)}
        {[0, 1].map((i) => <circle key={`p${i}`} cx={x + 60 + i * 40} cy={yP - 6} r={14 + ((f + i * 5) % 10) * 2} fill="#cbb89a" opacity=".6" stroke="#1a1220" strokeWidth="3" />)}</g>}
      {/* espigões de susto */}
      {susto && (fase === 'susto2' ? [-2, -1, 0, 1, 2] : [-1, 0, 1]).map((i) => <path key={i} d={`M${x + i * 36},${yP - 330 * esc * sy + pulo}l${i * 18},${fase === 'susto2' ? -64 : -34}`} stroke="#fff3b0" strokeWidth={fase === 'susto2' ? 10 : 7} strokeLinecap="round" />)}
      {/* íris */}
      <path fillRule="evenodd" fill="#000" d={`M-500,-400H2100V1200H-500Z M${irisC[0] - iris},${irisC[1]}a${iris},${iris},0,1,0,${iris * 2},0a${iris},${iris},0,1,0,${-iris * 2},0Z`} />
    </Palco>
  );
}
