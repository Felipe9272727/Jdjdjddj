import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
    baixarSemSubir, quemDevoDesligar, quemDevoLigar,
} from '../npc/floor10Roteamento';

describe('baixar não é ligar', () => {
    it('baixa pelo cofre sem construir engine nenhum', async () => {
        const chamadas: string[] = [];
        const progresso: number[] = [];
        const cofre = {
            download: async (url: string, o?: { progressCallback?: (p: never) => void }) => {
                chamadas.push(url);
                (o?.progressCallback as unknown as (p: object) => void)?.(
                    { loaded: 50, total: 100 },
                );
            },
        };
        const ok = await baixarSemSubir(cofre, 'https://x/m.gguf', (l) => progresso.push(l));
        expect(ok).toBe(true);
        expect(chamadas).toEqual(['https://x/m.gguf']);
        expect(progresso).toEqual([50]);
    });

    it('runtime sem `download` devolve false em vez de estourar', async () => {
        // Degradar para o caminho antigo é aceitável; sumir com o cérebro não.
        expect(await baixarSemSubir({}, 'https://x/m.gguf')).toBe(false);
        expect(await baixarSemSubir(null, 'https://x/m.gguf')).toBe(false);
        expect(await baixarSemSubir(undefined, 'https://x/m.gguf')).toBe(false);
    });

    it('propaga a falha do download em vez de engolir', async () => {
        const cofre = { download: async () => { throw new Error('rede caiu'); } };
        await expect(baixarSemSubir(cofre, 'https://x/m.gguf')).rejects.toThrow('rede caiu');
    });
});

describe('o roteamento que o dono do jogo desenhou', () => {
    // "o player manda mensagem pra mente, ela liga automaticamente junto do
    //  embbending, processa, e manda a resposta, pós mandar a resposta, ela
    //  desliga dnv junto do embbending... aí, o player saiu do chat,
    //  automaticamente, liga a vontade (llama 1b) e o motor"
    it('no chat: mente e memória de pé, vontade e motor parados', () => {
        expect(quemDevoLigar(true)).toEqual(['fala', 'memoria']);
        expect(quemDevoDesligar(true)).toEqual(['vontade', 'motor']);
    });

    it('fora do chat: vontade e motor de pé, fala e memória parados', () => {
        expect(quemDevoLigar(false)).toEqual(['vontade', 'motor']);
        expect(quemDevoDesligar(false)).toEqual(['fala', 'memoria']);
    });

    it('nunca há sobreposição: os dois grupos são disjuntos', () => {
        // É esta a invariante que segura o aparelho — nunca dois pipelines de
        // pé ao mesmo tempo. Medido: cada cérebro de pé custa ~2x o arquivo em
        // memória ANÔNIMA (4,52 de 5,09 GB), então sobreposição é RAM real.
        for (const noChat of [true, false]) {
            const ligados = new Set(quemDevoLigar(noChat));
            expect(quemDevoDesligar(noChat).some((c) => ligados.has(c))).toBe(false);
        }
    });
});

describe('fechar o chat descarrega a mente — a metade que pesa', () => {
    // Medido no celular emulado, separando memória ANÔNIMA de cache de arquivo:
    // cada cérebro de pé custa ~2x o próprio arquivo, e 89% é anônimo. Com os
    // quatro de pé a conta passa de 9 GB, e o Chrome no Android derruba muito
    // antes. Descarregar não perde nada: os pesos ficam no OPFS.
    it('o `close` do chat chama os dois descarregadores', () => {
        const fonte = readFileSync(
            new URL('../Floor10NpcChat.tsx', import.meta.url),
            'utf8',
        );
        const i = fonte.indexOf('const close = useCallback');
        const bloco = fonte.slice(i, i + 400);
        expect(bloco).toContain("npcSet({ open: false })");
        expect(bloco).toContain('unloadConversationBrain()');
        expect(bloco).toContain('unloadFloor10Memoria()');
    });

    it('a fila NÃO sobe runtime: os quatro só baixam', () => {
        // "baixe tudo de uma vez, sem ligar... eles não podem ter uma thread
        // ativa enquanto não estão sendo usados"
        const fonte = readFileSync(
            new URL('../Floor10NpcChat.tsx', import.meta.url),
            'utf8',
        );
        const i = fonte.indexOf('iniciarPrecarga(passosDoAndar10(');
        const bloco = fonte.slice(i, i + 1200);
        expect(bloco).toContain('baixarVontade()');
        expect(bloco).toContain('baixarMotor()');
        expect(bloco).toContain('baixarMemoria()');
        // A fala é a única que sobe: é ela que o jogador está esperando.
        expect(bloco).toContain('initLLM()');
    });
});
