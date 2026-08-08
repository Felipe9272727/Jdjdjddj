import { describe, it, expect } from 'vitest';
import {
    CANDIDATOS_DO_MOTOR,
    PISO_DO_MOTOR,
    candidatosDoMotor,
    cosseno,
    desempacotar,
    margemDoMotor,
    normalizar,
    ranquearAlvos,
    type VetorDoRotulo,
} from '../npc/floor10Classificador';
import {
    FLOOR10_ROTULOS, hashDoRotulo, textoDoPensamento, textoDoRotulo,
} from '../npc/floor10Rotulos';
import { FLOOR10_MOTOR_TARGETS } from '../npc/floor10MotorCortex';
import { FLOOR10_MOTOR_DIM, FLOOR10_MOTOR_VETORES } from '../npc/floor10MotorVetores';

/** Vetor unitário apontando para o eixo `i` — dá para escrever a resposta certa. */
const eixo = (i: number, dim = 8): number[] => {
    const v = new Array<number>(dim).fill(0);
    v[i] = 1;
    return v;
};

const rotulos = (pares: Array<[string, number[]]>): VetorDoRotulo[] =>
    pares.map(([alvo, v]) => ({ alvo: alvo as VetorDoRotulo['alvo'], v }));

describe('floor10Classificador — o ranking', () => {
    it('o alvo mais parecido vem primeiro', () => {
        const placar = ranquearAlvos(eixo(0), rotulos([
            ['player', eixo(1)],
            ['west-side', eixo(0)],
            ['self', eixo(2)],
        ]));
        expect(placar[0]?.alvo).toBe('west-side');
        expect(placar[0]?.nota).toBeCloseTo(1, 6);
    });

    it('cada alvo vale a nota da sua MELHOR redação', () => {
        // Redações são jeitos diferentes de dizer a mesma coisa: a pior não
        // pode puxar o alvo para baixo. Sem isto, um alvo com quatro frases
        // perderia sempre para um alvo com uma só.
        const meio = normalizar([0.7, 0.7, 0, 0, 0, 0, 0, 0]);
        const placar = ranquearAlvos(eixo(0), rotulos([
            ['player', meio],
            ['west-side', eixo(2)],
            ['west-side', eixo(0)],
        ]));
        expect(placar[0]?.alvo).toBe('west-side');
    });

    it('nenhum alvo aparece duas vezes, mesmo com muitas redações', () => {
        const placar = ranquearAlvos(eixo(0), rotulos([
            ['player', eixo(0)], ['player', eixo(1)], ['player', eixo(2)],
        ]));
        expect(placar).toHaveLength(1);
    });
});

describe('floor10Classificador — os candidatos que vão ao desempate', () => {
    const tres = rotulos([
        ['west-side', eixo(0)],
        ['to-my-left', normalizar([0.9, 0.4, 0, 0, 0, 0, 0, 0])],
        ['player', normalizar([0.8, 0.6, 0, 0, 0, 0, 0, 0])],
        ['self', eixo(3)],
    ]);

    it('devolve os três mais próximos, na ordem', () => {
        expect(candidatosDoMotor(eixo(0), tres)).toEqual(['west-side', 'to-my-left', 'player']);
    });

    it('o padrão são três — poucos o bastante para a resposta ser curta', () => {
        expect(CANDIDATOS_DO_MOTOR).toBe(3);
        expect(candidatosDoMotor(eixo(0), tres)).toHaveLength(3);
    });

    it('LISTA VAZIA quando nada se parece com nada', () => {
        // Sem candidato não há plano, e sem plano o corpo mantém o que fazia.
        // É a falha segura: a bancada mostrou que raspar um alvo de um texto
        // duvidoso põe o Nilo andando para o lugar errado com convicção.
        const longe = rotulos([['player', eixo(5)], ['self', eixo(6)]]);
        expect(candidatosDoMotor(eixo(0), longe)).toEqual([]);
    });

    it('o piso é o que separa "não sei" de "sei"', () => {
        const quaseNoPiso = normalizar([PISO_DO_MOTOR + 0.02, 1 - PISO_DO_MOTOR, 0, 0, 0, 0, 0, 0]);
        expect(candidatosDoMotor(eixo(0), rotulos([['player', quaseNoPiso]])).length)
            .toBeGreaterThan(0);
    });

    it('lista de rótulos vazia não explode', () => {
        expect(candidatosDoMotor(eixo(0), [])).toEqual([]);
    });

    it('pedir menos que um ainda devolve um', () => {
        expect(candidatosDoMotor(eixo(0), tres, 0)).toHaveLength(1);
    });
});

