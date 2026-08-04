// Servidor mínimo com COOP/COEP — sem isolamento cross-origin não existe
// SharedArrayBuffer, e sem SharedArrayBuffer o wllama multithread nem sobe.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const RAIZ = process.argv[2];
const PORTA = Number(process.argv[3] ?? 8710);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.gguf': 'application/octet-stream',
  '.json': 'application/json',
};

let contagem = {};

const servidor = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const caminho = join(RAIZ, normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  contagem[url.pathname] = (contagem[url.pathname] ?? 0) + 1;

  if (url.pathname === '/__contagem') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(contagem));
    return;
  }

  let alvo = caminho;
  let info;
  try {
    info = statSync(alvo);
    if (info.isDirectory()) {
      alvo = join(alvo, 'index.html');
      info = statSync(alvo);
    }
  } catch {
    res.writeHead(404).end('não achei');
    return;
  }

  const cabecalhos = {
    'content-type': TIPOS[extname(alvo)] ?? 'application/octet-stream',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-resource-policy': 'cross-origin',
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  };

  const range = req.headers.range;
  if (range) {
    const [inicio, fim] = range.replace('bytes=', '').split('-');
    const de = Number(inicio);
    const ate = fim ? Number(fim) : info.size - 1;
    res.writeHead(206, {
      ...cabecalhos,
      'content-range': `bytes ${de}-${ate}/${info.size}`,
      'content-length': ate - de + 1,
    });
    createReadStream(alvo, { start: de, end: ate }).pipe(res);
    return;
  }

  res.writeHead(200, { ...cabecalhos, 'content-length': info.size });
  createReadStream(alvo).pipe(res);
});

servidor.listen(PORTA, () => console.log(`servindo ${RAIZ} em http://127.0.0.1:${PORTA}`));
