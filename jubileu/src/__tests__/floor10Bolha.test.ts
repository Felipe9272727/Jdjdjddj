import { describe, it, expect } from 'vitest';
import {
    FRASES_DA_META,
    MemoriaDeBolhas,
    BOLHA_MAX_LETRAS,
    escolherFrase,
    fraseBase,
    gerarBolha,
    limparBolha,
    promptDaBolha,
} from '../npc/floor10Bolha';
import { DELIBERATION_GOALS, deliberationThought } from '../npc/floor10Deliberation';

// ── O QUE ESTES TESTES PROTEGEM ───────────────────────────────────────────
//
// A bolha é a única saída do NPC que o jogador lê sem abrir o chat. O pedido
// era que o modelo escrevesse essa linha; o risco é o modelo escrever qualquer
// coisa. Cada teste aqui é um jeito de estragar a tela do jogador.

describe('floor10Bolha — a peneira', () => {
    it('deixa passar uma fala curta em português', () => {
        expect(limparBolha('posso chegar perto?')).toBe('posso chegar perto?');
    });

    it('tira o eco do formato do prompt', () => {
        expect(limparBolha('Nilo: você ainda está aí?')).toBe('você ainda está aí?');
        expect(limparBolha('A FRASE: me dá um minuto.')).toBe('me dá um minuto.');
        expect(limparBolha('- fica quieto um segundo.')).toBe('fica quieto um segundo.');
    });

    it('tira aspas e asterisco, que na bolha viram lixo visível', () => {
        expect(limparBolha('"você ouviu isso?"')).toBe('você ouviu isso?');
        expect(limparBolha('*se aproxima* deixa eu ver você')).toBe('se aproxima deixa eu ver você');
    });

    it('RECUSA inglês — o pensamento da vontade vazando cru para a tela', () => {
        expect(limparBolha('I walk toward the player because the silence is long')).toBe('');
        expect(limparBolha('I take five steps to my left')).toBe('');
        expect(limparBolha('the door is open')).toBe('');
    });

    it('RECUSA rótulo técnico — o encanamento não aparece para quem joga', () => {
        expect(limparBolha('MOTION: approach | player | normal | 6')).toBe('');
        expect(limparBolha('GOAL: approach-player')).toBe('');
        expect(limparBolha('<think>deixa eu ver</think>')).toBe('');
        expect(limparBolha('[[WILL:APPROACH_PLAYER]]')).toBe('');
    });

    it('RECUSA a instrução devolvida de volta', () => {
        expect(limparBolha('Em português do Brasil, no máximo 10 palavras.')).toBe('');
        expect(limparBolha('REGRAS: sem aspas, sem asterisco')).toBe('');
    });

    it('RECUSA o vazio, o quase-vazio e o parágrafo', () => {
        expect(limparBolha('')).toBe('');
        expect(limparBolha('   \n  ')).toBe('');
        expect(limparBolha('ah')).toBe('');
        expect(limparBolha('a'.repeat(400))).toBe('');
    });

    it('só a PRIMEIRA linha vira bolha', () => {
        expect(limparBolha('me dá um minuto.\ne depois a gente conversa\nmais uma linha'))
            .toBe('me dá um minuto.');
    });

    it('frase um pouco longa é cortada numa fronteira de frase, nunca no meio da palavra', () => {
        const longa = 'preciso que você me escute agora com muita atenção. depois eu explico tudo direitinho';
        const saida = limparBolha(longa);
        expect(saida.length).toBeLessThanOrEqual(BOLHA_MAX_LETRAS);
        expect(saida.endsWith('.')).toBe(true);
        // O corte não pode inventar uma palavra partida.
        expect(longa.startsWith(saida)).toBe(true);
    });

    it('não explode com entrada que não é string', () => {
        expect(limparBolha(undefined as unknown as string)).toBe('');
        expect(limparBolha(null as unknown as string)).toBe('');
        expect(limparBolha(42 as unknown as string)).toBe('');
    });
});

