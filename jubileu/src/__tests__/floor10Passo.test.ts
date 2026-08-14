import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRISON_DEVICES } from '../npc/f10Prison';
import { METADE_DO_CAMINHO, casasDaProsa, distanciaDaProsa } from '../npc/floor10Prosa';
import { passoDoPlano, planoDaMeta, type CorpoDoNilo } from '../npc/floor10Passo';
import { DELIBERATION_GOALS } from '../npc/floor10Deliberation';
import { FLOOR10_MOTOR_TARGETS, FLOOR10_MOTOR_VERBS } from '../npc/floor10MotorCortex';
import type { Floor10MotorPlan, Floor10MotorTarget } from '../npc/floor10MotorCortex';

const plano = (verb: string, target: string, pace = 'normal'): Floor10MotorPlan => ({
    verb: verb as Floor10MotorPlan['verb'],
    target: target as Floor10MotorPlan['target'],
    pace: pace as Floor10MotorPlan['pace'],
    duration: 6,
    raw: '',
});

const mundo = (jogador: { x: number; z: number } | null = { x: 0, z: 10 }) => ({
    jogador,
    elevador: { x: 0, z: -10 },
    limite: 22,
    dt: 1 / 60,
});

/** Roda `n` quadros e devolve o corpo. */
function correr(corpo: CorpoDoNilo, p: Floor10MotorPlan | null, n: number, j = { x: 0, z: 10 }) {
    for (let i = 0; i < n; i += 1) passoDoPlano(corpo, p, mundo(j));
    return corpo;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
    Math.hypot(a.x - b.x, a.z - b.z);

describe('o corpo obedece ao plano — e para quando não há plano', () => {
    // "ele só fica rondando de um lado pro outro, e o comportamento mais NPC
    //  possível". Rondar é o que um corpo faz quando ninguém lhe deu destino.
    it('SEM plano ele não sai do lugar', () => {
        const corpo: CorpoDoNilo = { x: 3, z: 3, yaw: 0 };
        correr(corpo, null, 300);
        expect(corpo.x).toBe(3);
        expect(corpo.z).toBe(3);
    });

    it('sem plano ele ainda acompanha o jogador com o olhar', () => {
        // Parado é presença; parado E de costas é NPC quebrado.
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: Math.PI };
        correr(corpo, null, 300, { x: 0, z: 10 });
        // Olhando para +z: yaw ≈ 0.
        expect(Math.abs(Math.atan2(Math.sin(corpo.yaw), Math.cos(corpo.yaw)))).toBeLessThan(0.1);
    });
});

describe('approach tem FIM — o NPC não gruda no jogador', () => {
    it('para na distância de conversa em vez de encostar', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        const j = { x: 0, z: 10 };
        correr(corpo, plano('approach', 'player'), 60 * 20, j);
        const d = dist(corpo, j);
        // Sem o freio ele encosta (d → 0) e fica vibrando contra o jogador.
        expect(d).toBeGreaterThan(1.2);
        expect(d).toBeLessThan(2.2);
    });

    it('e chega de fato mais perto do que estava', () => {
        // O outro lado: um freio cedo demais viraria "approach" que não anda.
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        const j = { x: 0, z: 18 };
        const antes = dist(corpo, j);
        correr(corpo, plano('approach', 'player'), 60 * 5, j);
        expect(dist(corpo, j)).toBeLessThan(antes - 3);
    });
});

describe('withdraw dá espaço sem fugir para a parede', () => {
    it('afasta até um limite e para', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 9, yaw: 0 };
        const j = { x: 0, z: 10 };
        correr(corpo, plano('withdraw', 'player'), 60 * 30, j);
        const d = dist(corpo, j);
        expect(d).toBeGreaterThan(4);
        // Sem o teto ele iria até a parede (limite 22).
        expect(d).toBeLessThan(6);
    });

    it('recua de FRENTE: dar espaço não é virar as costas', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 9, yaw: 0 };
        correr(corpo, plano('withdraw', 'player'), 60 * 10, { x: 0, z: 10 });
        // Continua encarando +z (o jogador), mesmo tendo andado para -z.
        expect(Math.abs(Math.atan2(Math.sin(corpo.yaw), Math.cos(corpo.yaw)))).toBeLessThan(0.2);
    });
});

