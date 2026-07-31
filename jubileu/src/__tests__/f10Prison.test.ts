import { describe, expect, it } from 'vitest';
import {
    PRISON_DEVICES, PRISON_SENSE_SIZE, describePrison, freshPrison,
    prisonReward, prisonSenses, stepPrison, type F10PrisonState, type PrisonEvent,
} from '../npc/f10Prison';

const em = (id: string) => {
    const d = PRISON_DEVICES.find((x) => x.id === id);
    if (!d) throw new Error(`aparelho ${id} não existe`);
    return { x: d.x, z: d.z };
};
const LONGE = { x: 0, z: 0 };

/** Roda `segundos` com o Nilo e o jogador parados onde foram colocados. */
function correr(
    state: F10PrisonState,
    segundos: number,
    npc: { x: number; z: number } | null,
    player: { x: number; z: number } | null,
): PrisonEvent[] {
    const todos: PrisonEvent[] = [];
    for (let t = 0; t < segundos; t += 0.1) {
        todos.push(...stepPrison(state, { npc, player, dt: 0.1 }));
    }
    return todos;
}

describe('npc/f10Prison — a saída precisa de dois', () => {
    it('o Nilo SOZINHO não abre nada, tente o quanto tentar', () => {
        // É a premissa inteira: ele está preso há anos porque uma pessoa só
        // não resolve. Cinco minutos em cima da placa não movem a tranca.
        const p = freshPrison();
        correr(p, 300, em('placa-oeste'), null);
        expect(p.locks.every((l) => !l.solved)).toBe(true);
        expect(p.doorOpen).toBe(false);
        // Mas ele TENTOU, e a tentativa fica registrada.
        expect(p.npcAttempts).toBeGreaterThan(0);
    });

    it('nem correndo de uma ponta à outra: a mesma pessoa não vale por duas', () => {
        const p = freshPrison();
        for (let i = 0; i < 40; i += 1) {
            correr(p, 1, em('placa-oeste'), null);
            correr(p, 1, em('placa-leste'), null);
        }
        expect(p.locks.find((l) => l.id === 'placas')?.solved).toBe(false);
    });

    it('os DOIS juntos, cada um numa ponta, fazem a tranca ceder', () => {
        const p = freshPrison();
        const eventos = correr(p, 4, em('placa-oeste'), em('placa-leste'));
        expect(p.locks.find((l) => l.id === 'placas')?.solved).toBe(true);
        expect(eventos.some((e) => e.type === 'juntos')).toBe(true);
        expect(eventos.some((e) => e.type === 'tranca-aberta')).toBe(true);
        // A outra tranca não abriu de brinde.
        expect(p.locks.find((l) => l.id === 'alavancas')?.solved).toBe(false);
        expect(p.doorOpen).toBe(false);
    });

    it('soltar antes da hora não abre — e registra o quase', () => {
        const p = freshPrison();
        correr(p, 1.5, em('placa-oeste'), em('placa-leste')); // precisa de 2,5s
        const eventos = correr(p, 1, em('placa-oeste'), LONGE);
        expect(p.locks.find((l) => l.id === 'placas')?.solved).toBe(false);
        expect(eventos.some((e) => e.type === 'quase')).toBe(true);
        expect(p.locks.find((l) => l.id === 'placas')!.nearMisses).toBeGreaterThan(0);
    });

    it('todas as trancas abertas → a porta cede', () => {
        const p = freshPrison();
        correr(p, 4, em('placa-oeste'), em('placa-leste'));
        const eventos = correr(p, 6, em('alavanca-norte'), em('alavanca-sul'));
        expect(p.doorOpen).toBe(true);
        expect(eventos.some((e) => e.type === 'porta-aberta')).toBe(true);
    });

    it('os eventos contínuos valem POR SEGUNDO, não por quadro', () => {
        // 'juntos' dispara a cada quadro. Sem escalar pelo dt, um segundo lado
        // a lado valia 60 × 0,35 = 21 — mais de dez vezes o prêmio de abrir a
        // porta, afogando todo o resto do sinal.
        const umQuadro = prisonReward({ type: 'juntos', lock: 'placas', progress: 0.5 }, 1 / 60);
        const umSegundo = prisonReward({ type: 'juntos', lock: 'placas', progress: 0.5 }, 1);
        expect(umQuadro * 60).toBeCloseTo(umSegundo, 5);
        expect(umQuadro).toBeLessThan(prisonReward({ type: 'porta-aberta' }, 1 / 60));
        // Os discretos ignoram o dt: acontecem uma vez e valem cheio.
        expect(prisonReward({ type: 'tranca-aberta', lock: 'placas' }, 1 / 60))
            .toBe(prisonReward({ type: 'tranca-aberta', lock: 'placas' }, 1));
    });

    it('a recompensa ensina COOPERAÇÃO, não decoreba de aparelho', () => {
        expect(prisonReward({ type: 'tentativa-sozinho', device: 'placa-oeste' }))
            .toBeLessThan(0);
        expect(prisonReward({ type: 'juntos', lock: 'placas', progress: 0.5 }))
            .toBeGreaterThan(0.2);
        expect(prisonReward({ type: 'tranca-aberta', lock: 'placas' }))
            .toBeGreaterThan(prisonReward({ type: 'juntos', lock: 'placas', progress: 1 }));
        expect(prisonReward({ type: 'porta-aberta' }))
            .toBeGreaterThan(prisonReward({ type: 'tranca-aberta', lock: 'placas' }));
    });

    it('ele NÃO recebe a solução de bandeja — nem nos sentidos, nem no texto', () => {
        // Se algum destes textos contasse a regra, o campo de provas não
        // testaria independência nenhuma: ele estaria lendo a resposta.
        const p = freshPrison();
        const texto = describePrison(p);
        expect(texto).toContain('LOCKED IN');
        expect(texto.toLowerCase()).not.toContain('at the same time');
        expect(texto.toLowerCase()).not.toContain('two people');
        expect(texto.toLowerCase()).not.toContain('ask the player');
        // Os sentidos são números do que dá para perceber, no tamanho fixo que
        // a rede espera.
        expect(prisonSenses(p)).toHaveLength(PRISON_SENSE_SIZE);
        for (const v of prisonSenses(p)) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
    });

    it('ele PERCEBE que algo mudou quando não estava sozinho', () => {
        // Não é a regra: é a pista. O zumbido só existe com os dois, e é daí
        // que ele pode tirar sozinho a conclusão de chamar o jogador.
        const p = freshPrison();
        correr(p, 1, em('placa-oeste'), em('placa-leste'));
        expect(describePrison(p)).toContain('humming');
        const sentidos = prisonSenses(p);
        expect(Math.max(...sentidos)).toBeGreaterThan(0);
    });

    it('o silêncio longo aparece — é o que dói e empurra para outra ideia', () => {
        const p = freshPrison();
        correr(p, 120, em('placa-oeste'), null);
        expect(describePrison(p)).toContain('Nothing has changed');
    });

    it('as duas placas ficam longe demais para uma pessoa alcançar as duas', () => {
        const oeste = em('placa-oeste');
        const leste = em('placa-leste');
        expect(Math.hypot(oeste.x - leste.x, oeste.z - leste.z)).toBeGreaterThan(4);
    });
});
