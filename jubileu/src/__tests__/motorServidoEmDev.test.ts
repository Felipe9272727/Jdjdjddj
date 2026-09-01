import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

/**
 * ── O MOTOR DA CASA TEM DE SER IMPORTÁVEL, NÃO SÓ EXISTIR ────────────────
 *
 * `motorImplantado.test.ts` garante que os BYTES certos estão em
 * `public/wllama-relaxed/`. Este garante a outra metade: que o navegador
 * consegue `import()`-á-los.
 *
 * As duas coisas não são a mesma, e a diferença custou um andar inteiro.
 * Quando o motor da casa virou o padrão do jogo (`MOTOR_DA_CASA` em
 * `wllamaEngine.ts`), os 1.617 testes de unidade continuaram passando, o `tsc`
 * continuou limpo, e o Andar 10 parou de funcionar em desenvolvimento:
 *
 *     Falha ao carregar granite-4.0-h-tiny 7B-A1B localmente:
 *     Failed to fetch dynamically imported module:
 *     http://127.0.0.1:3000/wllama-relaxed/index.js?import
 *     Nenhum outro modelo foi ativado.
 *
 * O Vite recusa 500 qualquer `import()` de arquivo que more em `public/` —
 * "should not be imported from source code. It can only be referenced via HTML
 * tags" — e acrescenta `?import` ao pedido para reconhecê-lo. Em produção o
 * arquivo é copiado para `dist/` e o import funciona; em `npm run dev` o Nilo
 * não dizia UMA palavra. Nenhum teste de unidade encosta no servidor, então
 * nenhum deles podia ver isso: só abrir o jogo de verdade viu
 * (`bancada-navegador/andar-10-real.mjs`).
 *
 * O conserto é o plugin `motorDaCasa()` no `vite.config.ts`. Este teste sobe o
 * servidor de verdade e pede o arquivo do jeito que o navegador pede — com o
 * `?import` incluído, que é a parte que quebrava.
 */
describe('o motor da casa é importável no servidor de desenvolvimento', () => {
    let servidor: ViteDevServer;
    let base: string;

    beforeAll(async () => {
        servidor = await createServer({
            root: new URL('../../', import.meta.url).pathname,
            logLevel: 'error',
            server: { port: 0, hmr: false },
        });
        await servidor.listen();
        const porta = servidor.httpServer?.address();
        base = `http://127.0.0.1:${typeof porta === 'object' && porta ? porta.port : 0}`;
    }, 120_000);

    afterAll(async () => { await servidor?.close(); });

    it('o ESM sai com 200 e tipo de módulo mesmo com `?import`', async () => {
        // O `?import` é o que o Vite acrescenta quando o pedido vem de um
        // `import()` — e era exatamente com ele que a resposta virava 500.
        const r = await fetch(`${base}/wllama-relaxed/index.js?import`);
        expect(r.status).toBe(200);
        expect(r.headers.get('content-type')).toContain('javascript');
        const corpo = await r.text();
        // Um HTML de erro do Vite também sai com 200 em alguns caminhos; o que
        // prova que vieram os bytes do motor é o motor estar lá dentro.
        expect(corpo).toContain('Wllama');
        expect(corpo).not.toContain('<!DOCTYPE html>');
    }, 60_000);

    it('o wasm sai com o tipo que o WebAssembly.instantiateStreaming exige', async () => {
        const r = await fetch(`${base}/wllama-relaxed/wasm/wllama.wasm`);
        expect(r.status).toBe(200);
        expect(r.headers.get('content-type')).toBe('application/wasm');
    }, 60_000);

    it('o isolamento cross-origin sobrevive ao atalho', async () => {
        // Quem responde é um middleware nosso, e o `server.headers` do Vite é
        // outro middleware que já não roda depois dele. Sem estes cabeçalhos o
        // `SharedArrayBuffer` some e o wasm com threads não sobe.
        const r = await fetch(`${base}/wllama-relaxed/index.js`);
        expect(r.headers.get('cross-origin-opener-policy')).toBe('same-origin');
        expect(r.headers.get('cross-origin-embedder-policy')).toBe('credentialless');
    }, 60_000);

    it('o atalho não serve nada fora da pasta do motor', async () => {
        // `../` LITERAL não testa nada: o `fetch` normaliza o caminho antes de
        // sair, e o pedido chega ao servidor já como `/package.json` — sem
        // nunca passar pelo nosso prefixo. Quem chega inteiro é a forma
        // percent-encoded, que só vira `..` depois do `decodeURIComponent`.
        //
        // E aqui vai uma correção do próprio teste, medida e não suposta: essa
        // forma DEVOLVE o `package.json`, e devolve TAMBÉM com o plugin
        // desligado — é o servidor de desenvolvimento do Vite servindo a raiz
        // do projeto, o que ele faz desde sempre e só em `dev`. Não é buraco
        // nosso, e afirmar que o atalho fecha isso seria mentira.
        //
        // O que este teste PODE afirmar é o que ele afirma: que quem respondeu
        // não foi o nosso middleware. A assinatura é o `Cross-Origin-Resource-
        // Policy`, que só ele põe — a resposta do Vite não tem esse cabeçalho.
        const r = await fetch(`${base}/wllama-relaxed/%2e%2e/%2e%2e/package.json`);
        expect(r.headers.get('cross-origin-resource-policy')).toBeNull();
    }, 60_000);
});