describe('orbit anda sem aproximar nem afastar', () => {
    it('mantém o raio e muda de posição', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 7, yaw: 0 };
        const j = { x: 0, z: 10 };
        const raioAntes = dist(corpo, j);
        const xAntes = corpo.x;
        correr(corpo, plano('orbit', 'player'), 60 * 4, j);
        expect(Math.abs(corpo.x - xAntes)).toBeGreaterThan(1);
        // O raio não pode explodir nem colapsar — era o defeito clássico de
        // órbita sem correção: ela abre um pouco a cada volta.
        expect(Math.abs(dist(corpo, j) - raioAntes)).toBeLessThan(1.5);
    });
});

describe('o ritmo importa, e a parede segura', () => {
    it('fast anda mais que slow no mesmo tempo', () => {
        const lento: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        const rapido: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        const j = { x: 0, z: 20 };
        correr(lento, plano('approach', 'player', 'slow'), 60 * 3, j);
        correr(rapido, plano('approach', 'player', 'fast'), 60 * 3, j);
        expect(rapido.z).toBeGreaterThan(lento.z + 2);
    });

    it('nunca atravessa a parede', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        correr(corpo, plano('explore', 'north-side', 'fast'), 60 * 60);
        expect(Math.abs(corpo.x)).toBeLessThanOrEqual(21.5);
        expect(Math.abs(corpo.z)).toBeLessThanOrEqual(21.5);
    });

    it('stay e hold não deslocam', () => {
        for (const verbo of ['stay', 'hold']) {
            const corpo: CorpoDoNilo = { x: 5, z: -5, yaw: 0 };
            correr(corpo, plano(verbo, 'player'), 60 * 10);
            expect(corpo.x).toBe(5);
            expect(corpo.z).toBe(-5);
        }
    });

    it('sem jogador no mundo, alvo `player` não move nem quebra', () => {
        const corpo: CorpoDoNilo = { x: 2, z: 2, yaw: 0 };
        for (let i = 0; i < 100; i += 1) passoDoPlano(corpo, plano('approach', 'player'), mundo(null));
        expect(corpo.x).toBe(2);
        expect(corpo.z).toBe(2);
    });
});

describe('andar até CHEGAR, e só então parar', () => {
    // "Eu quero que o corpo ande de verdade." O relógio de `duration` (3 a 12s)
    // expirava muito antes da rodada seguinte (~60s no celular): ele andaria
    // seis segundos por minuto. O movimento já se limita sozinho — é a chegada
    // que encerra o gesto, não o cronômetro.
    it('approach percorre uma distância GRANDE se o alvo estiver longe', () => {
        const corpo: CorpoDoNilo = { x: -18, z: -18, yaw: 0 };
        const j = { x: 18, z: 18 };
        // 40s de caminhada a 1,6 m/s: tempo de sobra para atravessar a sala.
        correr(corpo, plano('approach', 'player'), 60 * 40, j);
        expect(dist(corpo, j)).toBeLessThan(2.2);
    });

    it('e depois de chegar ele PARA — não fica tremendo no alvo', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        const j = { x: 0, z: 10 };
        correr(corpo, plano('approach', 'player'), 60 * 20, j);
        const parado = { x: corpo.x, z: corpo.z };
        correr(corpo, plano('approach', 'player'), 60 * 20, j);
        // Sem o freio, aqui apareceria oscilação em torno do jogador.
        expect(dist(corpo, parado)).toBeLessThan(0.05);
    });

    it('explore atravessa a sala até o lado pedido', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        correr(corpo, plano('explore', 'north-side'), 60 * 30);
        // O alvo do lado norte é z = limite - 4 = 18.
        expect(corpo.z).toBeGreaterThan(16);
    });
});

