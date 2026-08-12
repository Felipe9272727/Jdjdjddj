import { describe, it, expect } from 'vitest';
import { perceiveFloor10 } from '../npc/floor10Perception';
import { mapaEmTexto } from '../npc/floor10Mapa';
import { freshPrison } from '../npc/f10Prison';

const olhar = (extra: Record<string, unknown> = {}) => perceiveFloor10({
    npcPosition: { x: 0, y: 0, z: 0 },
    npcYaw: 0,
    playerPosition: { x: 3, y: 0, z: 3 },
    ...extra,
});

describe('os olhos passam a ver os aparelhos da sala trancada', () => {
    it('sem prisão, nada muda — o campo é vazio, não ausente', () => {
        expect(olhar().devices).toEqual([]);
    });

    it('COM prisão, ele vê as quatro placas e alavancas', () => {
        // ── O BURACO QUE ISTO FECHA ───────────────────────────────────────
        // O andar tem duas placas em cantos opostos e duas alavancas: é o
        // quebra-cabeça cooperativo inteiro. Os olhos reportavam quatro tipos
        // de objeto — chão, paredes, elevador, jogador — e nenhum aparelho.
        //
        // Três peças prontas dependiam disso e ficavam inertes: os alvos
        // `nearest-device`/`active-device` do motor, as ações `try-device`/
        // `call-player` da rede de reforço, e a própria vontade, que não podia
        // querer o que não sabia existir.
        const olhos = olhar({ prison: freshPrison() });
        expect(olhos.devices.length).toBe(4);
        for (const d of olhos.devices) {
            expect(d.distance).toBeGreaterThan(0);
            expect(typeof d.direction).toBe('string');
            expect(typeof d.visible).toBe('boolean');
        }
    });

    it('a distância e a direção saem da MESMA régua dos outros objetos', () => {
        const olhos = olhar({ prison: freshPrison() });
        const oeste = olhos.devices.find((d) => d.id === 'placa-oeste');
        // placa-oeste fica em (-7, -6); do centro olhando para +z, ela está atrás
        // e à esquerda, a ~9,2 m.
        expect(oeste?.distance).toBeCloseTo(9.2, 0);
        expect(oeste?.direction).toContain('back');
    });

    it('`device` entra em visibleObjects quando algum está no campo de visão', () => {
        const olhos = olhar({ prison: freshPrison() });
        const algumVisivel = olhos.devices.some((d) => d.visible);
        expect(olhos.visibleObjects.includes('device')).toBe(algumVisivel);
    });
});

describe('o mapa que a vontade lê passa a ter o que querer', () => {
    it('sem prisão o mapa não menciona aparelho nenhum', () => {
        const texto = mapaEmTexto(olhar(), 0);
        expect(texto).not.toContain('plate');
        expect(texto).not.toContain('lever');
    });

    it('com prisão ele lista os aparelhos E diz que precisa de dois', () => {
        const texto = mapaEmTexto(olhar({ prison: freshPrison() }), 0);
        expect(texto).toContain('plate');
        expect(texto).toContain('lever');
        // A regra que transforma objeto de cenário em convite: sozinho não dá.
        expect(texto).toContain('SAME TIME');
        expect(texto).toContain('cannot reach two at once');
    });

    it('quando o JOGADOR está em cima de um, o mapa grita isso', () => {
        // É a única frase do mapa que pede duas pessoas. Sem ela, o Nilo vê
        // um objeto; com ela, vê um convite.
        const prisao = freshPrison();
        prisao.devices['placa-oeste'].heldByPlayer = true;
        const texto = mapaEmTexto(olhar({ prison: prisao }), 0);
        expect(texto).toContain('HE is standing on it right now');
    });

    it('o mapa DEGRADA em vez de quebrar quando a percepção é antiga', () => {
        // Percepções montadas à mão (testes, o ?campo, chamadores antigos)
        // chegam sem `devices`. Um mapa que estoura derruba a deliberação
        // inteira — o Nilo pararia de pensar por causa de um campo novo.
        const antiga = { ...olhar(), devices: undefined } as never;
        expect(() => mapaEmTexto(antiga, 0)).not.toThrow();
    });
});

describe('os olhos novos CHEGAM ao jogo', () => {
    it('o corpo 3D passa a prisão para a percepção', async () => {
        // Quem decide se os olhos veem os aparelhos é quem CHAMA. Sem a prisão
        // aqui, o campo chega vazio e tudo continua como antes — mais uma peça
        // pronta e desligada, que é o defeito que esta base já teve três vezes
        // (a tabela de roteamento, o `planoDaProsa`, e a fila de download).
        const fonte = await import('node:fs/promises')
            .then((fs) => fs.readFile(new URL('../Floor10Npc.tsx', import.meta.url), 'utf8'));
        expect(/perceiveFloor10\(\{[\s\S]{0,600}?prison: f10prison/.test(fonte)).toBe(true);
    });
});
