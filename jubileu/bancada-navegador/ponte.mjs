// ── A PONTE: O NAVEGADOR DESTA CAIXA NÃO ALCANÇA A INTERNET ──────────────
//
// A sessão sai por um proxy que re-termina TLS, e o Chromium do Playwright não
// tem a CA desse proxy no armazém dele (o NSS está vazio; não há certutil para
// instalar). Resultado: todo `fetch` para jsdelivr ou huggingface morre em
// "Failed to fetch", e os carregadores falham juntos no mesmo prazo — 12,7 s
// cada, que é o timeout do CDN e não do modelo.
//
// A saída NÃO é desligar verificação de TLS. É interceptar: o Playwright roda
// no Node, o Node tem o proxy e a CA configurados, então quem busca é ele e o
// navegador recebe os bytes já resolvidos. A página nunca faz o pedido externo.
//
// Este arquivo nasceu dentro de `jogo-de-verdade.mjs` e saiu de lá quando a
// segunda bancada (`andar-10-real.mjs`) precisou do mesmo mecanismo. Cada
// comentário aqui é uma volta que morreu: não os apague sem repetir a volta.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

/** Acima disto o arquivo vai por redirecionamento, não por `route.fulfill`. */
export const GRANDE = 100e6;

const ALVOS_EXTERNOS = [
    '**://cdn.jsdelivr.net/**',
    '**://huggingface.co/**',
    '**://*.hf.co/**',
    '**://cdn-lfs*.hf.co/**',
    '**://unpkg.com/**',
    '**://storage.googleapis.com/**',
];

const tipo = (url) => (url.endsWith('.js') || url.endsWith('.mjs') ? 'text/javascript'
    : url.endsWith('.json') ? 'application/json'
    : url.endsWith('.wasm') ? 'application/wasm'
    : 'application/octet-stream');

/**
 * Sobe a ponte e devolve `{ instalarEm, fechar }`.
 *
 * `guardarGrandes` existe porque as duas bancadas têm necessidades opostas: a
 * do pipeline baixa um modelo por vez e pode apagar o anterior; a do Andar 10
 * real baixa o granite em DUAS partes que o wllama pede quase juntas, e apagar
 * a primeira no meio derruba a segunda.
 */
