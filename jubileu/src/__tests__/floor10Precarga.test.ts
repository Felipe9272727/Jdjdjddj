import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    conversaLiberada, iniciarPrecarga, passosDoAndar10, precargaCompleta,
    precargaEtapa, resetPrecargaForTests,
} from '../npc/floor10Precarga';
import { definirFilaDoAndar10, floor10Fila } from '../npc/floor10Fila';
import { npcSet } from '../npc/npcStore';

const ordem: string[] = [];
const carregador = (nome: string, ms = 0) => () => {
    ordem.push(`inicio:${nome}`);
    return new Promise((r) => setTimeout(() => { ordem.push(`fim:${nome}`); r(null); }, ms));
};

describe('npc/floor10Precarga — baixa TUDO primeiro, um depois do outro', () => {
    beforeEach(() => {
        ordem.length = 0;
        resetPrecargaForTests();
        // A conversa fechada é o estado neutro: com ela aberta os passos
        // pesados esperam, e um teste vizinho herdaria a espera.
        npcSet({ open: false, phase: 'cold' });
        definirFilaDoAndar10({
            fala: 1_915_305_312, vontade: 1_321_083_008,
            motor: 639_446_688, memoria: 333_590_944,
        });
    });

    it('baixa UM DE CADA VEZ, com os leves antes dos dois pesados', async () => {
        // Em paralelo eles dividiriam a mesma banda e a mesma CPU — e o wllama
        // ainda tem de ler cada arquivo de volta do cache para dentro do WASM
        // ao terminar. Dois fazendo isso junto num celular é a travada.
        //
        // A ordem põe a memória (333 MB, usada em TODA mensagem) antes da
        // vontade (1,32 GB) e do motor (640 MB): estes dois esperam a conversa
        // fechar, e atrás deles a memória demoraria a chegar sem precisar.
        await iniciarPrecarga(passosDoAndar10({
            fala: carregador('fala'),
            vontade: carregador('vontade'),
            motor: carregador('motor'),
            memoria: carregador('memoria'),
        }));
        expect(ordem).toEqual([
            'inicio:fala', 'fim:fala',
            'inicio:memoria', 'fim:memoria',
            'inicio:vontade', 'fim:vontade',
            'inicio:motor', 'fim:motor',
        ]);
    });

    it('com o chat ABERTO, a vontade e o motor não sobem', async () => {
        // O defeito: `precarregar*` não baixa, ele chama `activate()` e SOBE um
        // runtime inteiro. Com o painel aberto isso punha 1,32 GB + 640 MB em pé
        // por cima do SmolLM3 de 1,92 GB — e a primeira mensagem do jogador
        // matava, via `pausarDeliberacao()`, exatamente o que tinha acabado de
        // subir. É o ciclo reabre-e-mata, pela metade que faltava consertar.
        npcSet({ open: true, phase: 'ready' });
        const fila = iniciarPrecarga(passosDoAndar10({
            fala: carregador('fala'),
            vontade: carregador('vontade'),
            motor: carregador('motor'),
            memoria: carregador('memoria'),
        }));
        await vi.waitFor(() => expect(ordem).toContain('fim:memoria'));
        expect(ordem).not.toContain('inicio:vontade');
        expect(ordem).not.toContain('inicio:motor');

        // Fechou: os dois pesados sobem inteiros, sem cancelamento nenhum.
        npcSet({ open: false });
        await fila;
        expect(ordem).toEqual([
            'inicio:fala', 'fim:fala',
            'inicio:memoria', 'fim:memoria',
            'inicio:vontade', 'fim:vontade',
            'inicio:motor', 'fim:motor',
        ]);
    });

    it('gerar uma resposta também segura os dois pesados', async () => {
        // `phase: 'thinking'` é o 3B escrevendo. Subir outro llama.cpp aqui é a
        // mesma disputa de núcleos, com o painel aberto ou não.
        npcSet({ open: false, phase: 'thinking' });
        const fila = iniciarPrecarga(passosDoAndar10({
            fala: carregador('fala'),
            vontade: carregador('vontade'),
            motor: carregador('motor'),
            memoria: carregador('memoria'),
        }));
        await vi.waitFor(() => expect(ordem).toContain('fim:memoria'));
        expect(ordem).not.toContain('inicio:vontade');

        npcSet({ phase: 'ready' });
        await fila;
        expect(ordem).toContain('fim:motor');
    });

    it('a fila chega a 100% — era isto que não acontecia', async () => {
        // O relato: a barra parava em "1 de 4 · 49%" e ficava lá, porque os
        // outros dois nunca eram pedidos.
        await iniciarPrecarga(passosDoAndar10({
            fala: carregador('fala'),
            vontade: carregador('vontade'),
            motor: carregador('motor'),
            memoria: carregador('memoria'),
        }));
        expect(floor10Fila.completa()).toBe(true);
        expect(floor10Fila.estado().fracao).toBe(1);
        expect(precargaCompleta()).toBe(true);
    });

    it('um cérebro que falha NÃO trava a fila', async () => {
        // Sem a vontade ele segue no reflexo; sem o motor a intenção continua
        // ampla. Parar a fila transformaria degradação em pane.
        await iniciarPrecarga(passosDoAndar10({
            fala: carregador('fala'),
            vontade: () => Promise.reject(new Error('sem espaço')),
            motor: carregador('motor'),
            memoria: carregador('memoria'),
        }));
        expect(ordem).toContain('inicio:motor');
        expect(precargaCompleta()).toBe(true);
    });

    it('chamar duas vezes não baixa duas vezes', async () => {
        const passos = passosDoAndar10({
            fala: carregador('fala'),
            vontade: carregador('vontade'),
            motor: carregador('motor'),
            memoria: carregador('memoria'),
        });
        const a = iniciarPrecarga(passos);
        const b = iniciarPrecarga(passos);
        expect(a).toBe(b);
        await a;
        expect(ordem.filter((o) => o === 'inicio:fala')).toHaveLength(1);
    });

    it('a conversa libera com a FALA, sem esperar os 3,9 GB', async () => {
        // Prender o "oi" até os três descerem seria trocar um problema por um
        // pior: o jogador chega no Nilo e fica olhando barra por vários minutos.
        npcSet({ phase: 'ready' });
        expect(conversaLiberada()).toBe(true);
        npcSet({ phase: 'cold' });
    });

    it('a etapa atual é observável, para a tela não ter de adivinhar', async () => {
        expect(precargaEtapa()).toBe('fala');
        await iniciarPrecarga(passosDoAndar10({
            fala: carregador('fala'),
            vontade: carregador('vontade'),
            motor: carregador('motor'),
            memoria: carregador('memoria'),
        }));
        expect(precargaEtapa()).toBe('pronto');
    });
});

