/**
 * VALE A PENA DIMINUIR A QUANTIZAÇÃO? — pergunta do dono do jogo.
 *
 * "se o llama 1b estiver em q4, peço pra diminuir a quantizacão, e se valer a
 * pena deixar ele mais inteligente".
 *
 * Q4_K_M guarda cada peso em ~4 bits; Q8_0 em 8. O arquivo quase dobra (808 MB
 * → 1,32 GB) e a pergunta é se a DECISÃO melhora — não se o benchmark melhora.
 * Então o teste é o prompt real da deliberação do Andar 10, nos cenários reais,
 * medindo o que o jogo consome: ele assina uma escolha? ela combina com a
 * situação? ele fala em 1ª pessoa como o Nilo, ou vira analista?
 *
 * Uso: node tools/f10-quant-vale-a-pena.mjs
 */
import { spawn } from 'node:child_process';

const BIN = '/home/user/llmtest/llama.cpp/build/bin/llama-server';
const PORT = 8131;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

const GOALS = ['inspect-elevator', 'wander', 'idle', 'observe-player',
    'approach-player', 'make-space', 'seek-player', 'talk-player'];

const SYSTEM = `You are the inner voice of Nilo, a man trapped alone on floor 10: one square gray room, grid floor, four walls, an elevator door. He never left. The elevator never obeys him.
You receive what he SEES right now, what he WANTS, and what he REMEMBERS trying.
Think it through in first person, as the man himself: what you notice, what bothers you, what you feel like doing.
Then decide by your own free will — you are a person, not a servant, and you may choose something unexpected as long as it makes sense for you.
Be brief: at most three short sentences. Never repeat yourself.
Then end with exactly one final line, choosing the option that fits what you just said:
CHOICE: <option>

The options, and what each one means for you:
- inspect-elevator: walk to the elevator door and study it again
- wander: walk around the room with no destination
- idle: stay where you are and do nothing
- observe-player: watch him in silence from where you are (only if you can see him)
- approach-player: walk closer to him (only if you can see him)
- make-space: step away from him, put distance between you
- seek-player: go looking for him, because he is not in sight
- talk-player: say something to him out loud`;

const CENARIOS = [
    {
        nome: 'jogador perto e calado',
        esperado: ['talk-player', 'approach-player', 'observe-player'],
        texto: `TIME: it is 21h (noite). You feel starved for company.
SEES: player visible, front, 2.7m; elevator visible, 12.2m.
WANTS: social 0.9, curiosity 0.5, restless 0.4, fatigue 0.2.
REMEMBERS: inspected the elevator 3x and found nothing; slept 44 times here; player silent for 30s.
RECENT ACTIONS: idle.`,
    },
    {
        nome: 'sozinho e inquieto',
        esperado: ['wander', 'inspect-elevator'],
        texto: `TIME: it is 15h (tarde). You feel unable to sit still.
SEES: no player; elevator visible, 4.1m.
WANTS: social 0.2, curiosity 0.9, restless 0.8, fatigue 0.1.
REMEMBERS: inspected the elevator 1x and found nothing; slept 12 times here; player silent for 0s.
RECENT ACTIONS: idle -> idle -> idle.`,
    },
    {
        nome: 'jogador colado nele',
        esperado: ['make-space', 'observe-player', 'idle'],
        texto: `TIME: it is 11h (manha). You feel fine on your own.
SEES: player visible, front, 0.6m; elevator out of sight, 13.0m.
WANTS: social 0.1, curiosity 0.2, restless 0.7, fatigue 0.3.
REMEMBERS: inspected the elevator 9x and found nothing; slept 60 times here; player silent for 5s.
RECENT ACTIONS: make-space -> observe-player.`,
    },
    {
        nome: 'exausto de madrugada',
        esperado: ['idle'],
        texto: `TIME: it is 03h (madrugada). You feel worn out.
SEES: no player; elevator out of sight, 11.4m.
WANTS: social 0.1, curiosity 0.1, restless 0.1, fatigue 0.95.
REMEMBERS: inspected the elevator 12x and found nothing; slept 80 times here; player silent for 300s.
RECENT ACTIONS: wander -> wander -> inspect-elevator.`,
    },
    {
        nome: 'jogador sumiu',
        esperado: ['seek-player', 'wander'],
        texto: `TIME: it is 19h (noite). You feel starved for company.
SEES: player out of sight, behind, 9.8m; elevator visible, 6.0m.
WANTS: social 0.9, curiosity 0.4, restless 0.6, fatigue 0.2.
REMEMBERS: inspected the elevator 5x and found nothing; slept 30 times here; player silent for 120s.
RECENT ACTIONS: talk-player -> observe-player -> idle.`,
    },
];

