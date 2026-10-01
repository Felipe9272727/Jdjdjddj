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
import { andar } from './andar';

export const DUR = 144;
const RAIOS = [48, 100];
/** Clarão: 1 quadro aceso, 1 apagado, 1 aceso (piscada elétrica) e 5 de decaimento. */
const clarao = (f) => RAIOS.reduce((m, t) => Math.max(m, f === t || f === t + 2 ? 1 : f === t + 1 ? 0 : f > t + 2 && f <= t + 7 ? 1 - (f - t - 2) / 6 : 0), 0);

export function Suite() {
  const f = useCurrentFrame();
  const fl = clarao(f);
  // ── o hóspede ──
  const fase = f < RAIOS[0] ? 'entra' : f < 74 ? 'susto1' : f < RAIOS[1] ? 'arrisca' : f < 112 ? 'susto2' : 'foge';
  // o chão sobe em diagonal da porta (fundo) para a frente da cena; a escala acompanha (mesmo mapa p/ todos)
  const chaoDiag = (xx) => 520 + (xx - 230) * (130 / 270);
  const escDiag = (xx) => .92 + (xx - 230) * (.23 / 270);
  /** UM só mapa de profundidade: a escala sai do y do chão (para todos os personagens). */
  const escY = (yy) => .92 + (yy - 520) * (.23 / 130);
  // caminhadas: "sneak" de 1930 (passo alto e lento, corpo em surtos, apoio duplo); fuga em corrida
  const ENTRA = { f0: 0, x0: 230, dir: 1, passo: 72, periodo: 18, chao: chaoDiag, altPe: 48, quique: 18 };
  const ARRISCA = { f0: 74, dir: 1, passo: 52, periodo: 20, altPe: 26, quique: 5 };
  const xFimEntra = andar({ ...ENTRA, f: RAIOS[0] }).x;                  // onde a entrada termina…
  const xArrisca0 = xFimEntra - 30;                                       // …recua 30 de medo e arrisca dali
  const yArrisca = 690; // no "arrisca" ele vem mais para a frente (cabeça longe da cúpula do abajur)
  ARRISCA.x0 = xArrisca0; ARRISCA.chao = yArrisca;
  const xFimArrisca = andar({ ...ARRISCA, f: RAIOS[1] }).x;
  const FOGE = { f0: 114, x0: xFimArrisca, dir: -1, passo: 64, periodo: 3, chao: (xx) => 690 + (xFimArrisca - xx) * ((520 - 690) / (xFimArrisca - 230)), altPe: 40, quique: 16, D: .45, surto: 0 };
  const W = fase === 'entra' ? andar({ ...ENTRA, f })
    : fase === 'arrisca' ? andar({ ...ARRISCA, f })
    : fase === 'foge' && f >= 114 && f < 132 ? andar({ ...FOGE, f }) : null;
  // fora das caminhadas, o x/y seguem keyframes que COMEÇAM e TERMINAM onde as caminhadas estão (sem saltos)
  const xK = k(f, [[0, 230], [RAIOS[0], xFimEntra, 'o'], [60, xFimEntra - 20, 'io'], [74, xArrisca0, 'h'], [RAIOS[1], xFimArrisca, 'h'], [112, xFimArrisca, 'o'], [114, xFimArrisca + 30, 'h'], [132, 220, 'h'], [144, 230]]);
  const xW = W ? W.x : xK;
  // a descida até 690 acontece no RECUO do susto 1 (ele recua para a frente, de medo) — sem salto de profundidade
  const yFimEntra = chaoDiag(xFimEntra);
  const yW = fase === 'entra' ? chaoDiag(xW) : fase === 'susto1' ? k(f, [[RAIOS[0], yFimEntra], [60, yFimEntra, 'io'], [74, 690]])
    : fase === 'foge' && f >= 114 ? FOGE.chao(xW) : 690;
  const pontaDosPes = fase === 'entra' || fase === 'arrisca';
  const pulo = k(f, [[0, 0], [RAIOS[0], 0, 'x'], [RAIOS[0] + 2, 6, 'x'], [RAIOS[0] + 3, -70, 'o'], [RAIOS[0] + 10, 0, 'b'], [RAIOS[1], 0, 'x'], [RAIOS[1] + 2, 10, 'x'], [RAIOS[1] + 3, -110, 'o'], [RAIOS[1] + 12, 0, 'b']]);
  const sy = k(f, [[0, 1], [RAIOS[0], 1, 'x'], [RAIOS[0] + 2, .82, 'x'], [RAIOS[0] + 4, 1.2, 'io'], [RAIOS[0] + 10, .88, 'b'], [RAIOS[0] + 16, 1], [RAIOS[1], 1, 'x'], [RAIOS[1] + 2, .78, 'x'], [RAIOS[1] + 4, 1.25, 'io'], [RAIOS[1] + 11, .86, 'b'], [110, 1, 'o'], [112, .8, 'h'], [113, .85, 'h'], [115, 1]]);
  const smear = f === 113 || f === 114 ? 1.25 : 1;
  const susto = fase === 'susto1' && f < 62 || fase === 'susto2';
  const treme = (fase === 'susto1' && f >= 56) || fase === 'arrisca' ? Math.sin(f * 3.1) * 2.5 : 0;
  const escH = escY(yW);
  const tr = Math.sin(f * 2.7) * 4; // as mãos tremendo na boca
  const giroPe = (no) => fase === 'entra' ? (no ? 22 : 35) : fase === 'arrisca' ? (no ? 10 : 18) : fase === 'foge' ? (no ? 0 : 20) : 0;
  const pesoSy = pontaDosPes && W ? ((W.t % 1) < .1 ? .95 : 1 + .04 * Math.sin((W.t % 1) * Math.PI)) : 1;
  const hosp = { x: xW + treme, y: yW + (W ? W.bob : 0) + pulo, esc: escH, sy: sy * pesoSy, sx: smear / Math.sqrt(sy * pesoSy),
    dir: fase === 'foge' ? -1 : 1, perfil: true, maosNaFrente: pontaDosPes || (fase === 'susto1' && f >= 62),
    r: fase === 'foge' ? -18 : susto ? -12 : pontaDosPes && W ? (fase === 'arrisca' ? 5 + 7 * Math.sin((W.t % 1) * Math.PI) : 4 + 12 * Math.sin((W.t % 1) * Math.PI)) : 4,
    cab: susto ? 10 : pontaDosPes && W ? -6 - 6 * Math.sin((W.t % 1) * Math.PI) : 0,
    cara: susto ? 'susto' : f >= 56 || fase === 'entra' ? 'medo' : 'cauto', suor: f >= 56,
    // mãos na boca (o medroso de 1930); no susto, braços para cima assimétricos; na fuga, braços de corrida
    bE: susto ? { a: 150, d: -20 } : pontaDosPes || fase === 'susto1' ? { a: -140 - tr, d: 24, c: 40 } : { a: 90 + (W ? W.bracoE * 1.6 : 0), d: 10 },
    bD: susto ? { a: 60, d: 30 } : pontaDosPes || fase === 'susto1' ? { a: -150 + tr, d: -24, c: 42 } : { a: 90 + (W ? W.bracoD * 1.6 : 0), d: 10 },
    pE: W ? { alvo: W.peE, d: W.noE ? 16 : 40, giro: giroPe(W.noE) } : { a: -8, d: 10, giro: fase === 'susto1' ? 22 : 0 },
    pD: W ? { alvo: W.peD, d: W.noD ? 16 : 40, giro: giroPe(W.noD) } : { a: 14, d: -10 } };

  // ── o Aurélio: escada de aproximação no MESMO mapa de profundidade do hóspede; só se move no escuro ──
  const degrau = f < RAIOS[0] ? 0 : f < RAIOS[1] ? 1 : 2;
  const aur = [{ x: 1250, esc: .9, y: 525 }, { x: 1010, esc: 1.05, y: 600 }, { x: xFimArrisca + 270, esc: escY(700), y: 700 }][degrau];
  const ombroHosp = [xW + 30 * escH, yW - 215 * escH];
  const POSES = [{ r: Math.sin(f * .07) * 1.5, cab: -4 + Math.sin(f * .09) * 4, bE: { a: 6, d: 6 }, bD: { a: 6, d: 6 } },
                 { r: -6, cab: -18, bE: { a: 10, d: 10 }, bD: { a: 40, d: 30, c: 120 } },
                 // curvado sobre ele: a garra POUSA no ombro do hóspede (até ele fugir), depois fica no ar chamando
                 { r: -12, cab: -26, bD: { a: 14, d: 10 }, bE: f < 112 ? { alvo: ombroHosp, d: -30 } : { a: 120 + Math.sin(f * .45) * 8, d: -40, c: 120 } }];
  const aurelio = { x: aur.x, y: aur.y, esc: aur.esc, resp: Math.sin(f * .12) * .015, olhos: Math.max(fl, degrau === 2 ? .8 : .2), garra: degrau === 2, ...POSES[degrau] };

  // ── câmera quase parada: um empurrão lento na tensão, tranco no trovão ──
  const z = 1.3; // câmera TRAVADA: a régua do quarto não muda; quem chega perto é o Aurélio
  const cx = 720;
  const cy = 450;
  // íris: abre no começo, fecha no fim em cima dos olhos do Aurélio (lá, no escuro, ele volta para longe)
  const iris = f < 8 ? k(f, [[0, 0, 'o'], [8, 1300]]) : f >= 132 ? k(f, [[132, 1300, 'o'], [143, 0]]) : 1300;
  const irisC = f < 8 ? [230, 400] : [aur.x - 4, aur.y - 300 * aur.esc];
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
      <Sombra x={aur.x} y={aur.y + 4} rx={60 * aur.esc} o={.55} /><Sombra x={xW} y={yW + 4} rx={46 * escH * (1 - .25 * Math.max(0, -(W ? W.bob : 0) / 18) - Math.max(0, -pulo) / 300)} ry={12} o={.4} />
      {/* fuga: riscos de velocidade e poeira atrás dele */}
      {fase === 'foge' && f < 132 && <g>{[0, 1, 2].map((i) => <path key={i} d={`M${xW + 70},${yW - 200 + i * 50}h${120 + i * 40}`} stroke="#fff3b0" strokeWidth="8" strokeLinecap="round" opacity=".8" />)}
        {[0, 1].map((i) => <circle key={`p${i}`} cx={xW + 60 + i * 40} cy={yW - 6} r={14 + ((f + i * 5) % 10) * 2} fill="#cbb89a" opacity=".6" stroke="#1a1220" strokeWidth="3" />)}</g>}
      <g filter={fl > 0 ? 'url(#silhueta)' : undefined}>
        <Ator f={f} luz={false}>
          <g filter={fl > 0 ? undefined : 'url(#aroAurelio)'}><AurelioRig pose={aurelio} f={f} /></g>
          <HospedeRig pose={hosp} />
        </Ator>
      </g>
      <Ator f={f} luz={false}><Fala x={Math.min(Math.max(aur.x - 120, 105 + 230), 1335 - 230)} y={aur.y - 300 * aur.esc - 10} t="VOCÊ TAMBÉM?" w={420} tam={50} cauda={.7} esc={k(f, [[0, 0, 'h'], [108, 0, 'b'], [113, 1, 'h'], [130, 1, 'i'], [134, 0]])} /></Ator>
      {/* espigões de susto */}
      {susto && (fase === 'susto2' ? [-2, -1, 0, 1, 2] : [-1, 0, 1]).map((i) => <path key={i} d={`M${xW + i * 36},${yW - 330 * escH * sy + pulo}l${i * 18},${fase === 'susto2' ? -64 : -34}`} stroke="#fff3b0" strokeWidth={fase === 'susto2' ? 10 : 7} strokeLinecap="round" />)}
      {/* íris */}
      <path fillRule="evenodd" fill="#000" d={`M-500,-400H2100V1200H-500Z M${irisC[0] - iris},${irisC[1]}a${iris},${iris},0,1,0,${iris * 2},0a${iris},${iris},0,1,0,${-iris * 2},0Z`} />
    </Palco>
  );
}
