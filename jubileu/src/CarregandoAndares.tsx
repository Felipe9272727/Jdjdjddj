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
import { an, tr, rot, op, pop, vis, pos, PV, passos, ROSTOS, Fala, type Q } from './CarregandoCenas';

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
  pernas: <g {...L}><path d="M62,200L56,282M98,200L104,282" stroke="#3d6b35" strokeWidth="26" /><path d="M40,286H72M90,286H122" stroke="#2a2118" strokeWidth="16" /></g>,
  corpo: <g {...L}><path d="M44,120Q44,96,80,94Q116,96,116,120V206H44Z" fill="#3b6fb0" /><path d="M66,96L80,112L94,96" fill="none" stroke="#2c5489" strokeWidth="5" /></g>,
  bracoE: <g {...L}><path d="M50,112Q34,150,38,186" fill="none" stroke="#3b6fb0" strokeWidth="22" /><circle cx="38" cy="192" r="11" fill="#e8b48a" /></g>,
  bracoD: <g {...L}><path d="M110,112Q126,150,122,186" fill="none" stroke="#3b6fb0" strokeWidth="22" /><circle cx="122" cy="192" r="11" fill="#e8b48a" /></g>,
  cabeca: <g {...L}>
    <rect x="50" y="34" width="60" height="64" rx="18" fill="#e8b48a" />
    <path d="M44,58Q42,24,80,22Q120,24,116,60Q104,40,92,46Q84,34,72,44Q60,36,44,58Z" fill="#7a4a24" />
    <circle cx="68" cy="66" r="5" fill={K} stroke="none" /><circle cx="92" cy="66" r="5" fill={K} stroke="none" />
    <path d="M70,84Q80,90,90,84" fill="none" strokeWidth="4" />
  </g>,
  susto: <g {...L}><circle cx="68" cy="64" r="8" fill="#fff" strokeWidth="3" /><circle cx="92" cy="64" r="8" fill="#fff" strokeWidth="3" /><circle cx="68" cy="64" r="3" fill={K} stroke="none" /><circle cx="92" cy="64" r="3" fill={K} stroke="none" /><ellipse cx="80" cy="86" rx="6" ry="8" fill={K} /></g>,
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
    <rect y={chao} width={W} height={H - chao} fill="#2a1d14" /><rect y={chao - 18} width={W} height="22" fill="#4a3424" />
    <rect x={jx} y={H * .14} width={jw} height={H * .36} fill="#0b1424" />
    <path d={`M${jx + jw / 2},${H * .14}V${H * .5}M${jx},${H * .32}H${jx + jw}`} stroke="#5a4634" strokeWidth="12" />
    <rect x={jx - 14} y={H * .12} width={jw + 28} height={H * .4} fill="none" stroke="#5a4634" strokeWidth="18" />
    <path d={`M${W * .08},${chao}V${H * .3}H${W * .2}V${chao}`} fill="#2e2219" strokeWidth="8" />
    <rect x={W * .1} y={H * .33} width={W * .08} height={chao - H * .33} fill="#1a120c" />
    <circle cx={W * .17} cy={(chao + H * .33) / 2} r="7" fill={OURO} />
  </g>;
};
const chuva = (W: number, H: number) => <g stroke="#9ab4d6" strokeWidth="3" opacity=".6">
  {Array.from({ length: 16 }, (_, i) => <path key={i} d={`M${W * .6 + (i * 37) % (W * .22)},${H * .16 + (i * 53) % (H * .3)}l-8,22`} />)}
