import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    FLOOR10_RASCUNHADOR_MODEL,
    FLOOR10_RASCUNHADOR_LOAD_CONFIG,
    FLOOR10_RASCUNHO_TOKENS,
    FLOOR10_RASCUNHADOR_THREADS,
    PERSONA_DO_RASCUNHO,
    FILA_RASCUNHO,
} from '../npc/floor10Rascunhador';
import { PECA_RASCUNHO } from '../npc/floor10Composicao';

const fonte = readFileSync(new URL('../npc/floor10Rascunhador.ts', import.meta.url), 'utf8');

/**
 * O RASCUNHADOR — e o teste que mais importa aqui é sobre o que NÃO está na
 * configuração de carga.
 */
describe('a configuração de carga', () => {
    it('NÃO quantiza o KV — e este é o teste que impede o modelo de morrer', () => {
        // O jogo carrega todo o resto com `cache_type_k/v: 'q8_0'` (+15% medidos
        // no SmolLM3). Este modelo ABORTA com q8_0, num
        // `ggml-impl.h:318: fatal error` que não aponta para nada. Eu cheguei a
        // REPROVAR o modelo por isso, e o dono do jogo não aceitou: o histórico
        // mostrava ele rodando em agosto, e a diferença era só esta linha.
        //
        // O a800m, MESMA arquitetura `granitemoe`, engole q8_0 sem reclamar —
        // então não dá para deduzir do irmão. Alguém "arrumando" a assimetria
        // por simetria com os outros cérebros quebraria o pipeline inteiro com
        // um erro ilegível, e é isso que este teste existe para impedir.
        expect(FLOOR10_RASCUNHADOR_LOAD_CONFIG).not.toHaveProperty('cache_type_k');
        expect(FLOOR10_RASCUNHADOR_LOAD_CONFIG).not.toHaveProperty('cache_type_v');
        expect(fonte).toContain('cache_type_k');  // só no comentário que explica
        expect(fonte).toMatch(/AUSENTES de propósito/);
    });

    it('não pede GPU: ela já derrubou a fala três vezes neste aparelho', () => {
        expect(FLOOR10_RASCUNHADOR_LOAD_CONFIG.n_gpu_layers).toBe(0);
    });

    it('duas threads — ele divide o aparelho com o revisor', () => {
        expect(FLOOR10_RASCUNHADOR_THREADS).toBe(2);
    });

    it('o contexto é curto porque o rascunho é curto', () => {
        expect(FLOOR10_RASCUNHADOR_LOAD_CONFIG.n_ctx).toBeLessThanOrEqual(1024);
        expect(FLOOR10_RASCUNHO_TOKENS).toBeLessThanOrEqual(56);
    });
});

describe('o modelo', () => {
    it('é o a400m, e os bytes batem com a fila', () => {
        expect(FLOOR10_RASCUNHADOR_MODEL.url).toContain('granite-3.1-1b-a400m');
        expect(FLOOR10_RASCUNHADOR_MODEL.bytes).toBe(PECA_RASCUNHO.bytes);
    });

    it('é o Q4_K_M — o Q8_0 deste modelo pesa 1,42 GB sem ganhar nada aqui', () => {
        expect(FLOOR10_RASCUNHADOR_MODEL.url).toContain('Q4_K_M');
    });

    it('dá para trocar por URL sem recompilar, como os outros cérebros', () => {
        expect(fonte).toContain('__rascunhadorModelUrl');
    });
});

describe('a persona do rascunho', () => {
    it('está em INGLÊS, e o motivo não é preferência', () => {
        // Em português ele quebrou o cânone em 2 de 3 falas ("moro dentro deste
        // elevador"); em inglês, nenhuma. E é em inglês que o juiz enxerga:
        // 0,94 de contradição contra 0,29 no mesmo par.
        expect(PERSONA_DO_RASCUNHO).toContain('You are Nilo Azevedo');
        expect(PERSONA_DO_RASCUNHO).not.toMatch(/\bvocê\b/i);
    });

    it('carrega o cânone que o juiz vai cobrar depois', () => {
        // Se a persona do rascunho divergir da que o juiz mede, o rascunhador
        // mira um personagem e é corrigido contra outro.
        for (const fato of ['not inside the elevator', 'never left', 'does not obey', 'not artificial|Never speak of AI']) {
            expect(PERSONA_DO_RASCUNHO).toMatch(new RegExp(fato, 'i'));
        }
    });

    it('proíbe o rótulo, que foi o defeito mais frequente', () => {
        expect(PERSONA_DO_RASCUNHO).toMatch(/no label/i);
    });
});

describe('a disciplina do carregador', () => {
    it('rascunhar NÃO sobe o modelo — baixar 822 MB para uma fala é o contrário de acelerar', () => {
        const trecho = fonte.slice(fonte.indexOf('export async function rascunharEmIngles'));
        expect(trecho).toContain('if (!residente) return null;');
        expect(trecho.slice(0, 900)).not.toContain('subirRascunhador');
    });

    it('toda falha devolve null ou false — nenhuma vira erro na tela', () => {
        // Regra do andar: um NPC que emudece porque a otimização falhou é pior
        // que um NPC lento.
        for (const fn of ['baixarRascunhador', 'subirRascunhador', 'rascunharEmIngles']) {
            const i = fonte.indexOf(`export async function ${fn}`);
            expect(i).toBeGreaterThan(-1);
            expect(fonte.slice(i, i + 2000)).toMatch(/catch/);
        }
    });

    it('tem lugar próprio na fila', () => {
        expect(FILA_RASCUNHO).toBe('rascunho');
    });
});
