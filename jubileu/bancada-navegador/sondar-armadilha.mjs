// Sonda o GRAFO DA CENA em vez de tentar ler a foto. Diz se o mapa de sombra
// está ligado, e o que cada filho do grupo da armadilha realmente é.
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PORTA = process.env.PORTA ?? '3011';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
});
const ctx = await b.newContext({ viewport: { width: 1024, height: 640 } });
const p = await ctx.newPage();
await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await p.route('**://www.google.com/**', (r) => r.abort());
await p.route('**://firestore.googleapis.com/**', (r) => r.abort());
p.on('pageerror', (e) => console.log('  [erro]', String(e.message).slice(0, 140)));
await p.goto(`http://127.0.0.1:${PORTA}/index.html?f3preview&armadilha&nopost`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 18000));
const info = await p.evaluate(() => {
    const cena = window.__cena;
    if (!cena) return { erro: 'sem __cena' };
    const luzes = [];
    let comSombra = 0, total = 0;
    cena.traverse((o) => {
        if (o.isLight) luzes.push({ tipo: o.type, castShadow: o.castShadow });
        if (o.isMesh) { total += 1; if (o.castShadow) comSombra += 1; }
    });
    // o grupo da armadilha: aquele cujo primeiro filho é uma esfera
    const grupos = [];
    cena.traverse((o) => {
        if (!o.isGroup || o.children.length < 3) return;
        const f0 = o.children[0];
        if (f0?.isMesh && f0.geometry?.type === 'SphereGeometry') {
            grupos.push({
                pos: o.position.toArray().map((v) => +v.toFixed(2)),
                filhos: o.children.map((c) => ({
                    geo: c.geometry?.type,
                    pos: c.position.toArray().map((v) => +v.toFixed(3)),
                    esc: c.scale.toArray().map((v) => +v.toFixed(3)),
                    vis: c.visible,
                    sombra: c.castShadow,
                    mat: c.material?.type,
                    cor: c.material?.color?.getHexString?.(),
                    filhos: c.children.length,
                })),
            });
        }
    });
    const gl = window.__gl;
    const sombra = gl ? { ligado: gl.shadowMap.enabled, tipo: gl.shadowMap.type } : null;
    // O CUSTO DE DESENHO. É a única régua de desempenho que esta caixa dá com
    // honestidade: FPS aqui é do SwiftShader e não diz nada sobre o celular, mas
    // CHAMADA DE DESENHO e TRIÂNGULO são os mesmos números em qualquer máquina.
    const custo = gl ? {
        chamadas: gl.info.render.calls,
        triangulos: gl.info.render.triangles,
        texturas: gl.info.memory.textures,
        geometrias: gl.info.memory.geometries,
        programas: gl.info.programs ? gl.info.programs.length : null,
    } : null;
    return { luzes, malhasComSombra: comSombra, malhas: total, grupos, sombra, custo };
});
console.log('shadowMap:', JSON.stringify(info.sombra));
console.log('CUSTO:', JSON.stringify(info.custo));
console.log('luzes:', JSON.stringify(info.luzes));
console.log('malhas com castShadow:', info.malhasComSombra, '/', info.malhas);
for (const g of info.grupos ?? []) {
    console.log('grupo em', JSON.stringify(g.pos));
    for (const c of g.filhos) console.log('   ', c.geo, 'pos', JSON.stringify(c.pos), 'esc', JSON.stringify(c.esc), c.mat, '#' + c.cor, 'vis', c.vis, 'sombra', c.sombra, 'contornos', c.filhos);
}
if (info.erro) console.log('ERRO', info.erro);
ponte.fechar();
await b.close();
