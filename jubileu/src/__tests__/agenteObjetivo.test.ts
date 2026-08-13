import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { platforms, reset, tick } from '../f3Parkour';
import { type Plataforma, daParaPular } from '../agente/agenteSalto';
import { ELEV_W, hasWalkInElevator } from '../constants';
import { irAte } from '../agente/agenteAndar';
import { RAIO_DA_VISTA, caminho } from '../agente/agenteMapa';
import {
    DENTRO_DO_CAB, alcanca, dentroDoCab, oQueFazerAqui, oQueFazerNoAr, olharOAndar,
    pegarOElevador,
} from '../agente/agenteObjetivo';

/** Um ponto fora do cab em todo andar (z = 0 está bem acima de ELEVATOR_ZONE_Z). */
const FORA_DO_CAB = { x: 0, z: 0 };
const TODOS = [0, 1, 2, 3, 5, 6, 7, 8, 9, 10];

describe('o alvo do elevador é DERIVADO, não cravado', () => {
    it('é o centro da caixa de ELEV_W', () => {
        const xs = ELEV_W.flatMap((w) => [w[0], w[2]]);
        const zs = ELEV_W.flatMap((w) => [w[1], w[3]]);
        expect(DENTRO_DO_CAB.x).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2, 6);
        expect(DENTRO_DO_CAB.z).toBeCloseTo((Math.min(...zs) + Math.max(...zs)) / 2, 6);
    });

    it('bate com o ponto para onde o App TELEPORTA o jogador na viagem', () => {
        // `playerPositionCmdRef.current = { x: 0, y: 0, z: -13 }`. Eu tinha
        // escrito aqui "duas vezes", contando as duas que eu conhecia; um
        // revisor foi medir e são 13 ocorrências de `z: -13` no App, 10 nessa
        // forma exata. O número errado enfraquecia o próprio argumento: treze
        // cópias do mesmo ponto são um motivo MAIOR para derivar a coordenada
        // de `ELEV_W` do que duas seriam.
        expect(DENTRO_DO_CAB).toEqual({ x: 0, z: -13 });
    });
});

describe('a regra do cab é a DO JOGO, inteira', () => {
    // ── O BUG QUE ESTE BLOCO PRENDE ───────────────────────────────────────
    // Eu tinha escrito `dentroDoCab(p)` só com as duas condições espaciais,
    // sem o `hasWalkInElevator`. O `Player.tsx` usa as TRÊS, e o comentário
    // da constante explica por quê: "several maps legitimately extend through
    // z <= -10". Com meia regra o agente se declarava embarcado na popa do
    // navio do Andar 7 e no meio do Viveiro.
    it('a popa do navio do Andar 7 NÃO é o elevador', () => {
        // O convés vai até z = -6,6 × 1,85 = -12,21: dentro da faixa espacial
        // do cab, e mesmo assim é chão de navio.
        const popa = { x: 0, z: -11.5 };
        expect(popa.z).toBeLessThanOrEqual(-10);       // cai na faixa…
        expect(dentroDoCab(7, popa)).toBe(false);      // …e ainda assim não é cab
    });

    it('o mesmo ponto NO SAGUÃO é o elevador', () => {
        expect(dentroDoCab(0, { x: 0, z: -11.5 })).toBe(true);
    });

    it('concorda com hasWalkInElevator em todo andar', () => {
        for (const nivel of TODOS) {
            expect(dentroDoCab(nivel, DENTRO_DO_CAB)).toBe(hasWalkInElevator(nivel));
        }
    });
});

describe('a jogada: ir para outro andar', () => {
    // ── O QUE "IR PARA OUTRO ANDAR" É, MECANICAMENTE ──────────────────────
    // Quem troca o andar é o elevador, e só nos andares 0–3 entrar nele basta.
    // Nos outros o andar é dono da própria saída (overlay, cutscene, interação),
    // e o agente precisa SABER disso — senão anda até o meio do cab no Andar 8
    // e espera uma viagem que nunca começa.
    for (const nivel of [0, 1, 2, 3]) {
        it(`andar ${nivel}: sai de fora, embarca, e a viagem acontece`, () => {
            const andar = olharOAndar(nivel, FORA_DO_CAB);
            const t = pegarOElevador(andar, FORA_DO_CAB);
            expect(t.jaEstava).toBe(false);
            expect(t.motivo, `parou por ${t.motivo}`).toBe('chegou');
            expect(t.embarcou).toBe(true);
            expect(t.viaja, 'entrou no cab mas a viagem não começa').toBe(true);
            expect(t.passos).toBeGreaterThan(0);
        });
    }

    for (const nivel of [5, 6, 7, 8, 9, 10]) {
        it(`andar ${nivel}: o cab NÃO leva a lugar nenhum, e ele sabe`, () => {
            const andar = olharOAndar(nivel, FORA_DO_CAB);
            expect(pegarOElevador(andar, FORA_DO_CAB).viaja).toBe(false);
            expect(oQueFazerAqui(andar, FORA_DO_CAB).tipo).toBe('explorar');
        });
    }

    it('já dentro do cab: reconhece, não anda à toa', () => {
        const dentro = { x: 0, z: -12 };
        const andar = olharOAndar(0, dentro);
        const t = pegarOElevador(andar, dentro);
        expect(t.jaEstava).toBe(true);
        expect(t.passos).toBe(0);
        expect(t.viaja).toBe(true);
    });
});

