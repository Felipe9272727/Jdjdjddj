/**
 * f3Tinta.ts — a MÃO que desenha o Andar 3.
 *
 * O ruído e o fervilhar moravam dentro de `f3Hazards`, porque nasceram lá: foi
 * a fileira de espinhos que primeiro precisou parecer traçada à mão em vez de
 * gerada. Depois o balão da súplica pegou o mesmo `steps()` de 8 Hz, e o balão
 * de grito também. Agora a passada do Diabrete quer o mesmo, e um módulo de
 * armadilhas não é lugar de onde uma animação de corrida deva importar nada.
 *
 * Então isto mora aqui: um hash e uma frequência. É pouca coisa, e é justamente
 * o ponto — é a MESMA mão tremendo em todo lugar do andar, e agora dá para ver
 * isso no grafo de imports e não só nos comentários.
 */

/** Hash, não sorteio: a mesma entrada desenha a mesma coisa em toda máquina. */
export function ruidoDaTinta(a: number): number {
    const x = Math.sin(a * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
}

/**
 * O FERVILHAR ("boil"): a linha de um desenho de 1930 é redesenhada a cada dois
 * ou três quadros e ferve. O tempo entra QUANTIZADO, então a forma se re-sorteia
 * ~8x por segundo em vez de deslizar — que é a diferença entre tinta e
 * interpolação.
 */
export const BOIL_HZ = 8;
export const BOIL_AMP = 0.045;

/** Em que "quadro desenhado" o tempo `t` cai. */
export const quadroDaTinta = (t: number) => Math.floor(t * BOIL_HZ);

/** O tremor deste quadro, em [-amp/2, +amp/2], para a semente dada. */
export function tremor(semente: number, t: number, amp = BOIL_AMP): number {
    return (ruidoDaTinta(semente + quadroDaTinta(t) * 3.7) - 0.5) * amp;
}
