import { describe, expect, it } from 'vitest';
import {
    REARME_APOS_FALA_SEG,
    REARME_COM_REABERTURA_SEG,
    rearmeAposFala,
    DELIBERATION_GOALS,
    DELIBERATION_GRAMMAR,
    DELIBERATION_SYSTEM_PROMPT,
    DELIBERATION_TTL_SECONDS,
    DELIBERATION_TIMEOUT_MS,
    buildDeliberationPrompt,
    deliberationBonus,
    deliberationRetryDelay,
    looksLikeLoop,
    parseDeliberation,
} from '../npc/floor10Deliberation';
import { perceiveFloor10 } from '../npc/floor10Perception';
import { INITIAL_FLOOR10_WILL } from '../npc/floor10Will';

const PERCEPTION = perceiveFloor10({
    npcPosition: { x: 0, y: 0, z: 2.2 },
    npcYaw: Math.PI,
    playerPosition: { x: 0, y: 0, z: 0 },
});

const MEMORY = {
    inspectedElevatorCount: 3,
    sleeps: 44,
    playerSilentSeconds: 12.4,
    lastGoals: ['wander', 'idle'] as const,
};

// Saída REAL do MiniCPM5-1B rodando o GGUF em CPU com este prompt.
const REAL_OUTPUT = `[Start thinking]
We are given a description of a character in a game environment.
CHOICE: wander
But I need to ensure it's exactly one line after the choice.
So I'll write:
CHOICE: wander
Yes.
[End thinking]
Wander is the most neutral and safe action given no interaction instructions, aligning with his traits of curiosity (0.9) but low social engagement (0.2).
CHOICE: wander`;

describe('npc/floor10Deliberation — o segundo cérebro pequeno e privado', () => {
    it('descreve o mundo em estrutura, não em prosa', () => {
        const prompt = buildDeliberationPrompt(PERCEPTION, INITIAL_FLOOR10_WILL.drives, MEMORY);
        // `SEES: player 3m; elevator 9m` virou um MAPA — dois objetos e duas
        // distâncias não davam ao modelo mundo suficiente para querer outra
        // coisa além de aproximar ou afastar. Ver floor10Mapa.
        expect(prompt).toContain('YOU ARE:');
        expect(prompt).toContain('AROUND YOU:');
        expect(prompt).toContain('YOU CAN MOVE:');
        expect(prompt).toContain('WANTS:');
        expect(prompt).toContain('REMEMBERS:');
        expect(prompt).toContain('inspected the elevator 3x');
        expect(prompt).toContain('slept 44 times');
        expect(prompt).toContain('wander -> idle');
        // COMPACTO CONTINUA VALENDO, com o teto reajustado ao mapa: 568
        // caracteres medidos contra 420 antes, ou seja ~37 tokens a mais de
        // prefill. Prefill é o que custa caro no celular dele (rodadas de 60s
        // são quase todas prefill), então o teto existe para essa conta não
        // crescer de novo sem alguém decidir que vale.
        expect(prompt.length).toBeLessThan(700);
    });

    it('pede livre arbítrio e NÃO oferece menu', () => {
        expect(DELIBERATION_SYSTEM_PROMPT).toContain('free will');
        expect(DELIBERATION_SYSTEM_PROMPT).toContain('Think it through');
        expect(DELIBERATION_SYSTEM_PROMPT).toContain('motor interpreter');
        expect(DELIBERATION_SYSTEM_PROMPT).toContain('Never repeat yourself');
        expect(DELIBERATION_SYSTEM_PROMPT).not.toContain('Do not narrate reasoning');
    });

    it('o MENU sumiu — era a jaula que o dono do jogo apontou', () => {
        // O prompt antigo se contradizia: prometia "your body is not limited to
        // the broad labels below" e na linha seguinte exigia `CHOICE: <option>`
        // com oito rótulos. Formulário é instrução dura, promessa é conversa —
        // e o modelo obedecia ao formulário.
        expect(DELIBERATION_SYSTEM_PROMPT).not.toContain('CHOICE:');
        for (const goal of DELIBERATION_GOALS) {
            expect(DELIBERATION_SYSTEM_PROMPT).not.toContain(goal);
        }
        // Em lugar do menu, o pedido do RPG de texto.
        expect(DELIBERATION_SYSTEM_PROMPT).toContain('text adventure');
        expect(DELIBERATION_SYSTEM_PROMPT).toContain('describe the movement');
    });

    it('a GRAMÁTICA das metas continua existindo — o resgate ainda a usa', () => {
        // Tirar a exigência do menu não é aposentar o vocabulário: o resgate
        // (última tentativa antes de perder a rodada) pergunta "qual das oito
        // é essa?" e precisa da gramática para prender a resposta.
        for (const goal of DELIBERATION_GOALS) {
            expect(DELIBERATION_GRAMMAR).toContain(`"${goal}"`);
        }
    });

    it('lê a decisão de uma saída real do modelo', () => {
        const decision = parseDeliberation(REAL_OUTPUT, 100);
        expect(decision?.goal).toBe('wander');
        expect(decision?.at).toBe(100);
        // A justificativa vem da fala final, sem o raciocínio interno.
        expect(decision?.rationale).toContain('curiosity');
        expect(decision?.rationale).not.toContain('[Start thinking]');
    });

    it('fica com a ÚLTIMA escolha — é a que ele assumiu depois de pensar', () => {
        const raw = 'CHOICE: idle\nhmm, actually\nCHOICE: inspect-elevator';
        expect(parseDeliberation(raw)?.goal).toBe('inspect-elevator');
    });

    it('ignora rótulo inventado e devolve nulo sem escolha válida', () => {
        expect(parseDeliberation('CHOICE: dance-forever')).toBeNull();
        expect(parseDeliberation('ainda estou pensando…')).toBeNull();
    });

    it('inclina o reflexo sem mandar nele, e a inclinação envelhece', () => {
        const decision = parseDeliberation(REAL_OUTPUT, 0);
        expect(decision).not.toBeNull();
        const fresh = deliberationBonus(decision, 'wander', 0);
        const half = deliberationBonus(decision, 'wander', DELIBERATION_TTL_SECONDS / 2);
        expect(fresh).toBeGreaterThan(0);
        expect(half).toBeGreaterThan(0);
        expect(half).toBeLessThan(fresh);
        // Depois do prazo a intenção não manda mais.
        expect(deliberationBonus(decision, 'wander', DELIBERATION_TTL_SECONDS + 1)).toBe(0);
        // E nunca empurra uma meta diferente da escolhida.
        expect(deliberationBonus(decision, 'idle', 0)).toBe(0);
        expect(deliberationBonus(null, 'wander', 0)).toBe(0);
    });
});

