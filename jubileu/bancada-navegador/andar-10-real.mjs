// ── O ANDAR 10 DE VERDADE, O DOS ANDARES NORMAIS ─────────────────────────
//
// `jogo-de-verdade.mjs` mede o `?pipeline`: abre `floor10.html` (que renderiza
// a BANCADA, `Floor10Bench`) e chama `falarPeloPipelineReal` na unha. Isso
// nunca tocou o Andar 10 que o jogador joga.
//
// O Andar 10 do jogo é outro caminho inteiro:
//
//     index.html → App.tsx → currentLevel === 10 → <Floor10NpcChat/>
//     jogador chega perto  → npc.near = true
//     jogador aperta E     → open() → iniciarPrecarga(passosDoAndar10(…))
//     jogador manda a fala → sendToNpc()
//
// Esta bancada percorre ESSE caminho, sem reimplementar nenhum pedaço dele:
//
//   · `window.__startFloor(10)` — o gancho de playtest que já existia no
//     App.tsx (linha ~1484), o mesmo que a crítica offline usa para jogar.
//   · `npcSet({ near: true })` — equivale a andar até o Nilo. É o único
//     empurrão; a proximidade normalmente vem do Floor10Npc, que depende da
//     posição do jogador em 3D.
//   · tecla `E` — dispara o `open()` DE VERDADE do componente, e é ele quem
//     chama `iniciarPrecarga`. A fila que roda aqui é a fila do jogo, na ordem
//     do jogo, com os carregadores do jogo.
//   · `sendToNpc(pergunta)` — a mesma função que o botão de enviar chama.
//
// Por que `sendToNpc` direto e não digitar no input: o envio (Floor10NpcChat,
// linha ~399) é literalmente `void sendToNpc(t)`. Passar pelo DOM só
// acrescentaria uma forma de a bancada quebrar sem que nada do jogo tenha
// mudado. A fila, essa sim, SÓ existe pelo DOM — e por isso ela é disparada
// pela tecla.
//
// ── SUBA O SERVIDOR SEM HMR ──────────────────────────────────────────────
//
//     DISABLE_HMR=true npm run dev
//
// Não é preferência. O watcher do Vite cobre a raiz do projeto, e uma volta
// desta bancada morreu assim, no meio da primeira fala:
//
//     page.evaluate: Execution context was destroyed, most likely because of
//     a navigation
//
// A "navegação" foi um recarregamento que o Vite mandou porque EU editei um
// arquivo (`ponte.mjs`) enquanto a volta corria. Uma bancada que leva minutos
// não pode depender de ninguém ficar parado; `DISABLE_HMR=true` é lido pelo
// `vite.config.ts` e desliga o canal.
//
//   VITE=http://127.0.0.1:3000 node bancada-navegador/andar-10-real.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import { abrirPonte } from './ponte.mjs';

const VITE = process.env.VITE ?? 'http://127.0.0.1:3000';
const PERGUNTAS = (process.env.PERGUNTAS ?? [
    'Oi, quem é você?',
    'Onde a gente tá?',
    'O que tem atrás daquela parede?',
].join('|')).split('|');
const TETO_FILA_S = Number(process.env.TETO_FILA_S ?? 2400);
const TETO_FALA_S = Number(process.env.TETO_FALA_S ?? 900);
const RELATORIO = process.env.RELATORIO ?? '/tmp/andar-10-real.json';

const seg = (ms) => `${(ms / 1000).toFixed(1)}s`;
const gb = (b) => `${(b / 1e9).toFixed(2)} GB`;

const ponte = abrirPonte({
    cache: process.env.CACHE ?? '/tmp/ponte-andar10',
    porta: Number(process.env.PORTA_PONTE ?? 3431),
    // A fala vem em DOIS shards e o wllama pede os dois quase juntos; guardar
    // um só apagava o primeiro no meio do segundo. O disco desta caixa hoje
    // tem 29 GB e a fila inteira pesa ~5 — cabe folgado.
    guardarGrandes: 8,
    manterCache: process.env.MANTER_CACHE !== '0',
});

