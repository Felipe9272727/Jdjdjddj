// CICLO DE CAMINHADA COM O PÉ PLANTADO (refeito pelo plano da crítica do Opus).
//  · cada pé fica PARADO no chão do mundo durante o apoio; o apoio dura `D` do ciclo (>.5 = há apoio
//    duplo: os dois pés no chão um instante, o que dá PESO — 50/50 deixava o andar flutuando);
//  · no balanço o pé sobe cedo e alto e estica (arco com pico antecipado), e pousa no próximo apoio;
//  · o corpo avança em SURTOS: segura ~1/4 do passo no contato e depois vai (o "sneak" de 1930) —
//    `surto: 0` volta à velocidade constante (corrida);
//  · cada apoio é centrado no meio do intervalo em que o corpo passa por cima dele;
//  · pernas de PERFIL (os dois pés na mesma linha, `separa` 0): tronco de frente, pernas de lado, como
//    em Bosko e no Mickey dos anos 30 — o par contra o tronco lê como profundidade, não como tesoura.
const suave = (s) => s * s * (3 - 2 * s);
/**
 * andar({ f, f0, x0, dir, passo, periodo, chao, altPe, quique, D, surto, separa })
 * Devolve { x, bob, peE, peD, noE, noD, bracoE, bracoD, t } — pés em coordenadas do mundo.
 */
export function andar({ f, f0 = 0, x0, dir = 1, passo = 70, periodo = 8, chao, altPe = 26, quique = 10, D = .62, surto = .25, separa = 0 }) {
  const corpoX = (tt) => {
    if (tt <= 0) return x0;
    const n = Math.floor(tt), q = tt - n;
    const ava = surto > 0 ? (q < surto ? 0 : suave((q - surto) / (1 - surto))) : q;
    return x0 + dir * passo * (n + ava);
  };
  const t = Math.max(0, f - f0) / periodo;
  const x = corpoX(t);
  const ch = (xx) => (typeof chao === 'function' ? chao(xx) : chao);
  const pe = (desloc) => {
    // ciclo de 2 passos; o apoio do ciclo n vai de t = 2n − desloc até 2n − desloc + 2D
    const u = (t + desloc) / 2, ciclo = Math.floor(u), fr = u - ciclo;
    const apoio = (n) => corpoX(2 * n - desloc + D);              // centrado no meio do apoio
    if (fr < D) { const xa = apoio(ciclo); return { x: xa, y: ch(xa), no: true }; }
    const s = (fr - D) / (1 - D), a0 = apoio(ciclo), a1 = apoio(ciclo + 1);
    const xx = a0 + (a1 - a0) * Math.pow(s, .6);   // o pé vai à frente ANTES do pico do arco (não empilha)
    return { x: xx, y: ch(xx) - Math.sin(Math.pow(s, .7) * Math.PI) * altPe, no: false, s };
  };
  const pE = pe(0), pD = pe(1);
  const q = t % 1;
  const bob = -Math.sin(q * Math.PI) * quique;                     // o mais baixo no contato
  const balanco = Math.sin(t * Math.PI) * 28;
  return { x, bob, peE: [pE.x - separa / 2, pE.y], peD: [pD.x + separa / 2, pD.y], noE: pE.no, noD: pD.no, sE: pE.s ?? 0, sD: pD.s ?? 0,
    bracoE: balanco * dir, bracoD: -balanco * dir, t };   // com o ângulo espelhado por lado, sinais opostos = um à frente, outro atrás
}
