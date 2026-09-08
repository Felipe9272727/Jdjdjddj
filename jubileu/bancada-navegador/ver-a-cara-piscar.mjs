// ── A PISCADA EM MOVIMENTO ───────────────────────────────────────────────────
//
// Foto parada não prova piscada: prova que existe um desenho de olho fechado,
// que é outra coisa. `window.__f3CaraLog` guarda cada TROCA de cara com a hora,
// e é a sequência que diz se ela pisca no ritmo certo — a cada ~2,8 s, com
// quatro quadros rápidos, e sem cair no compasso da fala.
//
//   node bancada-navegador/ver-a-cara-piscar.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { INTERVALO_DA_PISCADA, DURACAO_DA_PISCADA } from '../src/f3Olhos.ts';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1024, height: 640 } });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await p.route('**://www.google.com/**', r => r.abort());
p.on('pageerror', e => console.log('  [erro]', String(e.message).slice(0, 160)));
await p.goto('http://127.0.0.1:3011/index.html?f3preview&nopost&cam=0.66,1.90,15.8&alvo=0.66,1.80,14',
    { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise(r => setTimeout(r, 30000));
const log = await p.evaluate(() => window.__f3CaraLog ?? []);
if (!log.length) { console.log('nenhuma troca de cara — a sonda não gravou nada'); }
else {
    const t0 = log[0].t;
    console.log('── A SEQUÊNCIA DA CARA ──');
    for (const l of log) console.log(`  +${String(l.t - t0).padStart(6)} ms  ${l.cara}`);
    // Quantas PISCADAS: uma piscada é uma corrida de quadros 0..3 seguidos.
    const piscadas = log.filter(l => l.cara.endsWith('/0')).length;
    const span = (log[log.length - 1].t - t0) / 1000;
    console.log(`\n  trocas: ${log.length}   piscadas: ${piscadas}   em ${span.toFixed(1)} s`);
    // ── CUIDADO COM A CONTA ──────────────────────────────────────────────────
    // Esta bancada roda a ~2 fps, e o relógio do personagem soma `dt` com teto
    // de 0,05 s por quadro. Ou seja: o relógio DELE anda ~10x mais devagar que o
    // relógio de parede. Vinte e seis segundos aqui são ~2,6 s de personagem, e
    // esperar nove piscadas nesse tempo seria esperar errado.
    const relogioDele = span / 10;
    console.log(`\n  relógio de parede: ${span.toFixed(1)} s  →  relógio DELE: ~${relogioDele.toFixed(1)} s`);
    console.log(`  esperado nesse tempo: ~${(relogioDele / INTERVALO_DA_PISCADA).toFixed(1)} piscadas `
        + `(uma a cada ${INTERVALO_DA_PISCADA} s, durando ${DURACAO_DA_PISCADA.toFixed(2)} s)`);
    console.log('  o que a sequência tem que mostrar: quadros subindo 0→3 e VOLTANDO a -1.');
}
ponte.fechar(); await b.close();