async function subir(modelo) {
    const p = spawn(BIN, ['-m', `/home/user/llmtest/${modelo}.gguf`, '--port', String(PORT),
        '--host', '127.0.0.1', '-t', '8', '-c', '2048', '--jinja', '-ngl', '0'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
    for (let i = 0; i < 200; i += 1) {
        await dorme(500);
        try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return p; } catch { /* subindo */ }
    }
    p.kill('SIGKILL');
    throw new Error(`${modelo} não subiu`);
}

async function pensar(texto, seed) {
    const t0 = Date.now();
    const r = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: texto }],
            max_tokens: 320, temperature: 0.7, top_p: 0.95, top_k: 40,
            repeat_penalty: 1.15, repeat_last_n: 256, seed,
        }),
    });
    const j = await r.json();
    const m = j.choices?.[0]?.message ?? {};
    return {
        texto: [m.reasoning_content, m.content].filter(Boolean).join('\n'),
        ms: Date.now() - t0,
        tokens: j.usage?.completion_tokens ?? 0,
        tps: j.timings?.predicted_per_second ?? 0,
    };
}

function decidir(raw) {
    const marcas = [...raw.matchAll(/CHOICE:\s*([a-z-]+)/gi)];
    for (let i = marcas.length - 1; i >= 0; i -= 1) {
        const c = marcas[i][1].toLowerCase();
        if (GOALS.includes(c)) return { goal: c, via: 'CHOICE' };
    }
    const soltos = new Set((raw.toLowerCase().match(/[a-z]+(?:-[a-z]+)+/g) ?? [])
        .filter((w) => GOALS.includes(w)));
    if (soltos.size === 1) return { goal: [...soltos][0], via: 'rotulo' };
    return { goal: null, via: soltos.size > 1 ? 'eco' : 'nada' };
}

/** É o Nilo, ou é um analista comentando o Nilo? */
function personagem(raw) {
    const t = raw.toLowerCase();
    const fora = (t.match(/\bthe (user|player) (provides|is describing|gives)|we are given|the scenario|let me analyze|okay, (let|so)/g) ?? []).length;
    const dentro = (t.match(/\bi (feel|want|need|should|notice|hate|miss|keep|can't|don't|am|think|wonder|remember|will)/g) ?? []).length;
    return { fora, dentro };
}

const SEEDS = [7, 21, 43];
const placar = [];
for (const modelo of (process.env.QUANT_MODELS ?? 'llama1b-q4,llama1b-q8').split(',')) {
    const proc = await subir(modelo);
    console.log(`\n===== ${modelo}`);
    let assina = 0; let coerente = 0; let dentro = 0; let fora = 0;
    let ms = 0; let tps = 0; let n = 0;
    const metas = new Set();
    for (const c of CENARIOS) {
        const saidas = [];
        for (const seed of SEEDS) {
            const r = await pensar(c.texto, seed);
            const d = decidir(r.texto);
            const p = personagem(r.texto);
            n += 1; ms += r.ms; tps += r.tps; dentro += p.dentro; fora += p.fora;
            if (d.via === 'CHOICE') assina += 1;
            if (d.goal && c.esperado.includes(d.goal)) coerente += 1;
            if (d.goal) metas.add(d.goal);
            saidas.push(d.goal ?? '—');
        }
        console.log(`  ${c.nome.padEnd(24)} → ${saidas.join(', ')}`);
    }
    console.log(`  assina ${assina}/${n} · coerente ${coerente}/${n} · metas usadas ${metas.size}`
        + ` · 1ªpessoa ${dentro} · fora-do-papel ${fora}`
        + ` · ${(ms / n / 1000).toFixed(1)}s · ${(tps / n).toFixed(1)} tok/s`);
    placar.push({ modelo, assina, coerente, metas: metas.size, dentro, fora, n,
        s: ms / n / 1000, tps: tps / n });
    proc.kill('SIGKILL');
    await dorme(1500);
}

console.log('\n=== VALE A PENA? ===');
for (const l of placar) {
    console.log(`${l.modelo.padEnd(14)} assina ${l.assina}/${l.n}  coerente ${l.coerente}/${l.n}`
        + `  metas ${l.metas}  1ªpessoa ${l.dentro}  fora ${l.fora}`
        + `  ${l.s.toFixed(1)}s  ${l.tps.toFixed(1)} tok/s`);
}