export function abrirPonte({
    cache = '/tmp/ponte',
    porta = 3421,
    guardarGrandes = 1,
    registrar = console.log,
    // Repetir a bancada custa o download inteiro de novo — 2,6 GB só da fala.
    // Com o disco em 29 GB isso é desperdício, e a segunda volta é justamente
    // onde se conferem os consertos da primeira.
    manterCache = false,
} = {}) {
    fs.mkdirSync(cache, { recursive: true });

    // ── ARQUIVO GRANDE NÃO PASSA POR `route.fulfill` ─────────────────────
    //
    // O `fulfill` do Playwright serializa o corpo em base64 antes de mandar
    // para o navegador, e o V8 recusa string acima de 512 MB:
    //
    //     Error: Cannot create a string longer than 0x1fffffe8 characters
    //     ERR_STRING_TOO_LONG   ← o rascunhador tem 822 MB
    //
    // Então o grande vai por REDIRECIONAMENTO: a ponte responde 302 para um
    // servidor local que transmite o arquivo em pedaços, com Range, como
    // qualquer servidor de verdade. O navegador continua sem falar com a
    // internet.
    const servidor = createServer((req, res) => {
        const nome = decodeURIComponent((req.url ?? '').replace(/^\/+/, '').split('?')[0]);
        const caminho = `${cache}/${nome}`;
        if (!nome || !fs.existsSync(caminho)) { res.writeHead(404).end(); return; }
        const tamanho = fs.statSync(caminho).size;
        const cabecalhos = {
            'content-type': 'application/octet-stream',
            'accept-ranges': 'bytes',
            'access-control-allow-origin': '*',
            'cross-origin-resource-policy': 'cross-origin',
        };
        const faixa = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
        if (faixa) {
            const de = faixa[1] ? Number(faixa[1]) : 0;
            const ate = faixa[2] ? Number(faixa[2]) : tamanho - 1;
            res.writeHead(206, {
                ...cabecalhos,
                'content-range': `bytes ${de}-${ate}/${tamanho}`,
                'content-length': ate - de + 1,
            });
            fs.createReadStream(caminho, { start: de, end: ate }).pipe(res);
            return;
        }
        res.writeHead(200, { ...cabecalhos, 'content-length': tamanho });
        fs.createReadStream(caminho).pipe(res);
    });
    const dePe = new Promise((ok) => servidor.listen(porta, '127.0.0.1', ok));

    const grandesNoDisco = [];

    async function rota(route, request) {
        const url = request.url();
        const nome = createHash('sha1').update(url).digest('hex');
        const destino = `${cache}/${nome}`;
        if (!fs.existsSync(destino)) {
            const t = Date.now();
            // ── BAIXA PARA UM NOME PROVISÓRIO E SÓ DEPOIS RENOMEIA ───────
            //
            // O `curl` escrevia direto no destino, e o teste de cache é
            // `existsSync`. Matar a bancada no meio de um download deixava um
            // arquivo PARCIAL com o nome definitivo — que todas as execuções
            // seguintes tratavam como completo.
            //
            // O sintoma foi este, repetido em duas voltas seguidas:
            //
            //     falhados: vontade: o arquivo guardado tem 32 MB e deveria
            //     ter 1246 MB; apaguei, tente de novo
            //
            // O JOGO estava certo — conferiu o tamanho, apagou e mandou tentar
            // de novo. A ponte é que devolvia os mesmos 32 MB sempre. Renomear
            // é atômico: ou o arquivo completo existe, ou não existe nada.
            const parcial = `${destino}.parcial`;
            const r = spawnSync('curl', ['-sL', '--fail', '--retry', '3', '-o', parcial, url],
                { timeout: 1_800_000 });
            if (r.status !== 0 || !fs.existsSync(parcial)) {
                fs.rmSync(parcial, { force: true });
                registrar(`  ‹ponte› FALHOU ${url.slice(0, 90)}`);
                return route.abort();
            }
            fs.renameSync(parcial, destino);
            const mb = fs.statSync(destino).size / 1e6;
            if (mb > 1) {
                registrar(`  ‹ponte› ${mb.toFixed(0).padStart(5)} MB em `
                    + `${((Date.now() - t) / 1000).toFixed(0).padStart(3)}s · ${url.split('/').pop()}`);
            }
        }
        if (fs.statSync(destino).size > GRANDE) {
            // ── QUANTOS GRANDES CABEM NO DISCO AO MESMO TEMPO ────────────
            //
            // Guardar todos foi o que encheu o disco desta caixa — 0 byte
            // livre, e o embeddinggemma falhou no meio do download. Guardar
            // só UM derruba um modelo em duas partes. Quem sabe o número é a
            // bancada, não a ponte.
            grandesNoDisco.push(destino);
            for (const velho of grandesNoDisco.splice(0, grandesNoDisco.length - guardarGrandes)) {
                if (velho !== destino) fs.rmSync(velho, { force: true });
            }
            return route.fulfill({
                status: 302,
                headers: { location: `http://127.0.0.1:${porta}/${nome}` },
            });
        }
        await route.fulfill({
            status: 200,
            headers: {
                'content-type': tipo(url),
                'access-control-allow-origin': '*',
                'cross-origin-resource-policy': 'cross-origin',
            },
            body: fs.readFileSync(destino),
        });
    }

    return {
        /** Liga a ponte nos alvos externos de uma página do Playwright. */
        async instalarEm(page) {
            await dePe;
            for (const alvo of ALVOS_EXTERNOS) await page.route(alvo, rota);
        },
        rota,
        fechar() {
            servidor.close();
            if (!manterCache) fs.rmSync(cache, { recursive: true, force: true });
        },
    };
}