// ── O PERFIL PRECISA SER DE DISCO, E ISSO É MEDIÇÃO ──────────────────────
//
// Com o perfil efêmero do Playwright o navegador anuncia 2,67 GB de cota para o
// site. O granite pede 2,79 GB (2,59 × 1,08 de folga), e a primeira volta desta
// bancada morreu exatamente aí:
//
//     Sem espaço para o granite-4.0-h-tiny 7B-A1B: o navegador só libera
//     0.44 GB para este site e o modelo precisa de 1.62 GB.
//
// A recusa do JOGO estava certíssima — quem estava errado era a caixa. Medido
// nos dois modos, com o mesmo binário e as mesmas flags:
//
//     perfil efêmero ....... cota  2,67 GB
//     perfil em disco ...... cota 27,10 GB
//
// E vem um segundo ganho de graça: o OPFS sobrevive entre execuções, então a
// segunda volta não rebaixa 2,59 GB — que é justamente quando se conferem os
// consertos da primeira.
const PERFIL = process.env.PERFIL ?? '/home/user/perfil-andar10';
const contexto = await chromium.launchPersistentContext(PERFIL, {
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage',
        // O jogo é 3D. Sem isto o canvas não sobe nesta caixa e o App nunca
        // chega a montar o Andar 10 — a fila não roda e o sintoma é um
        // silêncio idêntico ao de um erro engolido.
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    ],
});
const page = contexto.pages()[0] ?? await contexto.newPage();
await ponte.instalarEm(page);

// ── QUEM SERVIU O MOTOR ──────────────────────────────────────────────────
//
// A pergunta que originou esta bancada: "veja se lá já está com o motor que se
// mostrou 3 vezes melhor". A resposta não é ler o código — é ver qual arquivo
// o navegador buscou.
const motores = new Set();
page.on('request', (r) => {
    const u = r.url();
    if (/wllama|\.wasm$/.test(u)) motores.add(u.replace(VITE, ''));
});
const erros = [];
page.on('pageerror', (e) => { erros.push(String(e.message).slice(0, 200)); });
page.on('console', (m) => {
    const t = m.text();
    if (/erro|error|falhou|abort|fail/i.test(t) && !/favicon/.test(t)) erros.push('console: ' + t.slice(0, 200));
});