describe('a meta sozinha já move o corpo — sem depender do tradutor', () => {
    // Medido na réplica: uma rodada, `deslocamento total: 0.00 m`. A vontade
    // decidiu e o Nilo não saiu do lugar, porque `motion` veio nulo — e na
    // PRIMEIRA rodada ele sempre vem nulo: o tradutor tem 640 MB e ainda está
    // subindo. Eu tinha anotado isso como "conhecido"; para quem olha a tela,
    // "conhecido" era um NPC que nasce paralisado.
    it('approach-player faz o corpo ir até o jogador', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        const j = { x: 0, z: 14 };
        correr(corpo, planoDaMeta('approach-player'), 60 * 20, j);
        expect(dist(corpo, j)).toBeLessThan(2.2);
    });

    it('inspect-elevator leva o corpo até a porta', () => {
        const corpo: CorpoDoNilo = { x: 10, z: 10, yaw: 0 };
        correr(corpo, planoDaMeta('inspect-elevator'), 60 * 30);
        expect(Math.hypot(corpo.x - 0, corpo.z - (-10))).toBeLessThan(1.5);
    });

    it('make-space afasta', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 9, yaw: 0 };
        const j = { x: 0, z: 10 };
        correr(corpo, planoDaMeta('make-space'), 60 * 20, j);
        expect(dist(corpo, j)).toBeGreaterThan(4);
    });

    it('observe-player NÃO desloca: observar é ficar de olho, não avançar', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        correr(corpo, planoDaMeta('observe-player'), 60 * 20, { x: 0, z: 10 });
        expect(corpo.x).toBe(0);
        expect(corpo.z).toBe(0);
    });

    it('idle também não desloca', () => {
        const corpo: CorpoDoNilo = { x: 3, z: -3, yaw: 0 };
        correr(corpo, planoDaMeta('idle'), 60 * 20);
        expect(corpo.x).toBe(3);
        expect(corpo.z).toBe(-3);
    });

    it('TODA meta devolve um plano válido', () => {
        // Sem isto, uma meta nova cairia num `default` e o corpo pararia sem
        // ninguém entender por quê.
        for (const meta of DELIBERATION_GOALS) {
            const p = planoDaMeta(meta);
            expect(FLOOR10_MOTOR_VERBS).toContain(p.verb);
            expect(FLOOR10_MOTOR_TARGETS).toContain(p.target);
        }
    });
});

describe('direções relativas ao corpo — "5 passos à esquerda"', () => {
    // "vamos supor que a vontade quer fazer algo que não tenha na choice...
    //  o lfm fala, vou andar 5 passos a esquerda, e o motor traduz em movimento"
    //
    // Antes disto os alvos eram todos ABSOLUTOS: a única forma de o Nilo ir para
    // a esquerda era existir alguma coisa à esquerda dele. Um corpo que só sabe
    // ir até objetos pula de âncora em âncora — nunca anda pela sala.
    it('esquerda é a esquerda DELE, não a do mapa', () => {
        // Olhando para +z (yaw 0), a esquerda dele é -x.
        const a: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        correr(a, plano('explore', 'to-my-left'), 60 * 6, { x: 99, z: 99 });
        expect(a.x).toBeLessThan(-1);

        // Virado para +x (yaw = PI/2), a MESMA ordem leva para +z.
        const b: CorpoDoNilo = { x: 0, z: 0, yaw: Math.PI / 2 };
        correr(b, plano('explore', 'to-my-left'), 60 * 6, { x: 99, z: 99 });
        expect(b.z).toBeGreaterThan(1);
    });

    it('frente e trás são opostos', () => {
        const frente: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        const tras: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        correr(frente, plano('explore', 'ahead'), 60 * 6, { x: 99, z: 99 });
        correr(tras, plano('explore', 'behind'), 60 * 6, { x: 99, z: 99 });
        expect(frente.z).toBeGreaterThan(1);
        expect(tras.z).toBeLessThan(-1);
    });

    it('as relativas continuam respeitando a parede', () => {
        const corpo: CorpoDoNilo = { x: 21, z: 21, yaw: Math.PI / 4 };
        correr(corpo, plano('explore', 'ahead', 'fast'), 60 * 30, { x: 99, z: 99 });
        expect(Math.abs(corpo.x)).toBeLessThanOrEqual(21.5);
        expect(Math.abs(corpo.z)).toBeLessThanOrEqual(21.5);
    });
});