describe('floor10Bolha — a memória do que ele já disse', () => {
    it('reconhece a MESMA frase com acento, caixa e pontuação diferentes', () => {
        const m = new MemoriaDeBolhas();
        m.guardar('Você ainda está aí?');
        expect(m.jaDisse('voce ainda esta ai')).toBe(true);
    });

    it('reconhece a mesma frase reescrita — que é o disco riscado disfarçado', () => {
        expect(MemoriaDeBolhas.parecidas(
            'preciso olhar aquela porta outra vez',
            'preciso olhar aquela porta',
        )).toBe(true);
    });

    it('NÃO confunde duas falas de verdade diferentes', () => {
        expect(MemoriaDeBolhas.parecidas('posso chegar perto?', 'para onde foi você?')).toBe(false);
        expect(MemoriaDeBolhas.parecidas('me dá um minuto.', 'você acredita em mim?')).toBe(false);
    });

    it('esquece as antigas: a janela não cresce para sempre', () => {
        const m = new MemoriaDeBolhas();
        m.guardar('primeira frase inteira dita aqui');
        for (let i = 0; i < 10; i += 1) m.guardar(`frase numero ${i} completamente diferente`);
        expect(m.jaDisse('primeira frase inteira dita aqui')).toBe(false);
    });

    it('as recentes vão da mais nova para a mais velha (é o que o prompt quer)', () => {
        const m = new MemoriaDeBolhas();
        m.guardar('uma'); m.guardar('duas'); m.guardar('tres');
        expect(m.recentes(2)).toEqual(['tres', 'duas']);
    });
});

describe('floor10Bolha — as frases prontas viram várias', () => {
    it('TODA meta tem mais de uma leitura: nenhuma volta a ser frase única', () => {
        for (const meta of DELIBERATION_GOALS) {
            expect(FRASES_DA_META[meta].length).toBeGreaterThan(1);
        }
    });

    it('o jogo continua dizendo a frase de sempre quando não há modelo', () => {
        // Isto é o contrato com o que já estava na tela: sem o micro carregado,
        // a bolha não pode piorar em relação ao que existia.
        expect(fraseBase('approach-player')).toBe('acho que vou chegar mais perto.');
        expect(deliberationThought('decided', 'approach-player')).toBe('acho que vou chegar mais perto.');
    });

    it('a linha ESCRITA manda sobre a frase pronta', () => {
        expect(deliberationThought('decided', 'approach-player', 'posso te perguntar uma coisa?'))
            .toBe('posso te perguntar uma coisa?');
        // Espaço em branco não é linha: cai na frase pronta.
        expect(deliberationThought('decided', 'approach-player', '   '))
            .toBe('acho que vou chegar mais perto.');
        // E nada disso vale antes de haver decisão.
        expect(deliberationThought('thinking', 'approach-player', 'oi')).toBe('pensando…');
    });

    it('a bolha escrita CHEGA na tela — o campo do store é lido pela interface', async () => {
        // ── POR QUE UM TESTE OLHA O FONTE ─────────────────────────────────
        // Já perdi uma tabela de roteamento inteira para código morto: o
        // módulo existia, era testado, e ninguém o chamava. Aqui o risco é
        // igual — `deliberationBubble` pode ser preenchido a cada rodada e
        // nunca chegar à bolha se a chamada não passar o terceiro argumento.
        const fonte = await import('node:fs/promises')
            .then((fs) => fs.readFile(new URL('../Floor10NpcChat.tsx', import.meta.url), 'utf8'));
        const chamada = /deliberationThought\(\s*[^)]*deliberationBubble/s.test(fonte);
        expect(chamada).toBe(true);
    });

    it('há PERGUNTA ao jogador no repertório — foi metade do pedido', () => {
        const perguntas = DELIBERATION_GOALS
            .filter((meta) => FRASES_DA_META[meta].some((f) => f.includes('?')));
        expect(perguntas.length).toBe(DELIBERATION_GOALS.length);
    });

    it('nenhuma frase pronta é longa demais ou tem rótulo técnico', () => {
        for (const meta of DELIBERATION_GOALS) {
            for (const f of FRASES_DA_META[meta]) {
                expect(f.length).toBeLessThanOrEqual(BOLHA_MAX_LETRAS);
                expect(limparBolha(f)).toBe(f);
            }
        }
    });

    it('escolherFrase não repete enquanto houver variante inédita', () => {
        const m = new MemoriaDeBolhas();
        const vistas = new Set<string>();
        for (let i = 0; i < FRASES_DA_META['approach-player'].length; i += 1) {
            const f = escolherFrase('approach-player', m);
            expect(vistas.has(f)).toBe(false);
            vistas.add(f);
            m.guardar(f);
        }
    });

    it('meta desconhecida não quebra a tela', () => {
        expect(escolherFrase('meta-que-nao-existe', new MemoriaDeBolhas())).toBe('decidi o que fazer.');
    });
});