describe('floor10Classificador — a margem', () => {
    it('mede a distância entre o primeiro e o segundo', () => {
        expect(margemDoMotor([
            { alvo: 'player', nota: 0.56 },
            { alvo: 'west-side', nota: 0.52 },
            { alvo: 'self', nota: 0.44 },
        ])).toBeCloseTo(0.04, 6);
    });

    it('candidato único é certeza total: margem 1', () => {
        expect(margemDoMotor([{ alvo: 'player', nota: 0.9 }])).toBe(1);
        expect(margemDoMotor([])).toBe(1);
    });
});

describe('floor10Classificador — as contas', () => {
    it('normalizar devolve comprimento 1', () => {
        const v = normalizar([3, 4, 0, 0, 0, 0, 0, 0]);
        expect(Math.hypot(...v)).toBeCloseTo(1, 9);
    });

    it('normalizar o vetor nulo não vira NaN', () => {
        expect(normalizar([0, 0, 0]).every(Number.isFinite)).toBe(true);
    });

    it('cosseno de vetores iguais é 1, de ortogonais é 0', () => {
        expect(cosseno(eixo(0), eixo(0))).toBeCloseTo(1, 9);
        expect(cosseno(eixo(0), eixo(1))).toBeCloseTo(0, 9);
    });

    it('cosseno com tamanhos diferentes usa o menor, sem NaN', () => {
        expect(Number.isFinite(cosseno([1, 0, 0], [1, 0]))).toBe(true);
    });
});

describe('floor10Classificador — int8 com escala', () => {
    it('desempacota valores com sinal', () => {
        // 0x7f = 127, 0x81 = -127 em int8.
        const base64 = globalThis.btoa(String.fromCharCode(127, 129));
        const v = desempacotar(base64, 0.01);
        expect(v[0]).toBeCloseTo(1.27, 6);
        expect(v[1]).toBeCloseTo(-1.27, 6);
    });

    it('a volta int8 preserva o cosseno até a terceira casa', () => {
        const original = normalizar(Array.from({ length: 64 }, (_, i) => Math.sin(i * 1.7)));
        const escala = Math.max(...original.map(Math.abs)) / 127;
        const bytes = original.map((x) => Math.round(x / escala));
        const base64 = globalThis.btoa(String.fromCharCode(...bytes.map((b) => b & 0xff)));
        const volta = normalizar(desempacotar(base64, escala));
        expect(cosseno(original, volta)).toBeGreaterThan(0.999);
    });
});

describe('floor10Rotulos — o catálogo', () => {
    it('TODO alvo do motor tem rótulo — senão ele é inalcançável', () => {
        const comRotulo = new Set(FLOOR10_ROTULOS.map((r) => r.alvo));
        for (const alvo of FLOOR10_MOTOR_TARGETS) {
            expect(comRotulo.has(alvo), `alvo sem rótulo: ${alvo}`).toBe(true);
        }
    });

    it('nenhum rótulo aponta para alvo que não existe', () => {
        for (const r of FLOOR10_ROTULOS) expect(FLOOR10_MOTOR_TARGETS).toContain(r.alvo);
    });

    it('cada rótulo tem ao menos duas redações', () => {
        for (const r of FLOOR10_ROTULOS) {
            expect(r.frases.length, `poucas redações: ${r.alvo}`).toBeGreaterThanOrEqual(2);
        }
    });

    it('as redações são em primeira pessoa, como o Nilo escreve', () => {
        // É com o texto DELE que estas frases vão ser comparadas. Uma redação
        // em terceira pessoa mede outra coisa.
        for (const r of FLOOR10_ROTULOS) {
            for (const f of r.frases) expect(f, `${r.alvo}: ${f}`).toMatch(/^I\b/);
        }
    });

    it('nenhuma redação repetida entre alvos diferentes', () => {
        const vistas = new Map<string, string>();
        for (const r of FLOOR10_ROTULOS) {
            for (const f of r.frases) {
                expect(vistas.has(f), `"${f}" em ${r.alvo} e ${vistas.get(f)}`).toBe(false);
                vistas.set(f, r.alvo);
            }
        }
    });

    it('os prefixos do embeddinggemma vão nos dois lados', () => {
        // Medido no floor10Memoria: com prefixo 11/12, sem prefixo 9/12.
        expect(textoDoRotulo('I move left.')).toBe('title: movement | text: I move left.');
        expect(textoDoPensamento('oi')).toBe('task: search result | query: oi');
    });

    it('o pensamento é cortado para não estourar o contexto', () => {
        expect(textoDoPensamento('x'.repeat(5000)).length).toBeLessThan(700);
    });

    it('o hash muda quando a redação muda, e só então', () => {
        expect(hashDoRotulo('I move left.')).toBe(hashDoRotulo('I move left.'));
        expect(hashDoRotulo('I move left.')).not.toBe(hashDoRotulo('I move right.'));
    });
});

