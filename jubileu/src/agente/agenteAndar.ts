// ── O AGENTE-JOGADOR: A PARTE QUE EXECUTA O CAMINHO ───────────────────────
//
// A grade (agenteMapa) decide PARA ONDE ir. Aqui o corpo vai — com a física do
// jogo, `resolveCollision`, a mesma que o jogador humano sente.
//
// ── A EXIGÊNCIA QUE MANDA NESTE ARQUIVO ──────────────────────────────────
//
//   "Eles tem que funcionar até em andares futuros"
//
// Por isso não existe, em lugar nenhum daqui nem do agenteMapa, um `if (level
// === 3)`. A única coisa que este agente sabe sobre o mundo é a lista de
// paredes que o jogo já entrega para qualquer andar (`wallsForState`) e um
// ponto de destino. Um andar que ainda não foi escrito tem paredes como todos
// os outros — e o agente vai andar nele sem uma linha de código nova.
//
// Isso é uma promessa fácil de fazer e fácil de quebrar sem perceber: basta
// alguém acrescentar um caso especial "só para o Andar 7". O teste que fecha
// esse buraco alimenta o agente com um andar SINTÉTICO, que não existe no jogo,
// e exige que ele atravesse do mesmo jeito.
import { PR } from '../constants';
import { resolveCollision } from '../physics';
import { CELULA, type GradeDoAndar, type Ponto, caminho } from './agenteMapa';

/**
 * O raio do corpo é IMPORTADO, não copiado.
 *
 * Eu tinha escrito `0.35` de cabeça; o valor real é `PR = 0.5`. Com o número
 * errado a grade aprovaria vãos que o corpo não atravessa, e o agente travaria
 * em passagens que o plano jurava existir — o pior tipo de defeito, porque o
 * plano e a execução discordam e cada um parece certo sozinho.
 */
export const RAIO_DO_CORPO = PR;

/** Metros por passo de simulação. Igual ao passo das sondas que já existem. */
export const PASSO = 0.06;

/** Chegou perto o bastante do ponto do caminho para mirar o próximo. */
const ALCANCE_DO_PONTO = CELULA * 0.9;

export type Tentativa = {
    /** Ele chegou ao destino? */
    chegou: boolean;
    /** Onde parou. */
    fim: Ponto;
    /** Distância que faltou. */
    faltou: number;
    /** Passos gastos. */
    passos: number;
    /** Pontos do caminho planejado; vazio quando não havia caminho. */
    plano: readonly Ponto[];
    /** Por que parou — o que interessa quando ele NÃO chega. */
    motivo: 'chegou' | 'sem-caminho' | 'travou' | 'tempo';
};

/**
 * Leva o corpo de `de` até `ate` no andar descrito por `paredes`.
 *
 * Não tem estado nem efeito colateral: entra posição, sai posição. É assim que
 * o mesmo código serve ao teste headless e ao jogo — e é assim que dá para
 * medir "ele chega?" sem abrir um navegador.
 */
export function irAte(
    grade: GradeDoAndar,
    paredes: number[][],
    de: Ponto,
    ate: Ponto,
    tetoDePassos = 4000,
): Tentativa {
    const plano = caminho(grade, de, ate);
    if (plano.length === 0) {
        return {
            chegou: false, fim: { ...de }, faltou: Math.hypot(ate.x - de.x, ate.z - de.z),
            passos: 0, plano, motivo: 'sem-caminho',
        };
    }

    let { x, z } = de;
    let alvo = 0;
    // ── O DETECTOR DE TRAVA ───────────────────────────────────────────────
    // Um agente encostado numa quina anda 0,0001 m por passo e "não falha" —
    // ele só nunca chega. Sem medir isso, o relatório diria "tempo" e eu
    // procuraria o defeito no lugar errado. Aqui, andar quase nada por muitos
    // passos seguidos é uma causa com nome próprio.
    let paradoHa = 0;
    for (let passo = 0; passo < tetoDePassos; passo += 1) {
        // O último ponto do plano é o destino de verdade; os do meio são só
        // marcos e podem ser abandonados assim que ele passa perto.
        while (alvo < plano.length - 1
            && Math.hypot(plano[alvo].x - x, plano[alvo].z - z) < ALCANCE_DO_PONTO) {
            alvo += 1;
        }
        const p = plano[alvo];
        const dx = p.x - x;
        const dz = p.z - z;
        const d = Math.hypot(dx, dz);
        if (alvo === plano.length - 1 && d < ALCANCE_DO_PONTO) {
            return {
                chegou: true, fim: { x, z },
                faltou: Math.hypot(ate.x - x, ate.z - z),
                passos: passo, plano, motivo: 'chegou',
            };
        }
        const s = Math.min(PASSO, d);
        const [nx, nz] = resolveCollision(x + (dx / d) * s, z + (dz / d) * s, RAIO_DO_CORPO, paredes);
        paradoHa = Math.hypot(nx - x, nz - z) < PASSO * 0.15 ? paradoHa + 1 : 0;
        x = nx;
        z = nz;
        if (paradoHa > 90) {
            return {
                chegou: false, fim: { x, z },
                faltou: Math.hypot(ate.x - x, ate.z - z),
                passos: passo, plano, motivo: 'travou',
            };
        }
    }
    return {
        chegou: false, fim: { x, z },
        faltou: Math.hypot(ate.x - x, ate.z - z),
        passos: tetoDePassos, plano, motivo: 'tempo',
    };
}
