import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    avisoDeSaciedade,
    avisoDoHistorico,
    MemoriaDeConsequencia, avaliarConsequencia, avisoDeInsistencia,
    linhasDeConsequencia, type MundoObservado,
} from '../npc/floor10Consequencia';
import { buildDeliberationPrompt } from '../npc/floor10Deliberation';

const mundo = (p: Partial<MundoObservado> = {}): MundoObservado => ({
    distanciaDoJogador: 8,
    distanciaDoElevador: 12,
    conversaAberta: false,
    mensagensDoJogador: 0,
    ...p,
});

describe('ele descobre que foi ignorado', () => {
    // "vamos supor, ele se aproximou do player, e o player ignorou (não abriu o
    //  chat ou sla) ele vai saber disso entendeu?"
    it('aproximar + o jogador abriu a conversa = atendido', () => {
        expect(avaliarConsequencia(
            'approach-player',
            mundo({ conversaAberta: false }),
            mundo({ conversaAberta: true }),
        )).toBe('atendido');
    });

    it('aproximar + o jogador mandou mensagem = atendido', () => {
        expect(avaliarConsequencia(
            'approach-player',
            mundo({ mensagensDoJogador: 2 }),
            mundo({ mensagensDoJogador: 3 }),
        )).toBe('atendido');
    });

    it('aproximar + o jogador veio até ele = atendido', () => {
        expect(avaliarConsequencia(
            'approach-player',
            mundo({ distanciaDoJogador: 8 }),
            mundo({ distanciaDoJogador: 4 }),
        )).toBe('atendido');
    });

    it('aproximar e NADA acontecer = ignorado', () => {
        // O caso exato que ele descreveu.
        expect(avaliarConsequencia(
            'approach-player',
            mundo({ distanciaDoJogador: 8 }),
            mundo({ distanciaDoJogador: 7.6 }),
        )).toBe('ignorado');
    });

    it('o jogador sumir de vista NÃO é ignorar', () => {
        // Sem isto o Nilo aprenderia "fui ignorado" toda vez que o jogador
        // virasse uma esquina, e a lição seria falsa.
        expect(avaliarConsequencia(
            'approach-player',
            mundo({ distanciaDoJogador: 8 }),
            mundo({ distanciaDoJogador: null }),
        )).toBe('indefinido');
    });

    it('dar espaço: ele recuou ou continuou colado', () => {
        expect(avaliarConsequencia('make-space', mundo({ distanciaDoJogador: 1 }),
            mundo({ distanciaDoJogador: 4 }))).toBe('atendido');
        expect(avaliarConsequencia('make-space', mundo({ distanciaDoJogador: 1 }),
            mundo({ distanciaDoJogador: 1.2 }))).toBe('ignorado');
    });

    it('o elevador é conferido pelo CORPO dele, não pelo jogador', () => {
        expect(avaliarConsequencia('inspect-elevator', mundo(),
            mundo({ distanciaDoElevador: 1 }))).toBe('atendido');
        expect(avaliarConsequencia('inspect-elevator', mundo(),
            mundo({ distanciaDoElevador: 11 }))).toBe('ignorado');
    });

    it('metas sem pergunta objetiva ficam INDEFINIDAS', () => {
        // E indefinido nunca vira texto: "você vagou e nada aconteceu" é ruído.
        for (const meta of ['wander', 'idle', 'observe-player'] as const) {
            expect(avaliarConsequencia(meta, mundo(), mundo())).toBe('indefinido');
        }
        expect(linhasDeConsequencia([
            { meta: 'wander', resultado: 'indefinido', em: 1 },
        ])).toEqual([]);
    });
});

describe('e ele é mandado parar de insistir', () => {
    it('duas falhas seguidas na MESMA meta gera a instrução', () => {
        const aviso = avisoDeInsistencia([
            { meta: 'approach-player', resultado: 'ignorado', em: 1 },
            { meta: 'approach-player', resultado: 'ignorado', em: 2 },
        ]);
        expect(aviso).toContain('approach-player');
        expect(aviso).toContain('Choose something else');
    });

    it('UMA falha não gera: uma vez é acaso', () => {
        expect(avisoDeInsistencia([
            { meta: 'approach-player', resultado: 'ignorado', em: 1 },
        ])).toBeNull();
    });

    it('metas diferentes não geram, mesmo falhando', () => {
        expect(avisoDeInsistencia([
            { meta: 'approach-player', resultado: 'ignorado', em: 1 },
            { meta: 'inspect-elevator', resultado: 'ignorado', em: 2 },
        ])).toBeNull();
    });

    it('um sucesso no meio limpa a acusação', () => {
        expect(avisoDeInsistencia([
            { meta: 'approach-player', resultado: 'ignorado', em: 1 },
            { meta: 'approach-player', resultado: 'atendido', em: 2 },
        ])).toBeNull();
    });

    it('os `indefinido` não contam como tentativa', () => {
        // Vagar entre duas aproximações não pode "quebrar" o padrão: para quem
        // joga, ele insistiu duas vezes seguidas.
        expect(avisoDeInsistencia([
            { meta: 'approach-player', resultado: 'ignorado', em: 1 },
            { meta: 'wander', resultado: 'indefinido', em: 2 },
            { meta: 'approach-player', resultado: 'ignorado', em: 3 },
        ])).not.toBeNull();
    });
});

