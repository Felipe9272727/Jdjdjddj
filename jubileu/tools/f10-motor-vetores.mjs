/**
 * GERA OS VETORES DOS RÓTULOS DO MOTOR.
 *
 * O motor deixou de pedir ao modelo que escrevesse `west-side`. Agora ele
 * compara o pensamento do Nilo com 12 punhados de frases e fica com o mais
 * parecido — medido, 5/7 contra 4/7 da gramática, e 811 ms contra 70.000 ms.
 *
 * As frases dos rótulos NÃO MUDAM durante a partida. Embuti-las no aparelho
 * custa 9,6 s de CPU (medido, 4 threads) toda vez que o jogo abre, competindo
 * com o download dos cérebros. Como o texto é fixo, o vetor é fixo: dá para
 * calcular aqui, uma vez, e mandar pronto no bundle.
 *
 * Mesmo formato do cânone (`f10-memoria-vetores.mjs`): int8 com escala, 768
 * bytes por frase em vez de 3 KB, diferença no cosseno na quarta casa. E o
 * HASH junto — se alguém editar uma redação e esquecer de rodar isto, o jogo
 * detecta e recalcula aquela frase sozinho, em vez de comparar com o vetor de
 * um texto que já não existe.
 *
 * Uso: node tools/f10-motor-vetores.mjs
 *      (sobe o servidor da bancada sozinho; o .gguf tem de estar em
 *       bancada-navegador/gemma-embed.gguf)
 * Saída: src/npc/floor10MotorVetores.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..');
const BANCADA = path.join(RAIZ, 'bancada-navegador');
const MODELO = process.env.F10_EMBED_GGUF ?? '/gemma-embed.gguf';
const PORTA = Number(process.env.PORTA ?? 8791);
const SAIDA = path.join(RAIZ, 'src/npc/floor10MotorVetores.ts');

// ── O CHROMIUM MUDA DE NÚMERO ENTRE SESSÕES ──────────────────────────────
// Mesma armadilha do rodar.mjs: o binário existe, só com outra versão, e o
// playwright morre pedindo `npx playwright install` — que aqui não resolve.
function acharChromium() {
    if (process.env.CHROMIUM_BIN) return process.env.CHROMIUM_BIN;
    const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    let pastas = [];
    try { pastas = fs.readdirSync(raiz); } catch { return undefined; }
    for (const pasta of pastas.filter((p) => p.startsWith('chromium'))
        .sort((a, b) => Number(a.includes('headless')) - Number(b.includes('headless')))) {
        for (const rel of ['chrome-linux/chrome', 'chrome-headless-shell-linux64/chrome-headless-shell']) {
            const alvo = path.join(raiz, pasta, rel);
            if (fs.existsSync(alvo)) return alvo;
        }
    }
    return undefined;
}

// Lê os rótulos do FONTE, para a ferramenta e o jogo nunca divergirem.
const fonte = fs.readFileSync(path.join(RAIZ, 'src/npc/floor10Rotulos.ts'), 'utf8');
const ROTULOS = [];
for (const bloco of fonte.matchAll(/alvo:\s*'([a-z-]+)',\s*\n\s*frases:\s*\[([\s\S]*?)\],/g)) {
    const alvo = bloco[1];
    const frases = [...bloco[2].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
    ROTULOS.push({ alvo, frases });
}
if (ROTULOS.length === 0) throw new Error('não achei rótulo nenhum em floor10Rotulos.ts');
console.log(`▸ ${ROTULOS.length} rótulos, ${ROTULOS.reduce((s, r) => s + r.frases.length, 0)} redações`);

const servidor = spawn('node', [path.join(BANCADA, 'servidor.mjs'), BANCADA, String(PORTA)], {
    stdio: 'ignore',
});
const encerrar = () => { try { servidor.kill(); } catch { /* já morreu */ } };
process.on('exit', encerrar);

await new Promise((r) => { setTimeout(r, 1500); });

const executablePath = acharChromium();
const navegador = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--enable-features=SharedArrayBuffer', '--no-sandbox',
        '--js-flags=--experimental-wasm-jspi', '--unlimited-storage'],
});
const pagina = await navegador.newPage();
pagina.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
// PÁGINA VAZIA, e não a bancada: a `vetor.html` carrega o modelo sozinha, e
// aí o `evaluate` abaixo abriria um SEGUNDO handle no mesmo arquivo do OPFS —
// o Chrome recusa com NoModificationAllowedError.
await pagina.goto(`http://127.0.0.1:${PORTA}/vazio.html`, { waitUntil: 'domcontentloaded' });

console.log('▸ carregando o embeddinggemma…');
const vetores = await pagina.evaluate(async ({ modelo, rotulos }) => {
    const { Wllama } = await import('/wllama-cdn/index.js');
    const w = new Wllama({ default: '/wllama-cdn/wasm/wllama.wasm' }, { suppressNativeLog: true });
    await w.loadModelFromUrl(modelo, {
        n_ctx: 1024, n_threads: navigator.hardwareConcurrency || 4, embeddings: true,
    });
    const saida = [];
    for (const r of rotulos) {
        for (const frase of r.frases) {
            const resp = await w.createEmbedding({ input: `title: movement | text: ${frase}` });
            const v = resp?.data?.[0]?.embedding ?? [];
            const n = Math.hypot(...v) || 1;
            saida.push({ alvo: r.alvo, frase, v: v.map((x) => x / n) });
        }
    }
    return saida;
}, { modelo: MODELO, rotulos: ROTULOS });

await navegador.close();
encerrar();

// FNV-1a, o mesmo de floor10Rotulos.hashDoRotulo.
const hash = (frase) => {
    const texto = `title: movement | text: ${frase}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < texto.length; i += 1) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
};

const linhas = vetores.map(({ alvo, frase, v }) => {
    const escala = Math.max(...v.map(Math.abs)) / 127;
    const bytes = v.map((x) => Math.round(x / escala) & 0xff);
    const b64 = Buffer.from(Uint8Array.from(bytes)).toString('base64');
    return `    { alvo: '${alvo}', hash: ${hash(frase)}, escala: ${escala.toExponential(8)}, v: '${b64}' },`;
});

const dim = vetores[0]?.v.length ?? 0;
fs.writeFileSync(SAIDA, `// GERADO POR tools/f10-motor-vetores.mjs — não editar à mão.
//
// Os vetores das redações de floor10Rotulos.ts, calculados com o MESMO modelo
// que o jogo baixa (embeddinggemma-300M), quantizados em int8 com escala.
// Estão aqui para o aparelho não gastar ~9,6s de CPU embeddando texto que
// nunca muda, toda vez que o andar abre.
//
// Editou uma redação em floor10Rotulos.ts? Rode a ferramenta de novo. Se
// esquecer, o jogo percebe pelo \`hash\` e recalcula aquela frase sozinho.
import type { Floor10MotorTarget } from './floor10MotorCortex';

export type VetorDoRotuloEmpacotado = {
    alvo: Floor10MotorTarget;
    /** FNV-1a do texto com prefixo, para detectar redação editada. */
    hash: number;
    escala: number;
    /** int8 em base64, ${dim} dimensões. */
    v: string;
};

export const FLOOR10_MOTOR_DIM = ${dim};

export const FLOOR10_MOTOR_VETORES: readonly VetorDoRotuloEmpacotado[] = [
${linhas.join('\n')}
];
`);
console.log(`✔ ${vetores.length} vetores (${dim}d) em ${path.relative(RAIZ, SAIDA)}`);
