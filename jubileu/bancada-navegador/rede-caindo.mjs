// SERVIDOR QUE DERRUBA A CONEXÃO NO MEIO DO DOWNLOAD
//
// Existe para responder UMA pergunta que nenhum teste com wllama falso
// responde: quando a rede do celular cai no meio dos 334 MB, que erro o wllama
// REAL entrega para quem chamou `loadModelFromUrl`? Se ele embrulhar o
// `TypeError: Failed to fetch` numa mensagem própria, a classificação de
// `floor10Carga.ehFalhaTransitoria` erra e a retentativa nunca dispara — o
// conserto seria de mentira.
//
// O arquivo servido é lixo com Content-Length: para observar o erro do
// DOWNLOAD não é preciso um GGUF válido, e um GGUF válido pequeno não existe
// nesta caixa.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORTA = Number(process.argv[2] ?? 8711);
const RAIZ = path.join(import.meta.dirname);
const TAMANHO = 48 * 1024 * 1024;
const CORTAR_EM = 16 * 1024 * 1024;

let pedidos = 0;

const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.wasm': 'application/wasm',
};

const servidor = http.createServer((req, res) => {
    // SharedArrayBuffer exige isolamento de origem, como no jogo.
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const url = new URL(req.url, `http://127.0.0.1:${PORTA}`);

    if (url.pathname === '/fake.gguf') {
        pedidos += 1;
        if (url.searchParams.get('erro') === '503' && pedidos <= 2) {
            console.log(`[servidor] pedido ${pedidos}: 503`);
            res.writeHead(503, { 'Content-Type': 'text/plain' })
                .end('Service Unavailable');
            return;
        }
        const cair = pedidos === 1;
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(TAMANHO),
            'Accept-Ranges': 'bytes',
        });
        const bloco = Buffer.alloc(256 * 1024);
        let enviados = 0;
        const empurrar = () => {
            while (enviados < TAMANHO) {
                if (cair && enviados >= CORTAR_EM) {
                    // A rede CAI: socket destruído no meio, sem trailer, sem fim.
                    console.log(`[servidor] pedido ${pedidos}: cortando em ${enviados} bytes`);
                    req.destroy();
                    res.destroy();
                    return;
                }
                const resto = Math.min(bloco.length, TAMANHO - enviados);
                enviados += resto;
                if (!res.write(bloco.subarray(0, resto))) {
                    res.once('drain', empurrar);
                    return;
                }
            }
            console.log(`[servidor] pedido ${pedidos}: entregue inteiro`);
            res.end();
        };
        empurrar();
        return;
    }

    const arquivo = path.join(RAIZ, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!arquivo.startsWith(RAIZ) || !fs.existsSync(arquivo)) {
        res.writeHead(404).end('não achei');
        return;
    }
    res.writeHead(200, {
        'Content-Type': TIPOS[path.extname(arquivo)] ?? 'application/octet-stream',
    });
    fs.createReadStream(arquivo).pipe(res);
});

servidor.listen(PORTA, '127.0.0.1', () => {
    console.log(`[servidor] rede-caindo em http://127.0.0.1:${PORTA}`);
});
