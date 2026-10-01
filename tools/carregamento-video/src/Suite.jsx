// CENA 4 — SUÍTE 612 (andar 6, 6 s em laço). Chuva na janela; o hóspede entra na ponta dos pés.
// RELÂMPAGO: o Aurélio, que estava longe, agora está mais perto. O hóspede leva um susto enorme,
// arrisca de novo… RELÂMPAGO: o Aurélio está do lado dele, de mão erguida (VOCÊ TAMBÉM?). Ele foge.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { HB, Hospede, AB, Aurelio, quarto, chuva, cortina } from '../../../jubileu/src/CarregandoAndares';
import { k } from './rig';
import { Palco, Ator, Fala, Sombra, Peca, Boneco, tremor } from './estilo';

export const DUR = 144;
const PE = 640;
const RAIOS = [52, 104];

export function Suite() {
  const f = useCurrentFrame();
  const clarao = RAIOS.some((t) => f >= t && f < t + 2) || RAIOS.some((t) => f >= t + 5 && f < t + 7);
  // o Aurélio só se move NO ESCURO do relâmpago (pula de lugar) — e respira devagar
  const aurX = f < RAIOS[0] + 1 ? 1180 : f < RAIOS[1] + 1 ? 960 : 720;
  const aurEsc = f < RAIOS[1] + 1 ? 1 : 1.12;
  const resp = Math.sin(f * .12) * .015;
  // o hóspede: ponta dos pés (passo longo e alto), susto (f52), recua tremendo, arrisca, susto 2 (f104), foge
  const hx = k(f, [[0, 120, 'l'], [50, 480, 'h'], [54, 480, 'o'], [62, 420, 'io'], [74, 420, 'io'], [102, 560, 'h'], [104, 560, 'o'], [114, 600, 'xi'], [140, -200, 'h'], [144, 120]]);
  const anda = (f < 50) || (f >= 74 && f < 102) || (f >= 114 && f < 140);
  const ritmo = f >= 114 ? .9 : .32, passo = anda ? Math.sin(f * ritmo) : 0;
  const pulo = k(f, [[0, 0], [52, 0, 'x'], [54, -60, 'o'], [60, 0, 'b'], [104, 0, 'x'], [106, -80, 'o'], [112, 0, 'b']]);
  const hsy = k(f, [[0, 1], [51, 1, 'x'], [52, .85, 'x'], [54, 1.18, 'io'], [60, .88, 'b'], [66, 1], [103, 1, 'x'], [104, .85, 'x'], [106, 1.22, 'io'], [112, .86, 'b'], [118, 1]]);
  const treme = (f >= 60 && f < 74) ? Math.sin(f * 3) * 3 : 0;
  const susto = (f >= 52 && f < 74) || (f >= 104 && f < 140);
  const z = k(f, [[0, 1.2, 'io'], [50, 1.35, 'h'], [53, 1.8, 'io'], [66, 1.4, 'io'], [102, 1.45, 'h'], [105, 2.0, 'io'], [116, 1.3, 'io'], [144, 1.2]]);
  const cx = k(f, [[0, 520, 'io'], [50, 520, 'h'], [53, 1000, 'io'], [66, 700, 'io'], [102, 640, 'h'], [105, 760, 'io'], [116, 640, 'io'], [144, 520]]);
  const cy = k(f, [[0, 420, 'io'], [53, 360, 'io'], [66, 410, 'io'], [105, 340, 'io'], [116, 410, 'io'], [144, 420]]);
  const vento = Math.sin(f * .08) * 4 + (clarao ? 6 : 0);
  return (
    <Palco f={f} z={z} cx={cx} cy={cy} tx={tremor(f, RAIOS[0] + 6, 8, 10) + tremor(f, RAIOS[1] + 6, 10, 10)} fundoCor="#0b0806" grade="sepia(.18) contrast(1.08) saturate(.9)">
      <defs>
        <pattern id="a6-pp" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M30,8Q40,30,30,52Q20,30,30,8Z" fill="#4a3b2c" /></pattern>
        <pattern id="a6-tb" width="160" height="40" patternUnits="userSpaceOnUse"><path d="M0,39H160M80,0V40" stroke="#1d140d" strokeWidth="3" /></pattern>
        <linearGradient id="a6-nt" x2="0" y2="1"><stop offset="0" stopColor="#0b1424" /><stop offset="1" stopColor="#1d2b48" /></linearGradient>
        <radialGradient id="a6-lz" cx=".5" cy=".1" r=".9"><stop offset="0" stopColor="#ffd98a" stopOpacity=".55" /><stop offset="1" stopColor="#ffd98a" stopOpacity="0" /></radialGradient>
      </defs>
      {quarto(1600, 760)}
      <g transform={`translate(0,${(f * 9) % 60 - 30})`}>{chuva(1600, 760)}</g>
      <g transform={`translate(880,150) skewX(${vento})`}><g transform="scale(1.1)">{cortina(-1)}</g></g>
      <g transform={`translate(1350,150) skewX(${-vento})`}><g transform="scale(1.1)">{cortina(1)}</g></g>
      {/* luminária pendente balançando (a luz vai junto) */}
      <g transform={`translate(800,0) rotate(${Math.sin(f * .1) * 6}) translate(-60,0)`}>
        <path d="M60,0V60" stroke="#1a1220" strokeWidth="4" /><path d="M30,90Q60,40,90,90Z" fill="#7a5a2a" stroke="#1a1220" strokeWidth="5" />
        <ellipse cx="60" cy="200" rx="160" ry="200" fill="url(#a6-lz)" />
      </g>
      <Sombra x={aurX} y={PE + 4} rx={70 * aurEsc} o={.6} /><Sombra x={hx} y={PE + 4} rx={50} />
      <Ator f={f}>
        <Boneco x={aurX} y={PE + 10} w={180} h={400} esc={1.25 * aurEsc} sx={1 - resp} sy={1 + resp}>
          <Peca piv={[90, 330]} sx={1 + Math.sin(f * .1) * .03}>{Aurelio.bainha}</Peca>
          {Aurelio.corpo}{Aurelio.braco}
          <Peca piv={[54, 136]} r={f >= RAIOS[1] ? k(f, [[RAIOS[1], 20], [130, 60, 'io'], [144, 60]]) : 0}>{Aurelio.mao}</Peca>
          <Peca piv={[90, 88]} r={k(f, [[0, 0], [40, -14, 'io'], [RAIOS[0], -20], [100, -10], [RAIOS[1], -26], [144, -30]])}>{Aurelio.cabeca}{f >= RAIOS[0] && Aurelio.olhar}</Peca>
        </Boneco>
        <Boneco x={hx + treme} y={PE + 10 + pulo} w={160} h={300} esc={1.3} sy={hsy} sx={1 / Math.sqrt(hsy)} r={f >= 114 && f < 140 ? -10 : anda ? passo * 3 : 0}>
          <Peca piv={[80, 198]} r={passo * (f >= 114 ? 36 : 22)}>{Hospede.pernaD}</Peca>
          <Peca piv={[80, 198]} r={-passo * (f >= 114 ? 36 : 22)}>{Hospede.pernaE}</Peca>
          <Peca piv={[50, 111]} r={susto ? (f >= 114 ? 120 + Math.sin(f * 1.2) * 30 : 80) : anda ? -passo * 20 : 0}>{Hospede.bracoE}</Peca>
          {Hospede.corpo}
          <Peca piv={[110, 111]} r={susto ? (f >= 114 ? -120 - Math.sin(f * 1.2) * 30 : -80) : anda ? passo * 20 : 0}>{Hospede.bracoD}</Peca>
          <Peca piv={[80, 90]} r={k(f, [[0, 0], [40, 6, 'io'], [52, 0, 'x'], [55, -10, 'e'], [70, 4]])} sy={f >= 46 && f < 52 ? 1.08 : 1}>
            {Hospede.cabeca}{susto ? Hospede.susto : Hospede.olhos}{f >= 60 && Hospede.suor}
          </Peca>
        </Boneco>
      </Ator>
      <Fala x={aurX - 40} y={250} t="VOCÊ TAMBÉM?" w={330} esc={k(f, [[0, 0, 'h'], [112, 0, 'b'], [117, 1, 'h'], [136, 1, 'i'], [140, 0]])} />
      {/* relâmpago: clarão azul por cima de tudo */}
      {clarao && <rect x="-400" y="-200" width="2400" height="1160" fill="#9fb4e8" opacity=".55" style={{ mixBlendMode: 'screen' }} />}
      {!clarao && <rect x="-400" y="-200" width="2400" height="1160" fill="#05070c" opacity={.18 + (Math.floor(f / 9) % 7 === 0 ? .25 : 0)} />}
    </Palco>
  );
}
