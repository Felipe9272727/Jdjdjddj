/**
 * CarregandoAndares — cenas de carregamento FORA do saguão, cada uma num andar, com os personagens dele:
 *
 *   ANDAR 6  — Suíte 612: chuva e relâmpago na janela; Aurélio Campos, o hóspede que sabia demais, de
 *              sobretudo, imóvel. O hóspede (cabelo de bacon) entra na ponta dos pés… e a cada relâmpago o
 *              Aurélio está mais perto.
 *   ANDAR 7  — O convés: ondas e vela; o Capitão gira o timão (HAR HAR!), o TROCO-64 esfrega o convés e
 *              leva uma onda na cara, e uma gaivota rouba o tricórnio.
 *   ANDAR 8  — O arquivo: o Arquivista carimba fichas (ARQUIVADO!) enquanto o Diabrete do andar 3 rabisca a
 *              foto dele; quando o Arquivista vira, o Diabrete vira estátua dentro de uma caixa-arquivo.
 *   ANDAR 12 — O céu: a cidade nas nuvens ao pôr do sol; a Cabeça de quepe de concierge abre a boca e cospe,
 *              e o TROCO-63 desvia no biplano.
 *
 * Mesmas regras de CarregandoCenas (helpers de lá): só SVG + CSS em transform/opacity, laço de D s,
 * `--off` congela. O cenário cobre a tela inteira em duas artes (paisagem `.oh`, retrato `.ov`); os
 * atores andam no palco em unidades --u (paisagem 1600×760, retrato 780×1600).
 */
import React, { memo } from 'react';
import { Robo, P64, Defs, Pt, Golpe, K, OURO, OURO_E, FONTE, L, registrarCenas } from './CarregandoAnimado';
import { an, tr, rot, op, pop, vis, pos, PV, passos, ROSTOS, Fala, respira, pisca, balanco, tranco, poeira, Poeira, D, type Q } from './CarregandoCenas';
import { assar, ferve, ginga, pernas, pulo, susto, tremor } from './cnMotor';

/** Plano de câmera no palco 1600×760: centro (cx, cy) com zoom z. */
export const plano = (cx: number, cy: number, z: number) => ({ x: (800 - cx * z) / 16, y: (380 - cy * z) / 7.6, sx: z, sy: z });
/** O mesmo plano para uma câmera que embrulha a TELA inteira (cenário de fundo junto), pivô no centro.
 *  Em paisagem a tela tem a proporção do palco, então o ponto (cx, cy) do palco vai para o meio. */
export const planoTela = (cx: number, cy: number, z: number) => {
  // nunca passa da borda do cenário: com zoom z o deslocamento máximo é (z-1)/2 da tela
  const lim = (z - 1) / 2 * 100, c = (v: number) => Math.max(-lim, Math.min(lim, v));
  return { x: c(-z * (cx - 800) / 16), y: c(-z * (cy - 380) / 7.6), sx: z, sy: z };
};

