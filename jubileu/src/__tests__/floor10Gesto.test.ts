import { describe, it, expect } from 'vitest';
import {
    DURACAO_DO_GESTO,
    POSE_PARADA,
    gestoPrendeOsPes,
    poseDoGesto,
} from '../npc/floor10Gesto';
import { FLOOR10_MOTOR_ACTS } from '../npc/floor10MotorCortex';

const EIXOS = [
    'bracoEsqX', 'bracoDirX', 'bracoDirZ',
    'cabecaX', 'cabecaY', 'cabecaZ',
    'altura', 'troncoX',
] as const;

const maiorMovimento = (act: Parameters<typeof poseDoGesto>[0]) => {
    const total = DURACAO_DO_GESTO[act ?? 'none'];
    let pico = 0;
    for (let t = 0; t < total; t += total / 120) {
        const p = poseDoGesto(act, t);
        for (const eixo of EIXOS) pico = Math.max(pico, Math.abs(p[eixo]));
    }
    return pico;
};

describe('floor10Gesto — o gesto tem de existir no corpo', () => {
    it('TODO gesto da gramática move alguma coisa (menos `none`)', () => {
        // Este é o teste do defeito: o motor escolhia entre oito gestos e o
        // corpo não fazia nenhum. Se um gesto novo entrar na gramática sem
        // pose, isto quebra aqui e não no aparelho de quem joga.
        for (const act of FLOOR10_MOTOR_ACTS) {
            if (act === 'none') continue;
            expect(maiorMovimento(act), `gesto sem pose: ${act}`).toBeGreaterThan(0.1);
        }
    });

    it('`none` e o gesto ausente não mexem em nada', () => {
        expect(poseDoGesto('none', 0.5)).toEqual(POSE_PARADA);
        expect(poseDoGesto(undefined, 0.5)).toEqual(POSE_PARADA);
    });

    it('toda pose tem os oito eixos como número — nada de NaN chegando na cena', () => {
        for (const act of FLOOR10_MOTOR_ACTS) {
            for (const t of [0, 0.1, 0.5, 1, 1.7, 2.5, 3.4]) {
                const p = poseDoGesto(act, t);
                for (const eixo of EIXOS) {
                    expect(Number.isFinite(p[eixo]), `${act} @${t} ${eixo}`).toBe(true);
                }
            }
        }
    });
});

describe('floor10Gesto — começo e fim', () => {
    it('começa e termina PARADO: nenhum gesto entra nem sai com tranco', () => {
        for (const act of FLOOR10_MOTOR_ACTS) {
            expect(poseDoGesto(act, 0)).toEqual(POSE_PARADA);
            expect(poseDoGesto(act, DURACAO_DO_GESTO[act])).toEqual(POSE_PARADA);
        }
    });

    it('depois do tempo do gesto o corpo volta sozinho — ninguém precisa desligar', () => {
        for (const act of FLOOR10_MOTOR_ACTS) {
            expect(poseDoGesto(act, DURACAO_DO_GESTO[act] + 5)).toEqual(POSE_PARADA);
            expect(poseDoGesto(act, 999)).toEqual(POSE_PARADA);
        }
    });

    it('tempo negativo (relógio andando para trás) não vira pose torta', () => {
        for (const act of FLOOR10_MOTOR_ACTS) {
            expect(poseDoGesto(act, -1)).toEqual(POSE_PARADA);
        }
    });

    it('nenhum ângulo passa do que um ombro humano faz', () => {
        for (const act of FLOOR10_MOTOR_ACTS) {
            expect(maiorMovimento(act)).toBeLessThan(2.2);
        }
    });
});