describe('a bolha de pensamento fala como o Nilo, não como sistema', () => {
    it('traduz a intenção deliberada para a voz dele', async () => {
        const { deliberationThought } = await import('../npc/floor10Deliberation');
        expect(deliberationThought('thinking', '')).toBe('pensando…');
        expect(deliberationThought('decided', 'inspect-elevator')).toContain('aquela porta');
        expect(deliberationThought('decided', 'wander')).toContain('parado');
        // Nada de rótulo técnico vazando para a tela.
        expect(deliberationThought('decided', 'inspect-elevator')).not.toContain('inspect');
        // Sem nada a mostrar, a bolha não aparece.
        expect(deliberationThought('off', '')).toBe('');
        expect(deliberationThought('unavailable', '')).toBe('');
        expect(deliberationThought('loading', '')).toBe('');
    });
});

describe('os dois cérebros se falam', () => {
    it('a promessa feita na conversa chega à deliberação', () => {
        const semPromessa = buildDeliberationPrompt(PERCEPTION, INITIAL_FLOOR10_WILL.drives, MEMORY);
        expect(semPromessa).not.toContain('JUST PROMISED');

        // O jogador pediu para entrar no elevador; o 3B aceitou.
        const comPromessa = buildDeliberationPrompt(PERCEPTION, INITIAL_FLOOR10_WILL.drives, {
            ...MEMORY,
            agreedAction: 'enter-elevator',
            agreedReason: 'Tudo bem, eu entro com você.',
        });
        expect(comPromessa).toContain('JUST PROMISED THE PLAYER: enter-elevator');
        expect(comPromessa).toContain('Tudo bem, eu entro com você.');
        expect(comPromessa).toContain('Keep your word');
    });
});

