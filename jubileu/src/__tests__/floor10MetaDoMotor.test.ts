import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    FLOOR10_MOTOR_TARGETS, FLOOR10_MOTOR_VERBS, metaDoPlanoMotor,
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
