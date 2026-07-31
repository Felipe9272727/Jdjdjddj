/* ── DUAS TAREFAS, UM SÓ SERVICE WORKER ───────────────────────────────────────
 *
 * 1. ISOLAMENTO (o motivo original): garante COOP/COEP na navegação quando o
 *    host ignora o vercel.json. Sem isso não há SharedArrayBuffer e o wllama
 *    cai para CPU×1.
 *
 * 2. O JOGO NÃO BAIXA DE NOVO À TOA (novo): o index.html publicado tem ~84 MB
 *    — bundle, texturas e modelos 3D embutidos em base64. Ele era rebaixado a
 *    CADA abertura, mesmo sem uma vírgula ter mudado, porque nada o guardava e
 *    o build ainda mandava `Cache-Control: no-store`.
 *
 * TEM DE SER ESTE ARQUIVO, e não um segundo worker: só um Service Worker
 * controla um escopo. Registrar outro em '/' substituiria este e derrubaria o
 * isolamento — a fala do Nilo voltaria a rodar numa thread só.
 *
 * ── COMO A FRESCURA É RESOLVIDA SEM PAGAR 84 MB ──────────────────────────────
 * Cache-first cego serviria build velho e traria de volta o antigo "mudei o
 * código e não aparece nada". Então, antes de servir, o worker pergunta ao
 * version.json (~100 bytes, gerado pelo inline-build) qual build está no ar —
 * e "build" ali é o hash do conteúdo, não o commit, justamente para que dois
 * builds do mesmo código sejam o mesmo id:
 *
 *   id igual ao do que está guardado   → serve do cache, 0 byte de rede
 *   id diferente, ou nada guardado     → baixa, guarda e serve o novo
 *   sem resposta em 2,5 s (rede ruim)  → serve o que tem, se tiver
 *
 * Ou seja: só baixa quando o jogo mudou de verdade. É a diferença entre pagar
 * 84 MB por alteração e pagar 84 MB por abertura.
 *
 * O QUE ESTE WORKER NÃO TOCA: qualquer coisa que não seja navegação. Os .gguf
 * dos cérebros (~4,2 GB) continuam passando direto para o wllama, que os guarda
 * no OPFS. Fazer 4,2 GB atravessarem JavaScript aqui dentro, num celular, é
 * custo de CPU e de memória por zero benefício — e um caminho a mais para o
 * download travar ou perder o progresso.
 */

const CACHE_JOGO = 'tne-jogo-v1';
/** Chave fixa do documento: `?bancada`, `?mente` etc. compartilham o mesmo HTML. */
const CHAVE_JOGO = new URL('__jogo__', self.registration.scope).href;
/** Chave do id de build a que o HTML guardado pertence. */
const CHAVE_VERSAO = new URL('__versao__', self.registration.scope).href;
/** Tempo máximo esperando o version.json antes de servir o que já existe. */
const ESPERA_VERSAO_MS = 2_500;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(
      nomes.filter((n) => n.startsWith('tne-') && n !== CACHE_JOGO).map((n) => caches.delete(n)),
    );
    await self.clients.claim();
  })());
});

/** Os cabeçalhos que fazem o `crossOriginIsolated` valer. */
function comIsolamento(response) {
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** A identidade de um build é o hash do conteúdo (`build`), não o commit. */
function identidade(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.build === 'string' && data.build) return data.build;
  // Deploys anteriores ao hash de conteúdo só tinham commit; ainda servem.
  return typeof data.commit === 'string' && data.commit ? data.commit : null;
}

async function versaoGuardada(cache) {
  try {
    const hit = await cache.match(CHAVE_VERSAO);
    if (!hit) return null;
    return identidade(await hit.json());
  } catch {
    return null;
  }
}

async function anotarVersao(cache, build) {
  await cache.put(
    CHAVE_VERSAO,
    new Response(JSON.stringify({ build, at: Date.now() }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

/** O id do build que está no ar AGORA. `null` = não deu para saber a tempo. */
async function versaoNoAr(scope) {
  try {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), ESPERA_VERSAO_MS);
    const res = await fetch(new URL('version.json', scope).href, {
      cache: 'no-store',
      signal: controle.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return identidade(await res.json());
  } catch {
    return null;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // SÓ A NAVEGAÇÃO. Ver o cabeçalho do arquivo: os modelos passam por fora.
  if (request.mode !== 'navigate') return;
  if (request.cache === 'only-if-cached') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_JOGO);

    // `?fresh=1` (ou `?nocache`) força baixar de novo. Saída de emergência para
    // quando a dúvida for justamente "será que estou vendo o build certo?".
    let forcar = false;
    try {
      const params = new URL(request.url).searchParams;
      forcar = params.has('fresh') || params.has('nocache');
    } catch { /* URL exótica: segue o caminho normal */ }

    const guardado = forcar ? null : await cache.match(CHAVE_JOGO);

    if (guardado) {
      const [noAr, daqui] = await Promise.all([
        versaoNoAr(self.registration.scope),
        versaoGuardada(cache),
      ]);
      // Sem resposta do version.json (offline, rede ruim): o que está guardado
      // é melhor que uma tela de erro.
      if (noAr === null || noAr === daqui) return guardado;
    }

    // Ou não há nada guardado, ou existe build novo: aí sim vale a rede.
    try {
      const fresca = await fetch(request);
      if (fresca.status === 0) return fresca; // opaca: não dá para reconstruir
      const isolada = comIsolamento(fresca);
      if (isolada.ok) {
        await cache.put(CHAVE_JOGO, isolada.clone());
        const build = await versaoNoAr(self.registration.scope);
        if (build) await anotarVersao(cache, build);
      }
      return isolada;
    } catch (erro) {
      // Offline: o jogo inteiro ainda abre, porque ele está aqui dentro.
      if (guardado) return guardado;
      throw erro;
    }
  })());
});
