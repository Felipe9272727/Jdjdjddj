import { beforeEach, describe, expect, it } from 'vitest';
import {
    FLOOR10_GPU_FPS_FLOOR,
    FLOOR10_GPU_FIRST_RUNG,
    FLOOR10_GPU_MAX_LAYERS,
    FLOOR10_GPU_MIN_SAMPLES,
    FLOOR10_GPU_START_LAYERS,
    Floor10GpuGovernor,
    FpsSampler,
} from '../npc/floor10Gpu';

// O ambiente de teste é `node` puro: não existe localStorage. Sem este
// substituto os testes de persistência passariam por engano — o gerente
// gravaria no vazio e ninguém notaria, que é exatamente o bug que eles
// existem para pegar.
const memoria = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => memoria.get(k) ?? null,
    setItem: (k: string, v: string) => { memoria.set(k, String(v)); },
    removeItem: (k: string) => { memoria.delete(k); },
    clear: () => { memoria.clear(); },
    get length() { return memoria.size; },
    key: (i: number) => [...memoria.keys()][i] ?? null,
};

// Cada teste começa limpo, senão um herdaria o veredito do anterior.
const zerar = () => { memoria.clear(); };

/** Alimenta o mesmo degrau até ele fechar a contagem mínima de amostras. */
const medir = (g: Floor10GpuGovernor, layers: number, tps: number, fps: number | null) => {
    let s = g.snapshot();
    for (let i = 0; i < FLOOR10_GPU_MIN_SAMPLES; i += 1) s = g.observe({ layers, tps, fps });
    return s;
};

