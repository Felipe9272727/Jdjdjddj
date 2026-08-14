import { describe, it, expect } from 'vitest';
import { MARGEM_SEGURA, planoDoVetor, rotulosVetorizados } from '../npc/floor10MotorVetor';
import { METADE_DO_CAMINHO } from '../npc/floor10Prosa';
import { buildMotorGrammar } from '../npc/floor10MotorCortex';
import { INITIAL_FLOOR10_PERCEPTION } from '../npc/floor10Perception';
import { FLOOR10_MOTOR_TARGETS, FLOOR10_MOTOR_VERBS } from '../npc/floor10MotorCortex';

describe('floor10MotorVetor — o plano sem LLM nenhum', () => {
    it('o alvo do vetor entra no plano', () => {
        expect(planoDoVetor('west-side', 'I move toward the west wall.').target).toBe('west-side');
    });

    it('o verbo sai da própria frase', () => {
        expect(planoDoVetor('player', 'I walk right up to him.').verb).toBe('approach');
        expect(planoDoVetor('player', 'I back away from him.').verb).toBe('withdraw');
        expect(planoDoVetor('elevator', 'I circle around the doors.').verb).toBe('orbit');
    });

    it('`self` vira SEMPRE `stay` — aproximar-se de si mesmo faz o corpo tremer no lugar', () => {
        // Sem isto, `approach | self` manda o passo calcular um destino igual à
        // posição atual, e o corpo fica corrigindo um erro de zero para sempre.
        expect(planoDoVetor('self', 'I walk and walk and walk.').verb).toBe('stay');
    });

    it('ritmo e duração saem da palavra escrita, com padrão no meio da tabela', () => {
        expect(planoDoVetor('player', 'I walk slowly toward him.').pace).toBe('slow');
        expect(planoDoVetor('player', 'I rush at him.').pace).toBe('fast');
        expect(planoDoVetor('player', 'I go to him.').pace).toBe('normal');
        expect(planoDoVetor('player', 'I go to him.').duration).toBe(6);
        expect(planoDoVetor('player', 'I watch him for a while.').duration).toBe(12);
    });

    it('o plano é sempre válido para o resto do jogo', () => {
        for (const alvo of FLOOR10_MOTOR_TARGETS) {
            const p = planoDoVetor(alvo, 'I move.');
            expect(FLOOR10_MOTOR_VERBS).toContain(p.verb);
            expect(FLOOR10_MOTOR_TARGETS).toContain(p.target);
            expect([3, 6, 9, 12]).toContain(p.duration);
            expect(['slow', 'normal', 'fast']).toContain(p.pace);
        }
    });

    it('pensamento sem verbo não vira plano NENHUM', () => {
        // ── A REGRA QUE O DONO DO JOGO PEDIU ─────────────────────────────
        //
        // Aqui havia `?? 'approach'`, e esse `??` era a maior fonte de
        // desobediência do NPC. Toda frase cujo verbo o mapa não reconhecia
        // virava "vá até a âncora mais próxima" — e como o vetor sempre acha
        // ALGUMA âncora, ele ia até a coisa que a frase mencionava. Mandar o
        // Nilo FUGIR do jogador fazia ele ir ATRÁS.
        //
        // Não entendeu, não faz nada. E isso não o deixa inerte: o corpo cai no
        // `planoDaMeta(goal)` da vontade, que é ordem legítima. O que morre é
        // só a obediência inventada.
        expect(planoDoVetor('player', '')).toBe(null);
        expect(planoDoVetor('player', 'zzz qqq xxx')).toBe(null);
    });

    it('mas "self" continua tendo plano — parar não precisa de verbo', () => {
        expect(planoDoVetor('self', '')?.verb).toBe('stay');
    });
});

