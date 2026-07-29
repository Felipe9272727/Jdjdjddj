import { describe, expect, it } from 'vitest';
import { Floor10WillBrain } from '../npc/floor10Will';
import { freshPrison, PRISON_DEVICES } from '../npc/f10Prison';
import { perceiveFloor10 } from '../npc/floor10Perception';

const NPC = { x: 0, y: 0, z: 2.2 };
const vision = (player: { x: number; y: number; z: number } | null) => perceiveFloor10({
    npcPosition: NPC,
    npcYaw: Math.PI,
    playerPosition: player,
});

/** Roda o cérebro por um tempo e devolve todas as metas que ele visitou. */
function metasEm(segundos: number, comPrisao: boolean, comJogador: boolean): Set<string> {
    const brain = new Floor10WillBrain(11);
    const prison = comPrisao ? freshPrison() : null;
    const player = comJogador ? { x: 1.2, y: 0, z: 0.4 } : null;
    const vistas = new Set<string>();
    for (let t = 0; t < segundos; t += 0.1) {
        const tick = brain.tick({
            dt: 0.1,
            time: t,
            perception: vision(player),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
            prison,
        });
        vistas.add(tick.snapshot.goal);
    }
    return vistas;
}

describe('npc/floor10Will — o Nilo dentro da prisão', () => {
    it('sem prisão, as duas metas novas nem existem', () => {
        // Elas são específicas da sala trancada; em qualquer outro contexto o
        // Nilo continua sendo exatamente o que sempre foi.
        const metas = metasEm(400, false, true);
        expect(metas.has('try-device')).toBe(false);
        expect(metas.has('call-player')).toBe(false);
        expect(metas.size).toBeGreaterThan(1);
    });

    it('com prisão, ele CHEGA a experimentar os aparelhos', () => {
        // Não é garantia de acerto — é a possibilidade de tentar. Sem isso a
        // rede nunca poderia aprender que cooperar funciona: ação que não
        // existe não recebe recompensa.
        const metas = metasEm(1200, true, true);
        expect(metas.has('try-device') || metas.has('call-player')).toBe(true);
    });

    it('a entrada da rede cresce com os sentidos da prisão', () => {
        const brain = new Floor10WillBrain(3);
        const prison = freshPrison();
        // Coloca o Nilo em cima de uma placa: o sentido correspondente acende.
        const placa = PRISON_DEVICES[0];
        const tick = brain.tick({
            dt: 0.1,
            time: 1,
            perception: vision({ x: 1, y: 0, z: 1 }),
            npcPosition: { x: placa.x, y: 0, z: placa.z },
            conversationOpen: false,
            speaking: false,
            prison,
        });
        // 35 entradas: 16 do corpo + 10 do one-hot da última ação + 9 da prisão.
        expect(tick.snapshot.learning.parameterCount).toBe(13835);
    });

    it('a prisão não sequestra o reflexo: ele continua fazendo o resto', () => {
        const metas = metasEm(1200, true, true);
        // Se as metas da prisão tivessem utilidade alta, ele ia direto ao
        // aparelho e o campo de provas não provaria nada — o mérito seria da
        // minha tabela, não do que ele aprendeu.
        expect(metas.size).toBeGreaterThan(2);
    });
});
