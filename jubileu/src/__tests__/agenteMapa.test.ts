import { describe, it, expect } from 'vitest';
import { wallsForState, PR } from '../constants';
import { construirGrade, caminho, livreEm, paraCelula } from '../agente/agenteMapa';
import { RAIO_DO_CORPO, irAte } from '../agente/agenteAndar';

const LIMITES = { minX: -26, maxX: 26, minZ: -26, maxZ: 26 };
const grade = (paredes: number[][]) => construirGrade(paredes, LIMITES);

describe('o agente-jogador anda em QUALQUER andar', () => {
    // ── A EXIGÊNCIA DO DONO DO JOGO ───────────────────────────────────────
    //   "Eles tem que funcionar até em andares futuros"
    // Por isso o teste varre os andares REAIS pelo número, sem saber nada sobre
    // nenhum deles: o que descreve todos é `wallsForState`.
    // ── O QUE FOI MEDIDO, E NÃO O QUE EU ESPERAVA ────────────────────────
    //
    // Seis andares o agente atravessa a pé, do cab até o meio da sala, sem uma
    // linha de código específica de andar. Três NÃO — e isso não é defeito do
    // agente, é limite do vocabulário dele:
    //
    //     andar 7 ... os dois pontos livres, nenhum caminho entre eles
    //     andar 9 ... idem
    //     andar 8 ... o CENTRO é bloqueado (é um andar de plataforma: o meio
    //                 da sala é vão, e atravessar exige PULAR)
    //
    // Andar não basta para jogar este jogo. Está aqui como número, e não como
    // promessa, porque é ele que diz o que falta construir.
    const A_PE = [0, 2, 3, 5, 6, 10];
    const PRECISAM_DE_MAIS = [7, 8, 9];

    for (const nivel of A_PE) {
        it(`andar ${nivel}: atravessa a pé, do cab ao meio da sala`, () => {
            const paredes = wallsForState(nivel, false, true);
            const g = grade(paredes);
            const r = irAte(g, paredes, { x: 0, z: -11.5 }, { x: 0, z: 0 });
            expect(r.motivo, `andar ${nivel} parou por ${r.motivo}`).toBe('chegou');
        });
    }

    for (const nivel of PRECISAM_DE_MAIS) {
        it(`andar ${nivel}: NÃO se atravessa só andando — e o agente admite`, () => {
            // O valor deste teste é a honestidade: ele prende o limite medido.
            // Se alguém der pulo ao agente e o andar 8 passar a ser atravessável,
            // este teste quebra — e quebrar aqui é a notícia boa.
            const paredes = wallsForState(nivel, false, true);
            const g = grade(paredes);
            const r = irAte(g, paredes, { x: 0, z: -11.5 }, { x: 0, z: 0 });
            expect(r.chegou).toBe(false);
            expect(r.motivo).toBe('sem-caminho');
        });
    }

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
        for (const nome of ['agenteMapa.ts', 'agenteAndar.ts']) {
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