/** O cenário: arte de paisagem e de retrato, cada uma só na sua orientação. */
const Cenario: React.FC<{ h: React.ReactNode; v: React.ReactNode; fundo: string }> = ({ h, v, fundo }) => (
  <div className="p" style={{ background: fundo }}>
    <div className="p oh"><svg viewBox="0 0 1600 760" preserveAspectRatio="xMidYMid slice" aria-hidden="true">{h}</svg></div>
    <div className="p ov"><svg viewBox="0 0 780 1600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">{v}</svg></div>
  </div>
);
const ORIENT = '.cna .ov{display:none}@media(orientation:portrait){.cna .oh{display:none}.cna .ov{display:block}}';
// ── OS PERSONAGENS ───────────────────────────────────────────────────────────
/** O hóspede (o avatar "cabelo de bacon"): camisa azul, calça verde. Caixa 160×300. */
const HB = '0 0 160 300';
const Hospede = {
  pernaE: <g {...L}><path d="M66,200L60,282" stroke="#3d6b35" strokeWidth="24" /><path d="M44,286H74" stroke="#2a2118" strokeWidth="16" /></g>,
  pernaD: <g {...L}><path d="M94,200L100,282" stroke="#2b4d24" strokeWidth="24" /><path d="M88,286H118" stroke="#2a2118" strokeWidth="16" /></g>,
  corpo: <g {...L}><path d="M44,120Q44,96,80,94Q116,96,116,120V206H44Z" fill="#3b6fb0" /><path d="M66,96L80,112L94,96" fill="none" stroke="#2c5489" strokeWidth="5" /><path d="M58,140Q80,150,102,140" fill="none" stroke="#2c5489" strokeWidth="4" /></g>,
  bracoE: <g {...L}><path d="M50,112Q34,150,38,186" fill="none" stroke="#2c5489" strokeWidth="22" /><circle cx="38" cy="192" r="11" fill="#e8b48a" /></g>,
  bracoD: <g {...L}><path d="M110,112Q126,150,122,186" fill="none" stroke="#3b6fb0" strokeWidth="22" /><circle cx="122" cy="192" r="11" fill="#e8b48a" /></g>,
  cabeca: <g {...L}>
    <rect x="50" y="34" width="60" height="64" rx="18" fill="#e8b48a" />
    <path d="M44,58Q42,24,80,22Q120,24,116,60Q104,40,92,46Q84,34,72,44Q60,36,44,58Z" fill="#7a4a24" />
    <path d="M70,86Q80,91,90,86" fill="none" strokeWidth="4" />
  </g>,
  olhos: <g stroke="none"><ellipse cx="68" cy="66" rx="4.5" ry="5.5" fill={K} /><ellipse cx="92" cy="66" rx="4.5" ry="5.5" fill={K} /><circle cx="69.5" cy="64" r="1.6" fill="#fff" /><circle cx="93.5" cy="64" r="1.6" fill="#fff" /></g>,
  susto: <g {...L}><rect x="52" y="54" width="56" height="24" fill="#e8b48a" stroke="none" /><circle cx="68" cy="64" r="9" fill="#fff" strokeWidth="3" /><circle cx="92" cy="64" r="9" fill="#fff" strokeWidth="3" /><circle cx="68" cy="65" r="3.2" fill={K} stroke="none" /><circle cx="92" cy="65" r="3.2" fill={K} stroke="none" /><rect x="60" y="80" width="40" height="16" fill="#e8b48a" stroke="none" /><ellipse cx="80" cy="88" rx="7" ry="9" fill="#5a1a1a" /><path d="M50,40L44,30M110,40L116,30M80,24V14" stroke={K} strokeWidth="4" /></g>,
  suor: <g {...L} strokeWidth="3"><path d="M116,50Q122,62,116,66Q110,62,116,50Z" fill="#bfe9ff" /></g>,
};
/** Aurélio Campos: alto, magro, sobretudo azul-meia-noite de gola alta, chapéu baixo. Caixa 180×400. */
const AB = '0 0 180 400';
const Aurelio = {
  corpo: <g {...L}>
    <path d="M60,130Q50,120,90,114Q130,120,120,130L136,380H44Z" fill="#1d2840" />
    <path d="M90,132V380" stroke="#121a2c" strokeWidth="4" />
    <path d="M60,128L90,176L120,128L112,108L90,140L68,108Z" fill="#26324f" />
    {[180, 230, 280].map((y) => <circle key={y} cx="104" cy={y} r="4" fill="#8a96b0" strokeWidth="2.5" />)}
    <path d="M58,388H84M96,388H122" stroke="#0d0f16" strokeWidth="12" />
  </g>,
  braco: <g {...L}><path d="M120,138Q138,200,132,262" fill="none" stroke="#1d2840" strokeWidth="24" /><circle cx="132" cy="270" r="11" fill="#d8cfc2" /></g>,
  cabeca: <g {...L}>
    <path d="M66,62Q64,112,90,118Q116,112,114,62Z" fill="#d8cfc2" />
    <path d="M74,86H84M96,86H106" strokeWidth="4" /><circle cx="80" cy="90" r="2.6" fill={K} stroke="none" /><circle cx="100" cy="90" r="2.6" fill={K} stroke="none" />
    <path d="M84,104H96" strokeWidth="3.5" />
    <path d="M40,66Q90,52,140,66Q132,74,90,72Q48,74,40,66Z" fill="#141a2a" />
    <path d="M62,64Q60,34,90,30Q120,34,118,64Z" fill="#1d2840" /><path d="M62,58H118" stroke="#3a4766" strokeWidth="6" />
  </g>,
  olhar: <g {...L}><circle cx="80" cy="90" r="4.2" fill="#e8f0ff" strokeWidth="2" /><circle cx="100" cy="90" r="4.2" fill="#e8f0ff" strokeWidth="2" /></g>,
  bainha: <g {...L}><path d="M50,330L44,380H136L130,330Z" fill="#1d2840" /><path d="M90,330V380" stroke="#121a2c" strokeWidth="4" /></g>,
  mao: <g {...L}><path d="M50,138Q34,180,44,226" fill="none" stroke="#1d2840" strokeWidth="24" /><circle cx="46" cy="234" r="11" fill="#d8cfc2" /></g>,
};
/** O Capitão: casaca vermelha de galões, tricórnio, barba preta, tapa-olho. Caixa 260×360. */
const CB = '0 0 260 360';
const Capitao = {
  corpo: <g {...L}>
    <path d="M70,150Q70,124,130,120Q190,124,190,150L204,330H56Z" fill="#9e1b22" />
    <path d="M96,128L130,200L164,128" fill="#f1e6cc" />
    <path d="M56,300H204" stroke={OURO} strokeWidth="8" /><path d="M130,200V330" stroke={OURO_E} strokeWidth="5" />
    {[220, 250, 280].map((y) => <circle key={y} cx="144" cy={y} r="6" fill={OURO} strokeWidth="3" />)}
    <path d="M90,344H120M140,344H170" stroke="#1c1510" strokeWidth="16" />
  </g>,
  bracoE: <g {...L}><path d="M76,140Q52,190,60,236" fill="none" stroke="#9e1b22" strokeWidth="28" /><path d="M52,226H70" stroke={OURO} strokeWidth="10" /><circle cx="62" cy="248" r="14" fill="#e0b58e" /></g>,
  bracoD: <g {...L}><path d="M184,140Q208,190,200,236" fill="none" stroke="#9e1b22" strokeWidth="28" /><path d="M190,226H208" stroke={OURO} strokeWidth="10" /><circle cx="198" cy="248" r="14" fill="#e0b58e" /></g>,
  cabeca: <g {...L}>
    <rect x="94" y="56" width="72" height="74" rx="24" fill="#e0b58e" />
    <path d="M90,100Q96,150,130,152Q164,150,170,100Q150,118,130,116Q110,118,90,100Z" fill="#1a1412" />
    <path d="M104,84Q116,76,126,84" fill="none" strokeWidth="4" /><circle cx="148" cy="88" r="5" fill={K} stroke="none" />
    <path d="M100,72L160,96" strokeWidth="4" /><ellipse cx="114" cy="88" rx="11" ry="9" fill={K} />
    <path d="M116,112Q130,122,144,112" fill="none" stroke="#f1e6cc" strokeWidth="5" />
  </g>,
  riso: <g {...L}><path d="M112,108Q130,138,148,108Z" fill="#7a1418" /><path d="M116,110H144" stroke="#fff" strokeWidth="4" /></g>,
  chapeu: <g {...L}>
    <path d="M70,66Q130,20,190,66Q170,44,130,48Q90,44,70,66Z" fill="#14100e" />
    <path d="M80,62Q130,6,180,62Q160,70,130,66Q100,70,80,62Z" fill="#14100e" /><path d="M84,60Q130,52,176,60" fill="none" stroke={OURO} strokeWidth="5" />
    <circle cx="130" cy="44" r="8" fill="#f1e6cc" strokeWidth="3" />
  </g>,
};
/** O Arquivista: senhor de óculos redondos, colete marrom, mangas arregaçadas. Caixa 240×300 (atrás da mesa). */
const RB = '0 0 240 300';
const Arquivista = {
  corpo: <g {...L}>
    <path d="M58,170Q58,136,120,132Q182,136,182,170V300H58Z" fill="#cfc4a8" />
    <path d="M78,140L92,300H148L162,140Q140,150,120,150Q100,150,78,140Z" fill="#3c3328" />
    <path d="M120,150L112,176L120,200L128,176Z" fill="#7a2f1f" />
  </g>,
  bracoE: <g {...L}><path d="M64,160Q40,210,58,252" fill="none" stroke="#cfc4a8" strokeWidth="26" /><circle cx="60" cy="258" r="13" fill="#c2a381" /></g>,
  bracoD: <g {...L}>
    <path d="M176,160Q204,206,188,250" fill="none" stroke="#cfc4a8" strokeWidth="26" /><circle cx="188" cy="256" r="13" fill="#c2a381" />
    <rect x="174" y="258" width="28" height="30" rx="5" fill="#5a3010" /><rect x="168" y="286" width="40" height="12" rx="3" fill="#7a2f1f" />
  </g>,
  cabeca: <g {...L}>
    <rect x="86" y="52" width="68" height="80" rx="26" fill="#c2a381" />
    <path d="M82,84Q78,40,120,38Q162,40,158,84Q150,62,120,64Q90,62,82,84Z" fill="#9a9288" />
    <circle cx="106" cy="94" r="11" fill="#e8eef5" fillOpacity=".7" strokeWidth="4" /><circle cx="134" cy="94" r="11" fill="#e8eef5" fillOpacity=".7" strokeWidth="4" /><path d="M117,94H123" strokeWidth="4" />
    <circle cx="106" cy="95" r="3" fill={K} stroke="none" /><circle cx="134" cy="95" r="3" fill={K} stroke="none" />
    <path d="M108,118Q120,112,132,118" fill="none" strokeWidth="4" /><path d="M100,112Q120,104,140,112" fill="none" stroke="#9a9288" strokeWidth="7" />
  </g>,
  bravo: <g {...L}><path d="M94,80L114,86M146,80L126,86" strokeWidth="5" /></g>,
};
/** O Diabrete (andar 3): borracha 1930, preto, olhos de torta, luvas brancas, pincel. Caixa 180×280. */
const DB = '0 0 180 280';
const Diabrete = {
  corpo: <g {...L}>
    <path d="M60,150Q50,250,64,262M120,150Q130,250,116,262" fill="none" stroke={K} strokeWidth="16" />
    <ellipse cx="62" cy="266" rx="18" ry="9" fill={K} /><ellipse cx="118" cy="266" rx="18" ry="9" fill={K} />
    <path d="M56,110Q90,94,124,110Q132,160,90,166Q48,160,56,110Z" fill={K} />
    <path d="M124,150Q166,160,160,120Q156,104,166,98" fill="none" stroke={K} strokeWidth="6" /><path d="M160,92L176,96L164,108Z" fill={K} />
  </g>,
  braco: <g {...L}>
    <path d="M122,118Q150,110,156,84" fill="none" stroke={K} strokeWidth="10" /><circle cx="158" cy="78" r="13" fill="#fff" strokeWidth="5" />
    <path d="M160,72L172,30" stroke="#a0522d" strokeWidth="8" /><path d="M168,34L180,6L162,24Z" fill="#e63a2e" strokeWidth="4" />
  </g>,
  cabeca: <g {...L}>
    <path d="M54,40L46,8L70,30Z" fill={K} /><path d="M126,40L134,8L110,30Z" fill={K} />
    <circle cx="90" cy="70" r="44" fill={K} />
    <path d="M58,62Q90,50,122,62Q126,104,90,108Q54,104,58,62Z" fill="#f4e8d0" stroke="none" />
    <ellipse cx="76" cy="66" rx="9" ry="13" fill="#fff" strokeWidth="3.5" /><path d="M76,58V76L82,70Z" fill={K} stroke="none" />
    <ellipse cx="104" cy="66" rx="9" ry="13" fill="#fff" strokeWidth="3.5" /><path d="M104,58V76L110,70Z" fill={K} stroke="none" />
    <path d="M66,88Q90,108,114,88" fill="#fff" strokeWidth="4" />
  </g>,
};
/** A Cabeça do andar 12: plástico chapado, quepe de concierge azul-petróleo; mandíbula separada. Caixa 420×440. */
const ZB = '0 0 420 440';
const Cabeca = {
  cranio: <g {...L} strokeWidth="8">
    <path d="M70,170Q70,70,210,64Q350,70,350,170V292H70Z" fill="#c9b8a6" />
    <ellipse cx="148" cy="196" rx="34" ry="24" fill="#fffaf0" /><ellipse cx="272" cy="196" rx="34" ry="24" fill="#fffaf0" />
    <circle cx="154" cy="198" r="13" fill={K} stroke="none" /><circle cx="266" cy="198" r="13" fill={K} stroke="none" />
    <path d="M112,160L184,172M308,160L236,172" strokeWidth="11" />
    <path d="M210,206L196,252H224Z" fill="#b8a492" />
    <path d="M60,104Q210,20,360,104L350,128Q210,84,70,128Z" fill="#173b45" />
    <path d="M90,60Q210,0,330,60L350,104Q210,40,70,104Z" fill="#1d4a57" />
    <path d="M44,124Q210,92,376,124Q360,150,210,142Q60,150,44,124Z" fill="#0f2a32" />
    <path d="M160,54H260V82H160Z" fill={OURO} strokeWidth="6" /><text x="210" y="77" textAnchor="middle" fontFamily={FONTE} fontSize="24" fill={K} stroke="none">13</text>
  </g>,
  boca: <g {...L} strokeWidth="8"><path d="M118,282H302V300Q210,316,118,300Z" fill="#3a0a10" /></g>,
  mandibula: <g {...L} strokeWidth="8"><path d="M96,292H324V340Q300,406,210,410Q120,406,96,340Z" fill="#c9b8a6" /><path d="M128,296H292" stroke="#fffaf0" strokeWidth="10" /></g>,
  goela: <g stroke="none"><ellipse cx="210" cy="320" rx="70" ry="40" fill="#ff7a3a" opacity=".85" /></g>,
};
/** O biplano do TROCO-63 (de lado, indo para a direita). Caixa 280×160. */
const BP = '0 0 280 160';
const Biplano = {
  corpo: <g {...L}>
    <path d="M20,40H230" stroke="#f1e6cc" strokeWidth="14" /><path d="M40,124H220" stroke="#f1e6cc" strokeWidth="14" />
    <path d="M70,46V118M190,46V118" strokeWidth="6" />
    <path d="M30,86Q36,64,90,64H220Q252,66,256,88Q252,108,220,110H90Q36,110,30,86Z" fill="#c8302a" />
    <path d="M20,74L44,62L44,110L20,100Z" fill="#c8302a" />
    <path d="M120,64V108" stroke="#f1e6cc" strokeWidth="6" />
    <rect x="98" y="44" width="40" height="30" rx="12" fill="#8cc4b4" /><rect x="104" y="50" width="28" height="16" rx="5" fill="#0c1716" />
    <circle cx="112" cy="58" r="3.5" fill="#75e6e0" stroke="none" /><circle cx="124" cy="58" r="3.5" fill="#75e6e0" stroke="none" />
  </g>,
  helice: <g {...L} strokeWidth="5"><ellipse cx="262" cy="88" rx="7" ry="44" fill="#f1e6cc" fillOpacity=".5" /><circle cx="262" cy="88" r="8" fill={OURO} /></g>,
};
const gaivota = <g {...L} strokeWidth="5"><path d="M10,30Q30,6,50,28Q70,6,90,30" fill="none" /><ellipse cx="50" cy="32" rx="10" ry="7" fill="#fff" /><path d="M58,32L68,34L58,37Z" fill="#ffb347" /></g>;