console.log(`\n  abrindo O JOGO em ${VITE}/index.html  (sem ?pipeline, sem floor10.html)\n`);
await page.goto(`${VITE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 180_000 });

// ── O ELEVADOR, PELO GANCHO DE PLAYTEST ──────────────────────────────────
await page.waitForFunction(() => typeof window.__startFloor === 'function', { timeout: 120_000 });
await page.evaluate(() => window.__startFloor(10));
console.log('  ✓ __startFloor(10) — o jogo está no Andar 10');

// O componente monta com o nível; sem ele o `npcSet` abaixo não tem quem ouça.
await page.waitForFunction(() => !!document.querySelector('canvas'), { timeout: 60_000 });

// ── O QUE O ANDAR PROMETE, ANTES DE BAIXAR NADA ──────────────────────────
const promessa = await page.evaluate(async () => {
    const E = await import('/src/npc/wllamaEngine.ts');
    const C = await import('/src/npc/floor10Composicao.ts');
    return {
        modelo: E.FLOOR10_MODEL.label,
        url: E.FLOOR10_MODEL.url,
        motorPadrao: E.WLLAMA_PATHS.default,
        prompt: E.prepareFloor10SystemPrompt('PERSONA'),
        fila: C.composicaoDaFila().map((p) => ({ papel: p.papel, label: p.label, bytes: p.bytes, essencial: p.essencial })),
        bytes: C.bytesDaFila(),
    };
});
console.log(`\n  modelo da fala : ${promessa.modelo}`);
console.log(`  arquivo        : ${promessa.url}`);
console.log(`  motor padrão   : ${promessa.motorPadrao}`);
console.log(`  prompt         : ${JSON.stringify(promessa.prompt)}`);
console.log(`\n  A FILA DO JOGO COMUM — ${promessa.fila.length} peças, ${gb(promessa.bytes)}:`);
for (const [i, p] of promessa.fila.entries()) {
    console.log(`   ${i + 1}. ${p.papel.padEnd(9)} ${p.label.padEnd(34)} ${gb(p.bytes).padStart(8)}${p.essencial ? '  ← essencial' : ''}`);
}

// ── FICAR PERTO DO NILO, E O QUE ESTA CAIXA NÃO CONSEGUE SIMULAR ─────────
//
// No jogo, `near` sai de uma medida: o Floor10Npc compara a cada quadro a
// posição do jogador com a do Nilo (`dist < 2,8 m`) e publica o resultado. O
// certo, então, seria ANDAR até ele — `window.__f10teleport(x, z)`, o gancho de
// playtest do App.tsx, com a posição que o próprio andar publica em
// `npc.perception.position`.
//
// Isso NÃO funciona nesta caixa, e a medição é clara:
//
//     __startFloor(10) → menu fora da tela: sim
//     __playerPos() ......... [0, 0, 8]  antes do teleporte
//     __f10teleport(1.2, 2.2) → +1s, +2s, +4s, +8s: [0, 0, 8]
//     npc.perception.player . null (o andar não enxerga o jogador)
//     requestAnimationFrame . roda, ~3 fps (SwiftShader)
//
// Ou seja: o rAF bate, o contexto WebGL está vivo, mas NENHUM `useFrame` roda —
// uma exceção dentro de um deles derruba o laço inteiro do react-three-fiber, e
// esta caixa não alcança a internet, então texturas remotas (uma delas vem do
// raw.githubusercontent.com) falham em carregar.
//
// A consequência honesta: **a vontade não pode ser observada aqui**. Ela mora
// no `useFrame` do Floor10Npc — Utility AI, gestos, memória de consequência —
// e sem quadros ela não dá um passo. O que esta bancada mede é o caminho da
// CONVERSA, que não depende de quadro nenhum: fila, motor, modelo, juiz,
// remendo e `sendToNpc`.
//
// E aqui vai o único empurrão que a bancada dá no jogo: `near: true` na marra.
// Num aparelho de verdade quem escreve isso é o quadro, medindo a distância;
// aqui não há quadro para escrever nem para corrigir. Vale por ter andado até
// ele.
async function chegarPerto() {
    return page.evaluate(async () => {
        const { npc, npcSet } = await import('/src/npc/npcStore.ts');
        const p = npc.perception?.position;
        // O caminho legítimo primeiro: se algum dia os quadros rodarem nesta
        // caixa, é ele que vale, e o empurrão abaixo vira inofensivo.
        if (p) window.__f10teleport?.(p.x + 1.2, p.z);
        if (!npc.near) npcSet({ near: true });
        return npc.near;
    });
}

console.log('\n  chegando perto do Nilo e apertando E…\n');
await chegarPerto();
await page.waitForTimeout(300);
await page.keyboard.press('e');

// ── A FILA, VISTA DE FORA, ENQUANTO ELA DESCE ────────────────────────────
const t0 = Date.now();
let ultimo = '';
const marcos = [];
const fechamentos = [];
for (;;) {
    const s = await page.evaluate(async () => {
        const { floor10Fila } = await import('/src/npc/floor10Fila.ts');
        const P = await import('/src/npc/floor10Precarga.ts');
        const { npc } = await import('/src/npc/npcStore.ts');
        const e = floor10Fila.estado();
        return {
            aberto: npc.open,
            atual: e.atual?.label ?? null,
            papel: e.atual?.id ?? null,
            posicao: e.posicao, total: e.total,
            fracao: e.fracao,
            prontos: [...e.prontos],
            falhados: e.falhados.map((f) => `${f.id}: ${f.motivo}`),
            etapa: P.precargaEtapa(),
            completa: P.precargaCompleta(),
            liberada: P.conversaLiberada(),
            fase: npc.phase,
            erro: npc.error,
        };
    });
    // ── O CHAT PODE FECHAR SOZINHO, E FECHAR NÃO É MOTIVO PARA DESISTIR ──
    //
    // A primeira volta parava aqui com "o chat não abriu", e a leitura fácil
    // era que a tecla nunca chegou. Não é isso: o painel abriu (a fila correu
    // 137 s) e fechou DEPOIS. Quem fecha sem ser o jogador é
    // `npcSaiuDoAndar()`, no desmonte do Floor10Npc. Reabrir é o que o jogador
    // faria, e é o que dá para observar quantas vezes acontece.
    if (!s.aberto) {
        fechamentos.push(Math.round((Date.now() - t0) / 1000));
        await chegarPerto();
        await page.waitForTimeout(250);
        await page.keyboard.press('e');
    }
    const linha = `${s.etapa} · ${s.posicao}/${s.total} ${s.atual ?? '—'} · ${(s.fracao * 100).toFixed(0)}%`;
    if (linha !== ultimo) {
        console.log(`  [${seg(Date.now() - t0).padStart(7)}] ${linha}${s.liberada ? '   (conversa liberada)' : ''}`);
        marcos.push({ ms: Date.now() - t0, ...s });
        ultimo = linha;
    }
    if (s.erro) console.log(`  ⚠ npc.error: ${s.erro}`);
    if (s.completa) { console.log(`\n  ✓ fila completa em ${seg(Date.now() - t0)}`); break; }
    if (Date.now() - t0 > TETO_FILA_S * 1000) { console.log(`\n  ✗ fila estourou o teto de ${TETO_FILA_S}s`); break; }
    await page.waitForTimeout(2000);
}

const fimDaFila = await page.evaluate(async () => {
    const { floor10Fila } = await import('/src/npc/floor10Fila.ts');
    const M = await import('/src/npc/floor10Memoria.ts');
    const { npc } = await import('/src/npc/npcStore.ts');
    const e = floor10Fila.estado();
    return {
        prontos: [...e.prontos],
        falhados: e.falhados.map((f) => `${f.id}: ${f.motivo}`),
        memoria: M.memoriaJaCarregada(),
        fase: npc.phase,
        rotulo: npc.modelLabel,
    };
});
console.log(`  prontos : ${fimDaFila.prontos.join(', ') || '—'}`);
console.log(`  falhados: ${fimDaFila.falhados.join(' | ') || 'nenhum'}`);
console.log(`  memória por significado de pé: ${fimDaFila.memoria ? 'SIM' : 'NÃO (cai na busca por palavra)'}`);
console.log(`  fase do NPC: ${fimDaFila.fase} · rótulo: ${fimDaFila.rotulo}`);
if (fechamentos.length) console.log(`  o painel fechou sozinho ${fechamentos.length}x (aos ${fechamentos.join('s, ')}s) e foi reaberto`);
console.log(`\n  motores buscados pelo navegador:`);
for (const m of motores) console.log(`    ${m}`);

// ── AS FALAS, PELO CAMINHO DO BOTÃO DE ENVIAR ────────────────────────────
const turnos = [];
for (const pergunta of PERGUNTAS) {
    console.log(`\n▸ ${pergunta}`);
    const antes = await page.evaluate(async () => {
        const { npc } = await import('/src/npc/npcStore.ts');
        return npc.history.length;
    });
    const t1 = Date.now();
    await page.evaluate(async (q) => {
        const { sendToNpc } = await import('/src/npc/wllamaEngine.ts');
        window.__turno = sendToNpc(q).then(() => 'ok').catch((e) => 'ERRO: ' + String(e?.message ?? e));
    }, pergunta);

    let visto = '';
    let desfecho = null;
    for (;;) {
        const s = await page.evaluate(async (n) => {
            const { npc } = await import('/src/npc/npcStore.ts');
            return {
                fase: npc.phase, etapa: npc.etapa, streaming: npc.streaming,
                rotulo: npc.modelLabel, erro: npc.error,
                cresceu: npc.history.length > n,
                ultima: npc.history[npc.history.length - 1]?.content ?? '',
                papel: npc.history[npc.history.length - 1]?.role ?? '',
            };
        }, antes);
        const marca = `${s.fase}|${s.etapa}`;
        if (marca !== visto) { console.log(`   · ${seg(Date.now() - t1).padStart(7)} ${s.fase}${s.etapa ? ' — ' + s.etapa : ''}`); visto = marca; }
        if (s.cresceu && s.papel === 'assistant' && s.fase !== 'thinking') { desfecho = s; break; }
        if (s.erro) { desfecho = s; break; }
        if (Date.now() - t1 > TETO_FALA_S * 1000) { desfecho = { ...s, estouro: true }; break; }
        await page.waitForTimeout(1000);
    }
    const ms = Date.now() - t1;
    const saida = await page.evaluate(async () => {
        const C = await import('/src/npc/floor10CaixaPreta.ts');
        return C.eventosDaCaixaPreta().slice(-25).map((e) => `${String(e.tipo).padEnd(26)} ${JSON.stringify(e.dados ?? {}).slice(0, 200)}`);
    });
    console.log(`   ── ${seg(ms)} · rótulo "${desfecho.rotulo}"${desfecho.estouro ? '  ⚠ ESTOUROU O TETO' : ''}`);
    console.log(`   ➜ ${JSON.stringify(desfecho.ultima)}`);
    if (desfecho.erro) console.log(`   ⚠ erro: ${desfecho.erro}`);
    for (const l of saida.filter((l) => /juiz|tom|remendo|revis|issue|refaz/i.test(l))) console.log(`     ${l}`);
    turnos.push({ pergunta, ms, fala: desfecho.ultima, rotulo: desfecho.rotulo, erro: desfecho.erro, caixa: saida });
}

// ── A VONTADE: O NPC AGINDO COMO UM JOGADOR ──────────────────────────────
//
// Ela não é uma peça da conversa — é o que o Nilo faz quando ninguém pergunta
// nada. Roda no `useFrame` do Floor10Npc: a Utility AI escolhe uma meta, o
// cérebro pequeno planeja o gesto, e a memória de consequência confere depois
// se aquilo funcionou. Aqui só se olha o resultado publicado no estado.
const vontade = await page.evaluate(async () => {
    const { npc } = await import('/src/npc/npcStore.ts');
    const C = await import('/src/npc/floor10CaixaPreta.ts');
    const a = npc.autonomy;
    return {
        goal: a?.goal, label: a?.label, reason: a?.reason,
        andando: a?.moving, compromisso: a?.commitment,
        gesto: a?.motion?.act ?? null,
        decisoes: a?.decisionId ?? 0,
        drives: a?.drives,
        aprendizado: a?.learning,
        falaSozinho: npc.autonomousSpeech,
        comando: npc.willCommand,
        fase: npc.deliberationPhase,
        eventos: C.eventosDaCaixaPreta()
            .filter((e) => /vontade|autonom|motor|prisao|consequencia/i.test(String(e.tipo ?? '')))
            .slice(-12)
            .map((e) => `${String(e.tipo).padEnd(26)} ${JSON.stringify(e.dados ?? {}).slice(0, 160)}`),
    };
});
console.log(`\n  ── A VONTADE ──────────────────────────────────────────────────────`);
console.log(`  meta agora     : ${vontade.goal} — ${vontade.label ?? ''}`);
console.log(`  porque         : ${vontade.reason ?? '—'}`);
console.log(`  decisões       : ${vontade.decisoes}  ·  andando: ${vontade.andando}  ·  gesto: ${vontade.gesto ?? '—'}`);
console.log(`  compromisso    : ${vontade.compromisso ?? '—'}`);
console.log(`  impulsos       : ${JSON.stringify(vontade.drives)}`);
console.log(`  aprendizado    : ${JSON.stringify(vontade.aprendizado)?.slice(0, 200)}`);
console.log(`  deliberação    : ${vontade.fase}`);
console.log(`  falou sozinho  : ${vontade.falaSozinho ? JSON.stringify(vontade.falaSozinho) : '(nada no instante da leitura)'}`);
for (const e of vontade.eventos) console.log(`    ${e}`);

console.log(`\n${'═'.repeat(78)}`);
const bons = turnos.filter((t) => t.fala && !t.erro);
console.log(`  ${bons.length}/${turnos.length} falas · média de ${(turnos.reduce((s, t) => s + t.ms, 0) / turnos.length / 1000).toFixed(1)}s por turno`);
console.log(`  fila: ${seg(marcos.at(-1)?.ms ?? 0)} até o fim`);
if (erros.length) {
    console.log(`\n  erros da página (${erros.length}):`);
    for (const e of [...new Set(erros)].slice(0, 12)) console.log(`    ${e}`);
}
fs.writeFileSync(RELATORIO, JSON.stringify({ promessa, marcos, fimDaFila, fechamentos, motores: [...motores], turnos, vontade, erros }, null, 2));
console.log(`\n  relatório em ${RELATORIO}`);
await contexto.close();
ponte.fechar();