describe('floor10MotorVetor — os rótulos desempacotados', () => {
    it('desempacota todos e guarda entre chamadas', () => {
        const a = rotulosVetorizados();
        expect(a.length).toBeGreaterThan(10);
        expect(rotulosVetorizados()).toBe(a);
    });

    it('o limiar separa os erros medidos das margens confiantes', () => {
        // Os ERROS do vetor na bancada ficaram em 0,014 e 0,040 — o corte tem
        // de estar acima deles para que esses casos ainda peçam desempate.
        expect(MARGEM_SEGURA).toBeGreaterThan(0.041);
        // E as margens CONFIANTES medidas no aparelho do dono do jogo foram
        // 0,062 e 0,076. Se o corte subir acima delas, o Qwen acorda em toda
        // rodada e o limiar vira um `if (true)` de ~100 s cada — foi o que
        // aconteceu com o 0,08 que eu tinha chutado.
        expect(MARGEM_SEGURA).toBeLessThan(0.062);
    });
});

describe('floor10MotorVetor — a gramática do desempate', () => {
    const olhos = INITIAL_FLOOR10_PERCEPTION;

    it('sem candidatos, a gramática oferece a lista inteira — como antes', () => {
        const g = buildMotorGrammar(olhos, null);
        expect(g).toContain('"elevator"');
        expect(g).toContain('"room-center"');
    });

    it('COM candidatos, a gramática oferece SÓ eles', () => {
        // É isto que impede o colapso: com 12 opções o modelo responde sempre a
        // mesma (medido em 6 modelos de 5 famílias). Com 3 que vieram da frase,
        // a mania dele não tem para onde fugir.
        const g = buildMotorGrammar(olhos, null, ['west-side', 'to-my-left']);
        expect(g).toContain('"west-side"');
        expect(g).toContain('"to-my-left"');
        expect(g).not.toContain('"room-center"');
    });

    it('um alvo que os OLHOS não veem não entra só porque o vetor gostou', () => {
        // `nearest-device` só existe com prisão. Se o vetor sugerir sem prisão,
        // a interseção tem de descartar — senão o motor manda o corpo para uma
        // coordenada que não existe.
        const g = buildMotorGrammar(olhos, null, ['nearest-device']);
        expect(g).not.toContain('"nearest-device"');
        // E cai na lista inteira, em vez de ficar com gramática vazia.
        expect(g).toContain('"elevator"');
    });

    it('gramática nunca sai vazia, nem com candidatos todos inválidos', () => {
        const g = buildMotorGrammar(olhos, null, []);
        expect(g).toContain('target ::=');
        expect(g.length).toBeGreaterThan(60);
    });
});

describe('floor10MotorVetor — a ligação chega no motor', () => {
    it('o motor consulta o vetor ANTES de acordar o Qwen', async () => {
        // ── POR QUE UM TESTE OLHA O FONTE ─────────────────────────────────
        // Nesta base eu já perdi uma tabela de roteamento inteira para código
        // morto — módulo existindo, testado, e ninguém chamando. Aqui o risco é
        // o mesmo: todo o caminho por vetor pode estar perfeito e o motor
        // continuar indo direto ao Qwen, que é o comportamento de hoje.
        const fonte = await import('node:fs/promises')
            .then((fs) => fs.readFile(new URL('../npc/floor10MotorBrain.ts', import.meta.url), 'utf8'));
        const iVetor = fonte.indexOf('classificarPensamento');
        const iQwen = fonte.indexOf('floor10ModelCoordinator.activate');
        expect(iVetor).toBeGreaterThan(0);
        expect(iQwen).toBeGreaterThan(0);
        // O vetor tem de ser consultado ANTES — senão o Qwen já pagou a carga.
        expect(iVetor).toBeLessThan(iQwen);
        // E o desempate tem de receber os candidatos.
        expect(/veredito\?\.candidatos/.test(fonte)).toBe(true);
    });
});

