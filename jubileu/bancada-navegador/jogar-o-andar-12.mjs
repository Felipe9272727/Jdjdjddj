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
// Mede o DANO, não a sobrevivência: sem isto a sessão acaba quando o bot morre e
// o número principal (quanto tempo a luta dura) vira uma extrapolação de 60 s.
const IMORTAL = process.env.IMORTAL === '1';
/** PULAR=1 mede o caminho de quem já viu a cena e aperta o botão de pular. */
const PULAR = process.env.PULAR === '1';

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
let cliques = 0, quadrosAnt = 0, tAnt = agora(), cargas = 0, cargaAnt = 0;
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
            bocaX: window.__f12bocaX ?? 0,
            carga: s.nave?.carga ?? 0,
        };
    }).catch(() => null);
    if (!e) { await new Promise(r => setTimeout(r, 120)); continue; }

    // FPS
    const t = agora();
    if (t - tAnt > 1.0) { fps.push(+((e.quadros - quadrosAnt) / (t - tAnt)).toFixed(1)); quadrosAnt = e.quadros; tAnt = t; }

    if (e.carga !== undefined) { if (e.carga < cargaAnt) cargas++; cargaAnt = e.carga; }
    if (e.fase !== faseAnt) { nota({ ev: 'fase', de: faseAnt, para: e.fase }); faseAnt = e.fase; }
    if (e.fala !== falaAnt) { nota({ ev: 'fala', n: e.fala, fase: e.fase }); falaAnt = e.fala; }
    if (e.ataque !== ataqueAnt && e.ataque) { nota({ ev: 'ataque', qual: e.ataque, vida: e.vida }); ataqueAnt = e.ataque; }
    if (e.virada && !viradaAnt) { nota({ ev: 'VIRADA', vida: e.vida }); viradaAnt = true; }
    if (vidasAnt !== null && e.vidas < vidasAnt) nota({ ev: 'TOMEI-DANO', vidas: e.vidas });
    vidasAnt = e.vidas; vidaAnt = e.vida;

    // ── JOGAR ────────────────────────────────────────────────────────
    //
    // UMA política, dois caminhos de entrada. A primeira versão desta bancada
    // dava políticas DIFERENTES para o dedo e para a tecla — o dedo arrastava
    // direto até o destino, a tecla dava toquinhos de 130 ms e soltava — e
    // depois eu reportei "o teclado causa 3x menos dano" como se fosse defeito
    // do jogo. Pode ser; mas com dois bots diferentes o número não é sobre o
    // jogo, é sobre os bots. Agora os dois perseguem o MESMO x desejado.
    if (e.fase === 'luta') {
        if (IMORTAL) await p.evaluate(() => { const s = window.__f12estado; if (s?.nave) s.nave.piscando = 9999; }).catch(()=>{});

        const arena = await p.evaluate(() => window.__f12arena.x).catch(() => 4);
        // DESVIO MÍNIMO, não fuga para a borda: um humano sai do caminho e
        // volta. Fugir para a parede também torna o raspão impossível de medir.
        let querMundo = e.bocaX ?? 0;                       // o padrão é mirar a boca
        if (e.perto && e.perto.z > -11) {
            const folga = 1.5;
            const dEsq = (e.perto.x - folga) - e.nx;        // quanto andar para ficar à esquerda
            const dDir = (e.perto.x + folga) - e.nx;
            const alvo = Math.abs(dEsq) < Math.abs(dDir) ? e.perto.x - folga : e.perto.x + folga;
            querMundo = Math.max(-arena, Math.min(arena, alvo));
        }
        const erro = querMundo - e.nx;

        if (MODO === 'tecla') {
            // segura a tecla enquanto faltar distância, como um humano segura
            const tecla = erro > 0.25 ? 'd' : erro < -0.25 ? 'a' : null;
            if (tecla) {
                await p.keyboard.down(tecla);
                await new Promise(r => setTimeout(r, 60));
                await p.keyboard.up(tecla);
            } else await new Promise(r => setTimeout(r, 60));
        } else {
            // arrasta pelo DELTA de mundo convertido em pixels, que é o que o
            // jogo espera (o arrasto é 1:1 com o dedo)
            const quadro = await p.evaluate(() => {
                const E = window.__f12enq; return E ? E.larg : null;
            }).catch(() => null);
            const larguraMundo = quadro ?? (arena * 2 / 0.9);
            const px = (erro / larguraMundo) * W;
            const x0 = W * 0.5, y0 = H * 0.6;
            await p.mouse.move(x0, y0); await p.mouse.down();
            await p.mouse.move(Math.max(4, Math.min(W - 4, x0 + px)), y0, { steps: 2 });
            await p.mouse.up();
            await new Promise(r => setTimeout(r, 60));
        }
    } else {
        // diálogo / introdução: clicar como um jogador clica.
        // O ÚLTIMO botão da página é o ▶ do balão; o primeiro virou o PULAR.
        // Sem escolher, a bancada pula a cena toda e mede o caminho de quem já
        // viu — que é um número legítimo, mas não é o do primeiro jogo.
        // E nas fases SEM diálogo (a introdução) o único botão da página é o
        // PULAR — clicar nele ali pula a cena inteira. O caminho normal espera
        // a introdução correr e só clica quando há balão.
        const temBalao = e.fase === 'encontro' || e.fase === 'virada'
            || e.fase === 'vitoria' || e.fase === 'derrota' || e.fase === 'despedida';
        if (PULAR || temBalao) {
            const bts = await p.$$('button');
            const bt = PULAR ? bts[0] : bts[bts.length - 1];
            if (bt) { await bt.click({ timeout: 2500 }).catch(() => {}); cliques++; }
        }
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
console.log(`  tiros carregados disparados: ${cargas}`);

// ── ATAQUES POR MINUTO, ANTES E DEPOIS DA VIRADA ─────────────────────────
// É o número que prova que a virada faz alguma coisa. Ela passou três entregas
// sem fazer nada enquanto o código dizia que fazia, e ninguém tinha um número.
{
    const vir = linha.find((l) => l.ev === 'VIRADA');
    const ats = linha.filter((l) => l.ev === 'ataque');
    const t0 = inicioLuta ? inicioLuta.t : 0;
    const fimT = agora();
    if (vir && ats.length) {
        const antes = ats.filter((a) => a.t < vir.t).length;
        const depois = ats.filter((a) => a.t >= vir.t).length;
        const jAntes = Math.max(0.001, vir.t - t0);
        const jDepois = Math.max(0.001, fimT - vir.t);
        console.log(`  ataques/min ANTES da virada:  ${(antes / jAntes * 60).toFixed(1)}  (${antes} em ${jAntes.toFixed(0)}s)`);
        console.log(`  ataques/min DEPOIS da virada: ${(depois / jDepois * 60).toFixed(1)}  (${depois} em ${jDepois.toFixed(0)}s)`);
    } else {
        console.log(`  (a virada não aconteceu nesta sessão: ${ats.length} ataques ao todo)`);
    }
}

// ── O NÚMERO PRINCIPAL: quanto tempo esta luta dura, de verdade ──────────
if (inicioLuta) {
    const tLuta = (fim2 && fim2.fase === 'vitoria' ? linha.find(l=>l.ev==='FIM')?.t ?? agora() : agora()) - inicioLuta.t;
    const dano = 240 - (fim2?.vida ?? 240);
    const dps = dano / tLuta;
    console.log(`\n  ── O NÚMERO ──`);
    console.log(`  tempo lutando ....... ${tLuta.toFixed(1)}s`);
    console.log(`  dano causado ........ ${dano.toFixed(1)} de 240`);
    console.log(`  DANO POR SEGUNDO .... ${dps.toFixed(2)}`);
    console.log(`  => LUTA COMPLETA .... ${dps > 0 ? (240/dps).toFixed(0)+'s (' + (240/dps/60).toFixed(1) + ' min)' : 'NUNCA'}`);
}