describe('o corpo alcança os APARELHOS — o campo era cego para eles', () => {
    // ── A QUEIXA QUE ISTO MATA ────────────────────────────────────────────
    //
    //   "no campo, as respostas dele não acionam movimento"
    //
    // O `alvoNoMundo` devolvia `null` para `nearest-device` e `active-device`,
    // com um comentário que apresentava isso como prudência: "sem catálogo de
    // aparelhos nesta réplica […] em vez de inventar uma posição que não existe
    // no mundo real".
    //
    // Só que a posição EXISTE — `PRISON_DEVICES` é um módulo puro com as quatro
    // coordenadas fixas, e o caminho do jogo 3D (`groundMotorPlan` →
    // `targetPoint`) já as resolvia. A réplica não estava sendo conservadora:
    // estava cega. E o Andar 10 É a prisão, então `nearest-device` é o palpite
    // mais provável do vetor lá dentro — ou seja, o campo mostrava o Nilo
    // PARADO exatamente nos casos em que o jogo o faria andar.
    //
    // Instrumento de medida que mente é pior que instrumento nenhum: as
    // decisões tomadas olhando para ele saem erradas.
    const aparelhos = PRISON_DEVICES.map((d) => ({
        x: d.x, z: d.z, heldByNpc: false, heldByPlayer: false,
    }));
    const mundo = (over = {}) => ({
        jogador: { x: -6, z: 6 },
        elevador: { x: 0, z: -10 },
        limite: 22,
        dt: 1 / 60,
        aparelhos,
        ...over,
    });
    const paraAparelho = (target: Floor10MotorTarget): Floor10MotorPlan => ({
        verb: 'approach', target, pace: 'normal', duration: 6, raw: `approach ${target}`,
    });

    it('"vá até a coisa mais próxima que reage" faz o corpo ANDAR', () => {
        // Do centro até o aparelho mais próximo são √(7²+6²) ≈ 9,2 m; a 1,6 m/s
        // isso leva ~350 quadros. 240 davam 6,4 m e o teste falhava dizendo
        // "não chegou" quando o certo era "não deu tempo".
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        for (let i = 0; i < 600; i += 1) passoDoPlano(corpo, paraAparelho('nearest-device'), mundo());
        expect(Math.hypot(corpo.x, corpo.z), 'não saiu do lugar').toBeGreaterThan(1);
        // E chegou perto de ALGUM aparelho de verdade.
        const perto = Math.min(...aparelhos.map((d) => Math.hypot(d.x - corpo.x, d.z - corpo.z)));
        expect(perto).toBeLessThan(1.5);
    });

    it('e escolhe o mais perto DELE, não um fixo', () => {
        // Partindo de cantos opostos ele tem de ir para aparelhos diferentes.
        const oeste: CorpoDoNilo = { x: -6, z: -6, yaw: 0 };
        const leste: CorpoDoNilo = { x: 6, z: -6, yaw: 0 };
        for (let i = 0; i < 600; i += 1) {
            passoDoPlano(oeste, paraAparelho('nearest-device'), mundo());
            passoDoPlano(leste, paraAparelho('nearest-device'), mundo());
        }
        expect(oeste.x).toBeLessThan(0);
        expect(leste.x).toBeGreaterThan(0);
    });

    it('"a coisa que ESTÁ reagindo" vai na acionada, não na mais perta', () => {
        // O Nilo colado na placa oeste, e a LESTE acionada pelo jogador: o
        // alvo é a que reage, senão ele nunca cruza a sala para cooperar.
        const comLesteAcionada = aparelhos.map((d) => ({ ...d, heldByPlayer: d.x > 0 && d.z < 0 }));
        const corpo: CorpoDoNilo = { x: -7, z: -6, yaw: 0 };
        for (let i = 0; i < 600; i += 1) {
            passoDoPlano(corpo, paraAparelho('active-device'), mundo({ aparelhos: comLesteAcionada }));
        }
        expect(corpo.x, 'ficou no lado oeste em vez de ir na acionada').toBeGreaterThan(0);
    });

    it('sem lista de aparelhos, volta a ficar parado — e isso é o certo', () => {
        // Quem chama sem prisão no mundo não tem aparelho nenhum para alcançar.
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        for (let i = 0; i < 120; i += 1) {
            passoDoPlano(corpo, paraAparelho('nearest-device'), mundo({ aparelhos: undefined }));
        }
        expect(Math.hypot(corpo.x, corpo.z)).toBeLessThan(0.01);
    });

    it('e o CAMPO passa a lista — teste de fiação', () => {
        // O defeito não era a função estar errada: era a réplica não entregar
        // os aparelhos. Comportamento e fiação, cobrados em separado.
        const fonte = readFileSync(new URL('../Floor10Campo.tsx', import.meta.url), 'utf8');
        expect(fonte).toContain('aparelhos: Object.values(f10prison.devices)');
    });
});

