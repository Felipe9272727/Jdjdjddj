import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    FLOOR10_MOTOR_ACTS, FLOOR10_MOTOR_GOALS, FLOOR10_MOTOR_RELATIVE,
    FLOOR10_MOTOR_TARGETS, FLOOR10_MOTOR_VERBS,
    buildMotorGrammar, buildMotorTranslationPrompt, metaDoPlanoMotor, parseMotorPlan,
} from '../npc/floor10MotorCortex';
import { DELIBERATION_GOALS } from '../npc/floor10Deliberation';
import type { Floor10MotorPlan } from '../npc/floor10MotorCortex';

const plano = (verb: string, target: string): Floor10MotorPlan => ({
    verb: verb as Floor10MotorPlan['verb'],
    target: target as Floor10MotorPlan['target'],
    pace: 'normal',
    duration: 6,
    raw: `${verb} ${target} normal 6`,
});

describe('o motor dá a META, não só o movimento', () => {
    // "o motor serviria justamente pra não ficar dependendo do 'choice' e a
    //  gente está procurando velocidade e inteligência"
    it('os pares que discriminam viram a meta certa', () => {
        expect(metaDoPlanoMotor(plano('approach', 'player'))).toBe('approach-player');
        expect(metaDoPlanoMotor(plano('withdraw', 'player'))).toBe('make-space');
        expect(metaDoPlanoMotor(plano('hold', 'player'))).toBe('observe-player');
        expect(metaDoPlanoMotor(plano('orbit', 'player'))).toBe('observe-player');
        expect(metaDoPlanoMotor(plano('approach', 'elevator'))).toBe('inspect-elevator');
        expect(metaDoPlanoMotor(plano('explore', 'room-center'))).toBe('wander');
        expect(metaDoPlanoMotor(plano('stay', 'self'))).toBe('idle');
    });

    it('o elevador manda sobre o verbo', () => {
        // É a única meta do andar ligada a um objeto específico: qualquer
        // movimento em direção a ele é a mesma intenção.
        for (const verb of FLOOR10_MOTOR_VERBS) {
            expect(metaDoPlanoMotor(plano(verb, 'elevator'))).toBe('inspect-elevator');
        }
    });

    it('parar num canto é ficar quieto; ir até ele é vagar', () => {
        expect(metaDoPlanoMotor(plano('stay', 'north-side'))).toBe('idle');
        expect(metaDoPlanoMotor(plano('hold', 'east-side'))).toBe('idle');
        expect(metaDoPlanoMotor(plano('explore', 'south-side'))).toBe('wander');
        expect(metaDoPlanoMotor(plano('approach', 'west-side'))).toBe('wander');
    });

    it('TODO par possível devolve uma meta que a deliberação conhece', () => {
        // Esta é a invariante que importa: o motor é preso por GRAMÁTICA, então
        // ele sempre devolve um par válido — e todo par tem de virar uma meta
        // válida, senão a rodada morre num `default` silencioso. 60 combinações.
        const metas = new Set<string>(DELIBERATION_GOALS);
        let pares = 0;
        for (const verb of FLOOR10_MOTOR_VERBS) {
            for (const target of FLOOR10_MOTOR_TARGETS) {
                pares += 1;
                expect(metas.has(metaDoPlanoMotor(plano(verb, target)))).toBe(true);
            }
        }
        expect(pares).toBe(FLOOR10_MOTOR_VERBS.length * FLOOR10_MOTOR_TARGETS.length);
    });

    it('é pura: o mesmo par dá sempre a mesma meta', () => {
        // Sem isto, uma meta que dependesse de estado global faria o NPC mudar
        // de ideia sozinho entre duas leituras do MESMO plano.
        for (const verb of FLOOR10_MOTOR_VERBS) {
            for (const target of FLOOR10_MOTOR_TARGETS) {
                const a = metaDoPlanoMotor(plano(verb, target));
                const b = metaDoPlanoMotor(plano(verb, target));
                expect(a).toBe(b);
            }
        }
    });
});

