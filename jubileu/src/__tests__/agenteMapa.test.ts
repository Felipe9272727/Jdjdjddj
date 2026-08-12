import { describe, it, expect } from 'vitest';
import { wallsForState, PR } from '../constants';
import {
    CELULA, FOLGA, alcancaveis, construirGrade, limitesDaVista, livreEm, maisLonge, paraCelula,
} from '../agente/agenteMapa';
import { RAIO_DO_CORPO, irAte } from '../agente/agenteAndar';

const LIMITES = { minX: -26, maxX: 26, minZ: -26, maxZ: 26 };
const grade = (paredes: number[][]) => construirGrade(paredes, LIMITES);

describe('o agente-jogador anda em QUALQUER andar', () => {
    // ── A EXIGÊNCIA DO DONO DO JOGO ───────────────────────────────────────
    //   "Eles tem que funcionar até em andares futuros"
    // Por isso o teste varre os andares REAIS pelo número, sem saber nada sobre
    // nenhum deles: o que descreve todos é `wallsForState`.
    // ── O QUE FOI MEDIDO, DEPOIS DE EU ERRAR A LEITURA UMA VEZ ───────────
    //
    // Primeira versão deste teste dizia que o Andar 8 "é de plataforma, o meio
    // é vão, exige pular". Errado: eu li `f8Platformer.test.ts` no nome de um
    // arquivo e supus. Medindo o alcance real a partir do cab:
    //
    //     andar 8 ... alcança 77 pontos da amostra, até 10,9 m — inclusive
    //                 (-1,8, -0,8), colado no centro. O que bloqueia o (0,0)
    //                 exato é MOBÍLIA (`F8_FURNITURE`), e o agente contorna.
    //     andar 7 ... alcança 3 pontos, no máximo 1,5 m
    //     andar 9 ... alcança 25 pontos, no máximo 4,0 m
    //
    // Nos 7 e 9 ele fica preso na área do cab — o ponto de partida que escolhi
    // não está na área jogável desses andares. Isso é limite do MEU teste, não
    // do agente, e a diferença importa: um manda consertar o agente, o outro
    // manda descobrir por onde se entra naquele andar.
    //
    // Por isso o alvo aqui deixou de ser "o meio da sala" (que eu chutei) e
    // passou a ser DERIVADO: o ponto alcançável mais distante. Se o agente
    // consegue chegar a algum lugar longe do cab, ele sabe andar naquele andar.
    const CAB = { x: 0, z: -11.5 };

    // O ponto alcançável mais distante do cab. Uma inundação, não mil A*.
    // Isto morava AQUI dentro, como função do teste. Uma primitiva de percepção
    // presa no teste é uma que o jogo não pode usar — e o agente precisa
    // exatamente dela para responder "e agora?" num andar que não conhece.
    // Mudou para `agenteMapa.maisLonge`; o teste agora usa a mesma que o jogo.
    const maisLongeQueEleAlcanca = (g: ReturnType<typeof grade>) => maisLonge(g, CAB);

    for (const nivel of [0, 2, 3, 5, 6, 8, 10]) {
        it(`andar ${nivel}: sai do cab e atravessa a área jogável`, () => {
            const paredes = wallsForState(nivel, false, true);
            const g = grade(paredes);
            const alvo = maisLongeQueEleAlcanca(g);
            // Se ele só alcança o próprio cab, ou não sabe andar ali, ou o
            // andar não se entra por aqui. Os dois merecem falhar.
            expect(alvo.d, `andar ${nivel} só alcança ${alvo.d.toFixed(1)}m`)
                .toBeGreaterThan(6);
            const r = irAte(g, paredes, CAB, alvo.p);
            expect(r.motivo, `andar ${nivel} parou por ${r.motivo}`).toBe('chegou');
        });
    }

    it('andares 7 e 9: o agente fica na área do cab — limite CONHECIDO', () => {
        // Prende o que foi medido. Quando alguém descobrir por onde se entra
        // nesses andares (ou der pulo ao agente), isto quebra — e quebrar aqui
        // é a notícia boa.
        for (const nivel of [7, 9]) {
            const g = grade(wallsForState(nivel, false, true));
            expect(maisLongeQueEleAlcanca(g).d).toBeLessThan(6);
        }
    });

    it('o raio do corpo é o do jogo — a física não é uma cópia', () => {
        // Se este número divergir de `PR`, a grade aprova caminhos que o corpo
        // real não atravessa, e o agente trava sem ninguém entender por quê.
        expect(RAIO_DO_CORPO).toBeCloseTo(PR, 5);
    });
});

