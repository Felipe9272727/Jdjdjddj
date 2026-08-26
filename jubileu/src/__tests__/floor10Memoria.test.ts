import { beforeEach, describe, expect, it } from 'vitest';
import {
    FLOOR10_MEMORIA_DIM,
    FLOOR10_MEMORIA_VETORES,
} from '../npc/floor10MemoriaVetores';
import {
    FLOOR10_MEMORIA_PISO,
    FLOOR10_MEMORIA_TETO_DA_FALA,
    FLOOR10_MEMORIA_TIMEOUT_MS,
    __setMemoriaEngineForProbes,
    fatosDaMemoria,
    fatosSemVetor,
    hashDoFato,
    lembrarPorSignificado,
    resetFloor10MemoriaForTests,
    textoDaPergunta,
    textoDoDocumento,
} from '../npc/floor10Memoria';
import { FLOOR10_CANON, buildFloor10SystemPrompt } from '../npc/floor10Canon';
import { npc } from '../npc/npcStore';

/** Um motor falso que devolve o vetor que o teste mandar. */
function motorFalso(vetor: number[]) {
    return {
        loadModelFromUrl: async () => undefined,
        createEmbedding: async () => ({ data: [{ embedding: vetor }] }),
    };
}

/** O vetor guardado de um fato, de volta a float — é o que o motor "veria". */
function vetorDoFato(id: string): number[] {
    const fato = fatosDaMemoria().find((f) => f.entry.id === id);
    if (!fato) throw new Error(`sem vetor para ${id}`);
    return [...fato.v];
}

describe('npc/floor10Memoria — os vetores do cânone', () => {
    beforeEach(() => {
        resetFloor10MemoriaForTests();
        __setMemoriaEngineForProbes(null);
    });

    it('todo fato do cânone tem vetor, e o vetor é DAQUELE texto', () => {
        // Este teste é o alarme de cânone editado sem regerar os vetores. Se
        // alguém mudar uma frase do Nilo e esquecer de rodar
        // tools/f10-memoria-vetores.mjs, o hash não bate e ele acusa aqui —
        // e não em silêncio, com o Nilo lembrando de um texto que não existe.
        expect(fatosSemVetor()).toEqual([]);
        expect(fatosDaMemoria()).toHaveLength(FLOOR10_CANON.length);
        for (const guardado of FLOOR10_MEMORIA_VETORES) {
            const entry = FLOOR10_CANON.find((e) => e.id === guardado.id);
            expect(entry, `vetor órfão: ${guardado.id}`).toBeTruthy();
            expect(guardado.hash).toBe(hashDoFato(entry!));
        }
    });

    it('os vetores chegam normalizados e com a dimensão do modelo', () => {
        for (const { entry, v } of fatosDaMemoria()) {
            expect(v.length, entry.id).toBe(FLOOR10_MEMORIA_DIM);
            const norma = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
            expect(norma).toBeCloseTo(1, 3);
        }
    });

    it('um fato editado é DESCARTADO em vez de responder o texto velho', () => {
        const falso = { id: 'past', keywords: [], tema: 'outro tema', fact: 'outro texto' };
        expect(hashDoFato(falso)).not.toBe(
            FLOOR10_MEMORIA_VETORES.find((f) => f.id === 'past')?.hash,
        );
    });

    it('usa os prefixos que o embeddinggemma espera', () => {
        // Não é enfeite: o modelo foi treinado com eles, e sem o `title:` a
        // medição caiu de 11/12 para 9/12.
        expect(textoDoDocumento(FLOOR10_CANON[0])).toMatch(/^title: .+ \| text: /);
        expect(textoDaPergunta('e aí?')).toBe('task: search result | query: e aí?');
    });
});

describe('npc/floor10Memoria — lembrar sem atrapalhar a conversa', () => {
    beforeEach(() => {
        resetFloor10MemoriaForTests();
        __setMemoriaEngineForProbes(null);
    });

    it('sem o modelo carregado responde null NA HORA, sem baixar nada', async () => {
        // A regra que faz esta camada ser opcional de verdade: quem chega ao
        // andar e diz "oi" não pode esperar 333 MB para ser respondido.
        await expect(lembrarPorSignificado('Como você veio parar aqui?'))
            .resolves.toBeNull();
    });

    it('acha o fato quando a pergunta aponta para ele', async () => {
        __setMemoriaEngineForProbes(motorFalso(vetorDoFato('past')));
        const lembrado = await lembrarPorSignificado('Como você veio parar aqui?');
        expect(lembrado?.id).toBe('past');
        expect(lembrado?.score).toBeGreaterThan(FLOOR10_MEMORIA_PISO);
        expect(npc.memoriaLembrou).toBe('past');
    });

    it('abaixo do piso NÃO enfia fato nenhum no prompt', async () => {
        // Medido: "oi" marca 0,177 contra 0,24–0,44 de uma pergunta de verdade.
        // Um fato aleatório no prompt é pior que fato nenhum.
        const ortogonal = new Array(FLOOR10_MEMORIA_DIM).fill(0);
        ortogonal[0] = 1;
        __setMemoriaEngineForProbes(motorFalso(ortogonal));
        await expect(lembrarPorSignificado('oi')).resolves.toBeNull();
    });

    it('vetor de tamanho errado é ignorado em vez de virar resposta torta', async () => {
        __setMemoriaEngineForProbes(motorFalso([1, 0, 0]));
        await expect(lembrarPorSignificado('e aí, tudo bem?')).resolves.toBeNull();
    });

    it('pergunta vazia nem chega a rodar o modelo', async () => {
        __setMemoriaEngineForProbes(motorFalso(vetorDoFato('past')));
        await expect(lembrarPorSignificado('   ')).resolves.toBeNull();
    });
});