describe('o fluxo da rodada põe o motor ANTES do descarte', () => {
    // A prova de ordem, lida da fonte. O teste de comportamento exigiria subir
    // dois modelos; o que se garante aqui é a ARQUITETURA que ele pediu — que o
    // motor deixe de ser refém do CHOICE.
    const fonte = readFileSync(
        new URL('../npc/floor10SmallBrain.ts', import.meta.url),
        'utf8',
    );
    const bloco = fonte.slice(fonte.indexOf('let decided = parseDeliberation(texto'));

    it('o motor roda antes do resgate, não depois da decisão', () => {
        const motor = bloco.indexOf('translateFloor10MotorThought(');
        const metaDoMotor = bloco.indexOf('metaDoPlanoMotor(motion)');
        const resgate = bloco.indexOf('assinarEscolha(');
        expect(motor).toBeGreaterThan(-1);
        expect(metaDoMotor).toBeGreaterThan(motor);
        // A ordem é o ponto: sem isto o resgate volta a ser o primeiro recurso
        // e uma geração inteira do modelo grande volta ao caminho comum.
        expect(resgate).toBeGreaterThan(metaDoMotor);
    });

    it('a justificativa guardada é o PENSAMENTO, não a linha do tradutor', () => {
        // "approach player normal 6" como rationale apagaria o raciocínio que
        // vira cor na fala do Nilo.
        const i = bloco.indexOf('metaDoPlanoMotor(motion)');
        expect(bloco.slice(i, i + 400)).toContain('rationale: texto.trim()');
    });

    it('o resgate continua existindo como última tentativa', () => {
        // Ele lê o pensamento com o modelo que o ESCREVEU, o que é mais fiel
        // que a leitura do tradutor de 0,6B. Deixou de ser o primeiro recurso,
        // não de existir.
        expect(bloco).toContain('assinarEscolha(');
    });
});

describe('a geração respeita o próprio teto', () => {
    // `DELIBERATION_TIMEOUT_MS` existia e chamava `abort()` desde sempre — e não
    // adiantava, porque o laço de leitura nunca olhava o sinal. A única saída
    // antecipada era `escolhaAssinada`. Ou seja: o teto valia para quem
    // terminava cedo e NÃO valia para quem demorava, que é o caso inteiro.
    const fonte = readFileSync(
        new URL('../npc/floor10SmallBrain.ts', import.meta.url),
        'utf8',
    );
    const laco = fonte.slice(
        fonte.indexOf('for await (const chunk of stream)'),
        fonte.indexOf('        } catch {', fonte.indexOf('for await (const chunk of stream)')),
    );

    it('o laço de leitura sai quando o sinal é abortado', () => {
        expect(laco).toContain('if (abort.signal.aborted) break;');
    });

    it('e a assinatura continua sendo saída antecipada', () => {
        // Cortar por tempo é a rede; assinar cedo continua sendo o caminho bom,
        // e ele economiza tokens de verdade.
        expect(laco).toContain('cortadoNaEscolha = true');
    });
});

describe('o motor DECLARA a intenção, não só o movimento', () => {
    // Medido no caminho real, duas rodadas sobre o MESMO pensamento:
    //     vontade: approach-player    motor: stay | self
    //     vontade: inspect-elevator   motor: stay | self
    // `stay + self` infere `idle`. Ou seja: quando a meta viesse do motor, o
    // Nilo ficaria PARADO onde queria se aproximar. A ideia dele estava certa;
    // a minha primeira execução é que lia o corpo para adivinhar a vontade.
    it('a meta declarada manda sobre a inferida', () => {
        const p = plano('stay', 'self');
        expect(metaDoPlanoMotor(p)).toBe('idle');
        expect(metaDoPlanoMotor({ ...p, goal: 'approach-player' })).toBe('approach-player');
    });

    it('a META saiu da gramática — a medição mandou', () => {
        // Eu pus `GOAL:` na gramática para o motor DECLARAR a intenção. A
        // bancada, com os pensamentos reais do aparelho dele, derrubou:
        //     Qwen3, GOAL primeiro ..... approach-player em 5 de 7
        //     Qwen3, MOTION primeiro ... inspect-elevator em 7 de 7
        // Inverter a ordem só trocou QUAL rótulo ele repete. Esses modelos não
        // escolhem entre oito rótulos; travam num. O MOVIMENTO eles acertam
        // (4/7, zero proibidos), então o motor volta a fazer uma coisa só.
        const g = buildMotorGrammar(
            { playerVisible: true, playerDistance: 2 } as never,
            null,
        );
        expect(g).not.toContain('goal ::=');
        expect(g.startsWith('root ::= "MOTION: "')).toBe(true);
    });

    it('lê a meta da resposta, e ignora lixo fora do vocabulário', () => {
        const bom = parseMotorPlan('GOAL: make-space\nMOTION: withdraw | player | slow | 6');
        expect(bom?.goal).toBe('make-space');
        expect(metaDoPlanoMotor(bom!)).toBe('make-space');

        const invalido = parseMotorPlan('GOAL: fugir-do-hotel\nMOTION: stay | self | slow | 3');
        // Meta fora do vocabulário não vira meta: cai na inferência.
        expect(invalido?.goal).toBeUndefined();
        expect(metaDoPlanoMotor(invalido!)).toBe('idle');
    });

    it('resposta SEM linha GOAL continua funcionando', () => {
        // Compatibilidade: o caminho sem gramática e respostas antigas.
        const antigo = parseMotorPlan('MOTION: approach | player | normal | 6');
        expect(antigo?.goal).toBeUndefined();
        expect(metaDoPlanoMotor(antigo!)).toBe('approach-player');
    });

    it('as duas listas de metas não podem divergir', () => {
        // `FLOOR10_MOTOR_GOALS` vive no cortex para não fechar ciclo com
        // floor10Deliberation. Duas cópias da mesma lista é como um vocabulário
        // some sem ninguém perceber.
        expect([...FLOOR10_MOTOR_GOALS].sort()).toEqual([...DELIBERATION_GOALS].sort());
    });
});