describe('ZERO conhecimento de andar específico', () => {
    it('atravessa um andar SINTÉTICO que não existe no jogo', () => {
        // ── O TESTE QUE SUSTENTA A PROMESSA ───────────────────────────────
        // "Funciona em andares futuros" é fácil de prometer e fácil de quebrar
        // sem perceber: basta alguém acrescentar um `if (level === 7)`. Aqui o
        // agente recebe paredes que NENHUM andar do jogo tem — um corredor em
        // S — e precisa atravessar do mesmo jeito.
        const paredes: number[][] = [
            // caixa externa
            [-10, -10, 10, -10], [10, -10, 10, 10], [10, 10, -10, 10], [-10, 10, -10, -10],
            // duas divisórias que forçam o zigue-zague
            [-10, -3, 4, -3],
            [10, 3, -4, 3],
        ];
        const g = grade(paredes);
        const r = irAte(g, paredes, { x: -8, z: -8 }, { x: 8, z: 8 });
        expect(r.motivo).toBe('chegou');
        // E o caminho tem de CONTORNAR: em linha reta seriam ~22 m.
        expect(r.plano.length * 0.5).toBeGreaterThan(20);
    });

    it('nenhum caso especial por número de andar no código do agente', async () => {
        const fs = await import('node:fs/promises');
        for (const nome of ['agenteMapa.ts', 'agenteAndar.ts', 'agenteObjetivo.ts']) {
            const fonte = await fs.readFile(new URL(`../agente/${nome}`, import.meta.url), 'utf8');
            // Comentários podem citar andares; código não pode ramificar neles.
            const semComentarios = fonte
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/.*$/gm, '');
            expect(/\blevel\s*===|\bnivel\s*===|\bandar\s*===/.test(semComentarios)).toBe(false);
        }
    });
});

describe('o agente sabe quando NÃO dá', () => {
    it('sala selada devolve "sem-caminho", não um agente batendo na parede', () => {
        // Informação útil, não falha: num andar com a porta trancada, "não há
        // caminho" é a resposta certa, e o agente precisa dela para tentar
        // outra coisa.
        const paredes: number[][] = [
            [-10, -10, 10, -10], [10, -10, 10, 10], [10, 10, -10, 10], [-10, 10, -10, -10],
            [-10, 0, 10, 0],
        ];
        const g = grade(paredes);
        const r = irAte(g, paredes, { x: 0, z: -5 }, { x: 0, z: 5 });
        expect(r.motivo).toBe('sem-caminho');
        expect(r.chegou).toBe(false);
    });

    it('a grade concorda com a física sobre o que é parede', () => {
        const paredes = wallsForState(0, false, true);
        const g = grade(paredes);
        // ── O PONTO SAI DA PRÓPRIA PAREDE, E NÃO DO MEU CHUTE ────────────
        // Eu tentei duas vezes cravar uma coordenada "que obviamente é parede"
        // e errei as duas — o teste me corrigiu nas duas. Derivar o ponto do
        // MEIO de um segmento real de `wallsForState` não depende de eu
        // lembrar a planta do andar, e continua valendo se a planta mudar.
        let bloqueados = 0;
        for (const [ax, az, bx, bz] of paredes) {
            const meio = paraCelula(g, { x: (ax + bx) / 2, z: (az + bz) / 2 });
            if (!livreEm(g, meio.i, meio.j)) bloqueados += 1;
        }
        // Toda parede com comprimento real bloqueia o próprio meio. Algumas são
        // degeneradas (segmentos de tamanho zero que o `resolveCollision`
        // ignora), então a exigência é a maioria esmagadora, não a totalidade.
        expect(bloqueados).toBeGreaterThan(paredes.length * 0.8);
    });
});

