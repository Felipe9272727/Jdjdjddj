// ── JOGAR O ANDAR 12, E MEDIR O QUE SE SENTE ─────────────────────────────────
//
// Esta bancada não fotografa: ela JOGA. Entra no andar, atravessa a introdução
// clicando como um jogador clica, pilota a nave com arrasto de dedo de verdade
// (ou com teclado, no modo PC) e registra uma LINHA DO TEMPO do que aconteceu.
//
// Ela existe porque foto não responde as perguntas que o dono do jogo faz:
// "é divertido?", "tem variedade?", "dá pra jogar?". Foto responde "está bonito
// neste instante", e este andar já me fez entregar duas vezes um jogo que eu
// tinha fotografado sem estar jogando.
//
//   MODO=toque|tecla W=915 H=412 SEGUNDOS=150 node bancada-navegador/jogar-o-andar-12.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const MODO = process.env.MODO ?? 'toque';
const W = Number(process.env.W ?? 915), H = Number(process.env.H ?? 412);
const SEGUNDOS = Number(process.env.SEGUNDOS ?? 150);
const FOTOS = process.env.FOTOS === '1';

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
const erros = [];
p.on('pageerror', e => erros.push(String(e.message).slice(0, 200)));

const t0 = Date.now();
const agora = () => (Date.now() - t0) / 1000;
const linha = [];
const nota = (o) => linha.push({ t: +agora().toFixed(2), ...o });