describe('falha ≠ concluído — o "pulou direto pra baixar o motor"', () => {
    beforeEach(() => {
        ordem.length = 0;
        resetPrecargaForTests();
        // A conversa fechada é o estado neutro: com ela aberta os passos
        // pesados esperam, e um teste vizinho herdaria a espera.
        npcSet({ open: false, phase: 'cold' });
        definirFilaDoAndar10({
            fala: 1_915_305_312, vontade: 1_321_083_008,
            motor: 639_446_688, memoria: 333_590_944,
        });
    });

    it('um carregador que devolve FALSE não conta como baixado', async () => {
        // `precarregarVontade` devolve `false` quando não consegue — e `false`
        // não é exceção, então o try/catch sozinho não via nada. A fila dava
        // por baixado 1,32 GB que nunca chegaram, e a barra pulava adiante.
        await iniciarPrecarga(passosDoAndar10({
            fala: carregador('fala'),
            vontade: () => Promise.resolve(false),
            motor: carregador('motor'),
            memoria: carregador('memoria'),
        }));
        const e = floor10Fila.estado();
        expect(e.prontos).not.toContain('vontade');
        expect(e.falhados.map((f) => f.id)).toContain('vontade');
        // E a barra NÃO chega a 100%, porque de fato não baixou tudo.
        expect(e.fracao).toBeLessThan(1);
        expect(floor10Fila.completa()).toBe(false);
    });

    it('a falha carrega um motivo legível, em vez de silêncio', async () => {
        await iniciarPrecarga(passosDoAndar10({
            fala: carregador('fala'),
            vontade: () => Promise.reject(new Error('o navegador só libera 1.87 GB')),
            motor: carregador('motor'),
            memoria: carregador('memoria'),
        }));
        const falha = floor10Fila.estado().falhados.find((f) => f.id === 'vontade');
        expect(falha?.motivo).toContain('1.87 GB');
    });

    it('mesmo falhando, a fila SEGUE para o próximo', async () => {
        await iniciarPrecarga(passosDoAndar10({
            fala: carregador('fala'),
            vontade: () => Promise.resolve(false),
            motor: carregador('motor'),
            memoria: carregador('memoria'),
        }));
        // Sem a vontade ele anda no reflexo; parar seria virar pane.
        expect(ordem).toContain('inicio:motor');
        expect(floor10Fila.estado().prontos).toContain('motor');
    });
});