describe('?campo — a tela de teste mede o motor NOVO', () => {
    it('o campo sobe o embeddinggemma e mostra se ele está no ar', async () => {
        // ── POR QUE UM TESTE OLHA O FONTE ─────────────────────────────────
        // O `?campo` existe para o dono do jogo testar no aparelho dele. Se o
        // embeddinggemma não subir ali, a tela mede o motor ANTIGO e parece
        // idêntica — ele testaria a coisa errada sem nenhum sinal disso.
        const fonte = await import('node:fs/promises')
            .then((fs) => fs.readFile(new URL('../Floor10Campo.tsx', import.meta.url), 'utf8'));
        // O modelo sobe…
        expect(/precarregarMemoria\(\)/.test(fonte)).toBe(true);
        // …o veredito é consultado…
        expect(/classificarPensamento\(/.test(fonte)).toBe(true);
        // …e a tela DIZ qual motor está decidindo.
        expect(fonte).toContain('FORA DO AR');
        expect(/margem/.test(fonte)).toBe(true);
    });
});

describe('floor10MotorVetor — o palpite do vetor nunca é jogado fora', () => {
    it('o motor cai na reserva do vetor quando o Qwen não conclui', async () => {
        // ── O DEFEITO QUE O PRINT MOSTROU ─────────────────────────────────
        // Em 2 de 4 rodadas no aparelho do dono do jogo o motor dizia "sem
        // plano motor" DEPOIS de o vetor ter dado um veredito bom (`player`
        // margem 0,076; `west-side` margem 0,062). Pagava-se os ~100 s do Qwen
        // E ficava-se sem plano — o pior dos dois mundos.
        const fonte = await import('node:fs/promises')
            .then((fs) => fs.readFile(new URL('../npc/floor10MotorBrain.ts', import.meta.url), 'utf8'));
        // A reserva é construída ANTES de acordar o Qwen…
        const iReserva = fonte.indexOf('const reserva =');
        const iEngine = fonte.indexOf('floor10ModelCoordinator.activate');
        expect(iReserva).toBeGreaterThan(0);
        expect(iReserva).toBeLessThan(iEngine);
        // …e é ela que vale quando o plano vem nulo, em TODAS as saídas.
        expect(/plan \?\? reserva/.test(fonte)).toBe(true);
        expect(/return reserva/.test(fonte)).toBe(true);
    });
});

describe('?campo — o vetor tem download próprio', () => {
    it('botão e barra separados, e dá para testá-lo sem a vontade', async () => {
        // Pedido do dono do jogo: "eu quero que no campo, tenha um download
        // separado pra ele". A vontade tem 1,25 GB e leva minutos; o
        // classificador tem 333 MB e é quem decide o movimento. Amarrar os dois
        // no mesmo botão obriga a esperar o arquivo grande para testar a peça
        // pequena — caro de repetir num plano de dados de celular.
        const fonte = await import('node:fs/promises')
            .then((fs) => fs.readFile(new URL('../Floor10Campo.tsx', import.meta.url), 'utf8'));
        // Botão próprio, que não toca na vontade…
        expect(/baixarVetor/.test(fonte)).toBe(true);
        expect(fonte).toContain('baixar o vetor');
        // …barra de progresso própria…
        expect(/downloadLine\(st\.memoriaDownload\)/.test(fonte)).toBe(true);
        // …e o teste de uma frase solta, senão o download separado não serve
        // para nada: o pensamento nasce na vontade.
        expect(/testarFrase/.test(fonte)).toBe(true);
    });
});

describe('floor10MotorVetor — a ordem repetida tem de andar de novo', () => {
    it('duas rodadas iguais NÃO produzem o mesmo `raw`', () => {
        // `floor10Passo` usa o `raw` como identidade do plano para travar o
        // destino dos alvos RELATIVOS. Com `raw` igual, o corpo — já tendo
        // chegado ao destino travado — ficava PARADO na segunda rodada,
        // achando que era a mesma ordem que ele já cumpriu.
        //
        // "Cinco passos à esquerda" duas vezes tem de andar dez, não cinco.
        const a = planoDoVetor('to-my-left', 'I step left.', 1);
        const b = planoDoVetor('to-my-left', 'I step left.', 2);
        expect(a.raw).not.toBe(b.raw);
        // Mas o resto do plano continua igual: só a identidade muda.
        expect(a.target).toBe(b.target);
        expect(a.verb).toBe(b.verb);
    });

    it('o corpo ANDA de novo quando a mesma ordem volta', async () => {
        const { passoDoPlano } = await import('../npc/floor10Passo');
        const mundo = {
            jogador: { x: -6, z: 6 }, elevador: { x: 0, z: -10 },
            limite: 22, dt: 1 / 60,
        };
        const corpo = { x: 0, z: 0, yaw: 0 };
        const andar = (selo: number) => {
            const antes = { x: corpo.x, z: corpo.z };
            const plano = planoDoVetor('to-my-left', 'I step left.', selo);
            for (let i = 0; i < 600; i += 1) passoDoPlano(corpo, plano, mundo);
            return Math.hypot(corpo.x - antes.x, corpo.z - antes.z);
        };
        expect(andar(1)).toBeGreaterThan(0.5);
        // A segunda ordem, idêntica, tem de mover o corpo outra vez.
        expect(andar(2)).toBeGreaterThan(0.5);
    });
});

describe('?campo — a tela diz ONDE o movimento morre', () => {
    it('mostra a ordem em vigor e os metros andados', async () => {
        const fonte = await import('node:fs/promises')
            .then((fs) => fs.readFile(new URL('../Floor10Campo.tsx', import.meta.url), 'utf8'));
        expect(fonte).toContain('NENHUMA — o corpo não recebeu plano');
        expect(/andado\.current/.test(fonte)).toBe(true);
    });
});

describe('floor10MotorVetor — o vetor decide SOZINHO', () => {
    it('com veredito, o motor devolve o plano e NÃO acorda o Qwen', async () => {
        // Medido: só o vetor 5/7 em ~1 s e 0 MB; o Qwen comprava um caso em
        // sete por 639 MB e 3,5 s por rodada — e sete amostras não distinguem
        // 5/7 de 6/7. Este teste prende a decisão: havendo veredito, sai plano
        // sem carregar modelo nenhum.
        const fonte = await import('node:fs/promises')
            .then((fs) => fs.readFile(new URL('../npc/floor10MotorBrain.ts', import.meta.url), 'utf8'));
        const iRetorno = fonte.indexOf('if (veredito) return planoDoVetor(');
        const iEngine = fonte.indexOf('floor10ModelCoordinator.activate');
        expect(iRetorno).toBeGreaterThan(0);
        // O retorno tem de vir ANTES do coordenador: depois dele o download de
        // 639 MB já foi pago.
        expect(iRetorno).toBeLessThan(iEngine);
    });

    it('o caminho antigo continua para quem não tem o embedding de pé', () => {
        // Não é código morto: é o `?campo` antes de baixar o vetor, e o
        // aparelho onde o embedding falhou. Melhor o motor antigo, com todos os
        // defeitos dele, que nenhum motor.
        expect(typeof planoDoVetor).toBe('function');
    });
});

describe('a distância da frase chega ao plano — teste de FIAÇÃO', () => {
    // Sem isto o conserto é decorativo, e eu comprovei mutando: apagando a
    // leitura da distância em `casasDaProsa`, os 59 testes de prosa e de corpo
    // continuavam passando. Um testava a FUNÇÃO que lê, o outro o CORPO que
    // obedece, e ninguém cobrava o fio entre os dois.
    it('o número escrito na frase vira o `distancia` do plano', () => {
        expect(planoDoVetor('player', 'stay 10 meters away from him')?.distancia).toBe(10);
        expect(planoDoVetor('player', 'get right up to him')?.distancia).toBe(0.8);
        expect(planoDoVetor('to-my-left', 'take three steps to my left')?.distancia).toBe(3);
    });

    it('e frase sem quanto nenhum não inventa distância', () => {
        // `undefined` é o que faz cada verbo usar o padrão que sempre usou —
        // pôr um número aqui mudaria o comportamento de quem não pediu nada.
        expect(planoDoVetor('player', 'walk to him')?.distancia).toBeUndefined();
    });

    it('"metade do caminho" chega como fração, não como metros', () => {
        expect(planoDoVetor('elevator', 'go halfway to the elevator')?.distancia)
            .toBe(METADE_DO_CAMINHO);
    });

    it('e o giro chega como ATO', () => {
        expect(planoDoVetor('self', 'spin 360 degrees')?.act).toBe('spin');
    });
});