// ═══ ANDAR 6 — SUÍTE 612 ═════════════════════════════════════════════════════
const quarto = (W: number, H: number) => {
  const chao = H * .66, jx = W * .58, jw = W * .26;
  return <g {...L}>
    <rect width={W} height={chao} fill="#3a2e24" /><rect width={W} height={chao} fill="url(#a6-pp)" />
    <rect y={chao} width={W} height={H - chao} fill="#2a1d14" /><rect y={chao} width={W} height={H - chao} fill="url(#a6-tb)" stroke="none" />
    <rect y={chao - 18} width={W} height="22" fill="#4a3424" />
    <rect x={jx} y={H * .14} width={jw} height={H * .36} fill="url(#a6-nt)" />
    <path d={`M${jx + jw / 2},${H * .14}V${H * .5}M${jx},${H * .32}H${jx + jw}`} stroke="#5a4634" strokeWidth="12" />
    <rect x={jx - 14} y={H * .12} width={jw + 28} height={H * .4} fill="none" stroke="#5a4634" strokeWidth="18" />
    <rect x={jx - 26} y={H * .52} width={jw + 52} height="16" fill="#5a4634" />
    <path d={`M${W * .08},${chao}V${H * .3}H${W * .2}V${chao}`} fill="#2e2219" strokeWidth="8" />
    <rect x={W * .1} y={H * .33} width={W * .08} height={chao - H * .33} fill="#1a120c" />
    <circle cx={W * .17} cy={(chao + H * .33) / 2} r="7" fill={OURO} />
    {/* a cama e o criado-mudo (fundo) */}
    <rect x={W * .3} y={chao - H * .12} width={W * .18} height={H * .12} rx="10" fill="#6e1f24" />
    <rect x={W * .3} y={chao - H * .16} width={W * .05} height={H * .16} rx="6" fill="#4a3424" />
    <rect x={W * .31} y={chao - H * .145} width={W * .06} height={H * .035} rx="10" fill="#efe3c8" />
  </g>;
};
const chuva = (W: number, H: number) => <g stroke="#9ab4d6" strokeWidth="3" opacity=".6">
  {Array.from({ length: 22 }, (_, i) => <path key={i} d={`M${W * .585 + (i * 37) % (W * .25)},${H * .15 + (i * 53) % (H * .33)}l-8,22`} />)}