await p.goto('http://127.0.0.1:3011/index.html?f12', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise(r => setTimeout(r, 3000));
nota({ ev: 'pagina-pronta' });
await p.click('button', { timeout: 30000 }).catch(() => nota({ ev: 'sem-botao-de-entrada' }));
nota({ ev: 'entrou' });

// contador de FPS na página
await p.evaluate(() => {
    window.__q = 0; const laco = () => { window.__q++; requestAnimationFrame(laco); }; requestAnimationFrame(laco);
});

// ── O LAÇO: joga, e anota tudo o que muda ────────────────────────────────
let faseAnt = null, ataqueAnt = null, vidaAnt = null, vidasAnt = null, falaAnt = null, viradaAnt = false;
let cliques = 0, quadrosAnt = 0, tAnt = agora();
const fps = [];
let alvoX = 0.5, alvoY = 0.62, dir = 1;
const fim = agora() + SEGUNDOS;
let iter = 0;

while (agora() < fim) {
    iter++;
    const e = await p.evaluate(() => {
        const s = window.__f12estado;
        if (!s) return null;
        const pr = s.projeteis ?? [];
        return {
            fase: s.fase, vida: s.vida, vidas: s.vidas, ataque: s.ataqueNoAr,
            fala: s.linhaDoDialogo, virada: s.passouDaVirada,
            nx: s.nave?.x, ny: s.nave?.y, ix: s.irmao?.x, iy: s.irmao?.y,
            nProj: pr.filter(q => q.tipo !== 'tiro').length,
            nTiros: pr.filter(q => q.tipo === 'tiro').length,
            // a ameaça mais perto de cruzar o plano do jogador
            perto: pr.filter(q => q.tipo !== 'tiro' && q.z > -14)
                .map(q => ({ x: q.x, y: q.y, z: q.z, tipo: q.tipo }))
                .sort((a, c) => c.z - a.z)[0] ?? null,
            quadros: window.__q,
        };
    }).catch(() => null);
    if (!e) { await new Promise(r => setTimeout(r, 120)); continue; }

    // FPS
    const t = agora();
    if (t - tAnt > 1.0) { fps.push(+((e.quadros - quadrosAnt) / (t - tAnt)).toFixed(1)); quadrosAnt = e.quadros; tAnt = t; }

    if (e.fase !== faseAnt) { nota({ ev: 'fase', de: faseAnt, para: e.fase }); faseAnt = e.fase; }
    if (e.fala !== falaAnt) { nota({ ev: 'fala', n: e.fala, fase: e.fase }); falaAnt = e.fala; }
    if (e.ataque !== ataqueAnt && e.ataque) { nota({ ev: 'ataque', qual: e.ataque, vida: e.vida }); ataqueAnt = e.ataque; }
    if (e.virada && !viradaAnt) { nota({ ev: 'VIRADA', vida: e.vida }); viradaAnt = true; }
    if (vidasAnt !== null && e.vidas < vidasAnt) nota({ ev: 'TOMEI-DANO', vidas: e.vidas });
    vidasAnt = e.vidas; vidaAnt = e.vida;

    // ── JOGAR ────────────────────────────────────────────────────────
    if (e.fase === 'luta') {
        // uma política simples de humano: fugir do que está vindo perto,
        // senão voltar ao meio (que é de onde se acerta a boca).
        let qx = 0.5, qy = 0.58;
        if (e.perto && e.perto.z > -9) {
            // desvia para o lado oposto da ameaça
            const arena = await p.evaluate(() => window.__f12arena.x).catch(() => 4);
            const ameacaU = 0.5 + (e.perto.x / (arena * 2));
            qx = ameacaU > 0.5 ? 0.22 : 0.78;
        }
        if (MODO === 'tecla') {
            const t1 = qx < 0.45 ? 'a' : qx > 0.55 ? 'd' : null;
            if (t1) { await p.keyboard.down(t1); await new Promise(r => setTimeout(r, 130)); await p.keyboard.up(t1); }
            else await new Promise(r => setTimeout(r, 110));
        } else {
            await p.mouse.move(W * alvoX, H * alvoY);
            await p.mouse.down();
            await p.mouse.move(W * qx, H * qy, { steps: 3 });
            await p.mouse.up();
            alvoX = qx; alvoY = qy;
            await new Promise(r => setTimeout(r, 90));
        }
    } else {
        // diálogo / introdução: clicar como um jogador clica
        const bt = await p.$('button');
        if (bt) { await bt.click({ timeout: 2500 }).catch(() => {}); cliques++; }
        await new Promise(r => setTimeout(r, 320));
    }

    if (e.fase === 'vitoria' || e.fase === 'derrota') { nota({ ev: 'FIM', fase: e.fase }); break; }
    dir = -dir;
}

const fim2 = await p.evaluate(() => { const s = window.__f12estado; return s ? { fase: s.fase, vida: s.vida, vidas: s.vidas } : null; }).catch(() => null);
ponte.fechar(); await b.close();

// ── O RELATÓRIO ──────────────────────────────────────────────────────────
console.log(`\n═══ JOGUEI O ANDAR 12 — ${MODO.toUpperCase()} ${W}x${H} ═══`);
console.log(`duração da sessão: ${agora().toFixed(1)}s   estado final:`, JSON.stringify(fim2));
console.log(`cliques de diálogo: ${cliques}`);
if (fps.length) {
    const ord = [...fps].sort((a, c) => a - c);
    console.log(`FPS: mediana ${ord[Math.floor(ord.length / 2)]}  min ${ord[0]}  max ${ord[ord.length - 1]}  (n=${fps.length})`);
}
if (erros.length) { console.log(`\nERROS DE PÁGINA (${erros.length}):`); [...new Set(erros)].slice(0, 6).forEach(x => console.log('  ', x)); }

console.log('\n── LINHA DO TEMPO ──');
for (const l of linha) {
    const { t, ev, ...resto } = l;
    console.log(`  ${String(t).padStart(7)}s  ${ev.padEnd(18)} ${JSON.stringify(resto)}`);
}

// ── O QUE A LINHA DO TEMPO DIZ ───────────────────────────────────────────
const inicioLuta = linha.find(l => l.ev === 'fase' && l.para === 'luta');
const ataques = linha.filter(l => l.ev === 'ataque');
const falas = linha.filter(l => l.ev === 'fala');
console.log('\n── LEITURA ──');
console.log(`  tempo até o jogador poder JOGAR: ${inicioLuta ? inicioLuta.t + 's' : 'NUNCA CHEGOU'}`);
console.log(`  falas antes da luta: ${falas.filter(f => !inicioLuta || f.t < inicioLuta.t).length}`);
console.log(`  ataques vistos: ${ataques.length}  tipos distintos: ${new Set(ataques.map(a => a.qual)).size}`);
const tipos = {};
for (const a of ataques) tipos[a.qual] = (tipos[a.qual] ?? 0) + 1;
console.log('  por tipo:', JSON.stringify(tipos));
if (ataques.length > 1) {
    const gaps = ataques.slice(1).map((a, i) => +(a.t - ataques[i].t).toFixed(1));
    console.log(`  intervalo entre ataques: ${gaps.join(', ')}`);
}
console.log(`  danos tomados: ${linha.filter(l => l.ev === 'TOMEI-DANO').length}`);