describe('a gramática é GBNF válida, não só uma string bonita', () => {
    // O teste que faltava e que deixou passar uma regressão silenciosa: eu
    // acrescentei a linha GOAL à gramática e conferi só o TEXTO. Escrito como
    // `"\nMOTION: "` num template literal, o `\n` vira quebra de linha DE
    // VERDADE — e um literal GBNF não pode conter quebra crua. A gramática
    // ficava malformada, `createChatCompletion` estourava, e o `catch` do motor
    // devolvia null: o jogo perdia a tradução EM SILÊNCIO. Medido no caminho
    // real: `motor: null` nas 3 rodadas, onde antes vinha `stay | self`.
    const g = buildMotorGrammar(
        { playerVisible: true, playerDistance: 2 } as never,
        null,
    );

    it('nenhum literal entre aspas contém quebra de linha crua', () => {
        for (const linha of g.split('\n')) {
            // Aspas em número par por linha = nenhum literal atravessa a quebra.
            const aspas = (linha.match(/"/g) ?? []).length;
            expect(aspas % 2).toBe(0);
        }
    });

    it('a quebra pedida ao modelo vai ESCAPADA', () => {
        // Duas letras (barra + n), não o caractere 0x0A.
        expect(g).toContain('\\n');
        // A raiz tem de caber numa linha só: se o `\n` tivesse virado quebra
        // crua, ela se partiria em duas e o literal ficaria aberto.
        expect(g.split('\n')[0]).toContain('MOTION: ');
    });

    it('toda regra referenciada existe', () => {
        // Uma regra órfã também derruba o parser dentro do worker, longe daqui.
        const definidas = new Set(
            [...g.matchAll(/^([a-z][a-z0-9-]*)\s*::=/gm)].map((m) => m[1]),
        );
        const raiz = g.split('\n')[0];
        for (const ref of raiz.replace(/"[^"]*"/g, ' ').matchAll(/[a-z][a-z0-9-]*/g)) {
            if (ref[0] === 'root') continue;
            expect(definidas.has(ref[0])).toBe(true);
        }
    });
});

describe('o motor entende o que NÃO é andar', () => {
    // "vamos supor que a vontade quer fazer algo que não tenha na choice, como
    //  pular, ou explorar"
    //
    // O motor só sabia falar de deslocamento: seis verbos que são todos formas
    // de ir e vir. "Encostar o ouvido na porta", "bater na parede", "pular" não
    // existiam nem no vocabulário nem no corpo. Um personagem que só translada
    // não age sobre o mundo, passeia por ele.
    it('lê o gesto e o alvo dele', () => {
        const p = parseMotorPlan(
            'GOAL: inspect-elevator\nMOTION: approach | elevator | slow | 6\nACT: listen | elevator',
        );
        expect(p?.act).toBe('listen');
        expect(p?.actTarget).toBe('elevator');
    });

    it('`none` NÃO vira gesto — é o caso normal', () => {
        // A maior parte das rodadas é só movimento. Forçar um gesto sempre
        // faria o Nilo parecer um autômato de tiques.
        const p = parseMotorPlan(
            'GOAL: wander\nMOTION: explore | room-center | normal | 6\nACT: none | self',
        );
        expect(p?.act).toBeUndefined();
    });

    it('gesto inventado é ignorado, não vira ação', () => {
        // Sem isto, uma alucinação do tradutor viraria comportamento — e o
        // corpo teria de recusar uma ordem que ele mesmo aceitou.
        const p = parseMotorPlan(
            'GOAL: idle\nMOTION: stay | self | slow | 3\nACT: teleport | elevator',
        );
        expect(p?.act).toBeUndefined();
    });

    it('resposta SEM linha ACT continua válida', () => {
        const p = parseMotorPlan('GOAL: idle\nMOTION: stay | self | slow | 3');
        expect(p).not.toBeNull();
        expect(p?.act).toBeUndefined();
    });

    it('a gramática prende o gesto às oito palavras', () => {
        const g = buildMotorGrammar({ playerVisible: true, playerDistance: 2 } as never, null);
        expect(g).toContain('act ::=');
        for (const a of FLOOR10_MOTOR_ACTS) expect(g).toContain(`"${a}"`);
        // E a raiz continua numa linha só: `\n` escapado, não quebra crua —
        // foi assim que a gramática ficou malformada uma vez e o motor
        // desligou em silêncio.
        expect(g.split('\n')[0]).toContain('ACT: ');
    });
});

describe('a gramática oferece TUDO que o vocabulário tem', () => {
    // O defeito que apareceu no aparelho dele: eu acrescentei quatro direções
    // relativas a FLOOR10_MOTOR_TARGETS e `availableMotorTargets` monta a lista
    // À MÃO. A gramática nunca as oferecia, e o motor não podia escolhê-las nem
    // querendo. O pensamento na tela era exatamente
    //     "I step sideways, left, toward the wall"  ->  sem plano motor
    // — ele disse a coisa que o vocabulário novo existe para dizer.
    const g = buildMotorGrammar(
        { playerVisible: true, playerDistance: 2, player: {} } as never,
        null,
    );

    it('as quatro direções relativas estão na gramática', () => {
        for (const alvo of ['ahead', 'behind', 'to-my-left', 'to-my-right']) {
            expect(g).toContain(`"${alvo}"`);
        }
    });

    it('os lados da sala continuam lá — "west wall" precisa de west-side', () => {
        for (const alvo of ['west-side', 'east-side', 'north-side', 'south-side']) {
            expect(g).toContain(`"${alvo}"`);
        }
    });

    it('o prompt ENSINA a correspondência entre a palavra e o alvo', () => {
        // Sem isto o 0,6B tinha de adivinhar que "the west wall" é `west-side`
        // — e, medido no aparelho, ele respondia `stay | self` a um pensamento
        // que dizia "I move toward the west wall".
        const p = buildMotorTranslationPrompt(
            'I move toward the west wall.',
            { player: null, elevator: { visible: true, distance: 9 } } as never,
            null,
        );
        expect(p).toContain('west wall is west-side');
        expect(p).toContain('to-my-left');
        // E a regra que impede a resposta preguiçosa.
        expect(p).toContain('never answer stay');
    });
});

describe('as quatro direções relativas não são "parado"', () => {
    // ── O BUG QUE ESTE BLOCO PRENDE ───────────────────────────────────────
    //
    // `ahead`, `behind`, `to-my-left` e `to-my-right` não estavam em lista
    // nenhuma dentro de `metaDoPlanoMotor`: as 24 combinações verbo×alvo
    // desciam até o `return 'idle'` do fim. "Cinco passos à esquerda" — o
    // recurso que existe justamente para o Nilo ANDAR pela sala — era rotulado
    // como "parado".
    //
    // E o rótulo vira `deliberationBonus`: +0,55 de utilidade por 45 s ao
    // candidato de mesma meta. Uma decisão de se DESLOCAR acabava empurrando o
    // candidato de FICAR QUIETO. O motor mandava andar e a deliberação, no
    // lance seguinte, era subornada a não andar.
    //
    // O teste antigo (linha ~46) só cobrava "o resultado é ALGUMA meta válida",
    // então passava com a semântica invertida — o padrão "passaria se a função
    // devolvesse constante".
    const MOVIMENTO = ['approach', 'withdraw', 'orbit', 'explore'] as const;
    const PARADA = ['stay', 'hold'] as const;

    for (const target of FLOOR10_MOTOR_RELATIVE) {
        for (const verb of MOVIMENTO) {
            it(`${verb} ${target} é deslocamento, não idle`, () => {
                const meta = metaDoPlanoMotor({
                    verb, target, pace: 'normal', duration: 6, raw: `${verb} ${target}`,
                });
                expect(meta).not.toBe('idle');
                expect(meta).toBe('wander');
            });
        }
        for (const verb of PARADA) {
            it(`${verb} ${target} é ficar quieto`, () => {
                expect(metaDoPlanoMotor({
                    verb, target, pace: 'normal', duration: 6, raw: `${verb} ${target}`,
                })).toBe('idle');
            });
        }
    }
});
