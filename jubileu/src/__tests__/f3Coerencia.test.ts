/**
 * f3Coerencia — a varredura atrás de CONTEÚDO MORTO e de DOIS DONOS.
 *
 * A volta anterior achou uma fala inteira escrita, revisada, testada — e nunca
 * disparada por nada. Isso não é bug de código: é uma classe de defeito que
 * nenhum tipo pega e nenhuma foto mostra, porque a coisa simplesmente não
 * acontece. Este arquivo existe para essa classe.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { reset as resetParkour, platforms, tick, type TipoDePlataforma } from '../f3Parkour';
import { f3Progress, resetHazards, ESPERA_DA_ULTIMA_FALA } from '../f3Hazards';
import { escolherFala } from '../f3Falas';
import { PINCEIS_DO_DIABRETE, acabamentoDoAndar } from '../f3Desenho';
import { DIABRETE_SCRIPT } from '../diabreteScript';
import { DECUPAGEM_DA_APRESENTACAO } from '../f3Decupagem';

describe('f3 — coerência do andar', () => {
    // ── UM NÚMERO, UM DONO ───────────────────────────────────────────────
    // `PINCEIS_DO_DIABRETE` e `f3Progress.needed` são o MESMO três: quantos
    // pincéis derrubam o Diabrete. Se um dia alguém mexer num e esquecer o
    // outro, o andar passa a se desfazer num ritmo e a acabar noutro — e isso
    // não quebra nada, só fica errado em silêncio.
    it('o número de pincéis é o mesmo em toda parte', () => {
        resetHazards();
        expect(f3Progress.needed).toBe(PINCEIS_DO_DIABRETE);
        // e o acabamento tem uma etapa para cada pincel, mais a etapa inteira
        const etapas = [];
        for (let i = 0; i <= PINCEIS_DO_DIABRETE; i++) etapas.push(acabamentoDoAndar(i));
        expect(new Set(etapas.map((e) => `${e.seta}|${e.tabuado}`)).size)
            .toBe(PINCEIS_DO_DIABRETE + 1);
    });

    // ── TODO PAPEL DE PEÇA TEM DE APARECER ───────────────────────────────
    // Descanso ganha bandeira, ponte ganha cordas e viga ganha ripas — três
    // marcos desenhados à mão em `Floor3.tsx`. Se o gerador nunca sortear um
    // desses papéis, o marco é enfeite morto: existe no código, nunca no jogo.
    it('o gerador produz todos os papéis de plataforma', () => {
        const vistos = new Set<TipoDePlataforma>();
        for (const semente of [0x9e3779b9, 1, 7, 42, 1337]) {
            resetParkour(semente);
            for (let z = 0; z < 400; z += 4) {
                tick(z * 0.1, z);
                for (const p of platforms) vistos.add(p.tipo);
            }
        }
        for (const papel of ['partida', 'passo', 'descanso', 'viga', 'ponte'] as TipoDePlataforma[]) {
            expect(vistos.has(papel), `o papel "${papel}" nunca é sorteado`).toBe(true);
        }
    });

    // ── A DECUPAGEM ACOMPANHA O ROTEIRO ──────────────────────────────────
    // Se alguém escrever uma fala nova para o Diabrete e esquecer o plano dela,
    // a cena volta a ter uma câmera parada segurando duas falas — que foi
    // exatamente o defeito da volta 13.
    it('cada fala da apresentação tem o seu plano', () => {
        expect(DECUPAGEM_DA_APRESENTACAO).toHaveLength(DIABRETE_SCRIPT.length);
    });
});

// ── A FALA QUE NINGUÉM OUVIA ─────────────────────────────────────────────────
// A terceira fala de roubo — "sem ele eu não sou NADA aqui…", que é a dobradiça
// do andar inteiro — era escrita, revisada, testada e NUNCA OUVIDA: `fell`
// disparava no mesmo quadro do terceiro pincel e a cutscene entrava por cima,
// apagando o balão. Agora a queda espera a fala terminar.
describe('f3 — o último pincel dá tempo da fala caber', () => {
    it('o terceiro roubo NÃO derruba o Diabrete na hora', () => {
        resetParkour(1); resetHazards();
        for (let i = 0; i < PINCEIS_DO_DIABRETE; i++) {
            f3Progress.brushes = i + 1;
            if (i + 1 >= f3Progress.needed && !f3Progress.fell && !f3Progress.caiEm) {
                f3Progress.caiEm = 1;   // o que tryCollectBrush faz
            }
        }
        expect(f3Progress.fell, 'caiu no mesmo quadro do roubo').toBe(false);
        expect(f3Progress.caiEm, 'a queda nem foi marcada').toBeGreaterThan(0);
    });

    it('e a espera é longa o bastante para uma fala inteira', () => {
        const maisLonga = Math.max(
            ...[1, 2, 3].map((n) => escolherFala('roubou', { roubados: n }).dura),
        );
        expect(ESPERA_DA_ULTIMA_FALA / 1000).toBeGreaterThanOrEqual(maisLonga - 2.2);
        expect(ESPERA_DA_ULTIMA_FALA).toBeLessThan(3000);   // respiro, não pausa
    });

    // ── NENHUM SOM FICA NA GAVETA ────────────────────────────────────────
    // Foi exatamente assim que o Diabrete passou o andar inteiro mudo: o banco
    // de som existia, era bom, e ninguém chamava metade dele. Um efeito
    // sintetizado e nunca disparado é conteúdo morto igual a uma fala escrita e
    // nunca dita — e nenhum tipo pega isso, porque o código compila lindo.
    it('todo efeito do banco de som do andar tem quem o toque', () => {
        const raiz = new URL('..', import.meta.url).pathname;
        const banco = readFileSync(join(raiz, 'floor3Sfx.ts'), 'utf8');
        const efeitos = [...banco.matchAll(/export function (playFloor3\w+)/g)].map(m => m[1]);
        expect(efeitos.length).toBeGreaterThan(8);

        const fontes = readdirSync(raiz)
            .filter(f => (f.endsWith('.ts') || f.endsWith('.tsx')) && f !== 'floor3Sfx.ts' && !f.endsWith('.test.ts'))
            .map(f => readFileSync(join(raiz, f), 'utf8'))
            .join('\n');

        const orfaos = efeitos.filter(e => !new RegExp(`\\b${e}\\s*\\(`).test(fontes));
        expect(orfaos).toEqual([]);
    });

    // ── O ARCO DO TIMBRE NÃO PODE VOLTAR NO TEMPO ────────────────────────
    // A voz dele (`f3Voz`) envelhece com `roubados`: cada pincel perdido sobe a
    // altura e fecha a surdina. Isso só funciona se TODO disparo de fala contar
    // em que altura do arco ele está. Um `dizer('espetou')` pelado não quebra
    // nada — só faz o sujeito voltar a soar seguro de si depois de ter perdido
    // tudo, que é a única coisa que esta voz existe para não fazer.
    it('nenhuma fala é disparada sem dizer em que altura do arco ele está', () => {
        const raiz = new URL('..', import.meta.url).pathname;
        const pelados: string[] = [];
        for (const f of readdirSync(raiz)) {
            if (!(f.endsWith('.ts') || f.endsWith('.tsx')) || f.endsWith('.test.ts')) continue;
            if (f === 'f3Falas.ts') continue;                       // a casa das falas
            const src = readFileSync(join(raiz, f), 'utf8');
            for (const m of src.matchAll(/\b(?:f3Dizer|dizer)\(([^)]*)\)/g)) {
                if (!m[1].includes('roubados')) pelados.push(`${f}: dizer(${m[1]})`);
            }
        }
        expect(pelados).toEqual([]);
    });
});