describe('floor10Bolha — o prompt', () => {
    it('leva o pensamento da vontade e o que ele já disse', () => {
        const m = new MemoriaDeBolhas();
        m.guardar('posso chegar perto?');
        const p = promptDaBolha('approach-player', 'I walk toward him, the silence is long', m.recentes());
        expect(p).toContain('I walk toward him');
        expect(p).toContain('posso chegar perto?');
        expect(p).toContain('não repita');
    });

    it('sem histórico, não inventa uma seção de histórico vazia', () => {
        const p = promptDaBolha('idle', 'I stay still', []);
        expect(p).not.toContain('não repita');
    });
});

describe('floor10Bolha — gerarBolha, o caminho inteiro', () => {
    const memoriaNova = () => new MemoriaDeBolhas();

    it('usa a linha do modelo quando ela presta', async () => {
        const r = await gerarBolha({
            meta: 'approach-player',
            pensamento: 'I move closer, curious',
            memoria: memoriaNova(),
            completar: async () => 'você não vai correr, vai?',
        });
        expect(r).toEqual({ linha: 'você não vai correr, vai?', doModelo: true });
    });

    it('CAI NA FRASE PRONTA quando o modelo devolve inglês', async () => {
        const r = await gerarBolha({
            meta: 'approach-player',
            pensamento: 'I move closer',
            memoria: memoriaNova(),
            completar: async () => 'I move closer to the player',
        });
        expect(r.doModelo).toBe(false);
        expect(FRASES_DA_META['approach-player']).toContain(r.linha);
    });

    it('CAI NA FRASE PRONTA quando o modelo estoura o tempo (devolve vazio)', async () => {
        const r = await gerarBolha({
            meta: 'idle',
            pensamento: 'I listen',
            memoria: memoriaNova(),
            completar: async () => '',
        });
        expect(r.doModelo).toBe(false);
        expect(FRASES_DA_META.idle).toContain(r.linha);
    });

    it('CAI NA FRASE PRONTA quando o modelo lança — nunca propaga erro para o passeio', async () => {
        const r = await gerarBolha({
            meta: 'wander',
            pensamento: 'I walk',
            memoria: memoriaNova(),
            completar: async () => { throw new Error('modelo caiu'); },
        });
        expect(r.doModelo).toBe(false);
        expect(FRASES_DA_META.wander).toContain(r.linha);
    });

    it('RECUSA a linha do modelo quando ele repete o que acabou de dizer', async () => {
        const m = memoriaNova();
        const primeira = await gerarBolha({
            meta: 'approach-player',
            pensamento: 'I move closer',
            memoria: m,
            completar: async () => 'deixa eu chegar mais perto de você',
        });
        expect(primeira.doModelo).toBe(true);
        const segunda = await gerarBolha({
            meta: 'approach-player',
            pensamento: 'I move closer again',
            memoria: m,
            completar: async () => 'deixa eu chegar mais perto de você',
        });
        expect(segunda.doModelo).toBe(false);
        expect(segunda.linha).not.toBe(primeira.linha);
    });

    it('sem pensamento não chama o modelo: não há o que reescrever', async () => {
        let chamou = false;
        const r = await gerarBolha({
            meta: 'idle',
            pensamento: '   ',
            memoria: memoriaNova(),
            completar: async () => { chamou = true; return 'qualquer coisa aqui'; },
        });
        expect(chamou).toBe(false);
        expect(r.doModelo).toBe(false);
    });

    it('dez rodadas seguidas NÃO viram dez vezes a mesma frase', async () => {
        // O teste do pedido, no formato em que ele reclamou: a mesma meta várias
        // vezes seguidas. Com o modelo mudo (pior caso), o repertório sozinho já
        // tem de render mais de uma linha.
        const m = memoriaNova();
        const ditas: string[] = [];
        for (let i = 0; i < 10; i += 1) {
            const r = await gerarBolha({
                meta: 'approach-player',
                pensamento: 'I move closer',
                memoria: m,
                completar: async () => '',
            });
            ditas.push(r.linha);
        }
        expect(new Set(ditas).size).toBeGreaterThan(1);
    });
});