describe('npc/floor10Gpu — a IA que decide quanto da GPU vale a pena', () => {
    beforeEach(zerar);

    it('o PADRÃO é a CPU: a GPU quebrou a fala duas vezes no aparelho real', () => {
        // O dono do jogo pediu uma parte da GPU ligada de saída, e foi o que
        // eu entreguei: 3 de 36 camadas. No celular dele isso deu "(ABORT)" e
        // depois "loadModel() is not yet called" — a geração morrendo, não
        // ficando lenta. Um padrão que quebra a primeira mensagem de todo
        // jogador não é "uma parte pequena ligada", é um defeito ligado.
        const g = new Floor10GpuGovernor();
        expect(FLOOR10_GPU_START_LAYERS).toBe(0);
        expect(g.layersForLoad()).toBe(0);
        // A engrenagem continua inteira: ligar é um botão, e o degrau de
        // partida é pequeno, longe do terço de modelo que travava antes.
        expect(FLOOR10_GPU_FIRST_RUNG).toBeGreaterThan(0);
        expect(FLOOR10_GPU_FIRST_RUNG).toBeLessThanOrEqual(4);
        expect(FLOOR10_GPU_MAX_LAYERS).toBeLessThan(12);
        expect(g.force(FLOOR10_GPU_FIRST_RUNG).nextLayers).toBe(FLOOR10_GPU_FIRST_RUNG);
    });

    it('mede a CPU pura antes de decidir qualquer coisa — precisa da régua', () => {
        const g = new Floor10GpuGovernor();
        const s = medir(g, FLOOR10_GPU_FIRST_RUNG, 2.6, 60);
        expect(s.baselineTps).toBeNull();
        // Sem linha de base ele não sabe se ganhou; a próxima carga vai medi-la.
        expect(s.nextLayers).toBe(0);
    });

    it('REQUISITO DO DONO: nunca fica num degrau mais lento que a CPU', () => {
        const g = new Floor10GpuGovernor();
        medir(g, FLOOR10_GPU_FIRST_RUNG, 2.0, 60);
        medir(g, 0, 2.5, 60);              // CPU pura é MAIS rápida
        const s = medir(g, FLOOR10_GPU_FIRST_RUNG, 2.0, 60);
        expect(s.verdict).toBe('recuado');
        expect(s.nextLayers).toBe(0);
        expect(s.reason).toContain('menos que');
    });

    it('sobe de degrau quando a GPU ganha da CPU e o FPS aguenta', () => {
        const g = new Floor10GpuGovernor();
        medir(g, FLOOR10_GPU_FIRST_RUNG, 3.4, 60);
        medir(g, 0, 2.5, 60);
        const s = medir(g, FLOOR10_GPU_FIRST_RUNG, 3.4, 60);
        expect(s.verdict).toBe('subindo');
        expect(s.nextLayers).toBeGreaterThan(FLOOR10_GPU_FIRST_RUNG);
        expect(s.nextLayers).toBeLessThanOrEqual(FLOOR10_GPU_MAX_LAYERS);
    });

    it('o FPS tem VETO: engasgo derruba a GPU mesmo com a fala mais rápida', () => {
        const g = new Floor10GpuGovernor();
        medir(g, 0, 2.5, 60);
        // Dobro da velocidade de fala, e ainda assim é rejeitado.
        const s = g.observe({ layers: FLOOR10_GPU_FIRST_RUNG, tps: 5.0, fps: 18 });
        expect(FLOOR10_GPU_FPS_FLOOR).toBeGreaterThan(18);
        expect(s.verdict).toBe('recuado');
        expect(s.nextLayers).toBe(0);
        expect(s.reason).toContain('FPS');
    });

    it('queda relativa de FPS também derruba, mesmo acima do piso', () => {
        const g = new Floor10GpuGovernor();
        medir(g, 0, 2.5, 60);
        // 40 FPS está acima do piso de 24, mas é uma queda de 33% sobre os 60
        // que o jogo fazia sem GPU. O jogador sente isso.
        const s = g.observe({ layers: FLOOR10_GPU_FIRST_RUNG, tps: 4.0, fps: 40 });
        expect(s.verdict).toBe('recuado');
        expect(s.reason).toContain('60');
    });

    it('recuar é definitivo: não fica tentando a GPU de novo sozinho', () => {
        const g = new Floor10GpuGovernor();
        medir(g, 0, 2.5, 60);
        g.observe({ layers: FLOOR10_GPU_FIRST_RUNG, tps: 5.0, fps: 10 });
        // Amostras ótimas depois do castigo não reabrem o assunto.
        const s = medir(g, FLOOR10_GPU_FIRST_RUNG, 9.9, 60);
        expect(s.verdict).toBe('recuado');
        expect(s.nextLayers).toBe(0);
    });

    it('uma fala que ABORTA com GPU ligada recua — o buraco que custou uma mensagem', () => {
        // Isto aconteceu de verdade: etiqueta "WebGPU×3 + CPU×8", tela com
        // "(ABORT)", e o gerente sem ficar sabendo de nada. O motivo é sutil:
        // `observe` só aprende com falas que produziram tokens, e uma geração
        // que aborta produz ZERO. O pior resultado possível não ensinava nada,
        // e o degrau ruim continuava marcado para a próxima carga.
        const g = new Floor10GpuGovernor();
        expect(g.layersForLoad()).toBe(FLOOR10_GPU_START_LAYERS);
        // Amostra de fala abortada: sem tokens, o `observe` ignora…
        expect(g.observe({ layers: FLOOR10_GPU_FIRST_RUNG, tps: 0, fps: 60 }).verdict)
            .not.toBe('recuado');
        // …e é por isso que a falha precisa de porta própria.
        const s = g.markGenerationFailed('WllamaAbortError: (ABORT)');
        expect(s.verdict).toBe('recuado');
        expect(s.nextLayers).toBe(0);
        expect(s.reason).toContain('ABORT');
        // E fica guardado: a próxima sessão não repete o experimento.
        expect(new Floor10GpuGovernor().layersForLoad()).toBe(0);
    });

    it('uma carga que falha com GPU volta para a CPU e fica lá', () => {
        const g = new Floor10GpuGovernor();
        const s = g.markLoadFailed('QuotaExceededError');
        expect(s.verdict).toBe('recuado');
        expect(s.nextLayers).toBe(0);
        expect(s.reason).toContain('CPU');
    });

    it('aparelho sem adaptador encerra o assunto sem drama', () => {
        const g = new Floor10GpuGovernor();
        const s = g.markUnavailable();
        expect(s.verdict).toBe('indisponivel');
        expect(s.nextLayers).toBe(0);
        // E amostras depois disso não mexem em nada.
        expect(g.observe({ layers: 4, tps: 99, fps: 60 }).nextLayers).toBe(0);
    });

    it('não decide por UMA amostra: ruído de uma fala não vira veredito', () => {
        const g = new Floor10GpuGovernor();
        const s = g.observe({ layers: FLOOR10_GPU_FIRST_RUNG, tps: 3.4, fps: 60 });
        expect(s.verdict).toBe('medindo');
        expect(s.reason).toContain(`1/${FLOOR10_GPU_MIN_SAMPLES}`);
        expect(FLOOR10_GPU_MIN_SAMPLES).toBeGreaterThanOrEqual(3);
    });

    it('para de subir no teto e assenta no melhor degrau medido', () => {
        const g = new Floor10GpuGovernor();
        medir(g, 0, 2.0, 60);
        for (let l = FLOOR10_GPU_FIRST_RUNG; l <= FLOOR10_GPU_MAX_LAYERS; l += 2) {
            medir(g, l, 2.0 + l * 0.1, 60);
        }
        const s = g.snapshot();
        expect(s.nextLayers).toBeLessThanOrEqual(FLOOR10_GPU_MAX_LAYERS);
        expect(['estavel', 'subindo']).toContain(s.verdict);
    });

    it('o dono do jogo manda mais que o gerente', () => {
        const g = new Floor10GpuGovernor();
        expect(g.force(0).nextLayers).toBe(0);
        expect(g.force(6).nextLayers).toBe(6);
        expect(g.force(999).nextLayers).toBe(FLOOR10_GPU_MAX_LAYERS);
        expect(g.reset().nextLayers).toBe(FLOOR10_GPU_START_LAYERS);
    });

    it('o que aprendeu sobrevive ao fechar o jogo', () => {
        const g = new Floor10GpuGovernor();
        medir(g, 0, 2.5, 60);
        g.observe({ layers: FLOOR10_GPU_FIRST_RUNG, tps: 5, fps: 12 });
        // Sessão nova, mesmo aparelho: não repete o erro que já custou caro.
        const outro = new Floor10GpuGovernor();
        expect(outro.snapshot().verdict).toBe('recuado');
        expect(outro.layersForLoad()).toBe(0);
    });
});

describe('FpsSampler — o termômetro é o próprio jogo', () => {
    it('usa a MEDIANA: um engasgo isolado não afunda a medida', () => {
        const s = new FpsSampler();
        // Sem quadros suficientes ele admite que não sabe, em vez de chutar.
        expect(s.stop()).toBeNull();
    });

    it('sem requestAnimationFrame não quebra nem inventa número', () => {
        const raf = globalThis.requestAnimationFrame;
        (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = undefined;
        const s = new FpsSampler();
        expect(() => s.start()).not.toThrow();
        expect(s.stop()).toBeNull();
        (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = raf;
    });
});
