import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
    baixarSemSubir, desligarQuemNaoEDaVez, quemDevoDesligar, quemDevoLigar,
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

describe('a tabela vira ação: desligarQuemNaoEDaVez', () => {
    it('no chat, desliga a vontade e o motor — nunca a fala nem a memória', async () => {
        const saiu: string[] = [];
        const chamados = await desligarQuemNaoEDaVez(true, {
            fala: async () => { saiu.push('fala'); },
            memoria: async () => { saiu.push('memoria'); },
            vontade: async () => { saiu.push('vontade'); },
            motor: async () => { saiu.push('motor'); },
        });
        expect(saiu).toEqual(['vontade', 'motor']);
        expect(chamados).toEqual(['vontade', 'motor']);
    });

    it('fora do chat, desliga a fala e a memória', async () => {
        const saiu: string[] = [];
        await desligarQuemNaoEDaVez(false, {
            fala: async () => { saiu.push('fala'); },
            memoria: async () => { saiu.push('memoria'); },
            vontade: async () => { saiu.push('vontade'); },
            motor: async () => { saiu.push('motor'); },
        });
        expect(saiu).toEqual(['fala', 'memoria']);
    });

    it('um cérebro que se recusa a sair não impede o outro', async () => {
        // Descarregar já custou uma sessão inteira de livre-arbítrio quando uma
        // promessa ficou pendurada. Aqui: se a vontade estourar, o motor SAI
        // mesmo assim, e quem chama sabe quem de fato saiu.
        const saiu: string[] = [];
        const chamados = await desligarQuemNaoEDaVez(true, {
            vontade: async () => { throw new Error('worker já morreu'); },
            motor: async () => { saiu.push('motor'); },
        });
        expect(saiu).toEqual(['motor']);
        expect(chamados).toEqual(['motor']);
    });

    it('um de cada vez, nunca em paralelo', async () => {
        // Dois workers de 1 GB morrendo juntos é pico de memória, não economia.
        let vivos = 0;
        let pico = 0;
        const lento = async () => {
            vivos += 1;
            pico = Math.max(pico, vivos);
            await new Promise((r) => { setTimeout(r, 5); });
            vivos -= 1;
        };
        await desligarQuemNaoEDaVez(true, { vontade: lento, motor: lento });
        expect(pico).toBe(1);
    });

    it('cérebro sem manobra é pulado, não quebra', async () => {
        expect(await desligarQuemNaoEDaVez(true, {})).toEqual([]);
    });
});

describe('ABRIR o chat desliga a vontade e o motor', () => {
    // O defeito nº 1 do relatório: "quando eu saio do chat, e entro, LAGA
    // TUDO". Fechar já descarregava a dupla da conversa; abrir não desligava
    // nada, e a vontade fica RESIDENTE entre rodadas — `abortDeliberation` só
    // encerra o worker que está gerando naquele instante. Então a fala reabria
    // 3,9 GB por cima de 1,32 GB parados mais 640 MB parados.
    const fonte = readFileSync(new URL('../Floor10NpcChat.tsx', import.meta.url), 'utf8');
    const bloco = fonte.slice(
        fonte.indexOf('const open = useCallback'),
        fonte.indexOf('const close = useCallback'),
    );

    it('o `open` chama o roteamento com noChat = true', () => {
        expect(bloco).toContain('desligarQuemNaoEDaVez(true, {');
        expect(bloco).toContain('unloadSmallBrain()');
        expect(bloco).toContain('unloadFloor10MotorBrain()');
    });

    it('desliga ANTES de mandar a fila subir a fala', () => {
        const desliga = bloco.indexOf('desligarQuemNaoEDaVez(true');
        const fila = bloco.indexOf('iniciarPrecarga(');
        expect(desliga).toBeGreaterThan(-1);
        expect(fila).toBeGreaterThan(desliga);
    });

    it('não espera: quem esperaria seria o jogador', () => {
        // O lado de fechar dorme 12s antes de subir a vontade, porque o sistema
        // demora a devolver a memória. Do lado de abrir, a folga vem de graça —
        // a fala só reabre no ENVIO da mensagem, não na abertura do painel.
        expect(bloco).toContain('void desligarQuemNaoEDaVez(true');
        expect(bloco).not.toContain('await desligarQuemNaoEDaVez');
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
        // Mesma lição do teste abaixo: a janela mede PRESENÇA, não distância.
        const bloco = fonte.slice(i, i + 1200);
        expect(bloco).toContain("npcSet({ open: false })");
        expect(bloco).toContain('unloadConversationBrain()');
        expect(bloco).toContain('unloadFloor10Memoria()');
    });

    it('a vontade sobe DEPOIS dos descarregamentos, nunca junto', () => {
        // A tabela proíbe sobreposição, e aqui é onde ela vira código: subir o
        // 1B enquanto o 3B ainda está de pé é exatamente a soma de memória que
        // derruba a aba. A ordem no `close` é a prova.
        const fonte = readFileSync(
            new URL('../Floor10NpcChat.tsx', import.meta.url),
            'utf8',
        );
        const i = fonte.indexOf('const close = useCallback');
        // Janela generosa: o que se prova aqui é a ORDEM das chamadas, não a
        // proximidade delas. Estava em 1600 e um comentário novo empurrou
        // `precarregarVontade` para fora — o teste acusou uma regressão que não
        // existia. Contar caracteres é frágil; a ordem é o que importa.
        const bloco = fonte.slice(i, i + 4000);
        const descarrega = bloco.indexOf('unloadFloor10Memoria()');
        const liga = bloco.indexOf('precarregarVontade()');
        expect(descarrega).toBeGreaterThan(-1);
        expect(liga).toBeGreaterThan(descarrega);
        // E desiste se o jogador reabriu o chat no meio.
        expect(bloco).toContain('if (npc.open) return;');
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
