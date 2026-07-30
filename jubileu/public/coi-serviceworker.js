/* Fallback de isolamento para WASM threads quando o host ignora vercel.json. */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // SÓ A NAVEGAÇÃO. Este `if` é o arquivo inteiro.
  //
  // Antes daqui passava TODO fetch, e cada resposta era reconstruída com
  // `new Response(response.body, …)`. Para uma página isso é irrelevante; para
  // o download dos cérebros significa 1,9 GB + 1,3 GB + 386 MB atravessando
  // JavaScript dentro de um Service Worker, no celular, byte a byte — custo de
  // CPU e de memória num aparelho que já está apertado, e um caminho a mais
  // para o download travar ou perder o progresso.
  //
  // E era desnecessário: `crossOriginIsolated` depende dos cabeçalhos do
  // DOCUMENTO. Com COEP=credentialless os sub-recursos entram sem precisar de
  // cabeçalho nenhum. Então os modelos passam direto, sem intermediário.
  if (request.mode !== 'navigate') return;
  if (request.cache === 'only-if-cached') return;

  event.respondWith((async () => {
    const response = await fetch(request);
    // Respostas opacas não podem ser reconstruídas; COEP=credentialless cuida
    // delas no navegador sem enviar credenciais.
    if (response.status === 0) return response;

    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  })());
});