describe('o Nilo ANDA no campo — medido meta a meta', () => {
    // ── A PERGUNTA DO DONO DO JOGO ────────────────────────────────────────
    //
    //   "Mas pera, o Nilo vai conseguir andar no campo?"
    //
    // Eu tinha consertado UMA causa (os aparelhos) e afirmado que resolvia.
    // Medindo todas as metas no mundo exato do campo, apareceram mais duas —
    // e as duas juntas eram o "ele não anda realmente" inteiro.
    const mundoDoCampo = {
        jogador: { x: -6, z: 6 },
        elevador: { x: 0, z: -10 },
        limite: 22,
        dt: 1 / 60,
        aparelhos: PRISON_DEVICES.map((d) => ({
            x: d.x, z: d.z, heldByNpc: false, heldByPlayer: false,
        })),
    };
    const rodar = (p: Floor10MotorPlan, corpo: CorpoDoNilo, quadros = 360) => {
        const antes = { x: corpo.x, z: corpo.z };
        for (let i = 0; i < quadros; i += 1) passoDoPlano(corpo, p, mundoDoCampo);
        return Math.hypot(corpo.x - antes.x, corpo.z - antes.z);
    };

    it('as metas de MOVIMENTO movem o corpo', () => {
        for (const meta of ['wander', 'seek-player', 'approach-player', 'talk-player',
            'inspect-elevator'] as const) {
            const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
            expect(rodar(planoDaMeta(meta, 1), corpo), `${meta} não andou`).toBeGreaterThan(1);
        }
    });

    it('e as metas de FICAR continuam paradas — parado nem sempre é bug', () => {
        // `idle` e `observe-player` são imobilidade de propósito. `make-space`
        // só recua se o jogador estiver perto, e daqui ele está a 8,5 m.
        for (const meta of ['idle', 'observe-player', 'make-space'] as const) {
            const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
            expect(rodar(planoDaMeta(meta, 1), corpo), `${meta} andou sem motivo`)
                .toBeLessThan(0.05);
        }
    });

    it('RODADAS SEGUIDAS continuam andando — era aqui que ele congelava', () => {
        // ── O TRAVAMENTO ─────────────────────────────────────────────────
        // Alvos relativos travam o destino enquanto o `raw` não muda — é o que
        // faz "cinco passos à esquerda" ser a esquerda de ONDE ELE DECIDIU. Mas
        // o `raw` de `planoDaMeta` era `fallback ${meta}`, CONSTANTE: duas
        // rodadas de `wander` tinham o mesmo raw, o destino ficava travado, e
        // ele andava até lá uma vez e parava para sempre.
        //
        // Medido: com selo, 4,21 m em toda rodada; com raw constante, 4,21 m na
        // primeira e 0,00 em todas as seguintes.
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        for (let rodada = 1; rodada <= 5; rodada += 1) {
            expect(rodar(planoDaMeta('wander', rodada), corpo), `parou na rodada ${rodada}`)
                .toBeGreaterThan(1);
        }
    });

    it('e MUDA DE RUMO — vagar não é andar reto até a parede', () => {
        // Com `ahead` fixo ele ia (0,4.2) → (0,8.4) → (0,12.6) até encostar na
        // parede e parar. Melhor que congelado, e ainda assim uma seta.
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        const trilha: string[] = [];
        for (let rodada = 1; rodada <= 6; rodada += 1) {
            rodar(planoDaMeta('wander', rodada), corpo);
            trilha.push(`${corpo.x.toFixed(1)},${corpo.z.toFixed(1)}`);
        }
        // Ele se moveu nos DOIS eixos: uma reta só mexeria em um.
        const xs = new Set(trilha.map((t) => t.split(',')[0]));
        const zs = new Set(trilha.map((t) => t.split(',')[1]));
        expect(xs.size, `andou só em z: ${trilha.join(' ')}`).toBeGreaterThan(1);
        expect(zs.size, `andou só em x: ${trilha.join(' ')}`).toBeGreaterThan(1);
    });

    it('vagar NUNCA pode mirar o centro da sala', () => {
        // A armadilha original, e ela é silenciosa: `explore | room-center` dá
        // deslocamento ZERO quando o corpo já está no centro — e o corpo CHEGA
        // no centro justamente por causa dessa meta. Ele ia uma vez e ficava.
        for (const meta of ['wander', 'seek-player'] as const) {
            for (let selo = 0; selo < 8; selo += 1) {
                expect(planoDaMeta(meta, selo).target).not.toBe('room-center');
            }
        }
    });
});

