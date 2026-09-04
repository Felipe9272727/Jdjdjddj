// ── O TEMPO PASSA PARA ELE TAMBÉM ─────────────────────────────────────────
//
// Item do levantamento que o dono do jogo pediu: "o que falta para o NPC virar
// um agente de verdade". Um dos buracos era que o Nilo CONGELA quando o jogador
// sai do andar — a vontade mora no `useFrame` do Floor10Npc, que desmonta.
//
// Só que o defeito é mais fundo do que "ele congela", e está numa linha:
//
//     private drives = drivesCopy(INITIAL_FLOOR10_WILL.drives)
//
// Toda entrada no Andar 10 devolve o humor dele às MESMAS quatro constantes
// (social 0,62 · curiosidade 0,68 · inquietação 0,42 · fadiga 0,08), não
// importa a hora nem quanto tempo você ficou fora. O `floor10Drives.ts` inteiro
// existe para dar a ele homeostase e linha de base circadiana — de madrugada
// exausto, de tarde inquieto — e isso é anulado no instante do nascimento: ele
// só caminha para a linha da hora DEPOIS de ticks suficientes, e recomeça do
// mesmo lugar na visita seguinte.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ, E POR QUÊ ────────────────────────────────
//
// Não simula o que ele fez enquanto você não estava. Inventar que "ele examinou
// o elevador quatro vezes de madrugada" seria fabricar história que ninguém
// observou — o oposto da regra que este projeto segue em todo o resto.
//
// O que ele faz é o que se pode afirmar: o tempo passou DE VERDADE, e a
// homeostase que já existe teria levado os desejos dele à linha de base da
// hora. Isso não é simulação, é a solução fechada da mesma equação que o
// `stepDrives` resolve por passos.
import { circadianBaseline, readClock } from './floor10Drives';
import type { Floor10WillDrives } from './floor10Will';

const CHAVE = 'floor10-ausencia-v1';

/** A mesma constante de `floor10Drives`: velocidade de retorno à linha de base. */
const RETORNO = 0.05;

export type EstadoDaAusencia = {
    drives: Floor10WillDrives;
    /** Quando ele foi deixado sozinho, em ms de época. */
    em: number;
};

function armazem(): Storage | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        // Safari em janela privada atira ao só tocar no objeto.
        return null;
    }
}

const naFaixa = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;

export function salvarAusencia(drives: Floor10WillDrives, em = Date.now()): void {
    const loja = armazem();
    if (!loja) return;
    try {
        loja.setItem(CHAVE, JSON.stringify({ drives, em }));
    } catch { /* cota cheia não pode derrubar o andar */ }
}

export function lerAusencia(): EstadoDaAusencia | null {
    const loja = armazem();
    if (!loja) return null;
    try {
        const cru = loja.getItem(CHAVE);
        if (!cru) return null;
        const d = JSON.parse(cru) as Partial<EstadoDaAusencia>;
        if (typeof d?.em !== 'number' || !Number.isFinite(d.em)) return null;
        const v = d.drives ?? ({} as Partial<Floor10WillDrives>);
        return {
            em: d.em,
            drives: {
                social: naFaixa(v.social),
                curiosity: naFaixa(v.curiosity),
                restlessness: naFaixa(v.restlessness),
                fatigue: naFaixa(v.fatigue),
            },
        };
    } catch {
        return null;
    }
}

export function esquecerAusencia(): void {
    const loja = armazem();
    if (!loja) return;
    try { loja.removeItem(CHAVE); } catch { /* nada a fazer */ }
}

/**
 * Quanto do caminho até a linha de base foi andado em `segundos`.
 *
 * `stepDrives` limita cada passo a 0,25 s de propósito — ele é chamado por
 * quadro. Para uma ausência de horas, chamá-lo num laço seria dezenas de
 * milhares de iterações para chegar onde a fórmula chega direto: a relaxação
 * exponencial tem solução fechada, e é a MESMA equação.
 *
 *     por passo:   de + (para − de) · RETORNO · dt
 *     no limite:   de + (para − de) · (1 − e^(−RETORNO · t))
 *
 * Aos 20 s já andou 63% do caminho; aos 60 s, 95%. Ou seja: sair e voltar
 * correndo mantém o humor, e sumir de verdade devolve o Nilo à linha da hora.
 */
export function fracaoRelaxada(segundos: number): number {
    if (!Number.isFinite(segundos) || segundos <= 0) return 0;
    return 1 - Math.exp(-RETORNO * segundos);
}

/**
 * Os desejos com que ele recebe você — a peça que faltava.
 *
 * Sem estado salvo, ele nasce na LINHA DE BASE DA HORA em vez das constantes
 * fixas: é a mesma pessoa em horas diferentes, que é o que o `floor10Drives`
 * sempre quis e não conseguia porque o nascimento atropelava.
 */
export function drivesAoChegar(
    agora = Date.now(),
    salvo = lerAusencia(),
): Floor10WillDrives {
    const base = circadianBaseline(readClock(new Date(agora)).hour);
    if (!salvo) return base;
    // Relógio do sistema para trás (fuso, viagem, usuário mexendo) daria tempo
    // negativo. Zero é a leitura honesta: nada de tempo passou que eu possa
    // afirmar.
    const segundos = Math.max(0, (agora - salvo.em) / 1000);
    const f = fracaoRelaxada(segundos);
    const mover = (de: number, para: number) => de + (para - de) * f;
    return {
        social: mover(salvo.drives.social, base.social),
        curiosity: mover(salvo.drives.curiosity, base.curiosity),
        restlessness: mover(salvo.drives.restlessness, base.restlessness),
        fatigue: mover(salvo.drives.fatigue, base.fatigue),
    };
}