</g>;
/** As cortinas (cada lado balança com a corrente de ar da janela). */
const cortina = (lado: number) => <g {...L} strokeWidth="5"><path d={lado < 0 ? 'M10,0H70Q60,120,80,240Q50,250,20,236Q4,120,10,0Z' : 'M50,0H110Q116,120,100,236Q70,250,40,240Q60,120,50,0Z'} fill="#7a1c22" /><path d={lado < 0 ? 'M30,10Q26,120,40,236' : 'M90,10Q94,120,80,236'} fill="none" stroke="#4a0e14" strokeWidth="4" /></g>;
const RELAMPAGOS = [2.9, 6.4];
const CSS6 = [
  ORIENT,
  pos('a6h', [260, 720, 216, 405], [90, 1360, 200, 375]),
  pos('a6a', [990, 700, 240, 533], [450, 1240, 220, 489]),
  pos('a6-abw', [820, 250, 360, 144], [380, 660, 380, 152]),
  pos('a6-ce', [880, 400, 120, 250], [400, 830, 110, 230]), pos('a6-cd', [1360, 400, 120, 250], [690, 830, 110, 230]),
  pos('a6-lu', [740, 110, 120, 220], [330, 300, 120, 220]),
  // a chuva escorre em laço curto (0,5 s) e o quarto treme no trovão
  an('a6-cv', null, [[0, tr(0, -6), 'l'], [.5, tr(0, 6)]], 0, .5),
  vis('a6-rl', RELAMPAGOS.flatMap((t): [number, number][] => [[t, t + .08], [t + .2, t + .3]])),
  tranco('a6-qt', RELAMPAGOS.map((t) => t + .35), .8),
  // as cortinas respiram com a corrente de ar; a luminária pendente balança e a luz vai junto
  an('a6-ce', '50% 0%', [[0, 'transform:skewX(0deg)'], [1.6, 'transform:skewX(4deg)'], [3.2, 'transform:skewX(-1deg)'], [3.4, 'transform:skewX(8deg)', 'o'], [5, 'transform:skewX(0deg)'], [6.9, 'transform:skewX(9deg)', 'o'], [8.4, 'transform:skewX(2deg)']]),
  an('a6-cd', '50% 0%', [[0, 'transform:skewX(0deg)'], [1.8, 'transform:skewX(-3deg)'], [3.4, 'transform:skewX(-8deg)', 'o'], [5.2, 'transform:skewX(0deg)'], [6.9, 'transform:skewX(-9deg)', 'o'], [8.6, 'transform:skewX(-2deg)']]),
  an('a6-lu', '50% 0%', [[0, rot(-5)], [1.25, rot(5)], [2.5, rot(-5)], [3.3, rot(9), 'o'], [4.6, rot(-7)], [5.9, rot(5)], [6.8, rot(-10), 'o'], [8.2, rot(6)], [9.2, rot(-4)]]),
  an('a6-es', null, [[0, op(.2)], [1.2, op(.2), 'h'], [1.25, op(.6), 'h'], [1.32, op(.2)], [4.6, op(.2), 'h'], [4.65, op(.65), 'h'], [4.82, op(.2)], [8.6, op(.2)], [8.62, op(.72), 'h'], [9.1, op(.72)], [9.4, op(.2)]]),
  // O HÓSPEDE: passos na ponta dos pés (corpo sobe no meio do passo), para, ESTICA o pescoço;
  // no relâmpago dá um pulo de susto (antecipa, estica, cai amassando) e recua devagar; no 2º, foge
  // ── REFEITO no cnMotor (lisa) ── o hóspede: entra na ponta dos pés (passos largos, corpo alto), estica o
  // pescoço; no 1º relâmpago: take de susto enorme e recua tremendo; no 2º: pula e FOGE em disparada.
  assar('a6hc', '50% 96%', D, (tl, a) => {
    tl.set(a, { x: -140 }, 0).to(a, { o: 1, duration: .2 }, .3)
      .to(a, { x: -4, duration: 2.2, ease: 'sine.inOut' }, .3)
      .to(a, { sy: 1.06, sx: .96, duration: .3, ease: 'sine.out' }, 2.55);                         // estica o pescoço para espiar
    susto(tl, a, 2.95, { alt: 9 });
    tl.to(a, { x: -10, duration: .2, ease: 'power2.out' }, 3.1)
      .to(a, { x: 36, duration: 1.9, ease: 'sine.inOut' }, 3.9);                                    // arrisca de novo, devagarinho
    for (let t = 3.6, i = 0; t < 3.9; t += .06, i++) tl.to(a, { r: i % 2 ? 1.5 : -1.5, duration: .03 }, t);
    pulo(tl, a, 6.42, { alt: 30, voo: .45 });
    tl.to(a, { x: 46, duration: .15, ease: 'power2.out' }, 7.0)                                     // antecipação da fuga
      .to(a, { x: -210, r: -8, duration: 1.4, ease: 'power3.in' }, 7.2)
      .set(a, { o: 0 }, 8.7).set(a, { x: -140, r: 0 }, 8.8);
  }, { inicial: { o: 0 } }),
  assar('a6hb', '50% 96%', D, (tl, a) => {
    ginga(tl, a, .3, 2.5, { passo: .55, alt: 4, gir: 2 });                                         // ponta dos pés: passo longo, alto
    ginga(tl, a, 3.9, 5.8, { passo: .63, alt: 3, gir: 1.5 });
    ginga(tl, a, 7.2, 8.6, { passo: .2, alt: 5, gir: 4 });                                         // disparada
  }),
  ...([['a6hpe', 0], ['a6hpd', 1]] as const).map(([c, f]) => assar(c, '50% 66%', D, (tl, a) => {
    pernas(tl, a, .3, 2.5, { passo: .55, ang: 22, fase: f }); pernas(tl, a, 3.9, 5.8, { passo: .63, ang: 18, fase: f }); pernas(tl, a, 7.2, 8.6, { passo: .2, ang: 38, fase: f });
  })),
  ...([['a6hbe', 1], ['a6hbd', -1]] as const).map(([c, g]) => assar(c, c === 'a6hbe' ? '31% 37%' : '69% 37%', D, (tl, a) => {
    for (let t = .3, i = 0; t < 2.5; t += .275, i++) tl.to(a, { r: g * (i % 2 ? 22 : -10), duration: .275, ease: 'sine.inOut' }, t);  // braços de "pé ante pé"
    tl.to(a, { r: g * -10, duration: .1 }, 2.95).to(a, { r: g * 95, duration: .2, ease: 'back.out(2.5)' }, 3.05).to(a, { r: g * 45, duration: .5, ease: 'sine.inOut' }, 3.5)
      .to(a, { r: 0, duration: .4 }, 3.95).to(a, { r: g * 110, duration: .2, ease: 'back.out(2.5)' }, 6.5);
    for (let t = 7.2, i = 0; t < 8.6; t += .1, i++) tl.to(a, { r: g * (i % 2 ? 140 : 80), duration: .1, ease: 'none' }, t);          // braços se debatendo
    tl.to(a, { r: 0, duration: .2 }, 8.7);
  })),
  an('a6hk', '50% 30%', [[0, rot(0)], [2.7, rot(0), 'o'], [2.85, tr(4, -6, 8)], [3.0, rot(-4)], [3.6, rot(-4), 'i'], [4.2, rot(10)], [5.8, rot(10)], [6.2, rot(-8)]]),
  pisca('a6ho', '50% 22%', [1.1, 2.2, 4.4, 5.3]),
  vis('a6hs', [[2.95, 3.9], [6.45, 8.7]]), vis('a6hz', [[3.4, 5.6], [7.0, 8.6]]),
  an('a6hzd', '72% 18%', [[0, tr(0, 0)], [3.4, tr(0, 0)], [4.4, tr(0, 22)], [4.45, tr(0, 0)], [5.5, tr(0, 22)], [7.0, tr(0, 0)], [7.8, tr(0, 22)]]),
  // O AURÉLIO: respira devagar (nunca para), a bainha balança; a cabeça vira MUITO devagar,
  // e a cada relâmpago ele está mais perto — no segundo já erguendo a mão
  respira('a6ab', '50% 96%', 3.2, .018),
  an('a6ac', '50% 96%', [[0, tr()], [RELAMPAGOS[0] + .07, tr(), 'h'], [RELAMPAGOS[0] + .08, tr(-60)], [RELAMPAGOS[1] + .07, tr(-60), 'h'], [RELAMPAGOS[1] + .08, tr(-115, 0, 0, 1.14, 1.14)], [9.3, tr(-115, 0, 0, 1.14, 1.14)], [9.5, `${tr(-115, 0, 0, 1.14, 1.14)};${op(0)}`], [9.7, `${tr()};${op(0)}`], [10, `${tr()};${op(1)}`]]),
  an('a6ak', '50% 22%', [[0, rot(0)], [1.2, rot(0), 'i'], [2.7, rot(-14)], [RELAMPAGOS[0] + .07, rot(-14), 'h'], [RELAMPAGOS[0] + .08, rot(-20)], [5.6, rot(-20), 'i'], [6.3, rot(-8)], [RELAMPAGOS[1] + .08, rot(-24)], [8.4, rot(-24), 'i'], [9.2, rot(-30)]]),
  an('a6am', '30% 34%', [[0, rot(0)], [RELAMPAGOS[1] + .07, rot(0), 'h'], [RELAMPAGOS[1] + .08, rot(20)], [7.2, rot(20), 'i'], [8.2, rot(58)], [9.3, rot(58)]]),
  an('a6ah', '50% 0%', [[0, 'transform:skewX(0deg)'], [1.6, 'transform:skewX(2deg)'], [3.4, 'transform:skewX(-5deg)', 'o'], [5, 'transform:skewX(1deg)'], [6.9, 'transform:skewX(-6deg)', 'o'], [8.4, 'transform:skewX(1deg)']]),
  pisca('a6ap', '50% 22%', [1.8, 4.9]),
  vis('a6ao', [[3.0, 9.4]]),
  pop('a6-ab', [7.6], 1.5),
  // câmera de terror: empurra devagar; no relâmpago CORTA para perto do Aurélio
  assar('a6-cam', '50% 50%', D, (tl, a) => {
    tl.set(a, planoTela(640, 470, 1.25), 0).to(a, { ...planoTela(560, 470, 1.55), duration: 2.6, ease: 'sine.inOut' }, .2)
      .set(a, planoTela(1060, 400, 1.9), RELAMPAGOS[0] + .08).to(a, { ...planoTela(900, 420, 1.5), duration: .6, ease: 'power2.inOut' }, RELAMPAGOS[0] + .9)
      .to(a, { ...planoTela(760, 440, 1.6), duration: 2, ease: 'sine.inOut' }, 4.2)
      .set(a, planoTela(940, 380, 2.1), RELAMPAGOS[1] + .08).to(a, { ...planoTela(700, 440, 1.3), duration: .5, ease: 'power2.out' }, 7.1)
      .to(a, { ...planoTela(640, 470, 1.25), duration: .8, ease: 'sine.inOut' }, 9.1);
  }),
].join('');
const Suite612 = memo(function Suite612() {
  return (
    <>
      <Defs />
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
        <pattern id="a6-pp" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M30,8Q40,30,30,52Q20,30,30,8Z" fill="#4a3b2c" /></pattern>
        <pattern id="a6-tb" width="160" height="40" patternUnits="userSpaceOnUse"><path d="M0,39H160M80,0V40" stroke="#1d140d" strokeWidth="3" /></pattern>
        <linearGradient id="a6-nt" x2="0" y2="1"><stop offset="0" stopColor="#0b1424" /><stop offset="1" stopColor="#1d2b48" /></linearGradient>
        <radialGradient id="a6-lz" cx=".5" cy=".1" r=".9"><stop offset="0" stopColor="#ffd98a" stopOpacity=".55" /><stop offset="1" stopColor="#ffd98a" stopOpacity="0" /></radialGradient>
      </defs></svg>
      <style>{CSS6}</style>
      <div className="p a6-cam"><div className="p a6-qt">
        <Cenario fundo="#1a120c" h={quarto(1600, 760)} v={quarto(780, 1600)} />
        <div className="p oh a6-cv"><svg viewBox="0 0 1600 760" preserveAspectRatio="xMidYMid slice">{chuva(1600, 760)}</svg></div>
        <div className="p ov a6-cv"><svg viewBox="0 0 780 1600" preserveAspectRatio="xMidYMid slice">{chuva(780, 1600)}</svg></div>
        <div className="pal"><div className="sh">
          <div className="e a6-ce"><Pt vb="0 0 120 250">{cortina(-1)}</Pt></div>
          <div className="e a6-cd"><Pt vb="0 0 120 250">{cortina(1)}</Pt></div>
          <div className="e a6-lu"><Pt vb="0 0 120 220"><path d="M60,0V60" stroke={K} strokeWidth="4" /><path d="M30,90Q60,40,90,90Z" fill="#7a5a2a" stroke={K} strokeWidth="5" /><ellipse cx="60" cy="150" rx="70" ry="80" fill="url(#a6-lz)" /></Pt></div>
          <div className="e a6a"><div className="p a6ac"><div className="p a6ab">
            <Pt c="a6ah" vb={AB}>{Aurelio.bainha}</Pt>
            <Pt vb={AB}>{Aurelio.corpo}</Pt><Pt vb={AB}>{Aurelio.braco}</Pt>
            <Pt c="a6am" vb={AB}>{Aurelio.mao}</Pt>
            <Pt c="a6ak" vb={AB}>{Aurelio.cabeca}<g className="a6ap">{Aurelio.olhar}</g><g className="a6ao">{Aurelio.olhar}</g></Pt>
          </div></div></div>
          <div className="e a6h"><div className="p a6hc"><div className="p a6hb">
            <Pt c="a6hpd" vb={HB}>{Hospede.pernaD}</Pt><Pt c="a6hpe" vb={HB}>{Hospede.pernaE}</Pt>
            <Pt c="a6hbe" vb={HB}>{Hospede.bracoE}</Pt>
            <Pt vb={HB}>{Hospede.corpo}</Pt>
            <Pt c="a6hbd" vb={HB}>{Hospede.bracoD}</Pt>
            <Pt c="a6hk" vb={HB}>{Hospede.cabeca}<g className="a6ho">{Hospede.olhos}</g><g className="a6hs">{Hospede.susto}</g><g className="a6hz"><g className="a6hzd">{Hospede.suor}</g></g></Pt>
          </div></div></div>
          <div className="e a6-abw"><Fala c="a6-ab" t="VOCÊ TAMBÉM?" w={300} /></div>
        </div></div>
      </div></div>
      {/* a luz que falha e o relâmpago, por cima de tudo */}
      <div className="p a6-es" style={{ background: '#05070c' }} />
      <div className="p a6-rl" style={{ background: '#6f84b8', mixBlendMode: 'screen' }} />
    </>
  );
});

