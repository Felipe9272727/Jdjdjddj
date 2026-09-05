// ── POR QUE O NILO DO ANDAR 10 DEMORA 6x O DA SALA DE VELOCIDADE ────────────
//
// O dono do jogo cronometrou: 13-25s no `?velocidade&motor=relaxed` contra
// 125s+ no Andar 10 de verdade. Cronometro contra cronometro e comparacao
// valida, entao a resposta tem de ser medida, nao deduzida. (Minha primeira
// resposta foi deduzida, e estava errada: eu disse que os dois numeros nao
// eram comparaveis. Sao.)
//
// Esta bancada roda os DOIS caminhos na mesma CPU, com os mesmos fios, a mesma
// amostragem e o mesmo teto de saida — de proposito. O que sobra de diferenca
// e so (a) a configuracao de CARGA e (b) o PROMPT, que sao as duas suspeitas.
//
//   npm run dev -- --port=3011        (noutro terminal, DISABLE_HMR=true)
//   node /tmp/servidor-modelo.mjs     (serve o gguf local com CORS)
//   FASE=1|3|4 node bancada-navegador/porque-o-nilo-e-lento.mjs
//
// O modelo vem de um servidor local porque o Chromium desta caixa nao alcanca
// o huggingface (ver ponte.mjs); e o contexto e PERSISTENTE porque o perfil
// efemero anuncia cota de 2,67 GB e a carga morre em QuotaExceededError.
//
// ── O QUE FOI MEDIDO (2026-09-05, x86 4 nucleos, 4 fios, SmolLM3-3B Q4_K_M) ──
//
// FASE 1 — a configuracao de carga e INOCENTE:
//     carga do ?velocidade (n_ctx 2048, KV f16,  warmup off) -> PT real 29,2s
//     carga do Andar 10    (n_ctx 1536, KV q8_0, warmup on)  -> PT real 29,3s
//   Nao e o n_ctx, nao e o KV em 8 bits, nao e o warmup, nao e o motor.
//   E tambem nao e o `think`: `enable_thinking:false` sai em toda chamada do
//   Andar 10, e a WebGPU comeca em 0 camadas.
//
// FASE 1 — o que a sala de velocidade mede e um prompt QUENTE:
//     EN frio ......... 28,4s        EN quente ....... 4,8s / 2,7s
//   O mesmo prompt custa 6x menos quando o cache do prefixo pega. O numero
//   que a sala publica e o quente; o do jogo e o frio.
//
// FASE 3 — de onde vem o tempo do Andar 10 (turno 1):
//     PT sem pre-aquecimento .......... 53,3s
//     pre-aquecimento (prefixo 897ch) . 28,1s   <- sai da frente do jogador
//     turno 1 (cauda 572ch) ........... 29,4s
//     turno 2 (mesmo fato de canone) ..  8,4s   <- a histerese funcionando
//     SEM cauda nenhuma ............... 11,7s   <- o piso: so a fala
//     turno 1 de novo ................. 29,4s
//   Ou seja: 11,7s sao a fala e 17,5s sao a CAUDA que o curador acrescenta
//   depois do prefixo aquecido. E a cauda que responde pela diferenca inteira.
//
//   (O "turno 1 de novo" custar igual nao e o cache falhando: o llama.cpp
//   guarda UMA sequencia, e a chamada "SEM cauda" no meio a sobrescreveu.)
//
// FASE 4 — quanto vale enxugar a cauda:
//     cauda ATUAL   572 chars -> 29,2s
//     cauda ENXUTA  311 chars -> 21,4s     (-27%, mesma quantidade de fala)
//   A cauda enxuta tira duas gorduras: o bloco de percepcao que gasta ~95
//   chars para dizer que NAO TEM dado, e a memoria injetada que repete quase
//   palavra por palavra a sala que o "Canone fixo" do prefixo ja descreveu.
// ── O JOGO REAL, MEDIDO DEPOIS (andar-10-real.mjs, x86, CPU×2) ──────────────
//
// A bancada sintetica acima isola variaveis; o `andar-10-real.mjs` roda o
// caminho inteiro. Ele achou o numero que faltava:
//
//   turno 1  "Oi, quem e voce?"              36,3s   leitura 20s  fala 11s
//                                            99 lidos · 273 reaproveitados
//   turno 2  "Onde a gente ta?"               0,0s   <- os Olhos responderam
//   turno 3  "O que tem atras daquela parede?" 77,5s  leitura 61s  fala 12s
//                                           297 lidos · 305 reaproveitados
//
// O REAPROVEITADO FICOU PARADO E O LIDO TRIPLICOU. O prompt total foi de 372
// para 602 tokens; dos 230 a mais, so 32 vieram do cache. A causa e de
// arquitetura: o fato do canone e a diretiva "NESTA FALA" moram DENTRO da
// mensagem de sistema, que vem ANTES do historico — quando o curador troca o
// fato, o prefixo comum morre ali e todo o historico e relido junto. O custo
// do turno CRESCE com a conversa.
//
// ── UM EXPERIMENTO QUE SAIU ERRADO, E FICA REGISTRADO COMO ERRADO ───────────
//
// A FASE 5 tenta comparar "volatil no sistema" com "volatil na ultima fala" e
// deu 17,7s contra 31,0s — como se a proposta fosse PIOR. Ela nao prova isso:
// os dois bracos nao partem do mesmo estado de cache. No braco 2 a primeira
// fala guardada e "cauda1 + pergunta1", e o historico do turno 3 traz a
// pergunta1 sozinha; os dois divergem na PRIMEIRA mensagem, entao o turno 3
// releu tudo por um motivo que so existe dentro do teste. Para valer, a fase 5
// precisa simular a sequencia real de turnos (cada resposta entrando no
// historico como o jogo a guarda) e mandar o bloco volatil como mensagem
// SEPARADA no fim, que e o que o caminho do revisor ja faz. Nao refiz ainda.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