describe('o resultado chega ao PROMPT — senão não muda nada', () => {
    // A percepção precisa do que o MAPA lê: posição, zona, rumo e yaw. Um
    // fixture magro passava enquanto o prompt só usava duas distâncias.
    const percepcao = {
        position: { x: 0, y: 0, z: 0 },
        zone: 'center',
        heading: 'north',
        yaw: 0,
        locationDescription: 'no centro',
        player: { visible: true, distance: 3, direction: 'front' },
        elevator: { visible: true, distance: 9, direction: 'left' },
        visibleObjects: [],
    } as never;
    const impulsos = {
        social: 0.5, curiosity: 0.5, restlessness: 0.5, fatigue: 0.1,
    } as never;

    it('as linhas de resultado aparecem no texto enviado', () => {
        const prompt = buildDeliberationPrompt(percepcao, impulsos, {
            inspectedElevatorCount: 0, sleeps: 0, playerSilentSeconds: 10,
            lastGoals: ['approach-player'],
            outcomes: ['you tried "approach-player" and it did not work — he did not respond'],
            stopRepeating: '"approach-player" has failed twice in a row. Choose something else this time.',
        } as never);
        expect(prompt).toContain('WHAT CAME OF THEM');
        expect(prompt).toContain('did not respond');
        expect(prompt).toContain('Choose something else');
    });

    it('sem resultados, nenhum cabeçalho vazio é escrito', () => {
        // "WHAT CAME OF THEM: ." ensinaria o modelo a ignorar a seção.
        const prompt = buildDeliberationPrompt(percepcao, impulsos, {
            inspectedElevatorCount: 0, sleeps: 0, playerSilentSeconds: 10,
            lastGoals: [],
        } as never);
        expect(prompt).not.toContain('WHAT CAME OF THEM');
    });
});

describe('a memória guarda, envelhece e não cresce sem fim', () => {
    it('confere e guarda de uma vez', () => {
        const m = new MemoriaDeConsequencia();
        expect(m.conferir('approach-player', mundo({ distanciaDoJogador: 8 }),
            mundo({ distanciaDoJogador: 7.9 }), 1)).toBe('ignorado');
        expect(m.lista()).toHaveLength(1);
        expect(m.linhas()[0]).toContain('did not respond');
    });

    it('não passa do teto', () => {
        const m = new MemoriaDeConsequencia();
        for (let i = 0; i < 100; i += 1) m.anotar('idle', 'atendido', i);
        expect(m.lista().length).toBeLessThanOrEqual(MemoriaDeConsequencia.TETO);
    });

    it('o prompt leva só os últimos, e do mais novo para o mais velho', () => {
        const m = new MemoriaDeConsequencia();
        for (let i = 0; i < 10; i += 1) m.anotar('inspect-elevator', 'ignorado', i);
        m.anotar('make-space', 'atendido', 11);
        const linhas = m.linhas();
        expect(linhas.length).toBeLessThanOrEqual(4);
        expect(linhas[0]).toContain('make-space');
    });
});

describe('a memória está LIGADA nos dois lugares que decidem', () => {
    // A regra do dia: teste unitário prova a função, não o caminho. Estas
    // asserções leem a fonte — se alguém remover a ligação, os testes de cima
    // continuariam verdes e o Nilo voltaria a repetir sem ninguém notar.
    const jogo = readFileSync(new URL('../Floor10Npc.tsx', import.meta.url), 'utf8');
    const campo = readFileSync(new URL('../Floor10Campo.tsx', import.meta.url), 'utf8');

    it('o jogo manda os resultados no prompt e agenda a conferência', () => {
        expect(jogo).toContain('outcomes: memoriaConsequencia.current.linhas()');
        expect(jogo).toContain('stopRepeating: memoriaConsequencia.current.aviso()');
        expect(jogo).toContain('memoriaConsequencia.current.conferir(');
    });

    it('a conferência do jogo espera o corpo agir antes de julgar', () => {
        // Conferir no instante da decisão diria SEMPRE "ignorado": o gesto
        // ainda não aconteceu. A janela sai da duração do plano.
        const i = jogo.indexOf('const espera =');
        expect(i).toBeGreaterThan(-1);
        expect(jogo.slice(i, i + 90)).toContain('motion?.duration');
    });

    it('o `?campo` faz o mesmo, para dar para julgar à mão', () => {
        expect(campo).toContain('outcomes: memoria.current.linhas()');
        expect(campo).toContain('memoria.current.conferir(');
    });

    it('o jogo conta só as mensagens DO JOGADOR como sinal de atenção', () => {
        // As respostas do Nilo não são atenção recebida; contá-las faria toda
        // aproximação parecer bem-sucedida.
        expect(jogo).toContain("m.role === 'user'");
    });
});