describe('a memória diz POR QUE não respondeu', () => {
    // ── O SILÊNCIO MUDO ───────────────────────────────────────────────────
    //
    // O dono do jogo suspeitou que o embedding com duas funções estivesse
    // prejudicando a mente principal. A suspeita é razoável e ninguém tinha
    // como confirmá-la: as saídas em `null` desta função eram indistinguíveis
    // entre si, e `memoriaLembrou` guardava o acerto da pergunta ANTERIOR para
    // sempre, porque só era escrito no sucesso.
    //
    // Com o motivo publicado, "estourou o teto" (a fila do worker) e "abaixo do
    // piso" (a pergunta não casa com fato nenhum) viram medidas diferentes — e
    // é a diferença entre consertar a fila e mexer no cânone.
    beforeEach(() => {
        resetFloor10MemoriaForTests();
        __setMemoriaEngineForProbes(null);
    });

    it('modelo desligado', async () => {
        await lembrarPorSignificado('Como você veio parar aqui?');
        expect(npc.memoriaMotivo).toBe('modelo desligado');
    });

    it('abaixo do piso — e guarda QUAL foi o melhor score', async () => {
        const ortogonal = new Array(FLOOR10_MEMORIA_DIM).fill(0);
        ortogonal[0] = 1;
        __setMemoriaEngineForProbes(motorFalso(ortogonal));
        await lembrarPorSignificado('oi');
        expect(npc.memoriaMotivo).toBe('abaixo do piso');
        // Saber que o melhor deu 0,18 contra um piso de 0,20 é informação
        // diferente de saber que deu 0,02 — por isso o score entra mesmo assim.
        expect(npc.memoriaScore).toBeLessThan(FLOOR10_MEMORIA_PISO);
    });

    it('o modelo falhou', async () => {
        __setMemoriaEngineForProbes({
            loadModelFromUrl: async () => undefined,
            createEmbedding: async () => { throw new Error('worker morreu'); },
        });
        await lembrarPorSignificado('Como você veio parar aqui?');
        expect(npc.memoriaMotivo).toBe('o modelo falhou');
    });

    it('e um acerto APAGA o motivo antigo em vez de deixá-lo na tela', async () => {
        __setMemoriaEngineForProbes({
            loadModelFromUrl: async () => undefined,
            createEmbedding: async () => { throw new Error('worker morreu'); },
        });
        await lembrarPorSignificado('Como você veio parar aqui?');
        expect(npc.memoriaMotivo).toBe('o modelo falhou');
        __setMemoriaEngineForProbes(motorFalso(vetorDoFato('past')));
        await lembrarPorSignificado('Como você veio parar aqui?');
        expect(npc.memoriaMotivo).toBe('');
        expect(npc.memoriaLembrou).toBe('past');
    });

    it('e um erro APAGA o acerto antigo, que era o pior dos dois', async () => {
        // Era este o defeito de verdade: `memoriaLembrou` nunca era limpo, então
        // depois de um acerto o painel mostrava esse mesmo id para sempre — a
        // memória parecia estar respondendo todas as perguntas.
        __setMemoriaEngineForProbes(motorFalso(vetorDoFato('past')));
        await lembrarPorSignificado('Como você veio parar aqui?');
        expect(npc.memoriaLembrou).toBe('past');
        __setMemoriaEngineForProbes(null);
        await lembrarPorSignificado('Como você veio parar aqui?');
        expect(npc.memoriaLembrou).toBe('');
    });

    it('o teto da conversa é MUITO maior que o da deliberação', () => {
        // Uma rodada de deliberação perdida não custa nada — o Nilo segue no
        // reflexo. Uma busca de conversa perdida custa o bloco "SUA MEMÓRIA"
        // inteiro, e o 3B inventa o passado. Dentro de uma espera de 142s
        // medida no celular, desistir aos 2,5s não economiza nada.
        expect(FLOOR10_MEMORIA_TETO_DA_FALA).toBeGreaterThan(FLOOR10_MEMORIA_TIMEOUT_MS * 3);
    });
});

describe('npc/floor10Canon — a memória por significado tem preferência', () => {
    it('o fato lembrado entra no prompt no lugar do achado por palavra', () => {
        // "Faz quanto tempo que você tá preso?" casa `floor10` por palavra
        // ('preso' não, mas 'andar'/'aqui' sim em outras falas). O que importa
        // aqui é a regra: quando a memória respondeu, é ela que vale.
        const prompt = buildFloor10SystemPrompt(
            'Como você veio parar aqui?', [], undefined, undefined,
            { id: 'past', fact: 'FATO ESCOLHIDO PELO SIGNIFICADO' },
        );
        expect(prompt).toContain('FATO ESCOLHIDO PELO SIGNIFICADO');
    });

    it('sem memória, a busca por palavra continua valendo', () => {
        const prompt = buildFloor10SystemPrompt('Você lembra do seu passado?', []);
        expect(prompt).toContain('manutenção noturna em elevadores');
    });
});

describe('direcaoLigada — o padrão é ligada, e só a URL desliga', () => {
    it('desliga com as três formas', async () => {
        const { direcaoLigada } = await import('../npc/floor10Memoria');
        expect(direcaoLigada('?pipeline&direcao=0')).toBe(false);
        expect(direcaoLigada('?pipeline&direcao=nao')).toBe(false);
        expect(direcaoLigada('?pipeline&direcao=off')).toBe(false);
    });

    it('e fica ligada em todo o resto — ninguém perde a direção por engano', async () => {
        const { direcaoLigada } = await import('../npc/floor10Memoria');
        expect(direcaoLigada('?pipeline')).toBe(true);
        expect(direcaoLigada('?pipeline&direcao=1')).toBe(true);
        expect(direcaoLigada('')).toBe(true);
    });
});