describe('a caixa de frase do campo move o corpo — teste de FIAÇÃO', () => {
    // ── O PRINT QUE O DONO DO JOGO MANDOU ─────────────────────────────────
    //
    //   vetor: no ar · elevator · margem 0.167 · folgado, sem LLM
    //   ordem: NENHUMA — o corpo não recebeu plano
    //
    // Os dois na mesma tela. De fora, a leitura óbvia é "o vetor acertou e
    // mesmo assim ele não anda" — a queixa antiga voltando por caminho novo.
    //
    // Só que o vetor tinha feito o trabalho dele. Quem não existia era o elo
    // seguinte: `testarFrase` chamava `setVetor` e parava aí. O veredito
    // morria na tela.
    //
    // Comportamento e fiação, cobrados em separado — a lição do aviso que eu
    // escrevi certo e deixei desconectado.
    it('classificar uma frase vira plano motor e alimenta o corpo', () => {
        const fonte = readFileSync(new URL('../Floor10Campo.tsx', import.meta.url), 'utf8');
        // O veredito vira plano…
        expect(fonte).toContain('planoDoVetor(veredito.alvo, frase)');
        // …e o plano entra no ref que o laço de quadro consome.
        expect(/plano\.current = p;/.test(fonte)).toBe(true);
        expect(/planoAte\.current = performance\.now\(\) \/ 1000 \+ p\.duration/.test(fonte))
            .toBe(true);
    });

    it('e o rótulo do botão não promete menos do que ele faz', () => {
        // "classificar" descrevia um beco sem saída. Quem lê "classificar" não
        // espera o corpo andar, e quem lê e o corpo NÃO anda conclui que está
        // quebrado — os dois lados errados pela mesma palavra.
        const fonte = readFileSync(new URL('../Floor10Campo.tsx', import.meta.url), 'utf8');
        expect(fonte).toContain('MOVER o Nilo');
    });
});