describe('floor10Gesto — cada gesto parece com o que o nome diz', () => {
    it('`wave` levanta o braço DIREITO pelo lado e balança', () => {
        const amostras = [0.6, 0.8, 1.0, 1.2, 1.4, 1.6].map((t) => poseDoGesto('wave', t));
        // Braço para cima o tempo todo (rotação negativa em Z sobe o ombro).
        for (const p of amostras) expect(p.bracoDirZ).toBeLessThan(-0.5);
        // E ele NÃO fica parado lá em cima: isso é o aceno.
        const valores = amostras.map((p) => p.bracoDirZ);
        expect(Math.max(...valores) - Math.min(...valores)).toBeGreaterThan(0.3);
    });

    it('`knock` leva a mão à frente e bate mais de uma vez', () => {
        const total = DURACAO_DO_GESTO.knock;
        const serie: number[] = [];
        for (let t = total * 0.3; t < total * 0.7; t += 0.02) {
            serie.push(poseDoGesto('knock', t).bracoDirX);
        }
        // Sempre à frente (negativo), e oscilando.
        expect(Math.max(...serie)).toBeLessThan(0);
        expect(Math.max(...serie) - Math.min(...serie)).toBeGreaterThan(0.2);
    });

    it('`touch` chega e FICA: tocar não é bater', () => {
        const a = poseDoGesto('touch', DURACAO_DO_GESTO.touch * 0.45).bracoDirX;
        const b = poseDoGesto('touch', DURACAO_DO_GESTO.touch * 0.55).bracoDirX;
        expect(a).toBeLessThan(-1);
        expect(Math.abs(a - b)).toBeLessThan(0.02);
    });

    it('`crouch` abaixa o corpo e `jump` levanta', () => {
        expect(poseDoGesto('crouch', DURACAO_DO_GESTO.crouch / 2).altura).toBeLessThan(-0.2);
        expect(poseDoGesto('jump', DURACAO_DO_GESTO.jump / 2).altura).toBeGreaterThan(0.3);
    });

    it('`jump` sai do chão E VOLTA — não fica flutuando', () => {
        const total = DURACAO_DO_GESTO.jump;
        expect(poseDoGesto('jump', total * 0.5).altura).toBeGreaterThan(0.3);
        expect(poseDoGesto('jump', total * 0.98).altura).toBeLessThan(0.05);
        expect(poseDoGesto('jump', total + 0.01).altura).toBe(0);
    });

    it('`listen` tomba a cabeça e quase não usa os braços', () => {
        const p = poseDoGesto('listen', DURACAO_DO_GESTO.listen / 2);
        expect(Math.abs(p.cabecaZ)).toBeGreaterThan(0.2);
        expect(Math.abs(p.bracoDirX)).toBeLessThan(0.05);
    });

    it('`look-around` varre a cabeça para OS DOIS lados', () => {
        const total = DURACAO_DO_GESTO['look-around'];
        const serie: number[] = [];
        for (let t = 0; t < total; t += 0.05) serie.push(poseDoGesto('look-around', t).cabecaY);
        expect(Math.max(...serie)).toBeGreaterThan(0.3);
        expect(Math.min(...serie)).toBeLessThan(-0.3);
    });
});

describe('floor10Gesto — quando os pés param', () => {
    it('gesto CONTRA alguma coisa prende os pés; gesto de corpo, não', () => {
        expect(gestoPrendeOsPes('knock')).toBe(true);
        expect(gestoPrendeOsPes('touch')).toBe(true);
        expect(gestoPrendeOsPes('crouch')).toBe(true);
        expect(gestoPrendeOsPes('wave')).toBe(false);
        expect(gestoPrendeOsPes('listen')).toBe(false);
        expect(gestoPrendeOsPes('look-around')).toBe(false);
        expect(gestoPrendeOsPes('jump')).toBe(false);
        expect(gestoPrendeOsPes('none')).toBe(false);
        expect(gestoPrendeOsPes(undefined)).toBe(false);
    });

    it('o corpo 3D APLICA a pose — senão o gesto volta a ser um comentário', async () => {
        // ── POR QUE UM TESTE OLHA O FONTE ─────────────────────────────────
        // Este módulo inteiro existe porque o `ACT:` era decidido, era exibido
        // no `?campo` e não movia nada no jogo. Um módulo puro perfeitamente
        // testado que ninguém chama reproduz o mesmo defeito com mais código.
        const fonte = await import('node:fs/promises')
            .then((fs) => fs.readFile(new URL('../Floor10Npc.tsx', import.meta.url), 'utf8'));
        // A pose é calculada…
        expect(/poseDoGesto\(/.test(fonte)).toBe(true);
        // …o gesto nasce quando a deliberação traz um `act`…
        expect(/motion\?\.act/.test(fonte)).toBe(true);
        // …e cada eixo chega mesmo a um osso.
        for (const eixo of EIXOS) {
            expect(fonte.includes(`pose.${eixo}`), `eixo não aplicado no corpo: ${eixo}`).toBe(true);
        }
    });

    it('todo gesto da gramática tem duração declarada', () => {
        for (const act of FLOOR10_MOTOR_ACTS) {
            expect(typeof DURACAO_DO_GESTO[act]).toBe('number');
            expect(DURACAO_DO_GESTO[act]).toBeGreaterThanOrEqual(0);
        }
        expect(DURACAO_DO_GESTO.none).toBe(0);
    });
});