</g>;
const CSS6 = [
  ORIENT,
  pos('a6h', [300, 690, 160, 300], [110, 1330, 160, 300]),
  pos('a6a', [1010, 640, 180, 400], [470, 1180, 180, 400]),
  pos('a6-abw', [1180, 230, 360, 144], [380, 660, 380, 152]),
  // a chuva escorre (as gotas descem em laço curto) e o relâmpago estoura duas vezes
  an('a6-cv', null, [[0, tr(0, -6)], [.5, tr(0, 6)], [.51, tr(0, -6)], [1, tr(0, 6)], [1.01, tr(0, -6)], [1.5, tr(0, 6)], [1.51, tr(0, -6)], [2, tr(0, 6)], [2.01, tr(0, -6)], [2.5, tr(0, 6)], [2.51, tr(0, -6)], [3, tr(0, 6)], [3.01, tr(0, -6)], [3.5, tr(0, 6)], [3.51, tr(0, -6)], [4, tr(0, 6)], [4.01, tr(0, -6)], [4.5, tr(0, 6)], [4.51, tr(0, -6)], [5, tr(0, 6)], [5.01, tr(0, -6)], [5.5, tr(0, 6)], [5.51, tr(0, -6)], [6, tr(0, 6)], [6.01, tr(0, -6)], [6.5, tr(0, 6)], [6.51, tr(0, -6)], [7, tr(0, 6)], [7.01, tr(0, -6)], [7.5, tr(0, 6)], [7.51, tr(0, -6)], [8, tr(0, 6)], [8.01, tr(0, -6)], [8.5, tr(0, 6)], [8.51, tr(0, -6)], [9, tr(0, 6)], [9.01, tr(0, -6)], [9.5, tr(0, 6)], [9.51, tr(0, -6)], [10, tr(0, 6)]]),
  vis('a6-rl', [[2.9, 3.0], [3.12, 3.22], [6.4, 6.5], [6.6, 6.72]]),
  // a lâmpada pisca (o quarto escurece por cima)
  an('a6-es', null, [[0, op(.18)], [1.2, op(.18)], [1.25, op(.55)], [1.32, op(.18)], [4.6, op(.18)], [4.65, op(.6)], [4.8, op(.6)], [4.85, op(.18)], [8.6, op(.18)], [8.62, op(.7)], [9.1, op(.7)], [9.4, op(.18)]]),
  // o hóspede: entra na ponta dos pés, para, olha, leva o susto e recua
  an('a6hc', '50% 96%', [[0, `${tr(-140)};${op(0)}`], [.3, `${tr(-140)};${op(1)}`], [2.8, `${tr(0, -3)};${op(1)}`], [3.0, `${tr(-6, 0, -8, 1.06, .92)};${op(1)}`], [3.4, `${tr(-10)};${op(1)}`],
    [6.3, `${tr(40, -3)};${op(1)}`], [6.5, `${tr(30, -16, -10)};${op(1)}`], [6.8, `${tr(20, 0, -6, 1.06, .92)};${op(1)}`], [8.6, `${tr(-150, 0, -4)};${op(1)}`], [8.9, `${tr(-200)};${op(0)}`]]),
  an('a6hl', '40% 66%', [[0, rot(0)], ...[.6, 1.2, 1.8, 2.4, 3.8, 4.4, 5.0, 5.6, 7.0, 7.4, 7.8, 8.2].map((t, i): Q => [t, rot(i % 2 ? 16 : -16)]), [8.6, rot(0)]]),
  an('a6hk', '50% 30%', [[0, rot(0)], [3.0, rot(0)], [3.2, rot(10)], [4.2, rot(10)], [4.6, rot(0)], [6.4, rot(-8)]]),
  vis('a6hs', [[2.95, 3.9], [6.45, 8.7]]),
  // o Aurélio: imóvel; a cada relâmpago está mais perto (e encarando)
  an('a6ac', '50% 96%', [[0, tr()], [2.98, tr()], [3.0, tr(-60)], [6.48, tr(-60)], [6.5, tr(-110, 0, 0, 1.12, 1.12)], [9.3, tr(-110, 0, 0, 1.12, 1.12)], [9.5, `${tr(-110, 0, 0, 1.12, 1.12)};${op(0)}`], [9.7, `${tr()};${op(0)}`], [10, `${tr()};${op(1)}`]]),
  an('a6ak', '50% 22%', [[0, rot(0)], [1.6, rot(0)], [2.6, rot(-12)], [3.0, rot(-12)], [6.5, rot(-16)]]),
  vis('a6ao', [[3.0, 9.4]]),
  pop('a6-ab', [7.2], 1.6),
].join('');
const Suite612 = memo(function Suite612() {
  return (
    <>
      <Defs />
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
        <pattern id="a6-pp" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M30,8Q40,30,30,52Q20,30,30,8Z" fill="#4a3b2c" /></pattern>
      </defs></svg>
      <style>{CSS6}</style>
      <Cenario fundo="#1a120c" h={quarto(1600, 760)} v={quarto(780, 1600)} />
      <div className="p oh a6-cv"><svg viewBox="0 0 1600 760" preserveAspectRatio="xMidYMid slice">{chuva(1600, 760)}</svg></div>
      <div className="p ov a6-cv"><svg viewBox="0 0 780 1600" preserveAspectRatio="xMidYMid slice">{chuva(780, 1600)}</svg></div>
      <div className="pal"><div className="sh">
        <div className="e a6a"><div className="p a6ac"><Pt vb={AB}>{Aurelio.corpo}</Pt><Pt vb={AB}>{Aurelio.braco}</Pt><Pt c="a6ak" vb={AB}>{Aurelio.cabeca}<g className="a6ao">{Aurelio.olhar}</g></Pt></div></div>
        <div className="e a6h"><div className="p a6hc">
          <Pt c="a6hl" vb={HB}>{Hospede.pernas}</Pt>
          <Pt vb={HB}>{Hospede.corpo}</Pt><Pt vb={HB}>{Hospede.bracoE}</Pt><Pt vb={HB}>{Hospede.bracoD}</Pt>
          <Pt c="a6hk" vb={HB}>{Hospede.cabeca}<g className="a6hs">{Hospede.susto}</g></Pt>
        </div></div>
        <div className="e a6-abw"><Fala c="a6-ab" t="VOCÊ TAMBÉM?" w={300} /></div>
      </div></div>
      {/* a luz que falha e o relâmpago, por cima de tudo */}
      <div className="p a6-es" style={{ background: '#05070c' }} />
      <div className="p a6-rl" style={{ background: '#a9bce6', mixBlendMode: 'screen' }} />
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
  an('a7t', '50% 50%', [[0, rot(0)], [2, rot(200)], [2.6, rot(150)], [5, rot(400)], [7, rot(330)], [10, rot(720)]]),
  an('a7cc', '50% 96%', [[0, tr()], [.6, tr(0, -2, -2)], [1.2, tr()], [1.8, tr(0, -2, 2)], [2.4, tr()], [3.6, tr(0, -4, -3, 1.04, .96)], [3.9, tr(0, 0, 3)], [4.2, tr(0, -4, -3)], [4.5, tr()], [7.2, tr()], [7.5, tr(0, -6, 4)], [8.4, tr(0, 0, 0)]]),
  an('a7ce', '22% 42%', [[0, rot(-60)], [2, rot(-40)], [3.5, rot(-60)], [5, rot(-40)], [7.2, rot(-60)], [7.5, rot(80)], [8.6, rot(60)], [9.2, rot(-60)]]),
  an('a7cd', '78% 42%', [[0, rot(60)], [2, rot(40)], [3.5, rot(140)], [4.5, rot(120)], [5, rot(40)], [7.2, rot(60)], [9.2, rot(60)]]),
  vis('a7cr', [[3.4, 4.8]]), pop('a7-hh', [3.5], .9),
  // a gaivota cruza e leva o tricórnio; ele volta caindo do céu no fim
  an('a7-g', '50% 50%', [[0, tr(0, 0)], [6.4, tr(0, 0)], [7.3, tr(-560, 220)], [8.4, tr(-1300, -120)], [8.5, `${tr(-1300, -120)};${op(0)}`], [9.9, `${tr(0, 0)};${op(0)}`], [10, `${tr(0, 0)};${op(1)}`]]),
  an('a7ch', '50% 18%', [[0, tr()], [7.25, tr()], [8.4, `${tr(-260, -90, -30)};${op(1)}`], [8.45, `${tr(-260, -90, -30)};${op(0)}`], [9.3, `${tr(0, -120, 20)};${op(0)}`], [9.35, `${tr(0, -120, 20)};${op(1)}`], [9.8, `${tr()};${op(1)}`]]),
  // o TROCO-64 esfrega o convés; a onda passa por cima (SPLASH) e ele fica pingando, tonto
  an('a7mc', PV.c, [[0, tr()], ...[.5, 1.5, 2.5, 3.5].flatMap((t): Q[] => [[t, tr(-6, 0, -4)], [t + .5, tr(6, 0, 4)]]), [4.6, tr()], [4.8, tr(-14, 0, -24, 1.04, .94)], [5.4, tr(-10, 0, -16)], [6.4, tr()], ...[7, 8, 9].flatMap((t): Q[] => [[t, tr(-6, 0, -4)], [t + .5, tr(6, 0, 4)]])]),
  an('a7me', PV.e, [[0, rot(50)], [4.6, rot(50)], [4.8, rot(160)], [5.6, rot(150)], [6.4, rot(50)]]),
  an('a7md', PV.d, [[0, rot(-50)], [4.6, rot(-50)], [4.8, rot(-160)], [5.6, rot(-150)], [6.4, rot(-50)]]),
  vis('a7mff', [[0, 4.5], [7, 9.9]]), vis('a7mfx', [[4.8, 6.6]]),
  pop('a7-sp', [4.7], .9), vis('a7-ww', [[4.8, 6.8]]),
].join('');
const Esfregao = <g {...L} strokeWidth="5"><path d="M100,150L100,250" stroke="#a0522d" strokeWidth="8" /><path d="M78,250H122L128,272H72Z" fill="#f1e6cc" /></g>;
const Conves7 = memo(function Conves7() {
  return (
    <>
      <Defs />
      <style>{CSS7}</style>
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
        <div className="pal"><div className="sh">
          <div className="e a7t"><Pt vb="0 0 120 120">{TIMAO}</Pt></div>
          <div className="e a7c"><div className="p a7cc">
            <Pt c="a7ce" vb={CB}>{Capitao.bracoE}</Pt><Pt vb={CB}>{Capitao.corpo}</Pt><Pt c="a7cd" vb={CB}>{Capitao.bracoD}</Pt>
            <Pt vb={CB}>{Capitao.cabeca}<g className="a7cr">{Capitao.riso}</g></Pt>
            <Pt c="a7ch" vb={CB}>{Capitao.chapeu}</Pt>
          </div></div>
          <Robo id="a7m" p={P64} k={0} al="n" ar="n" ex={ROSTOS} fx={<Pt vb="0 0 200 260">{Esfregao}</Pt>} />
          <div className="e a7-ww"><Pt vb="0 0 300 120"><g stroke="#9ad6ff" strokeWidth="6" strokeLinecap="round">{[40, 90, 150, 210, 260].map((x, i) => <path key={x} d={`M${x},${20 + (i % 2) * 20}v26`} />)}</g></Pt></div>
          <div className="e a7-spw"><Golpe c="a7-sp" cx={180} cy={150} t="SPLASH!" r={120} cor="#bfe9ff" rot={-8} vb="0 0 360 300" /></div>
          <div className="e a7-hhw"><Golpe c="a7-hh" cx={130} cy={130} t="HAR HAR!" r={118} cor="#fff3b0" rot={6} vb="0 0 260 260" /></div>
          <div className="e a7-g"><Pt vb="0 0 120 60">{gaivota}</Pt></div>
        </div></div>
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
  pos('a8-arw', [380, 300, 300, 300], [20, 780, 300, 300]),
  pos('a8-hmw', [1180, 330, 220, 220], [520, 900, 200, 200]),
  // a luminária balança sobre a mesa
  an('a8-lu', '50% 0%', [[0, rot(-4)], [2.5, rot(4)], [5, rot(-4)], [7.5, rot(4)], [10, rot(-4)]]),
  // o Arquivista carimba no ritmo; vira para a foto (bravo) e o Diabrete vira caixa
  an('a8rd', '78% 52%', [[0, rot(0)], ...[.6, 1.6, 2.6, 3.6, 4.6].flatMap((t): Q[] => [[t, rot(-28)], [t + .22, rot(6)], [t + .4, rot(0)]]), [8.6, rot(0)], [9.0, rot(-28)], [9.22, rot(6)], [9.4, rot(0)]]),
  an('a8rk', '50% 30%', [[0, rot(0)], [5.4, rot(0)], [5.7, rot(14)], [7.6, rot(14)], [8.0, rot(0)]]),
  an('a8rc', '50% 96%', [[0, tr()], ...[.82, 1.82, 2.82, 3.82, 4.82].flatMap((t): Q[] => [[t, tr(0, 1.5, 0, 1.02, .98)], [t + .2, tr()]])]),
  vis('a8rb', [[5.8, 7.8]]),
  pop('a8-ar', [.85, 2.85, 4.85, 9.25], .4),
  // o Diabrete: chega na ponta dos pés, rabisca a foto, congela… vira caixa e sai de fininho
  an('a8dc', '50% 96%', [[0, `${tr(160)};${op(0)}`], [.2, `${tr(160)};${op(1)}`], [2.2, `${tr(-20)};${op(1)}`], [2.4, `${tr(-20, -6)};${op(1)}`], [2.6, `${tr(-20)};${op(1)}`],
    [5.6, `${tr(-20)};${op(1)}`], [5.72, `${tr(-20, 0, 0, 1.1, .9)};${op(1)}`], [5.8, `${tr(-20, 20, 0, .6, .6)};${op(0)}`], [8.2, `${tr(-20, 20, 0, .6, .6)};${op(0)}`], [8.25, `${tr(-20)};${op(1)}`], [9.6, `${tr(200)};${op(1)}`], [9.7, `${tr(200)};${op(0)}`]]),
  an('a8dd', '68% 42%', [[0, rot(0)], ...[2.8, 3.4, 4.0, 4.6].flatMap((t): Q[] => [[t, rot(-40)], [t + .3, rot(10)]]), [5.2, rot(0)]]),
  passos('a8d', [[.2, 2.2, 6, 14], [8.25, 9.6, 4, 18]]),
  // a caixa-arquivo onde ele se esconde (e que espia de olhos arregalados)
  an('a8-cx', '50% 100%', [[0, op(0)], [5.75, op(0)], [5.8, `${tr(0, 0, 0, 1.1, .9)};${op(1)}`], [6.0, `${tr()};${op(1)}`], [7.9, `${tr()};${op(1)}`], [8.0, `${tr(0, -6)};${op(1)}`], [8.2, `${tr()};${op(1)}`], [8.25, op(0)]]),
  vis('a8-ol', [[6.6, 7.6]]),
  // os rabiscos aparecem na foto aos poucos
  ...[0, 1, 2].map((i) => vis(`a8-r${i}`, [[3.0 + i * .6, 9.6]])),
  pop('a8-hm', [5.7], .7),
].join('');
const ArquivoDoAndar8 = memo(function ArquivoDoAndar8() {
  return (
    <>
      <Defs />
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
        <radialGradient id="a8-lz" cx=".5" cy=".55" r=".6"><stop offset="0" stopColor="#ffd98a" stopOpacity=".28" /><stop offset=".6" stopColor="#000" stopOpacity=".1" /><stop offset="1" stopColor="#000" stopOpacity=".65" /></radialGradient>
      </defs></svg>
      <style>{CSS8}</style>
      <Cenario fundo="#120c08" h={arquivo(1600, 760)} v={arquivo(780, 1600)} />
      <div className="pal"><div className="sh">
        <div className="e a8r"><div className="p a8rc">
          <Pt vb={RB}>{Arquivista.bracoE}</Pt><Pt vb={RB}>{Arquivista.corpo}</Pt>
          <Pt c="a8rk" vb={RB}>{Arquivista.cabeca}<g className="a8rb">{Arquivista.bravo}</g></Pt>
          <Pt c="a8rd" vb={RB}>{Arquivista.bracoD}</Pt>
        </div></div>
        <div className="e a8-me"><Pt vb="0 0 460 200">{Mesa8}</Pt></div>
        <div className="e a8-fo"><Pt vb="0 0 120 148">{Foto}</Pt>{[0, 1, 2].map((i) => <Pt key={i} c={`a8-r${i}`} vb="0 0 120 148"><path d={RABISCOS[i]} transform="translate(0 12)" fill="none" stroke="#e63a2e" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></Pt>)}</div>
        <div className="e a8d"><div className="p a8dc">
          <Pt c="a8dl" vb={DB}>{Diabrete.corpo}</Pt>
          <Pt c="a8dd" vb={DB}>{Diabrete.braco}</Pt>
          <Pt vb={DB}>{Diabrete.cabeca}</Pt>
        </div></div>
        <div className="e a8-cx"><Pt vb="0 0 180 180">{Caixa8}</Pt><Pt c="a8-ol" vb="0 0 180 180"><g {...L} strokeWidth="4"><circle cx="76" cy="62" r="9" fill="#fff" /><circle cx="104" cy="62" r="9" fill="#fff" /><circle cx="78" cy="64" r="4" fill={K} stroke="none" /><circle cx="102" cy="64" r="4" fill={K} stroke="none" /></g></Pt></div>
        <div className="e a8-arw"><Golpe c="a8-ar" cx={150} cy={150} t="ARQUIVADO!" r={128} cor="#f1e6cc" rot={-10} vb="0 0 300 300" /></div>
        <div className="e a8-hmw"><Golpe c="a8-hm" cx={110} cy={110} t="HMM?" r={80} cor="#9af6ff" rot={8} vb="0 0 220 220" /></div>
      </div></div>
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
  ...[1, 2, 3].map((i) => an(`a12-n${i}`, null, [[0, tr(0)], [5, tr(i % 2 ? 30 : -30)], [10, tr(0)]])),
  // a Cabeça flutua; abre a boca (telegrafo), cospe duas vezes
  an('a12zc', '50% 60%', [[0, tr(0, 0)], [2.5, tr(0, -3, -2)], [5, tr(0, 0)], [7.5, tr(0, -3, 2)], [10, tr(0, 0)]]),
  an('a12zm', '50% 66%', [[0, tr()], [1.6, tr()], [2.1, tr(0, 12)], [3.4, tr(0, 12)], [3.8, tr()], [5.8, tr()], [6.3, tr(0, 12)], [7.6, tr(0, 12)], [8.0, tr()]]),
  vis('a12zg', [[2.0, 3.5], [6.2, 7.7]]),
  // o cuspe: sai da boca e voa em direção ao biplano
  an('a12-cp', '50% 50%', [[0, `${tr()};${op(0)}`], [2.6, `${tr(0, 0, 0, .4)};${op(0)}`], [2.62, `${tr(0, 0, 0, .4)};${op(1)}`], [3.4, `${tr(-420, 40, 360, 1.2)};${op(1)}`], [3.45, `${tr(-420, 40, 360, 1.2)};${op(0)}`],
    [6.8, `${tr(0, 0, 0, .4)};${op(0)}`], [6.82, `${tr(0, 0, 0, .4)};${op(1)}`], [7.6, `${tr(420, 60, -360, 1.2)};${op(1)}`], [7.65, `${tr(420, 60, -360, 1.2)};${op(0)}`]]),
  // o biplano cruza, mergulha para desviar, faz um looping e sai
  an('a12p', '50% 50%', [[0, 'transform:translate(0,0) rotate(0deg)'], [2.8, 'transform:translate(calc(var(--vx) * .36),-10%) rotate(-6deg)'], [3.2, 'transform:translate(calc(var(--vx) * .42),60%) rotate(24deg)'],
    [3.8, 'transform:translate(calc(var(--vx) * .5),10%) rotate(-10deg)'], [5.2, 'transform:translate(calc(var(--vx) * .62),-120%) rotate(-200deg)'], [6.2, 'transform:translate(calc(var(--vx) * .58),-30%) rotate(-360deg)'],
    [7.0, 'transform:translate(calc(var(--vx) * .66),-60%) rotate(-370deg)'], [7.4, 'transform:translate(calc(var(--vx) * .72),20%) rotate(-340deg)'], [9.6, 'transform:translate(var(--vx),-40%) rotate(-372deg)'], [9.62, `transform:translate(var(--vx),-40%) rotate(-372deg);${op(0)}`], [9.95, `transform:translate(0,0) rotate(0deg);${op(0)}`], [10, `transform:translate(0,0) rotate(0deg);${op(1)}`]]),
  an('a12ph', '93.6% 55%', [[0, 'transform:scaleY(1)'], ...Array.from({ length: 40 }, (_, i): Q => [(i + 1) * .25, `transform:scaleY(${i % 2 ? 1 : .2})`])]),
  pop('a12-pw', [3.3], .7),
].join('');
const CeuDoAndar12 = memo(function CeuDoAndar12() {
  return (
    <>
      <Defs />
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
        <linearGradient id="a12-ceu" x2="0" y2="1"><stop offset="0" stopColor="#3a2f66" /><stop offset=".55" stopColor="#c86a7a" /><stop offset="1" stopColor="#ffb56a" /></linearGradient>
      </defs></svg>
      <style>{CSS12}</style>
      <Cenario fundo="#3a2f66" h={ceu(1600, 760)} v={ceu(780, 1600)} />
      <div className="pal"><div className="sh">
        {[1, 2, 3].map((i) => <div key={i} className={`e a12-n${i}`}><Pt vb="0 0 180 90">{nuvem}</Pt></div>)}
        <div className="e a12z"><div className="p a12zc">
          <Pt c="a12zg" vb={ZB}>{Cabeca.goela}</Pt>
          <Pt vb={ZB}>{Cabeca.boca}</Pt>
          <Pt c="a12zm" vb={ZB}>{Cabeca.mandibula}</Pt>
          <Pt vb={ZB}>{Cabeca.cranio}</Pt>
        </div></div>
        <div className="e a12-cp"><Pt vb="0 0 90 90"><circle cx="45" cy="45" r="30" fill="#7dd35a" stroke={K} strokeWidth="6" /><circle cx="36" cy="36" r="8" fill="#c6f5a8" /></Pt></div>
        <div className="e a12p"><Pt vb={BP}>{Biplano.corpo}</Pt><Pt c="a12ph" vb={BP}>{Biplano.helice}</Pt></div>
        <div className="e a12-pww"><Golpe c="a12-pw" cx={140} cy={140} t="UFA!" r={100} cor="#fff3b0" rot={-8} vb="0 0 280 280" /></div>
      </div></div>
    </>
  );
});

/** As cenas dos andares (entram no sorteio junto com as do saguão). */
export const CENAS_ANDARES: React.ComponentType[] = [Suite612, Conves7, ArquivoDoAndar8, CeuDoAndar12];

registrarCenas(CENAS_ANDARES);