describe('"vá até ele, mas não o siga" — a diferença mecânica', () => {
    // ── O QUE "SEGUIR" É, NESTE JOGO ──────────────────────────────────────
    //
    // `approach player` lê a posição do jogador A CADA QUADRO. Se ele anda, o
    // Nilo vai atrás. Isso é seguir — e é o comportamento padrão.
    //
    // `fixarAlvo` congela o ponto onde o jogador ESTAVA quando a ordem saiu. O
    // Nilo vai até lá e para. É a segunda casa da frase, e a única negação com
    // tradução mecânica exata aqui.
    const mundoCom = (jx: number, jz: number) => ({
        jogador: { x: jx, z: jz },
        elevador: { x: 0, z: -10 },
        limite: 22,
        dt: 1 / 60,
    });
    const ordem = (fixar: boolean): Floor10MotorPlan => ({
        verb: 'approach', target: 'player', pace: 'normal', duration: 6,
        raw: 'teste#1', ...(fixar ? { fixarAlvo: true } : {}),
    });

    it('SEM a restrição ele persegue: o jogador anda, o Nilo vai atrás', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        // O jogador começa ao norte e foge para o leste no meio do caminho.
        for (let i = 0; i < 120; i += 1) passoDoPlano(corpo, ordem(false), mundoCom(0, 10));
        // 13,4 m até 1,6 m do jogador (onde `approach` freia), a 1,6 m/s: ~500
        // quadros. Eu tinha dado 300 e o teste acusou "não seguiu" quando o
        // certo era "não deu tempo" — a mesma armadilha de antes, de novo.
        for (let i = 0; i < 700; i += 1) passoDoPlano(corpo, ordem(false), mundoCom(15, 10));
        expect(corpo.x, 'não seguiu o jogador que fugiu para o leste').toBeGreaterThan(12);
    });

    it('COM a restrição ele vai até onde o jogador estava, e fica', () => {
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        for (let i = 0; i < 120; i += 1) passoDoPlano(corpo, ordem(true), mundoCom(0, 10));
        const meio = { x: corpo.x, z: corpo.z };
        // Mesmo com o jogador fugindo, o destino continua o de antes.
        for (let i = 0; i < 700; i += 1) passoDoPlano(corpo, ordem(true), mundoCom(15, 10));
        expect(corpo.x, 'perseguiu mesmo com a restrição').toBeLessThan(2);
        // E chegou onde o jogador estava, em vez de parar no lugar.
        expect(corpo.z).toBeGreaterThan(meio.z - 0.1);
        expect(corpo.z).toBeGreaterThan(8);
    });

    it('e a frase inteira produz o plano certo, ponta a ponta', () => {
        // A prova de que as duas casas chegam juntas até o corpo.
        const casas = casasDaProsa("go to the player but don't follow him");
        expect(casas.verbo).toBe('approach');
        expect(casas.fixarAlvo).toBe(true);
    });
});