describe('floor10MotorVetores — o que foi pré-calculado', () => {
    it('há um vetor para CADA redação de CADA rótulo', () => {
        const redacoes = FLOOR10_ROTULOS.reduce((s, r) => s + r.frases.length, 0);
        expect(FLOOR10_MOTOR_VETORES).toHaveLength(redacoes);
    });

    it('OS HASHES BATEM — se este teste falhar, rode tools/f10-motor-vetores.mjs', () => {
        // Este é o teste que existe para pegar o erro mais provável desta
        // arquitetura: alguém edita uma redação em floor10Rotulos.ts e esquece
        // de gerar os vetores. Aí o jogo compara o pensamento com o vetor de um
        // texto que já não existe, e ninguém percebe — o motor só fica um pouco
        // pior, silenciosamente.
        const esperados = FLOOR10_ROTULOS.flatMap((r) => r.frases.map(hashDoRotulo)).sort();
        const gravados = FLOOR10_MOTOR_VETORES.map((v) => v.hash).sort();
        expect(gravados).toEqual(esperados);
    });

    it('todo vetor aponta para um alvo que existe', () => {
        for (const v of FLOOR10_MOTOR_VETORES) expect(FLOOR10_MOTOR_TARGETS).toContain(v.alvo);
    });

    it('desempacotam na dimensão certa e normalizados', () => {
        for (const v of FLOOR10_MOTOR_VETORES) {
            const bruto = desempacotar(v.v, v.escala);
            expect(bruto).toHaveLength(FLOOR10_MOTOR_DIM);
            // O int8 tira um fio do comprimento; 1% de folga é de sobra.
            expect(Math.hypot(...bruto)).toBeCloseTo(1, 1);
        }
    });

    it('CADA redação é mais parecida consigo do que com qualquer outro alvo', () => {
        // Se uma redação de `to-my-left` estiver mais perto de `to-my-right`
        // do que de si mesma, o rótulo está escrito errado — e o motor vai
        // errar essa direção para sempre. É o risco dos antônimos, medido
        // aqui, de graça, sem carregar modelo.
        const vetores = FLOOR10_MOTOR_VETORES.map((v) => ({
            alvo: v.alvo, v: normalizar(desempacotar(v.v, v.escala)),
        }));
        for (const alvoDaVez of vetores) {
            const placar = ranquearAlvos(alvoDaVez.v, vetores);
            expect(placar[0]?.alvo, `redação de ${alvoDaVez.alvo} puxa para ${placar[0]?.alvo}`)
                .toBe(alvoDaVez.alvo);
        }
    });

    it('esquerda e direita NÃO são o mesmo vetor', () => {
        // O risco que quase matou a ideia. Se o cosseno entre elas for ~1, o
        // caminho por vetor não distingue direção e não serve.
        const pega = (alvo: string) => normalizar(desempacotar(
            FLOOR10_MOTOR_VETORES.find((v) => v.alvo === alvo)!.v,
            FLOOR10_MOTOR_VETORES.find((v) => v.alvo === alvo)!.escala,
        ));
        expect(cosseno(pega('to-my-left'), pega('to-my-right'))).toBeLessThan(0.97);
    });
});
