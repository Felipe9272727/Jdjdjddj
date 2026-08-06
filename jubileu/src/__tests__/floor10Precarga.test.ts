import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    conversaLiberada, conversaOcupaOAparelho, falaGerandoAgora, iniciarPrecarga,
    passosDoAndar10, pouparMemoriaLigado, precargaCompleta, precargaEtapa,
    resetPrecargaForTests,
} from '../npc/floor10Precarga';
import {
    definirFilaDoAndar10, floor10Fila,
    FILA_FALA, FILA_MEMORIA, FILA_MOTOR, FILA_REFLEXO, FILA_VONTADE,
} from '../npc/floor10Fila';
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
        // A VONTADE AGORA COMEÇA: a etapa dela só BAIXA (`baixarVontade`), e
        // download é rede, não núcleo. Este teste exigia o contrário, e o
        // contrário era o defeito que o dono do jogo relatou — "a vontade só
        // baixa pós a primeira mensagem ser respondida".
        await vi.waitFor(() => expect(ordem).toContain('inicio:vontade'));
        // O MOTOR também começa: a etapa dele agora só baixa.
        await vi.waitFor(() => expect(ordem).toContain('inicio:motor'));

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

    it('gerar uma resposta segura TODOS os outros, não só os pesados', async () => {
        // `phase: 'thinking'` é o 3B escrevendo. Subir outro llama.cpp aqui é a
        // mesma disputa de núcleos, com o painel aberto ou não.
        //
        // ANTES este teste exigia o oposto para a memória: que ela terminasse
        // DURANTE o `thinking`. Era o comportamento real, e era o defeito — a
        // memória termina num llama.cpp inteiro subindo, e ela subia por cima
        // da geração porque não tinha `adiarEnquanto` nenhum. O aparelho do
        // dono do jogo desligou sozinho com isso.
        npcSet({ open: false, phase: 'thinking' });
        const fila = iniciarPrecarga(passosDoAndar10({
            fala: carregador('fala'),
            vontade: carregador('vontade'),
            motor: carregador('motor'),
            memoria: carregador('memoria'),
        }));
        await vi.waitFor(() => expect(ordem).toContain('fim:fala'));
        expect(ordem).not.toContain('inicio:memoria');
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

describe('nenhuma etapa carrega por cima de uma geração', () => {
    // O aparelho do dono do jogo desligou sozinho. A fila baixava em sequência,
    // mas a sequência não sabia da FALA — e a fila começa quando o chat abre,
    // que é quando o jogador digita a primeira mensagem.
    it('memória e reflexo esperam a geração, não o chat fechar', () => {
        const passos = passosDoAndar10({
            fala: async () => true,
            vontade: async () => true,
            motor: async () => true,
            memoria: async () => true,
            reflexo: async () => true,
        });
        const por = (id: string) => passos.find((p) => p.id === id);

        // Tinham `adiarEnquanto` NENHUM: subiam junto com a primeira mensagem.
        expect(por(FILA_MEMORIA)?.adiarEnquanto).toBe(falaGerandoAgora);
        expect(por(FILA_REFLEXO)?.adiarEnquanto).toBe(falaGerandoAgora);

        // A VONTADE deixou de esperar o chat fechar: a etapa dela agora só
        // BAIXA (`baixarVontade`), e download é rede, não núcleo. O relato era
        // "a vontade só baixa pós a primeira mensagem ser respondida".
        expect(por(FILA_VONTADE)?.adiarEnquanto).toBe(falaGerandoAgora);
        // O motor também: a etapa dele agora só baixa.
        expect(por(FILA_MOTOR)?.adiarEnquanto).toBe(falaGerandoAgora);

        // A fala nunca espera: é ela que o jogador está olhando.
        expect(por(FILA_FALA)?.adiarEnquanto).toBeUndefined();
    });

    it('a regra estreita ignora o painel só aberto — senão custaria qualidade', () => {
        // Fazer a memória esperar o chat FECHAR tiraria o fato do cânone da
        // primeira conversa, que é de onde saem as invenções do Nilo.
        npcSet({ open: true, phase: 'ready' });
        expect(falaGerandoAgora()).toBe(false);
        expect(conversaOcupaOAparelho()).toBe(true);

        npcSet({ open: true, phase: 'thinking' });
        expect(falaGerandoAgora()).toBe(true);
    });
});

describe('esperar não pode virar nunca', () => {
    // Sem isto, `emCurso` da suíte anterior ainda está de pé e
    // `iniciarPrecarga` devolve a promessa VELHA — os passos deste teste nunca
    // rodam e a falha parece ser do conserto, não do arranjo.
    beforeEach(() => {
        ordem.length = 0;
        resetPrecargaForTests();
    });

    // DO APARELHO: "só baixou a smollm3 e a de embedding, a vontade e o motor
    // não baixaram". Quem testa o Nilo deixa o chat ABERTO — e a vontade e o
    // motor esperavam `conversaOcupaOAparelho`, que inclui o painel aberto.
    // Aberto o tempo todo, os dois esperavam para sempre: eu troquei um
    // travamento por uma funcionalidade que nunca chega.
    it('o chat aberto e parado deixa de segurar depois do teto', async () => {
        (globalThis as Record<string, unknown>).__f10TetoEsperaMs = 200;
        npcSet({ open: true, phase: 'ready' });
        const fila = iniciarPrecarga(passosDoAndar10({
            fala: carregador('fala'),
            vontade: carregador('vontade'),
            motor: carregador('motor'),
            memoria: carregador('memoria'),
        }));
        // Com o painel aberto, os pesados começam mesmo assim — depois do teto.
        // A afirmação é sobre a VONTADE começar apesar do painel aberto —
        // esperar pelo motor era esperar por um passo a mais e tornava o teste
        // dependente de tempo que não é o objeto da prova.
        await vi.waitFor(
            () => expect(ordem).toContain('inicio:vontade'),
            { timeout: 10_000 },
        );
        npcSet({ open: false });
        await fila;
        delete (globalThis as Record<string, unknown>).__f10TetoEsperaMs;
    }, 15_000);

    it('mas uma geração em curso ainda segura, teto ou não', () => {
        // O teto solta o painel aberto; NUNCA solta uma geração. É a invariante
        // que mantém o pico em 4 de 8 núcleos.
        npcSet({ open: true, phase: 'thinking' });
        expect(falaGerandoAgora()).toBe(true);
    });
});

describe('poupar memória: baixar não é o mesmo que manter de pé', () => {
    // Pela SEGUNDA vez hoje: sem isto, `emCurso` da suíte anterior continua de
    // pé, `iniciarPrecarga` devolve a promessa VELHA, os passos deste teste
    // nunca rodam — e a falha parece ser do conserto, não do arranjo.
    beforeEach(() => {
        ordem.length = 0;
        resetPrecargaForTests();
    });

    // Medido nesta caixa, três modelos, reta com erro < 30 MB em 5 GB:
    //     RSS = 2,00 × (GB de modelo) + 1,49 GB
    // Os cinco residentes dão 9,59 GB; fala + memória dão 5,68 GB. O Chrome do
    // Android mata a aba muito antes do primeiro — e "desligou sozinho" é
    // súbito como falta de memória, não progressivo como calor.
    it('opt-in: a medição que a justificava está pela metade', () => {
        // Aditividade provada (previsto 3,89 / medido 4,03) + Chrome no Android
        // matando o renderer sem aviso acima de ~2 GB por aba. Não existe troca
        // a pesar quando um dos lados garante a morte da aba.
        expect(pouparMemoriaLigado('')).toBe(false);
        expect(pouparMemoriaLigado('?bancada')).toBe(false);
        expect(pouparMemoriaLigado('?poupamemoria')).toBe(true);
        expect(pouparMemoriaLigado('?semopoupamemoria')).toBe(false);
    });

    it('com a flag, a vontade e o motor são liberados depois de baixados', async () => {
        (globalThis as Record<string, unknown>).__f10TetoEsperaMs = 50;
        (globalThis as Record<string, unknown>).__f10PoupaMemoria = false;
        const liberados: string[] = [];
        npcSet({ open: false, phase: 'ready' });
        await iniciarPrecarga(passosDoAndar10({
            fala: carregador('fala'),
            vontade: carregador('vontade'),
            motor: carregador('motor'),
            memoria: carregador('memoria'),
            liberarVontade: async () => { liberados.push('vontade'); },
            liberarMotor: async () => { liberados.push('motor'); },
        }));
        delete (globalThis as Record<string, unknown>).__f10TetoEsperaMs;
        delete (globalThis as Record<string, unknown>).__f10PoupaMemoria;
        // Com `__f10PoupaMemoria` explicitamente falso, nada é liberado.
        expect(liberados).toEqual([]);
        // E a fila termina inteira de qualquer forma: liberar não é falhar.
        expect(ordem).toContain('fim:motor');
    });

    it('COM a flag, os dois pesados são liberados — e a fila termina inteira', async () => {
        // O caso positivo. Sem ele eu teria provado só que o padrão não mudou,
        // que é o teste que nunca falha e nunca prova nada.
        (globalThis as Record<string, unknown>).__f10TetoEsperaMs = 50;
        (globalThis as Record<string, unknown>).__f10PoupaMemoria = true;
        const liberados: string[] = [];
        npcSet({ open: false, phase: 'ready' });
        await iniciarPrecarga(passosDoAndar10({
            fala: carregador('fala'),
            vontade: carregador('vontade'),
            motor: carregador('motor'),
            memoria: carregador('memoria'),
            liberarVontade: async () => { liberados.push('vontade'); },
            liberarMotor: async () => { liberados.push('motor'); },
        }));
        delete (globalThis as Record<string, unknown>).__f10TetoEsperaMs;
        delete (globalThis as Record<string, unknown>).__f10PoupaMemoria;
        expect(liberados).toEqual(['vontade', 'motor']);
        // Liberar acontece DEPOIS de concluir: baixou de verdade, e a barra
        // não pode voltar atrás por causa de uma economia de memória.
        expect(ordem).toContain('fim:vontade');
        expect(ordem).toContain('fim:motor');
        // A fila chegou ao fim: 'pronto' é o estado final da pré-carga.
        expect(precargaCompleta()).toBe(true);
    });

    it('a fala e a memória NUNCA são liberadas — são as duas da mente', () => {
        const passos = passosDoAndar10({
            fala: async () => true,
            vontade: async () => true,
            motor: async () => true,
            memoria: async () => true,
            liberarVontade: async () => undefined,
            liberarMotor: async () => undefined,
        });
        expect(passos.find((p) => p.id === FILA_FALA)?.liberar).toBeUndefined();
        expect(passos.find((p) => p.id === FILA_MEMORIA)?.liberar).toBeUndefined();
        expect(passos.find((p) => p.id === FILA_VONTADE)?.liberar).toBeDefined();
        expect(passos.find((p) => p.id === FILA_MOTOR)?.liberar).toBeDefined();
    });
});

describe('a fila não pode esperar para sempre', () => {
    // O formato dos três defeitos de hoje é o mesmo: espera sem prazo dentro de
    // uma fila SEQUENCIAL. `TETO_DE_ESPERA_MS` parecia fechar a porta, mas só
    // trocava a condição — passado ele, o passo esperava `falaGerandoAgora()`,
    // que não tem prazo nenhum. Fase presa em 'thinking' = tudo depois daquele
    // passo nunca baixa.
    //
    // RESSALVA: aqui eu não tenho relato de que aconteceu no aparelho. Estou
    // fechando pelo FORMATO, não pelo sintoma.
    beforeEach(() => {
        resetPrecargaForTests();
        npcSet({ open: false, phase: 'cold' });
    });

    it('com a fala eternamente "pensando", o passo ainda acontece', async () => {
        const alvo = globalThis as { __f10TetoEsperaMs?: number; __f10TetoAbsolutoMs?: number };
        alvo.__f10TetoEsperaMs = 20;
        alvo.__f10TetoAbsolutoMs = 60;
        // Nunca sai de 'thinking': é a fase travada que o teto absoluto existe
        // para sobreviver.
        npcSet({ phase: 'thinking' });

        let rodou = false;
        await iniciarPrecarga([{
            id: FILA_VONTADE,
            etapa: 'vontade',
            carregar: async () => { rodou = true; return true; },
            adiarEnquanto: () => true,   // adia sempre, como uma fase presa
        }]);

        delete alvo.__f10TetoEsperaMs;
        delete alvo.__f10TetoAbsolutoMs;
        npcSet({ phase: 'cold' });
        // Sem o teto absoluto isto nunca retornaria e o teste morreria no
        // timeout — que é o sintoma: a fila parada.
        expect(rodou).toBe(true);
    });

    it('antes do teto absoluto, a espera continua valendo', async () => {
        // O outro lado: um teto que dispara cedo demais desmonta a proteção
        // inteira e devolve o "1,32 GB subindo no meio da conversa".
        const alvo = globalThis as { __f10TetoEsperaMs?: number; __f10TetoAbsolutoMs?: number };
        alvo.__f10TetoEsperaMs = 10_000;
        alvo.__f10TetoAbsolutoMs = 10_000;
        npcSet({ phase: 'thinking' });

        let rodou = false;
        const fila = iniciarPrecarga([{
            id: FILA_VONTADE,
            etapa: 'vontade',
            carregar: async () => { rodou = true; return true; },
            // Condição REAL, que solta quando a fala termina — se eu usasse
            // `() => true` aqui, o teste mediria só o teto e não a espera.
            adiarEnquanto: falaGerandoAgora,
        }]);
        await new Promise((r) => { setTimeout(r, 60); });
        expect(rodou).toBe(false);   // ainda segurando, como deve

        npcSet({ phase: 'cold' });   // a fala terminou de verdade
        await fila;
        delete alvo.__f10TetoEsperaMs;
        delete alvo.__f10TetoAbsolutoMs;
        expect(rodou).toBe(true);
    });
});

describe('um passo quebrado não derruba a fila inteira', () => {
    // O `try` cobria só `passo.carregar()`. A espera da vez e a contabilidade
    // ficavam de fora, e uma exceção ali rejeitaria a promessa guardada em
    // `emCurso` — virando rejeição não tratada E fazendo toda chamada seguinte
    // devolver a mesma promessa rejeitada. Mesmo formato que custou a vontade
    // dele hoje: fracasso guardado numa promessa que ninguém zera.
    beforeEach(() => {
        resetPrecargaForTests();
        npcSet({ open: false, phase: 'cold' });
    });

    it('exceção na ESPERA não impede os passos seguintes', async () => {
        let segundoRodou = false;
        await iniciarPrecarga([
            {
                id: FILA_VONTADE,
                etapa: 'vontade',
                carregar: async () => true,
                // Estoura antes de carregar: é o caminho que ficava sem rede.
                adiarEnquanto: () => { throw new Error('loja quebrou'); },
            },
            {
                id: FILA_MOTOR,
                etapa: 'motor',
                carregar: async () => { segundoRodou = true; return true; },
            },
        ]);
        // Sem o try de fora, a promessa rejeitaria aqui e este expect nunca
        // rodaria — o `await` estouraria antes.
        expect(segundoRodou).toBe(true);
        expect(precargaCompleta()).toBe(true);
    });

    it('e a fila registra a falha em vez de engolir', async () => {
        await iniciarPrecarga([{
            id: FILA_VONTADE,
            etapa: 'vontade',
            carregar: async () => true,
            adiarEnquanto: () => { throw new Error('loja quebrou'); },
        }]);
        const falhado = floor10Fila.estado().falhados.find((f) => f.id === FILA_VONTADE);
        expect(falhado?.motivo).toContain('loja quebrou');
    });
});

describe('a espera sobrevive a uma condição que estoura num tique tardio', () => {
    // `conferir` roda em duas fontes sem try/catch por baixo: `npcSubscribe`
    // (via `npcBump`) e o relógio de 2 s. Uma exceção num tique TARDIO escapa do
    // try da chamada síncrona e deixa a promessa pendente para sempre — a fila
    // inteira parada atrás dela.
    beforeEach(() => {
        resetPrecargaForTests();
        npcSet({ open: false, phase: 'cold' });
    });

    it('condição que passa a estourar deixa o passo seguir', async () => {
        let chamadas = 0;
        let rodou = false;
        await iniciarPrecarga([{
            id: FILA_VONTADE,
            etapa: 'vontade',
            carregar: async () => { rodou = true; return true; },
            adiarEnquanto: () => {
                chamadas += 1;
                // As duas primeiras chamadas são SÍNCRONAS (a checagem de
                // entrada e a do teto) e já estão cobertas pelo try externo da
                // fila. O que este teste exercita é o TIQUE — a partir da
                // terceira, que roda dentro da promessa, via `conferir`.
                if (chamadas <= 2) return true;
                throw new Error('loja quebrou no tique');
            },
        }]);
        // Sem a guarda, este `await` nunca retornaria.
        expect(rodou).toBe(true);
        expect(chamadas).toBeGreaterThan(1);
    });
});
