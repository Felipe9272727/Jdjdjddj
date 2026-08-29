/**
 * ── O KERNEL DE q2_K VALE ALGUMA COISA? ─────────────────────────────────
 *
 * A/B entre DOIS wasms da MESMA árvore, um com o `relaxed-q2k.patch` e outro
 * sem. Só o kernel muda — mesma versão do llama.cpp, mesmo emcc, mesmas flags.
 * Comparar contra o wasm implantado não serviria: ele foi construído noutra
 * árvore, e a diferença carregaria tudo junto.
 *
 * Mede duas coisas, e a segunda é a que impede um desastre:
 *
 *   VELOCIDADE  4 fios, como o jogo roda.
 *   ARITMÉTICA  1 fio, temp 0, top_k 1, semente fixa. Kernel de quantização
 *               errado NÃO falha — ele responde bobagem, e a primeira versão
 *               do de q4_K cuspiu "jumbotron pymysql" sem erro nenhum. Com
 *               tudo travado, saída diferente entre os dois denuncia
 *               aritmética diferente.
 *
 * Com mais de um fio o próprio build diverge de si mesmo (a redução em ponto
 * flutuante muda de ordem), então o teste de aritmética SÓ vale com um fio.
 *
 *     MODELO=/caminho/q2k.gguf node bancada-navegador/q2k-ab.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, copyFileSync, symlinkSync, rmSync, existsSync } from 'node:fs';

const MODELO = process.env.MODELO ?? '/home/user/q2k-teste.gguf';
const RAIZ = '/tmp/q2kraiz';
const PORTA = 3413;
const BASE = `http://127.0.0.1:${PORTA}`;
const MOTORES = (process.env.MOTORES ?? 'sem-q2k,com-q2k').split(',');

if (existsSync(RAIZ)) rmSync(RAIZ, { recursive: true, force: true });
mkdirSync(RAIZ, { recursive: true });
copyFileSync('bancada-navegador/vazio.html', `${RAIZ}/vazio.html`);
// Shards: o wllama descobre os pedaços seguintes pelo padrão do nome, então
// o link tem de PRESERVAR o `-00001-of-000NN.gguf` — `m.gguf` quebraria isso.
const base = MODELO.replace(/^.*\//, '');
const casa = base.match(/^(.*)-(\d{5})-of-(\d{5})\.gguf$/);
let ALVO = 'm.gguf';
if (casa) {
    const dir = MODELO.slice(0, MODELO.length - base.length);
    const total = Number(casa[3]);
    for (let i = 1; i <= total; i++) {
        const n = String(i).padStart(5, '0');
        const nome = `${casa[1]}-${n}-of-${casa[3]}.gguf`;
        symlinkSync(`${dir}${nome}`, `${RAIZ}/${nome}`);
    }
    ALVO = base;
} else {
    symlinkSync(MODELO, `${RAIZ}/m.gguf`);
}
for (const m of MOTORES) symlinkSync(`/home/user/motores/${m}`, `${RAIZ}/${m}`);

const srv = spawn('node', ['bancada-navegador/servidor.mjs', RAIZ, String(PORTA)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});

const rodar = async (motor, fios) => {
    const p = await b.newPage();
    await p.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const r = await p.evaluate(async ({ base, motor, fios, alvo }) => {
        const mod = await import(`${base}/${motor}/index.js`);
        const w = new mod.Wllama({ default: `${base}/${motor}/wllama.wasm` });
        await w.loadModelFromUrl(`${base}/${alvo}`, {
            n_ctx: 1024, n_batch: 256, n_threads: fios, n_gpu_layers: 0,
            jinja: true, reasoning: false, warmup: false,
        });
        const msgs = [{ role: 'user', content: 'Explique como funciona um elevador antigo.' }];
        const uma = async () => {
            const t0 = performance.now();
            const res = await w.createChatCompletion({
                messages: msgs, n_predict: 48, temp: 0, top_k: 1, seed: 7,
                cache_prompt: false, ignore_eos: true,
            });
            return { ms: performance.now() - t0, txt: res?.choices?.[0]?.message?.content ?? '' };
        };
        await uma();
        const a = await uma(); const c = await uma(); const d = await uma();
        await w.exit?.();
        return { ms: [a.ms, c.ms, d.ms], txt: a.txt };
    }, { base: BASE, motor, fios, alvo: ALVO });
    await p.close();
    return r;
};

console.log(`\n  VELOCIDADE (${process.env.FIOS ?? 4} fios, 48 tokens, 3 repetições)`);
const vel = {};
for (const m of MOTORES) {
    const r = await rodar(m, Number(process.env.FIOS ?? 4));
    const media = r.ms.reduce((a, x) => a + x, 0) / r.ms.length;
    vel[m] = media;
    console.log(`    ${m.padEnd(9)} ${(48000 / media).toFixed(2)} tok/s   (${r.ms.map(Math.round).join(' ')} ms)`);
}
const g = vel[MOTORES[0]] / vel[MOTORES[1]];
console.log(`    → ${g >= 1 ? `${g.toFixed(3)}× mais RÁPIDO` : `${(1 / g).toFixed(3)}× mais LENTO`}`);

console.log('\n  ARITMÉTICA (1 fio, temp 0, top_k 1, semente fixa)');
const sai = {};
for (const m of MOTORES) {
    sai[m] = (await rodar(m, 1)).txt;
    console.log(`    ${m.padEnd(9)} "${sai[m].slice(0, 90).replace(/\n/g, ' ')}"`);
}
console.log(`    → ${sai[MOTORES[0]] === sai[MOTORES[1]]
    ? 'IDÊNTICO caractere a caractere — o kernel não mudou a conta'
    : 'DIVERGE — o kernel mudou a conta; NÃO implantar sem investigar'}`);

await b.close(); srv.kill();