describe('os testes que faltavam — achados por mutação', () => {
    // ── POR QUE ESTE BLOCO EXISTE ─────────────────────────────────────────
    // Um crítico rodou teste de mutação contra estes módulos: quebrou funções
    // de propósito e viu quais testes continuavam passando. Sobreviveram sete
    // mutações. Cada uma delas é uma linha de código que ninguém estava
    // cobrando, e as quatro abaixo são as que moram neste arquivo.

    it('a guarda anti-corte-de-quina não é testável por dentro — e aqui está o porquê', () => {
        // ── UM ACHADO QUE VIROU DOCUMENTAÇÃO ──────────────────────────────
        //
        // O crítico apagou a guarda anti-quina do A* e da inundação, uma de
        // cada vez, e a suíte passou nas duas. Eu tentei escrever o teste que
        // faltava e NÃO CONSEGUI — e a razão é melhor que o teste seria.
        //
        // A guarda protege contra cortar a diagonal quando os dois vizinhos
        // ortogonais estão bloqueados. Para isso existir, a parede precisa
        // bloquear UMA célula e deixar as vizinhas livres. Só que `FOLGA`
        // (0,6 m) é MAIOR que `CELULA` (0,5 m): qualquer parede empurra o corpo
        // numa faixa de pelo menos duas células de espessura. A quina fina que a
        // guarda protege não pode ser produzida por `construirGrade`.
        //
        // Então a guarda é defensiva, e fica: `alcancaveis` e `caminho` aceitam
        // QUALQUER grade, inclusive uma montada à mão com outra folga. O que dá
        // para cobrar é a premissa — se alguém baixar `FOLGA` abaixo de
        // `CELULA`, a quina fina passa a existir e este teste avisa.
        expect(FOLGA).toBeGreaterThan(CELULA);

        // E a espessura medida: um segmento reto bloqueia ≥ 2 células de cada
        // lado, em toda a extensão dele.
        const paredes: number[][] = [
            [-10, -10, 10, -10], [10, -10, 10, 10], [10, 10, -10, 10], [-10, 10, -10, -10],
            [-6, 0, 6, 0],
        ];
        const g = grade(paredes);
        for (let x = -5; x <= 5; x += 1) {
            let bloqueadas = 0;
            for (let z = -1; z <= 1; z += 0.5) {
                const c = paraCelula(g, { x, z });
                if (!livreEm(g, c.i, c.j)) bloqueadas += 1;
            }
            expect(bloqueadas, `em x=${x} a parede só bloqueou ${bloqueadas} células`)
                .toBeGreaterThanOrEqual(2);
        }
    });

    it('o detector de trava tem nome próprio: "travou"', () => {
        // `paradoHa > 90` nunca era asserido: dava para apagar o detector
        // inteiro e a suíte passava. Sem ele o relatório diria "tempo", e eu
        // procuraria o defeito no lugar errado — "acabou o orçamento de passos"
        // e "o corpo está entalado" pedem consertos opostos.
        //
        // O cenário é o que o detector existe para pegar: a GRADE e a FÍSICA
        // discordam. A grade é montada sem a divisória, então o A* jura que há
        // caminho; a física recebe a divisória e o corpo não passa.
        const caixa: number[][] = [
            [-10, -10, 10, -10], [10, -10, 10, 10], [10, 10, -10, 10], [-10, 10, -10, -10],
        ];
        const g = grade(caixa);
        const comDivisoria = [...caixa, [-10, 0, 10, 0]];
        const r = irAte(g, comDivisoria, { x: 0, z: -5 }, { x: 0, z: 5 });
        expect(r.motivo).toBe('travou');
        expect(r.chegou).toBe(false);
        // E ele parou ENCOSTADO na divisória, não no ponto de partida.
        expect(Math.abs(r.fim.z)).toBeLessThan(1.2);
    });

    it('a janela e as paredes que não se cruzam devolvem a janela, não uma caixa invertida', () => {
        // ── O BURACO PARA ANDARES FUTUROS ────────────────────────────────
        // Com o agente a mais de RAIO_DA_VISTA de toda parede num eixo, a
        // interseção invertia (minX > maxX). `construirGrade` fazia
        // `max(1, ceil(negativo))` e devolvia UMA célula, ancorada centenas de
        // metros longe — e daí tudo respondia "não alcanço nada", em silêncio.
        const longe: number[][] = [[500, 500, 520, 500], [500, 500, 500, 520]];
        const lim = limitesDaVista(longe, { x: 0, z: 0 });
        expect(lim.minX).toBeLessThan(lim.maxX);
        expect(lim.minZ).toBeLessThan(lim.maxZ);
        const g = construirGrade(longe, lim);
        expect(g.largura).toBeGreaterThan(10);
        // E o agente continua enxergando chão em volta de si.
        let livres = 0;
        for (const v of alcancaveis(g, { x: 0, z: 0 })) livres += v;
        expect(livres).toBeGreaterThan(100);
    });
});
