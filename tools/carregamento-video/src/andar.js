// CICLO DE CAMINHADA COM O PÉ PLANTADO. O defeito que deixava o andar "estranho": o corpo deslizava em
// velocidade constante e as pernas só balançavam, então o pé patinava no chão. Aqui cada pé fica
// PARADO no chão (em coordenadas do mundo) durante o apoio, e durante o balanço faz um arco até o
// próximo apoio. O corpo desce no contato e sobe na passagem (o "up/down" clássico), e os braços
// balançam em oposição às pernas.
/**
 * andar({ f, f0, x0, dir, passo, periodo, chao, altPe, quique, larguraPes })
 *   f: quadro atual · f0: quadro em que começa a andar · x0: x do corpo em f0 · dir: +1 direita, -1 esquerda
 *   passo: distância de um passo (px do mundo) · periodo: quadros por passo · chao: y do chão
 * Devolve { x, bob, peE, peD, bracoE, bracoD, fase } — pés em coordenadas do mundo; braços em graus.
 */
export function andar({ f, f0 = 0, x0, dir = 1, passo = 70, periodo = 8, chao, altPe = 26, quique = 10, separa = 40 }) {
  const t = Math.max(0, f - f0) / periodo;              // passos dados (contínuo)
  const x = x0 + dir * passo * t;                        // o corpo avança sem parar
  const pe = (desloc) => {
    // cada pé: apoio por 1 período, balanço por 1 período (ciclo de 2 passos)
    const u = (t + desloc) / 2, ciclo = Math.floor(u), fr = u - ciclo;
    // apoio CENTRADO sob o corpo: o pé planta meio passo à frente e o corpo passa por cima dele até meio passo
    // atrás (o pé nunca fica todo à frente — com personagem de frente, é isso que impede as pernas de cruzarem)
    const xApoio = (n) => x0 + dir * passo * (2 * n - desloc + .5);
    const ch = (xx) => typeof chao === 'function' ? chao(xx) : chao;
    if (fr < .5) return { x: xApoio(ciclo), y: ch(xApoio(ciclo)), no: true };                   // plantado
    const s = (fr - .5) * 2, ease = s * s * (3 - 2 * s);                           // balanço suave
    const xx = xApoio(ciclo) + dir * passo * 2 * ease;
    return { x: xx, y: ch(xx) - Math.sin(s * Math.PI) * altPe, no: false };
  };
  const pE = pe(0), pD = pe(1);
  const fase = (t % 1);
  const bob = -Math.abs(Math.sin(fase * Math.PI)) * quique;   // contato embaixo, passagem em cima
  const balanco = Math.sin(t * Math.PI) * 28;
  // os pés ficam cada um do seu lado do corpo (esquerdo à esquerda da tela, direito à direita)
  return { x, bob, peE: [pE.x - separa / 2, pE.y], peD: [pD.x + separa / 2, pD.y], noE: pE.no, noD: pD.no, bracoE: balanco * dir, bracoD: balanco * dir, t };
}