describe('quando não dá para embarcar, ele explora — e o alvo é real', () => {
    for (const nivel of TODOS) {
        it(`andar ${nivel}: o objetivo é alcançável a pé`, () => {
            const andar = olharOAndar(nivel, FORA_DO_CAB);
            const obj = oQueFazerAqui(andar, FORA_DO_CAB);
            // Um objetivo que ele não alcança é pior que nenhum: manda o corpo
            // bater na parede e o relatório dizer "travou".
            expect(alcanca(andar, FORA_DO_CAB, obj.alvo), `alvo de ${obj.tipo} inalcançável`)
                .toBe(true);
            const r = irAte(andar.grade, andar.paredes, FORA_DO_CAB, obj.alvo);
            expect(r.motivo, `andar ${nivel} parou por ${r.motivo}`).toBe('chegou');
            expect(obj.porque.length).toBeGreaterThan(0);
        });
    }

    it('explorar leva longe de verdade, não para o pé dele', () => {
        // Se o "mais distante alcançável" fosse o próprio ponto de partida, o
        // agente ficaria parado achando que cumpriu o objetivo — que é
        // exatamente a queixa original ("o Nilo não anda realmente").
        const andar = olharOAndar(10, FORA_DO_CAB);
        const obj = oQueFazerAqui(andar, FORA_DO_CAB);
        expect(Math.hypot(obj.alvo.x, obj.alvo.z)).toBeGreaterThan(10);
    });
});

describe('a grade nunca explode, mesmo num andar infinito', () => {
    it('o corredor sem fim do Andar 3 cabe numa janela', () => {
        // ── O NÚMERO QUE ME ENSINOU A MEDIR ──────────────────────────────
        // "Derivar os limites das paredes" parecia obviamente certo. Medido:
        // o Andar 3 dava grade de 61 × 200037 células — doze milhões — porque
        // `F3_CORRIDOR_FAR_Z = 100000` está lá de propósito ("the climb never
        // ends"). Um segmento honesto do jogo destrói o plano de mapear tudo.
        const g = olharOAndar(3, FORA_DO_CAB).grade;
        expect(g.altura).toBeLessThan(4 * RAIO_DA_VISTA / 0.5);
        expect(g.largura * g.altura).toBeLessThan(20000);
    });

    it('nenhum andar do jogo passa do teto de células', () => {
        const teto = (2 * RAIO_DA_VISTA / 0.5) ** 2;
        for (const nivel of TODOS) {
            const g = olharOAndar(nivel, FORA_DO_CAB).grade;
            expect(g.largura * g.altura, `andar ${nivel}`).toBeLessThanOrEqual(teto);
        }
    });

    it('andar pequeno continua com grade pequena', () => {
        // O convés do Andar 7 tem ~8 m de largura. Se a janela mandasse
        // sozinha, ele viraria 120×120 à toa.
        const g = olharOAndar(7, FORA_DO_CAB).grade;
        expect(g.largura).toBeLessThan(40);
    });

    it('a janela é em volta DELE — andou, enxerga outro pedaço', () => {
        // O que sustenta a janela finita: o alcance não é uma propriedade do
        // andar, é de onde ele está. Um alvo a 100 m não some do mundo, só sai
        // do plano atual — e volta quando ele chega mais perto.
        const longe = { x: 0, z: 60 };
        const g = olharOAndar(3, longe).grade;
        expect(g.minZ).toBeGreaterThan(0);
        expect(caminho(g, longe, { x: 0, z: 70 }).length).toBeGreaterThan(0);
    });
});