describe('floor10Consequencia — o tédio não precisa de fracasso', () => {
    const reg = (meta: string, resultado: string, em: number) =>
        ({ meta, resultado, em } as never);

    it('AVISA quando a mesma meta se repete, mesmo DANDO CERTO', () => {
        // ── O DEFEITO ORIGINAL, O QUE ATRAVESSOU TUDO ─────────────────────
        // "ele só fica rondando de um lado pro outro". O aviso antigo exigia
        // que a meta tivesse FALHADO duas vezes. Só que a repetição que quem
        // joga vê acontece com a meta dando certo: ele se aproxima, o jogador
        // reage, e ele se aproxima de novo. Nada ali é falha, e nada avisava.
        const aviso = avisoDeSaciedade([
            reg('approach-player', 'atendido', 1),
            reg('approach-player', 'atendido', 2),
            reg('approach-player', 'atendido', 3),
        ]);
        expect(aviso).toContain('approach-player');
        expect(aviso).toContain('3 times in a row');
    });

    it('e também quando o resultado é indefinido', () => {
        // `indefinido` é o caso mais comum de todos, e o aviso antigo FILTRAVA
        // esses registros fora antes de olhar — então a repetição mais frequente
        // era justamente a invisível.
        expect(avisoDeSaciedade([
            reg('wander', 'indefinido', 1),
            reg('wander', 'indefinido', 2),
            reg('wander', 'indefinido', 3),
        ])).toContain('wander');
    });

    it('NÃO avisa quando ele está variando', () => {
        expect(avisoDeSaciedade([
            reg('approach-player', 'atendido', 1),
            reg('inspect-elevator', 'atendido', 2),
            reg('approach-player', 'atendido', 3),
        ])).toBeNull();
    });

    it('não avisa antes de haver repetição suficiente', () => {
        expect(avisoDeSaciedade([
            reg('approach-player', 'atendido', 1),
            reg('approach-player', 'atendido', 2),
        ])).toBeNull();
        expect(avisoDeSaciedade([])).toBeNull();
    });

    it('o enjoo manda sobre a insistência quando os dois valem', () => {
        // Repetir por tédio é o caso comum, e o texto dele já cobre o outro:
        // "faça algo diferente" serve tanto para quem falhou quanto para quem
        // acertou três vezes.
        const tresFalhas = [
            reg('approach-player', 'ignorado', 1),
            reg('approach-player', 'ignorado', 2),
            reg('approach-player', 'ignorado', 3),
        ];
        expect(avisoDoHistorico(tresFalhas)).toContain('sick of it');
    });

    it('a insistência continua valendo sozinha, com duas falhas', () => {
        // Duas falhas seguidas ainda não são tédio (o corte é três), mas já são
        // teimosia visível — e esse aviso não pode ter sumido na troca.
        const duasFalhas = [
            reg('approach-player', 'ignorado', 1),
            reg('approach-player', 'ignorado', 2),
        ];
        expect(avisoDoHistorico(duasFalhas)).toContain('failed twice in a row');
    });
});

describe('floor10Consequencia — o aviso CHEGA ao prompt', () => {
    it('a memória usa o aviso de tédio, não só o de fracasso', () => {
        // ── POR QUE ESTE TESTE EXISTE SEPARADO ────────────────────────────
        // Os testes acima exercitam as funções puras. Eles passam mesmo que
        // `MemoriaDeConsequencia.aviso()` continue chamando o aviso ANTIGO — e
        // é `aviso()` que o prompt lê (`stopRepeating`). Ou seja: sem este
        // teste, o conserto podia estar perfeito e desligado.
        const m = new MemoriaDeConsequencia();
        m.anotar('approach-player', 'atendido', 1);
        m.anotar('approach-player', 'atendido', 2);
        m.anotar('approach-player', 'atendido', 3);
        expect(m.aviso()).toContain('sick of it');
    });

    it('sem repetição, a memória não inventa aviso', () => {
        const m = new MemoriaDeConsequencia();
        m.anotar('approach-player', 'atendido', 1);
        m.anotar('wander', 'atendido', 2);
        m.anotar('inspect-elevator', 'atendido', 3);
        expect(m.aviso()).toBeNull();
    });
});
