/**
 * Q4_K_M vs Q8_0 no CÓRTEX MOTOR (SmolLM2-135M).
 *
 * O córtex traduz o pensamento livre do Nilo numa instrução de movimento. A
 * gramática garante o FORMATO; o que ela não garante é a ESCOLHA — que verbo e
 * que alvo. Num modelo de 135M, quantizar a 4 bits tira uma fatia grande do que
 * pouco já existe, e a diferença de tamanho para o Q8_0 é de só 39 MB (105 →
 * 145) num andar que já baixa 1,9 GB de fala.
 *
 * Aqui os dois traduzem os MESMOS pensamentos e a gente compara acerto.
 *
 * Uso: node tools/f10-motor-quant.mjs
 */
import { spawn } from 'node:child_process';

const BIN = '/home/user/llmtest/llama.cpp/build/bin/llama-server';
const PORT = 8123;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

const VERBS = ['approach', 'withdraw', 'hold', 'orbit', 'explore', 'stay'];
const TARGETS = ['player', 'elevator', 'nearest-device', 'active-device',
    'room-center', 'north-side', 'south-side', 'east-side', 'west-side', 'self'];
const GRAMMAR = `root ::= "MOTION: " verb " | " target " | " pace " | " duration
verb ::= ${VERBS.map((v) => `"${v}"`).join(' | ')}
target ::= ${TARGETS.map((t) => `"${t}"`).join(' | ')}
pace ::= "slow" | "normal" | "fast"
duration ::= "3" | "6" | "9" | "12"`;

/** Pensamentos REAIS do tipo que o cérebro pequeno produz, com o que se espera. */
const CASOS = [
    {
        pensamento: 'He has been quiet for a long time. I want to get closer and see his face.',
        verbo: ['approach'], alvo: ['player'],
    },
    {
        pensamento: 'He is standing too close. I need room to breathe.',
        verbo: ['withdraw'], alvo: ['player', 'self'],
    },
    {
        pensamento: 'That thing under my foot hummed. I should keep my weight on it and not move.',
        verbo: ['hold', 'stay'], alvo: ['nearest-device', 'active-device', 'self'],
    },
    {
        pensamento: 'The elevator door again. I want to look at it from another angle this time.',
        verbo: ['orbit', 'approach'], alvo: ['elevator'],
    },
    {
        pensamento: 'I cannot sit still. I will walk the far side of the room, the one I never check.',
        verbo: ['explore'], alvo: ['north-side', 'south-side', 'east-side', 'west-side', 'room-center'],
    },
    {
        pensamento: 'Nothing to do. I will just stand here and listen to the room.',
        verbo: ['stay'], alvo: ['self'],
    },
];

const VARIANTE = process.env.MOTOR_PROMPT ?? 'A';

function prompt(pensamento) {
    if (VARIANTE === 'B') {
        // Sem a frase que sugere stay, exemplos com stay POR ÚLTIMO, e o
        // pensamento no fim (o que um modelo pequeno copia é o que está perto).
        return `Turn the sentence into a movement command.

sentence: I want to get closer to him.
command: MOTION: approach | player | normal | 6
sentence: He is too close, I need room.
command: MOTION: withdraw | player | normal | 6
sentence: I will keep my foot on that thing.
command: MOTION: hold | nearest-device | slow | 9
sentence: I want to see the door from another side.
command: MOTION: orbit | elevator | slow | 6
sentence: I will walk the far wall.
command: MOTION: explore | west-side | normal | 9
sentence: I will stand here and listen.
command: MOTION: stay | self | slow | 3
sentence: ${pensamento}
command:`;
    }
    return `Translate Nilo's own thought into one feasible body movement.
Do not invent a new desire and do not solve the room for him.
AVAILABLE TARGETS: ${TARGETS.join(', ')}.
VERBS: ${VERBS.join(', ')}.
PACE: slow, normal, fast. DURATION: 3, 6, 9, 12 seconds.
Use stay | self when his thought does not imply movement.

EXAMPLES:
I should stay still and listen. => MOTION: stay | self | slow | 3
I want to cross toward the right wall. => MOTION: explore | east-side | normal | 6
I want to get closer to him. => MOTION: approach | player | normal | 6
I should keep my weight on that thing. => MOTION: hold | nearest-device | slow | 9

HIS THOUGHT:
"""
${pensamento}
"""

Answer with exactly:
MOTION: <verb> | <target> | <pace> | <duration>`;
}

async function subir(modelo) {
    const p = spawn(BIN, ['-m', `/home/user/llmtest/${modelo}.gguf`, '--port', String(PORT),
        '--host', '127.0.0.1', '-t', '8', '-c', '1024', '--jinja', '-ngl', '0'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
    for (let i = 0; i < 120; i += 1) {
        await dorme(500);
        try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return p; } catch { /* subindo */ }
    }
    p.kill('SIGKILL');
    throw new Error(`${modelo} não subiu`);
}

async function traduzir(pensamento, seed) {
    const r = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            messages: [{ role: 'user', content: prompt(pensamento) }],
            max_tokens: 24, temperature: 0.3, grammar: GRAMMAR, seed,
        }),
    });
    const j = await r.json();
    return (j.choices?.[0]?.message?.content ?? '').trim();
}

const SEEDS = [1, 2, 3, 4, 5];
for (const modelo of (process.env.MOTOR_MODELS ?? 'motor-q4,motor-q8').split(',')) {
    const proc = await subir(modelo);
    let verboOk = 0;
    let alvoOk = 0;
    let total = 0;
    console.log(`\n===== ${modelo}`);
    for (const caso of CASOS) {
        const saidas = [];
        for (const seed of SEEDS) {
            const linha = await traduzir(caso.pensamento, seed);
            const m = /MOTION:\s*(\S+)\s*\|\s*(\S+)/.exec(linha);
            const v = m?.[1] ?? '?';
            const a = m?.[2] ?? '?';
            total += 1;
            if (caso.verbo.includes(v)) verboOk += 1;
            if (caso.alvo.includes(a)) alvoOk += 1;
            saidas.push(`${v}|${a}`);
        }
        console.log(`  "${caso.pensamento.slice(0, 46)}…"`);
        console.log(`     esperado ${caso.verbo.join('/')} → ${saidas.join('  ')}`);
    }
    console.log(`  VERBO certo: ${verboOk}/${total} · ALVO certo: ${alvoOk}/${total}`);
    proc.kill('SIGKILL');
    await dorme(1200);
}