function acharChromium() {
    if (process.env.CHROMIUM_BIN) return process.env.CHROMIUM_BIN;
    const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    let pastas = [];
    try { pastas = fs.readdirSync(raiz); } catch { return undefined; }
    const cands = pastas.filter((x) => x.startsWith('chromium'))
        .sort((a, b) => Number(a.includes('headless')) - Number(b.includes('headless')));
    for (const pasta of cands)
        for (const rel of ['chrome-linux/chrome', 'chrome-headless-shell-linux64/chrome-headless-shell'])
            if (fs.existsSync(path.join(raiz, pasta, rel))) return path.join(raiz, pasta, rel);
    return undefined;
}

const PORTA = process.env.PORTA || '3011';
const FIOS = process.env.FIOS || '4';
const TETO_MIN = Number(process.env.TETO_MIN ?? 30);
const exe = acharChromium();
// ── PERFIL EM DISCO, NAO EFEMERO ─────────────────────────────────────────
// O wllama guarda o gguf no armazenamento do navegador. Com o perfil efemero
// do Playwright a cota anunciada e 2,67 GB e a carga morre em
// QuotaExceededError no meio; com perfil em disco sao 27,10 GB. E a mesma
// pegadinha que `andar-10-real.mjs` documenta.
const PERFIL = process.env.PERFIL ?? '/home/user/perfil-bisect';
const ctx = await chromium.launchPersistentContext(PERFIL, {
    ...(exe ? { executablePath: exe } : {}),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage',
           '--enable-features=SharedArrayBuffer'],
});
const b = { close: () => ctx.close() };
const p = ctx.pages()[0] ?? await ctx.newPage();
p.on('console', (m) => { const t = m.text(); if (/error|falh|exce/i.test(t)) console.log('[con] ' + t.slice(0, 300)); });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message.slice(0, 300)));

let ultimo = '';
const relogio = setInterval(async () => {
    try {
        const agora = await p.evaluate(() => document.getElementById('r')?.textContent ?? '');
        if (agora !== ultimo) { process.stdout.write(agora.slice(ultimo.length)); ultimo = agora; }
    } catch { /* pagina ocupada */ }
}, 5000);

await p.goto(`http://127.0.0.1:${PORTA}/bancada-navegador/porque-o-nilo-e-lento.html?fios=${FIOS}&fase=${process.env.FASE ?? '3'}`,
    { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => typeof window.__pronto === 'string', null, { timeout: TETO_MIN * 60_000 })
    .catch(() => console.log('\n(estourou o teto de tempo — segue o que deu tempo de medir)'));
clearInterval(relogio);
console.log('\n===== RELATORIO =====');
console.log(await p.evaluate(() => window.__pronto ?? document.getElementById('r')?.textContent ?? '(nada)'));
await b.close();