describe('floor10Deliberation — travas contra o loop do modelo pequeno', () => {
    it('reconhece a cadeia de pensamento girando no lugar', () => {
        expect(looksLikeLoop(
            'inspect elevator inspect elevator inspect elevator inspect elevator',
        )).toBe(true);
        expect(looksLikeLoop('wait wait wait wait wait wait wait wait')).toBe(true);
    });

    it('não confunde uma decisão normal com loop', () => {
        expect(looksLikeLoop('CHOICE: inspect-elevator')).toBe(false);
        expect(looksLikeLoop(
            'The player is close and quiet, so I will watch before speaking. CHOICE: observe-player',
        )).toBe(false);
    });

    it('ignora saídas curtas demais para julgar', () => {
        expect(looksLikeLoop('')).toBe(false);
        expect(looksLikeLoop('idle idle')).toBe(false);
    });

    it('retoma rápido nas primeiras falhas — normalmente é só uma fala atravessando', () => {
        expect(deliberationRetryDelay(1)).toBe(5);
        expect(deliberationRetryDelay(3)).toBe(5);
    });

    it('espaça a insistência quando a falha vira defeito, em vez de repetir para sempre', () => {
        expect(deliberationRetryDelay(4)).toBeGreaterThan(5);
        expect(deliberationRetryDelay(6)).toBeGreaterThan(deliberationRetryDelay(5));
        // E para de piorar: nunca desiste de vez nem espera meia hora.
        expect(deliberationRetryDelay(99)).toBe(300);
    });

    it('tem teto de tempo por rodada, senão uma rodada presa mata o livre-arbítrio', () => {
        // Folgado de propósito: medido no navegador, 20s reprovava deliberação
        // SAUDÁVEL e o Nilo perdia o livre-arbítrio calado. O teto é contra
        // travamento, não contra lentidão — ninguém espera por ele.
        // Folgado porque ele PENSA: escrever frases custa mais que assinar uma
        // linha. Quem barra o loop eterno é o teto de tokens, não este relógio.
        expect(DELIBERATION_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000);
        expect(DELIBERATION_TIMEOUT_MS).toBeLessThanOrEqual(300_000);
    });
});

describe('floor10Deliberation — decisão sem o prefixo CHOICE', () => {
    it('aceita o rótulo puro (caso REAL visto na sala da mente)', () => {
        // Solto da gramática, o modelo respondeu só isto.
        expect(parseDeliberation('talk-player', 5)?.goal).toBe('talk-player');
        expect(parseDeliberation('\n inspect-elevator \n')?.goal).toBe('inspect-elevator');
    });

    it('continua preferindo o CHOICE quando ele existe', () => {
        expect(parseDeliberation('wander ... CHOICE: idle')?.goal).toBe('idle');
    });

    it('não inventa meta a partir de palavra hifenizada qualquer', () => {
        expect(parseDeliberation('i feel half-awake and self-aware')).toBeNull();
        expect(parseDeliberation('sem nada aqui')).toBeNull();
    });

    it('NÃO confunde o eco do enunciado com uma decisão', () => {
        // Saída REAL da sonda: pensando alto, ele relê a lista de opções. O
        // leitor antigo pegava o último rótulo — ou seja, o Nilo "escolhia"
        // sempre o último item da minha lista sem ter escolhido nada.
        const eco = `First, I need to analyze what he sees.
I must choose from the given options: ${DELIBERATION_GOALS.join(', ')}.`;
        expect(parseDeliberation(eco)).toBeNull();
        // Com a assinatura da segunda passada anexada, aí sim decide.
        expect(parseDeliberation(`${eco}\nCHOICE: idle`)?.goal).toBe('idle');
    });
});

describe('o rearme depois da fala paga (ou não) uma reabertura de 1,32 GB', () => {
    // O DEFEITO QUE ISTO IMPEDE: "meu celular quase reinicia de tanto lag".
    // A pausa da vontade passou a valer em toda fala, e pausar ENCERRA o
    // Worker. Com rearme fixo de 6s, o aparelho pagava uma inicialização
    // completa de modelo ENTRE CADA DUAS MENSAGENS — medido nesta caixa,
    // 7,5-8,2s de CPU cheia por reabertura, e num celular vários múltiplos.
    it('runtime aberto: volta rápido, porque não há preço a pagar', () => {
        expect(rearmeAposFala(true)).toBe(REARME_APOS_FALA_SEG);
        expect(rearmeAposFala(true)).toBeLessThanOrEqual(6);
    });

    it('runtime encerrado: só volta quando a conversa esfriar', () => {
        expect(rearmeAposFala(false)).toBe(REARME_COM_REABERTURA_SEG);
        // Tem de ser folgado o bastante para uma conversa em andamento não
        // disparar reabertura nenhuma entre uma mensagem e outra.
        expect(rearmeAposFala(false)).toBeGreaterThanOrEqual(30);
    });

    it('reabrir é sempre mais caro que continuar aberto', () => {
        expect(rearmeAposFala(false)).toBeGreaterThan(rearmeAposFala(true));
    });
});