describe('o QUANTO vem da frase — o teto de verdade não eram os verbos', () => {
    // ── A QUEIXA ──────────────────────────────────────────────────────────
    //
    //   "6 verbos? Eu queria que a vontade conseguisse fazer o que fazer, não
    //    que fosse limitada por tão pouca coisa, por isso queria um motor"
    //
    // E o teto não eram os verbos. Cada um tinha uma DISTÂNCIA CRAVADA:
    // `approach` sempre parava a 1,6 m, `withdraw` sempre recuava até 4,5,
    // `orbit` sempre a 3,5, e um passo relativo era sempre 5. Seis verbos por
    // catorze alvos davam 84 ordens DISCRETAS — e nenhuma delas era "chegue
    // bem perto" ou "fique a dez metros dele".
    //
    // Não faltava verbo. Faltava o quanto.
    const mundo = {
        jogador: { x: 0, z: 12 }, elevador: { x: 0, z: -10 }, limite: 22, dt: 1 / 60,
    };
    const ate = (p: Floor10MotorPlan, quadros = 900) => {
        const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
        for (let i = 0; i < quadros; i += 1) passoDoPlano(corpo, p, mundo);
        return Math.hypot(mundo.jogador.x - corpo.x, mundo.jogador.z - corpo.z);
    };
    const plano = (over: Partial<Floor10MotorPlan>): Floor10MotorPlan => ({
        verb: 'approach', target: 'player', pace: 'normal', duration: 6,
        raw: `d#${Math.random()}`, ...over,
    });

    it('"chegue bem perto" e "pare a cinco metros" deixam de ser o mesmo movimento', () => {
        const perto = ate(plano({ distancia: 0.8 }));
        const longe = ate(plano({ distancia: 5 }));
        expect(perto).toBeLessThan(1.3);
        expect(longe).toBeGreaterThan(4.4);
        expect(longe).toBeLessThan(5.6);
    });

    it('sem distância na frase, o padrão de sempre continua valendo', () => {
        // O conserto não pode mudar o comportamento de quem não pediu nada.
        expect(ate(plano({}))).toBeLessThan(1.9);
        expect(ate(plano({}))).toBeGreaterThan(1.3);
    });

    it('recuar também tem quanto: "um pouco" não é "o mais longe possível"', () => {
        // O corpo começa a 12 m do jogador, então `withdraw 12` não teria por
        // que se mexer — meu primeiro teste pedia isso e acusava o código.
        // Comparar exige começar PERTO.
        const daquiPerto = (d: number, quadros: number) => {
            const corpo: CorpoDoNilo = { x: 0, z: 10, yaw: 0 };  // 2 m do jogador
            const p = plano({ verb: 'withdraw', distancia: d });
            for (let i = 0; i < quadros; i += 1) passoDoPlano(corpo, p, mundo);
            return Math.hypot(mundo.jogador.x - corpo.x, mundo.jogador.z - corpo.z);
        };
        const pouco = daquiPerto(4, 900);
        const muito = daquiPerto(14, 1500);
        expect(pouco).toBeGreaterThan(3.4);
        expect(pouco).toBeLessThan(5);
        expect(muito).toBeGreaterThan(pouco + 5);
    });

    it('e o passo relativo deixa de ser sempre cinco', () => {
        const anda = (d?: number) => {
            const corpo: CorpoDoNilo = { x: 0, z: 0, yaw: 0 };
            const p = plano({ target: 'to-my-left', ...(d !== undefined ? { distancia: d } : {}) });
            for (let i = 0; i < 900; i += 1) passoDoPlano(corpo, p, mundo);
            return Math.hypot(corpo.x, corpo.z);
        };
        expect(anda(2)).toBeLessThan(3);
        expect(anda(10)).toBeGreaterThan(8);
        // E o padrão continua sendo cinco.
        expect(anda()).toBeGreaterThan(4);
        expect(anda()).toBeLessThan(6);
    });

    it('a frase inteira produz a distância, ponta a ponta', () => {
        expect(distanciaDaProsa('take three steps to my left')).toBe(3);
        expect(distanciaDaProsa('stay 10 meters away from him')).toBe(10);
        expect(distanciaDaProsa('get right up to the plate')).toBe(0.8);
        expect(distanciaDaProsa('watch him from a distance')).toBe(10);
        expect(distanciaDaProsa('go halfway to the elevator')).toBe(METADE_DO_CAMINHO);
        // Frase sem quanto nenhum: o verbo usa o padrão dele.
        expect(distanciaDaProsa('walk to the elevator')).toBe(null);
    });

    it('"metade do caminho" é fração, não metros', () => {
        // O corpo começa a 12 m do jogador; metade é 6.
        const meio = ate(plano({ distancia: METADE_DO_CAMINHO }), 900);
        expect(meio).toBeGreaterThan(4);
        expect(meio).toBeLessThan(8);
    });
});