// ═══ ANDAR 7 — O CONVÉS ══════════════════════════════════════════════════════
const mar = (W: number, H: number) => {
  const hz = H * .42;
  return <g {...L}>
    <rect width={W} height={hz} fill="#8fc3e6" /><circle cx={W * .8} cy={hz * .35} r={H * .07} fill="#fff3b0" stroke="none" />
    <rect y={hz} width={W} height={H - hz} fill="#1f6f9c" stroke="none" />
    <path d={`M0,${hz}H${W}`} strokeWidth="5" />
  </g>;
};
const ondas = (W: number, H: number, y: number, cor: string) => {
  const n = Math.ceil(W / 120) + 3;
  return <path d={`M-240,${H * y}` + Array.from({ length: n }, (_, i) => `q60,-26,120,0`).join('') + `V${H}H-240Z`} fill={cor} stroke={K} strokeWidth="5" strokeLinejoin="round" />;
};
const conves = (W: number, H: number) => {
  const y = H * .72;
  return <g {...L}>
    <path d={`M0,${y}H${W}V${H}H0Z`} fill="#8a5a32" />
    {Array.from({ length: Math.ceil(W / 90) }, (_, i) => <path key={i} d={`M${i * 90},${y}V${H}`} stroke="#5a3a1e" strokeWidth="4" />)}
    <path d={`M0,${y - 60}H${W}`} stroke="#5a3a1e" strokeWidth="16" />
    {Array.from({ length: Math.ceil(W / 70) }, (_, i) => <path key={i} d={`M${i * 70 + 20},${y - 60}V${y}`} stroke="#5a3a1e" strokeWidth="10" />)}
    <path d={`M0,${y}H${W}`} stroke="#3d2010" strokeWidth="10" />
  </g>;
};
const TIMAO = <g {...L} strokeWidth="7">
  {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M60,60L${60 + Math.cos(i * Math.PI / 4) * 58},${60 + Math.sin(i * Math.PI / 4) * 58}`} stroke="#7a4a1a" strokeWidth="9" />)}
  <circle cx="60" cy="60" r="42" fill="none" stroke="#a0522d" strokeWidth="12" /><circle cx="60" cy="60" r="12" fill={OURO} />
</g>;
const CSS7 = [
  ORIENT,
  ...[['a7-o1', 3.4], ['a7-o2', 2.6], ['a7-o3', 2]].map(([c, d]) => an(c as string, null, Array.from({ length: Math.round(10 / (d as number)) + 1 }, (_, i): Q => [Math.min(10, i * (d as number)), tr(i % 2 ? -3 : 0, i % 2 ? 1 : 0)]))),
  // o navio jogando no mar: o convés inteiro balança devagar
  an('a7-bl', '50% 100%', [[0, rot(0)], [2.5, rot(1.6)], [5, rot(0)], [7.5, rot(-1.6)], [10, rot(0)]]),
  pos('a7c', [880, 640, 260, 360], [380, 1170, 260, 360]),
  pos('a7t', [760, 560, 150, 150], [270, 1090, 150, 150]),
  pos('a7m', [260, 650, 220, 286], [40, 1180, 220, 286]),
  pos('a7-g', [1500, 160, 120, 60], [700, 400, 120, 60]),
  pos('a7-hhw', [1080, 260, 260, 260], [460, 700, 240, 240]),
  pos('a7-spw', [180, 440, 360, 300], [0, 940, 320, 280]),
  pos('a7-ww', [220, 300, 300, 120], [40, 820, 300, 120]),
  // o timão gira, o capitão ri e balança
  // ── REFEITO no cnMotor (lisa) ── o capitão gira o timão com o corpo todo, gargalha (HAR HAR) aos
  // pulos; a onda derruba o 64 (SPLASH); a gaivota leva o tricórnio — double-take — e ele cai de volta na cabeça.
  assar('a7t', '50% 50%', D, (tl, a) => {
    tl.to(a, { r: -20, duration: .3, ease: 'power2.out' }, 0).to(a, { r: 220, duration: 1.6, ease: 'power2.inOut' }, .3)
      .to(a, { r: 170, duration: .3, ease: 'power2.out' }, 2.0).to(a, { r: 420, duration: 1.8, ease: 'power2.inOut' }, 2.3)
      .to(a, { r: 380, duration: 1.4, ease: 'sine.inOut' }, 5.0).to(a, { r: 720, duration: 2.8, ease: 'power2.inOut' }, 7.2);
  }),
  assar('a7cc', '50% 96%', D, (tl, a) => {
    tl.to(a, { r: -4, x: -2, duration: .3, ease: 'power2.out' }, 0).to(a, { r: 5, x: 3, duration: 1.6, ease: 'power2.inOut' }, .3)
      .to(a, { r: -3, x: -1, duration: .3 }, 2.0).to(a, { r: 0, x: 0, duration: .6 }, 2.3);
    for (const [i, t] of [3.4, 3.7, 4.0, 4.3].entries())                                                                    // gargalhada aos pulos
      tl.to(a, { y: -6, sx: .92, sy: 1.1, r: i % 2 ? 4 : -4, duration: .15, ease: 'power2.out' }, t).to(a, { y: 0, sx: 1.08, sy: .92, duration: .1, ease: 'power2.in' }, t + .15).to(a, { sx: 1, sy: 1, r: 0, duration: .05 }, t + .25);
    tl.to(a, { y: 2, sx: 1.05, sy: .95, duration: 2 / 12 }, 7.25);
    susto(tl, a, 7.42, { alt: 6 });
    tl.to(a, { r: -6, duration: .4, ease: 'sine.inOut' }, 9.4).to(a, { sx: 1.08, sy: .9, r: 0, duration: 1 / 12 }, 9.75).to(a, { sx: 1, sy: 1, duration: .3, ease: 'elastic.out(1,.4)' }, 9.83);
  }),
  assar('a7ce', '22% 42%', D, (tl, a) => {
    tl.set(a, { r: -60 }, 0).to(a, { r: -30, duration: 1.6, ease: 'power2.inOut' }, .3).to(a, { r: -60, duration: 1.2 }, 2.0)
      .to(a, { r: 90, duration: .25, ease: 'back.out(2)' }, 7.5).to(a, { r: 60, duration: .5, ease: 'elastic.out(1,.4)' }, 7.75).to(a, { r: -60, duration: .4 }, 9.3);
  }),
  assar('a7cd', '78% 42%', D, (tl, a) => {
    tl.set(a, { r: 60 }, 0).to(a, { r: 30, duration: 1.6, ease: 'power2.inOut' }, .3);
    for (let t = 3.4; t < 4.6; t += .3) tl.to(a, { r: 150, duration: .15, ease: 'power2.out' }, t).to(a, { r: 115, duration: .15, ease: 'power2.in' }, t + .15);  // bate na pança
    tl.to(a, { r: 60, duration: .4 }, 4.7);
  }),
  vis('a7cr', [[3.4, 4.8]]), pop('a7-hh', [3.5], .9),
  // a gaivota mergulha em arco, pega o chapéu e sobe
  assar('a7-g', '50% 50%', D, (tl, a) => {
    tl.to(a, { x: -560, duration: .9, ease: 'power1.in' }, 6.4).to(a, { y: 220, duration: .9, ease: 'power2.in' }, 6.4)
      .to(a, { x: -1300, duration: 1.1, ease: 'power1.out' }, 7.3).to(a, { y: -120, duration: 1.1, ease: 'power2.out' }, 7.3)
      .set(a, { o: 0 }, 8.45).set(a, { x: 0, y: 0 }, 9.0).to(a, { o: 1, duration: .3 }, 9.6);
  }),
  assar('a7ch', '50% 18%', D, (tl, a) => {
    tl.to(a, { x: -260, duration: 1.1, ease: 'power1.out' }, 7.25).to(a, { y: -90, r: -30, duration: 1.1, ease: 'power2.out' }, 7.25)
      .set(a, { o: 0 }, 8.42).set(a, { x: 0, y: -160, r: 40 }, 9.0).set(a, { o: 1 }, 9.1)
      .to(a, { y: 0, duration: .65, ease: 'cn.queda' }, 9.1).to(a, { r: 0, duration: .65, ease: 'sine.inOut' }, 9.1)
      .to(a, { sx: 1.2, sy: .8, duration: 1 / 12 }, 9.75).to(a, { sx: 1, sy: 1, duration: .25, ease: 'back.out(3)' }, 9.83);
  }),
  // o TROCO-64 esfrega o convés no ritmo; a onda o derruba e arrasta; ele volta a esfregar, pingando
  assar('a7mc', PV.c, D, (tl, a) => {
    for (let t = .3; t < 4.5; t += 1) tl.to(a, { x: -6, r: -5, duration: .5, ease: 'sine.inOut' }, t).to(a, { x: 6, r: 5, duration: .5, ease: 'sine.inOut' }, t + .5);
    tl.to(a, { x: 0, r: 0, duration: .15 }, 4.4);
    susto(tl, a, 4.55, { alt: 6 });
    tl.to(a, { x: -22, r: -28, sx: 1.06, sy: .92, duration: .35, ease: 'power3.out' }, 4.75)                                 // arrastado pela onda
      .to(a, { x: -14, r: -18, sx: 1, sy: 1, duration: .6, ease: 'elastic.out(1,.4)' }, 5.1).to(a, { x: 0, r: 0, duration: .5, ease: 'back.out(2)' }, 6.3);
    for (let t = 6.4; t < 6.9; t += .1) tl.to(a, { r: Math.round(t * 10) % 2 ? 4 : -4, duration: .05 }, t);                 // sacode a água
    for (let t = 7.0; t < 9.9; t += 1) tl.to(a, { x: -6, r: -5, duration: .5, ease: 'sine.inOut' }, t).to(a, { x: 6, r: 5, duration: .5, ease: 'sine.inOut' }, t + .5);
  }),
  ...(['e', 'd'] as const).map((k) => { const g = k === 'e' ? 1 : -1; return assar(`a7m${k}`, k === 'e' ? PV.e : PV.d, D, (tl, a) => {
    tl.set(a, { r: 50 * g }, 0).to(a, { r: 165 * g, duration: .2, ease: 'back.out(2.5)' }, 4.7).to(a, { r: 140 * g, duration: .6, ease: 'elastic.out(1,.4)' }, 4.9).to(a, { r: 50 * g, duration: .4 }, 6.3);
  }); }),
  vis('a7mff', [[0, 4.5], [7, 9.9]]), vis('a7mfx', [[4.8, 6.6]]), vis('a7mfs', [[4.5, 4.8]]),
  pop('a7-sp', [4.7], .9), vis('a7-ww', [[4.8, 6.8]]),
  ferve('a7mb', PV.c, 1, 2), ferve('a7cb', '50% 96%', .8, 1),
  assar('a7-cam', '50% 50%', D, (tl, a) => {
    tl.set(a, planoTela(640, 470, 1.3), 0)
      .to(a, { ...planoTela(940, 420, 1.65), duration: .25, ease: 'power3.out' }, 3.35)       // HAR HAR
      .to(a, { ...planoTela(470, 500, 1.6), duration: .3, ease: 'expo.out' }, 4.55)           // SPLASH
      .to(a, { ...planoTela(940, 400, 1.55), duration: .6, ease: 'power2.inOut' }, 6.6)       // a gaivota
      .to(a, { ...planoTela(700, 380, 1.2), duration: 1.0, ease: 'power2.inOut' }, 7.6)       // segue o chapéu
      .to(a, { ...planoTela(940, 420, 1.6), duration: .6, ease: 'power2.inOut' }, 9.0)        // ele volta
      .to(a, { ...planoTela(640, 470, 1.3), duration: .2, ease: 'power2.inOut' }, 9.8);
  }),
  assar('a7-tq', '50% 50%', D, (tl, a) => { tremor(tl, a, 4.7, 1.2, 6); }),

].join('');
const Esfregao = <g {...L} strokeWidth="5"><path d="M100,150L100,250" stroke="#a0522d" strokeWidth="8" /><path d="M78,250H122L128,272H72Z" fill="#f1e6cc" /></g>;
const Conves7 = memo(function Conves7() {
  return (
    <>
      <Defs />
      <style>{CSS7}</style>
      <div className="p a7-cam">
      <Cenario fundo="#8fc3e6" h={mar(1600, 760)} v={mar(780, 1600)} />
      {([['a7-o1', .44, '#3d8cbd'], ['a7-o2', .5, '#2c7aad'], ['a7-o3', .56, '#22689a']] as const).map(([c, y, cor]) => (
        <React.Fragment key={c}>
          <div className={`p oh ${c}`}><svg viewBox="0 0 1600 760" preserveAspectRatio="xMidYMid slice">{ondas(1600, 760, y, cor)}</svg></div>
          <div className={`p ov ${c}`}><svg viewBox="0 0 780 1600" preserveAspectRatio="xMidYMid slice">{ondas(780, 1600, y, cor)}</svg></div>
        </React.Fragment>
      ))}
      <div className="p a7-bl">
        <div className="p oh"><svg viewBox="0 0 1600 760" preserveAspectRatio="xMidYMid slice">{conves(1600, 760)}</svg></div>
        <div className="p ov"><svg viewBox="0 0 780 1600" preserveAspectRatio="xMidYMid slice">{conves(780, 1600)}</svg></div>
        <div className="pal"><div className="sh a7-tq">
          <div className="e a7t"><Pt vb="0 0 120 120">{TIMAO}</Pt></div>
          <div className="e a7c"><div className="p a7cc"><div className="p a7cb">
            <Pt c="a7ce" vb={CB}>{Capitao.bracoE}</Pt><Pt vb={CB}>{Capitao.corpo}</Pt><Pt c="a7cd" vb={CB}>{Capitao.bracoD}</Pt>
            <Pt vb={CB}>{Capitao.cabeca}<g className="a7cr">{Capitao.riso}</g></Pt>
            <Pt c="a7ch" vb={CB}>{Capitao.chapeu}</Pt>
          </div></div></div>
          <Robo id="a7m" p={P64} k={0} al="n" ar="n" ex={ROSTOS} fx={<Pt vb="0 0 200 260">{Esfregao}</Pt>} />
          <div className="e a7-ww"><Pt vb="0 0 300 120"><g stroke="#9ad6ff" strokeWidth="6" strokeLinecap="round">{[40, 90, 150, 210, 260].map((x, i) => <path key={x} d={`M${x},${20 + (i % 2) * 20}v26`} />)}</g></Pt></div>
          <div className="e a7-spw"><Golpe c="a7-sp" cx={180} cy={150} t="SPLASH!" r={120} cor="#bfe9ff" rot={-8} vb="0 0 360 300" /></div>
          <div className="e a7-hhw"><Golpe c="a7-hh" cx={130} cy={130} t="HAR HAR!" r={118} cor="#fff3b0" rot={6} vb="0 0 260 260" /></div>
          <div className="e a7-g"><Pt vb="0 0 120 60">{gaivota}</Pt></div>
        </div></div>
      </div>
      </div>
    </>
  );
});

// ═══ ANDAR 8 — O ARQUIVO ═════════════════════════════════════════════════════
const arquivo = (W: number, H: number) => {
  const chao = H * .7, col = Math.ceil(W / 150);
  return <g {...L}>
    <rect width={W} height={H} fill="#1a120c" />
    {Array.from({ length: col }, (_, c) => <g key={c}>
      <rect x={c * 150 + 6} y={H * .06} width="138" height={chao - H * .06} fill="#2b1d12" strokeWidth="5" />
      {Array.from({ length: Math.floor((chao - H * .08) / 70) }, (_, r) => <g key={r}>
        <rect x={c * 150 + 16} y={H * .08 + r * 70} width="54" height="52" rx="4" fill={(c + r) % 3 ? '#b88a52' : '#a87842'} strokeWidth="4" />
        <rect x={c * 150 + 80} y={H * .08 + r * 70} width="54" height="52" rx="4" fill={(c + r) % 2 ? '#b88a52' : '#c49a62'} strokeWidth="4" />
        <rect x={c * 150 + 34} y={H * .08 + r * 70 + 18} width="18" height="8" fill="#f1e6cc" stroke="none" />
        <rect x={c * 150 + 98} y={H * .08 + r * 70 + 18} width="18" height="8" fill="#f1e6cc" stroke="none" />
      </g>)}
    </g>)}
    <rect y={chao} width={W} height={H - chao} fill="#120c08" />
    <ellipse cx={W / 2} cy={chao + (H - chao) * .5} rx={W * .3} ry={(H - chao) * .32} fill="#5a1a1a" />
    <rect width={W} height={H} fill="url(#a8-lz)" stroke="none" />
  </g>;
};
const Mesa8 = <g {...L}>
  <rect x="10" y="20" width="440" height="34" rx="6" fill="#4a2814" />
  <path d="M30,54V200M430,54V200" stroke="#2b150c" strokeWidth="16" />
  <rect x="300" y="-6" width="70" height="26" rx="3" fill="#f1e6cc" /><rect x="306" y="-14" width="70" height="26" rx="3" fill="#f6f1e4" />
</g>;
const Foto = <g {...L} strokeWidth="5"><rect x="4" y="4" width="112" height="140" fill="#f1e6cc" /><rect x="16" y="16" width="88" height="96" fill="#6f6252" /><circle cx="60" cy="54" r="18" fill="#c2a381" /><path d="M30,112Q60,72,90,112Z" fill="#3c3328" /></g>;
/** Os rabiscos do Diabrete na foto, um por vez: chifres, bigode, sobrancelhas. */
const RABISCOS = ['M42,40l-8,-14M78,40l8,-14', 'M40,70Q60,62,80,70', 'M48,46q4,-4,8,0M64,46q4,-4,8,0'];
const Caixa8 = <g {...L} strokeWidth="5"><rect x="4" y="30" width="172" height="150" rx="6" fill="#b88a52" /><rect x="60" y="80" width="60" height="22" fill="#f1e6cc" /><path d="M4,30L20,4H160L176,30" fill="#c49a62" /></g>;
const CSS8 = [
  ORIENT,
  pos('a8r', [640, 600, 240, 300], [270, 1150, 240, 300]),
  pos('a8-me', [570, 760, 460, 200], [160, 1310, 460, 200]),
  pos('a8-fo', [930, 560, 120, 148], [560, 1110, 120, 148]),
  pos('a8d', [1120, 690, 180, 280], [580, 1430, 180, 280]),
  pos('a8-cx', [1110, 700, 180, 180], [570, 1440, 180, 180]),
  pos('a8-arw', [420, 400, 300, 300], [20, 780, 300, 300]),
  pos('a8-hmw', [960, 360, 220, 220], [520, 900, 200, 200]),
  // a luminária balança sobre a mesa
  an('a8-lu', '50% 0%', [[0, rot(-4)], [2.5, rot(4)], [5, rot(-4)], [7.5, rot(4)], [10, rot(-4)]]),
  // o Arquivista carimba no ritmo; vira para a foto (bravo) e o Diabrete vira caixa
  // ── REFEITO no cnMotor (lisa) ── o Arquivista carimba com o braço todo (sobe devagar, desce seco); o
  // Diabrete entra na ponta dos pés, rabisca a foto aos risinhos; o Arquivista vira (HMM?) e ele vira CAIXA.
  assar('a8rd', '78% 52%', D, (tl, a) => {
    for (const t of [.6, 2.6, 4.6, 9.0]) tl.to(a, { r: 14, duration: .2, ease: 'power2.out' }, t - .05).to(a, { r: -34, duration: .12, ease: 'power3.in' }, t + .15).to(a, { r: 4, duration: .1 }, t + .27).to(a, { r: 0, duration: .25, ease: 'back.out(2)' }, t + .37);
    for (const t of [1.6, 3.6]) tl.to(a, { r: 8, duration: .2 }, t).to(a, { r: -20, duration: .12, ease: 'power3.in' }, t + .2).to(a, { r: 0, duration: .3, ease: 'back.out(2)' }, t + .32);
  }),
  assar('a8rk', '50% 30%', D, (tl, a) => {
    for (const t of [.82, 2.82, 4.82]) tl.to(a, { r: -4, duration: .05 }, t).to(a, { r: 0, duration: .25, ease: 'back.out(2)' }, t + .05);
    tl.to(a, { r: 4, duration: .4, ease: 'sine.inOut' }, 5.2).to(a, { r: -3, duration: .1 }, 5.55).to(a, { r: 16, duration: .15, ease: 'power3.out' }, 5.65)      // double-take
      .to(a, { r: 13, duration: .5, ease: 'elastic.out(1,.4)' }, 5.8);
    for (let t = 6.4; t < 7.6; t += .6) tl.to(a, { r: 18, duration: .3, ease: 'sine.inOut' }, t).to(a, { r: 10, duration: .3, ease: 'sine.inOut' }, t + .3);   // desconfiado
    tl.to(a, { r: 0, duration: .4, ease: 'power2.inOut' }, 7.8);
  }),
  assar('a8rc', '50% 96%', D, (tl, a) => {
    for (const t of [.82, 2.82, 4.82, 9.22]) tl.to(a, { y: 2, sx: 1.04, sy: .95, duration: .05 }, t).to(a, { y: 0, sx: 1, sy: 1, duration: .3, ease: 'elastic.out(1,.45)' }, t + .05);
    tl.to(a, { sy: 1.06, sx: .96, duration: 2 / 12 }, 5.65).to(a, { sy: 1, sx: 1, duration: .4, ease: 'back.out(2)' }, 5.82);
  }),
  vis('a8rb', [[5.8, 7.8]]),
  pop('a8-ar', [.85, 2.85, 4.85, 9.25], .4),
  assar('a8dc', '50% 96%', D, (tl, a) => {
    tl.set(a, { x: 160 }, 0).to(a, { o: 1, duration: .15 }, .2).to(a, { x: -20, duration: 2.0, ease: 'sine.inOut' }, .2);
    for (let t = .2, i = 0; t < 2.2; t += .4, i++) tl.to(a, { y: -9, r: i % 2 ? 4 : -4, duration: .2, ease: 'sine.out' }, t).to(a, { y: 0, duration: .2, ease: 'sine.in' }, t + .2);  // pé ante pé, pulinhos altos
    for (let t = 2.8; t < 5.2; t += .3) tl.to(a, { y: -3, sx: .97, sy: 1.04, duration: .1 }, t).to(a, { y: 0, sx: 1, sy: 1, duration: .2, ease: 'bounce.out' }, t + .1);  // risadinhas
    tl.to(a, { sx: 1.2, sy: .8, duration: .1, ease: 'power2.out' }, 5.68).to(a, { sx: .2, sy: 1.6, y: -10, o: 0, duration: .12, ease: 'power3.in' }, 5.78)   // POF: some
      .set(a, { sx: 1, sy: 1, y: 0 }, 6.0).set(a, { o: 1, sx: .5, sy: 1.4, y: -20 }, 8.25).to(a, { sx: 1, sy: 1, y: 0, duration: .3, ease: 'back.out(3)' }, 8.25)
      .to(a, { x: 200, duration: 1.3, ease: 'power2.in' }, 8.55).set(a, { o: 0 }, 9.7);
    for (let t = 8.55, i = 0; t < 9.7; t += .2, i++) tl.to(a, { y: -7, r: i % 2 ? 6 : -6, duration: .1 }, t).to(a, { y: 0, duration: .1 }, t + .1);
  }, { inicial: { o: 0 } }),
  assar('a8dd', '68% 42%', D, (tl, a) => {
    for (let t = 2.8; t < 5.2; t += .15) tl.to(a, { r: Math.round(t / .15) % 2 ? -42 : 12, duration: .15, ease: 'sine.inOut' }, t);  // rabisca rápido
    tl.to(a, { r: 0, duration: .2 }, 5.25);
  }),
  passos('a8d', [[.2, 2.2, 6, 14], [8.55, 9.7, 4, 22]]),
  assar('a8-cx', '50% 100%', D, (tl, a) => {
    tl.set(a, { o: 1, sx: .4, sy: 1.5, y: -30 }, 5.78).to(a, { sx: 1.15, sy: .85, y: 0, duration: .15, ease: 'power3.in' }, 5.78).to(a, { sx: 1, sy: 1, duration: .35, ease: 'elastic.out(1,.4)' }, 5.93)
      .to(a, { y: -4, duration: .15 }, 7.9).to(a, { y: 0, duration: .2, ease: 'bounce.out' }, 8.05).set(a, { o: 0 }, 8.25);
    for (let t = 6.4; t < 7.6; t += .25) tl.to(a, { r: Math.round(t * 4) % 2 ? 1.5 : -1.5, duration: .125 }, t);                       // a caixa treme (ele segurando o riso)
    tl.to(a, { r: 0, duration: .1 }, 7.6);
  }, { inicial: { o: 0 } }),
  vis('a8-ol', [[6.6, 7.6]]),
  ...[0, 1, 2].map((i) => vis(`a8-r${i}`, [[3.0 + i * .6, 9.6]])),
  pop('a8-hm', [5.7], .7),
  ferve('a8db', '50% 96%', 1.2, 2), ferve('a8rr', '50% 96%', .8, 1),
  assar('a8-cam', '50% 50%', D, (tl, a) => {
    tl.set(a, planoTela(820, 460, 1.3), 0);
    for (const t of [.85, 2.85, 4.85]) tl.to(a, { ...planoTela(800, 460, 1.36), duration: .05 }, t).to(a, { ...planoTela(820, 460, 1.3), duration: .3, ease: 'power2.out' }, t + .05);
    tl.to(a, { ...planoTela(1020, 470, 1.7), duration: .6, ease: 'power2.inOut' }, 3.0)          // o Diabrete rabiscando
      .to(a, { ...planoTela(800, 420, 1.6), duration: .15, ease: 'power3.out' }, 5.6)              // HMM?
      .to(a, { ...planoTela(1150, 560, 2.1), duration: .7, ease: 'power2.inOut' }, 6.3)            // a caixa que espia
      .to(a, { ...planoTela(900, 470, 1.3), duration: .5, ease: 'power2.inOut' }, 8.2)
      .to(a, { ...planoTela(820, 460, 1.3), duration: .4 }, 9.5);
  }),

].join('');
const ArquivoDoAndar8 = memo(function ArquivoDoAndar8() {
  return (
    <>
      <Defs />
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
        <radialGradient id="a8-lz" cx=".5" cy=".55" r=".6"><stop offset="0" stopColor="#ffd98a" stopOpacity=".28" /><stop offset=".6" stopColor="#000" stopOpacity=".1" /><stop offset="1" stopColor="#000" stopOpacity=".65" /></radialGradient>
      </defs></svg>
      <style>{CSS8}</style>
      <div className="p a8-cam">
      <Cenario fundo="#120c08" h={arquivo(1600, 760)} v={arquivo(780, 1600)} />
      <div className="pal"><div className="sh a8-sh">
        <div className="e a8r"><div className="p a8rc"><div className="p a8rr">
          <Pt vb={RB}>{Arquivista.bracoE}</Pt><Pt vb={RB}>{Arquivista.corpo}</Pt>
          <Pt c="a8rk" vb={RB}>{Arquivista.cabeca}<g className="a8rb">{Arquivista.bravo}</g></Pt>
          <Pt c="a8rd" vb={RB}>{Arquivista.bracoD}</Pt>
        </div></div></div>
        <div className="e a8-me"><Pt vb="0 0 460 200">{Mesa8}</Pt></div>
        <div className="e a8-fo"><Pt vb="0 0 120 148">{Foto}</Pt>{[0, 1, 2].map((i) => <Pt key={i} c={`a8-r${i}`} vb="0 0 120 148"><path d={RABISCOS[i]} transform="translate(0 12)" fill="none" stroke="#e63a2e" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></Pt>)}</div>
        <div className="e a8d"><div className="p a8dc"><div className="p a8db">
          <Pt c="a8dl" vb={DB}>{Diabrete.corpo}</Pt>
          <Pt c="a8dd" vb={DB}>{Diabrete.braco}</Pt>
          <Pt vb={DB}>{Diabrete.cabeca}</Pt>
        </div></div></div>
        <div className="e a8-cx"><Pt vb="0 0 180 180">{Caixa8}</Pt><Pt c="a8-ol" vb="0 0 180 180"><g {...L} strokeWidth="4"><circle cx="76" cy="62" r="9" fill="#fff" /><circle cx="104" cy="62" r="9" fill="#fff" /><circle cx="78" cy="64" r="4" fill={K} stroke="none" /><circle cx="102" cy="64" r="4" fill={K} stroke="none" /></g></Pt></div>
        <div className="e a8-arw"><Golpe c="a8-ar" cx={150} cy={150} t="ARQUIVADO!" r={128} cor="#f1e6cc" rot={-10} vb="0 0 300 300" /></div>
        <div className="e a8-hmw"><Golpe c="a8-hm" cx={110} cy={110} t="HMM?" r={80} cor="#9af6ff" rot={8} vb="0 0 220 220" /></div>
      </div></div>
      </div>
      <div className="p a8-lu" style={{ background: 'radial-gradient(ellipse 40% 35% at 50% 52%, rgba(255,217,138,.16), transparent 70%)', pointerEvents: 'none' }} />
    </>
  );
});

// ═══ ANDAR 12 — O CÉU ════════════════════════════════════════════════════════
const ceu = (W: number, H: number) => {
  const hz = H * .7;
  return <g {...L}>
    <rect width={W} height={H} fill="url(#a12-ceu)" stroke="none" />
    <circle cx={W * .5} cy={hz - H * .04} r={H * .1} fill="#ffcf6a" stroke="none" />
    {Array.from({ length: Math.ceil(W / 70) }, (_, i) => {
      const h = 60 + ((i * 47) % 120), x = i * 70;
      return <g key={i}><rect x={x} y={hz - h} width="56" height={h + 20} fill={i % 2 ? '#3b2d52' : '#2d2442'} strokeWidth="4" />
        {Array.from({ length: Math.floor(h / 26) }, (_, j) => <rect key={j} x={x + 12 + (j % 2) * 18} y={hz - h + 12 + j * 26} width="10" height="12" fill="#ffd98a" stroke="none" opacity={(i + j) % 3 ? .9 : .25} />)}
      </g>;
    })}
    <path d={`M0,${hz}Q${W * .15},${hz - 40},${W * .3},${hz}T${W * .6},${hz}T${W * .9},${hz}T${W * 1.2},${hz}V${H}H0Z`} fill="#f1d6e0" />
  </g>;
};
const nuvem = <g {...L} strokeWidth="5"><path d="M20,70Q10,40,44,40Q52,10,90,20Q120,4,140,34Q176,30,170,64Q172,82,140,80H40Q16,82,20,70Z" fill="#fde9ef" /></g>;
const CSS12 = [
  ORIENT,
  pos('a12z', [560, 500, 420, 440], [180, 900, 420, 440]),
  pos('a12p', [-300, 420, 280, 160], [-300, 1150, 280, 160], '--vx:700%', '--vx:400%'),
  pos('a12-cp', [700, 420, 90, 90], [320, 850, 90, 90]),
  pos('a12-n1', [120, 200, 220, 110], [40, 360, 200, 100]),
  pos('a12-n2', [1260, 300, 260, 130], [520, 520, 220, 110]),
  pos('a12-n3', [900, 120, 180, 90], [420, 220, 160, 80]),
  pos('a12-pww', [1120, 380, 280, 280], [500, 1260, 240, 240]),
  // nuvens derivando
  // ── REFEITO no cnMotor (lisa) ── a Cabeça flutua; para cuspir ela RECUA e incha (antecipação),
  // abre a boca passando do ponto e dá o bote; o biplano mergulha em arco, faz um looping e escapa.
  assar('a12zc', '50% 60%', D, (tl, a) => {
    tl.to(a, { y: -3, r: -2, duration: 1.6, ease: 'sine.inOut' }, 0);  // termina quando o recuo começa (senão os dois brigam por y/r)
    for (const t of [1.6, 5.8]) tl.to(a, { y: -5, sx: 1.08, sy: .94, r: 6, duration: .8, ease: 'power2.inOut' }, t)       // recua e incha
      .to(a, { y: 3, sx: .94, sy: 1.08, r: -8, duration: .12, ease: 'power3.out' }, t + 1.0)                                // bote
      .to(a, { y: 0, sx: 1, sy: 1, r: 0, duration: .6, ease: 'elastic.out(1,.4)' }, t + 1.15);
    tl.to(a, { y: -3, r: 2, duration: 1.6, ease: 'sine.inOut' }, 7.6).to(a, { y: 0, r: 0, duration: .8, ease: 'sine.inOut' }, 9.2);
  }),
  assar('a12zm', '50% 66%', D, (tl, a) => {
    for (const t of [1.6, 5.8]) tl.to(a, { y: -3, duration: .3 }, t).to(a, { y: 16, duration: .25, ease: 'back.out(2.5)' }, t + .5)
      .to(a, { y: 12, duration: .8, ease: 'sine.inOut' }, t + .9).to(a, { y: -2, duration: .15, ease: 'power3.in' }, t + 1.8).to(a, { y: 0, duration: .3, ease: 'bounce.out' }, t + 1.95);
  }),
  vis('a12zg', [[2.0, 3.5], [6.2, 7.7]]),
  ...[1, 2, 3].map((i) => assar(`a12-n${i}`, null, D, (tl, a) => { tl.to(a, { x: i % 2 ? 30 : -30, duration: 5, ease: 'sine.inOut' }, 0).to(a, { x: 0, duration: 5, ease: 'sine.inOut' }, 5); })),
  // o cuspe: nasce espremido na boca, estica no voo, gira
  assar('a12-cp', '50% 50%', D, (tl, a) => {
    for (const [t, dx, dy, g] of [[2.62, -420, 40, 360], [6.82, 420, 60, -360]] as const)
      tl.set(a, { o: 1, x: 0, y: 0, sx: .4, sy: .4 }, t).to(a, { sx: 1.5, sy: .7, duration: .1 }, t).to(a, { x: dx, y: dy, r: g, duration: .75, ease: 'power1.in' }, t)
        .to(a, { sx: 1.2, sy: 1.2, duration: .4 }, t + .2).set(a, { o: 0 }, t + .8);
  }, { inicial: { o: 0 } }),
  // o biplano (--vx da paisagem = 700%): cruza, mergulha para desviar (UFA), looping, escapa do 2º cuspe e sai
  assar('a12p', '50% 50%', D, (tl, a) => {
    const V = 700;
    tl.to(a, { x: V * .36, duration: 2.8, ease: 'sine.inOut' }, 0).to(a, { y: -10, r: -6, duration: 2.8, ease: 'sine.inOut' }, 0)
      .to(a, { x: V * .42, y: 60, r: 26, duration: .4, ease: 'power2.in' }, 2.8)                              // mergulho
      .to(a, { x: V * .5, y: 10, r: -10, duration: .6, ease: 'power2.out' }, 3.2)
      .to(a, { x: V * .62, y: -120, r: -200, duration: 1.4, ease: 'sine.inOut' }, 3.8)                         // looping
      .to(a, { x: V * .58, y: -30, r: -360, duration: 1.0, ease: 'sine.inOut' }, 5.2)
      .to(a, { x: V * .66, y: -60, r: -370, duration: .8, ease: 'sine.inOut' }, 6.2)
      .to(a, { x: V * .72, y: 20, r: -335, duration: .4, ease: 'power2.inOut' }, 7.0)                           // esquiva o 2º
      .to(a, { x: V, y: -40, r: -372, duration: 2.2, ease: 'power1.in' }, 7.4)
      .set(a, { o: 0 }, 9.62).set(a, { x: 0, y: 0, r: 0 }, 9.7).to(a, { o: 1, duration: .25 }, 9.75);
  }),
  an('a12ph', '93.6% 55%', [[0, 'transform:scaleY(1)'], ...Array.from({ length: 40 }, (_, i): Q => [(i + 1) * .25, `transform:scaleY(${i % 2 ? 1 : .2})`])]),
  pop('a12-pw', [3.3], .7),
  ferve('a12zr', '50% 70%', .7, 1),
  assar('a12-cam', '50% 50%', D, (tl, a) => {
    tl.set(a, planoTela(500, 380, 1.3), 0)
      .to(a, { ...planoTela(760, 340, 1.5), duration: 1.2, ease: 'power2.inOut' }, 1.4)          // a Cabeça se preparando
      .to(a, { ...planoTela(660, 380, 1.3), duration: .4, ease: 'power2.out' }, 2.62)            // o cuspe e o mergulho
      .to(a, { ...planoTela(820, 300, 1.15), duration: 1.6, ease: 'sine.inOut' }, 3.8)           // o looping
      .to(a, { ...planoTela(800, 340, 1.5), duration: .8, ease: 'power2.inOut' }, 5.8)
      .to(a, { ...planoTela(1050, 360, 1.3), duration: 2.4, ease: 'sine.inOut' }, 7.0)           // segue a fuga
      .to(a, { ...planoTela(500, 380, 1.3), duration: .5, ease: 'power2.inOut' }, 9.5);
  }),
  assar('a12-sh', '50% 50%', D, (tl, a) => { tremor(tl, a, 2.62, .7, 4); tremor(tl, a, 6.82, .7, 4); }),

].join('');
const CeuDoAndar12 = memo(function CeuDoAndar12() {
  return (
    <>
      <Defs />
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
        <linearGradient id="a12-ceu" x2="0" y2="1"><stop offset="0" stopColor="#3a2f66" /><stop offset=".55" stopColor="#c86a7a" /><stop offset="1" stopColor="#ffb56a" /></linearGradient>
      </defs></svg>
      <style>{CSS12}</style>
      <div className="p a12-cam">
      <Cenario fundo="#3a2f66" h={ceu(1600, 760)} v={ceu(780, 1600)} />
      <div className="pal"><div className="sh a12-sh">
        {[1, 2, 3].map((i) => <div key={i} className={`e a12-n${i}`}><Pt vb="0 0 180 90">{nuvem}</Pt></div>)}
        <div className="e a12z"><div className="p a12zc"><div className="p a12zr">
          <Pt c="a12zg" vb={ZB}>{Cabeca.goela}</Pt>
          <Pt vb={ZB}>{Cabeca.boca}</Pt>
          <Pt c="a12zm" vb={ZB}>{Cabeca.mandibula}</Pt>
          <Pt vb={ZB}>{Cabeca.cranio}</Pt>
        </div></div></div>
        <div className="e a12-cp"><Pt vb="0 0 90 90"><circle cx="45" cy="45" r="30" fill="#7dd35a" stroke={K} strokeWidth="6" /><circle cx="36" cy="36" r="8" fill="#c6f5a8" /></Pt></div>
        <div className="e a12p"><Pt vb={BP}>{Biplano.corpo}</Pt><Pt c="a12ph" vb={BP}>{Biplano.helice}</Pt></div>
        <div className="e a12-pww"><Golpe c="a12-pw" cx={140} cy={140} t="UFA!" r={100} cor="#fff3b0" rot={-8} vb="0 0 280 280" /></div>
      </div></div>
      </div>
    </>
  );
});

/** As cenas dos andares (entram no sorteio junto com as do saguão). */
export const CENAS_ANDARES: React.ComponentType[] = [Suite612, Conves7, ArquivoDoAndar8, CeuDoAndar12];

registrarCenas(CENAS_ANDARES);