describe('ZERO conhecimento de andar específico, também aqui', () => {
    it('nenhum caso especial por número de andar', async () => {
        const fs = await import('node:fs/promises');
        const fonte = await fs.readFile(
            new URL('../agente/agenteObjetivo.ts', import.meta.url), 'utf8',
        );
        const semComentarios = fonte
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');
        // A única coisa que o módulo pode perguntar sobre o número do andar é o
        // que o PRÓPRIO JOGO responde (`hasWalkInElevator`). Ramificar em `nivel
        // === 8` seria a promessa "funciona em andares futuros" morrendo.
        expect(/\bnivel\s*===|\blevel\s*===|\bandar\s*===/.test(semComentarios)).toBe(false);
        expect(semComentarios).toContain('hasWalkInElevator');
    });

    it('um andar futuro sem elevador vira "explorar", não um agente travado', () => {
        // Andar 11 não existe: `wallsForState` cai no ramo do Andar 5 e
        // `hasWalkInElevator` diz não. O agente precisa continuar respondendo
        // alguma coisa útil — e responde.
        const andar = olharOAndar(11, FORA_DO_CAB);
        const obj = oQueFazerAqui(andar, FORA_DO_CAB);
        expect(obj.tipo).toBe('explorar');
        expect(alcanca(andar, FORA_DO_CAB, obj.alvo)).toBe(true);
    });
});

describe('quando o chão não é chão: o parkour', () => {
    // ── A ILHA QUE UM REVISOR ACHOU ───────────────────────────────────────
    //
    // `agenteSalto` tinha 18 testes e NENHUM importador fora deles. E o motivo
    // era real, não descuido: `wallsForState(3)` descreve o corredor do parkour
    // como área aberta, sem plataforma nem vão — a queda é decidida por `y < -8`
    // no `Player.tsx`, que uma grade XZ não enxerga.
    //
    // Ou seja, no ANDAR EXATO para o qual o módulo foi escrito, o agente
    // concluía "é tudo chão livre" e nunca perguntava se dava para pular.
    const curso = (): Plataforma[] => {
        reset(0x9e3779b9);
        tick(0, 0);
        return platforms.map((p) => ({
            id: p.id, x: p.bx, z: p.cz, hw: p.hw, hd: p.hd, topY: p.topY, amp: p.amp,
        }));
    };

    it('com plataformas, o objetivo vira SUBIR — e a rota é de pulos reais', () => {
        const c = curso();
        const obj = oQueFazerAqui(olharOAndar(3, { x: 0, z: -5 }), { x: 0, z: -5 }, c);
        expect(obj.tipo).toBe('pular');
        expect(obj.rota!.length).toBeGreaterThan(1);
        // Cada passo da rota tem de ser um pulo que a física do jogo fecha.
        for (let i = 0; i < obj.rota!.length - 1; i += 1) {
            expect(daParaPular(obj.rota![i], obj.rota![i + 1]).da).toBe(true);
        }
        // E ele sobe: o destino é mais alto que a partida.
        expect(obj.rota![obj.rota!.length - 1].topY).toBeGreaterThan(obj.rota![0].topY);
    });

    it('sem plataformas, nada muda — o andar plano segue plano', () => {
        // A ligação não pode custar o comportamento de todos os outros andares.
        for (const nivel of [0, 1, 2, 5, 10]) {
            const de = { x: 0, z: 0 };
            const andar = olharOAndar(nivel, de);
            expect(oQueFazerAqui(andar, de).tipo).toBe(oQueFazerAqui(andar, de, []).tipo);
            expect(oQueFazerAqui(andar, de).tipo).not.toBe('pular');
        }
    });

    it('ilhado no ar, ele diz que não sai pulo — não inventa um destino', () => {
        // Uma plataforma sozinha no meio do nada. Mandar o corpo para um vão
        // que a física não fecha seria pior que admitir que não dá.
        const sozinha: Plataforma[] = [
            { id: 1, x: 0, z: 0, hw: 1, hd: 1, topY: 0 },
            { id: 2, x: 0, z: 60, hw: 1, hd: 1, topY: 8 },
        ];
        const obj = oQueFazerNoAr(sozinha, { x: 0, z: 0 });
        expect(obj.tipo).toBe('pular');
        expect(obj.rota).toHaveLength(1);
        expect(obj.porque).toContain('não sai pulo');
    });

    it('e o módulo do pulo deixou de ser ilha — teste de FIAÇÃO', () => {
        // O defeito não era o módulo estar errado: era ninguém consultá-lo.
        // Um módulo correto sem chamador não muda nada no jogo.
        const fonte = readFileSync(
            new URL('../agente/agenteObjetivo.ts', import.meta.url), 'utf8',
        );
        expect(fonte).toContain("from './agenteSalto'");
        expect(fonte).toContain('rotaDePulos(');
    });
});
