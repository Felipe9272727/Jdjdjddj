# Os remendos que só existem no `index.js` implantado

Extraído de `public/wllama-relaxed/index.js` com o script abaixo. Estes
trechos NÃO existem em nenhum código-fonte deste repositório nem do wllama
upstream: eles foram escritos direto no artefato construído e sobreviveram
só porque o arquivo está versionado. Se ele se perder, some tudo.

Nenhum deles é de performance — são três consertos funcionais. Estão aqui
para poderem ser reaplicados numa recompilação futura.

```js

function handleError(err) {
  // If WASM already aborted, onAbort already sent signal.abort; skip to avoid
  // re-reporting the resulting WebAssembly.RuntimeError as a JS exception.
  if (isAborted) return;

  // PATCH TNE: `err` NÃO pode ir inteiro. Um DOMException (QuotaExceededError,
  // por exemplo) não é clonável, o postMessage inteiro falha, o main thread
  // nunca fica sabendo e a promessa da carga não resolve NEM rejeita: é o
  // \"carregando\" eterno. Medido no Chromium com o SmolLM3-3B. Vai o nome e a
  // mensagem, que é o que serve para consertar; o objeto fica.
  const nome = err && err.name ? err.name + ': ' : '';
  const message = err ? nome + (err.message || String(err)) : 'Unknown error';
  const stack = err ? err.stack || String(err) : '';
  msg({
    verb: 'signal.abort',
    args: ['exception', message, stack, null],
  });
}

onmessage = async (e) => {
  if (!e.data) return;
  const { verb, args, callbackId } = e.data;

```

```js
    const argUseAsyncFile = args[1];
    try {
      // PONTE DE PTHREAD (patch TNE): o emscripten desta build ignora
      // `mainScriptUrlOrBlob` e cria cada pthread a partir de `_scriptName`,
      // que dentro deste Worker de Blob aponta para ESTE arquivo — sem o
      // bootstrap de pthread. O handshake nunca fechava e a carga travava
      // para sempre. O Blob do módulo, que só existe aqui, é a URL certa.
      try { globalThis.__emPthreadUrl = URL.createObjectURL(argMainScriptBlob); }
      catch (e) { msg({ verb: 'console.warn', args: ['sem URL de pthread: ' + e] }); }
      Module = getWModuleConfig(argMainScriptBlob);
      Module.preRun = () => {
        if (argUseAsyncFile) {
          Module.ENV['USE_ASYNC_FILE'] = '1';
        }
      };
      Module.onRuntimeInitialized = () => {
        // async call once module is ready
        // init FS
        patchHeapFS();
        // init cwrap
```

```js
};

// respond to main thread
const resOK = () => postMessage({ ok: true });
const resProgress = (loaded, total) =>
  postMessage({ progress: { loaded, total } });
// PATCH TNE: mesmo defeito do worker do llama.cpp, e este é pior porque
// acontece justamente quando falta espaço: um QuotaExceededError é DOMException,
// não é clonável, o postMessage inteiro falha e quem esperava o download fica
// esperando para sempre — sem barra, sem erro, sem fim. Vai o texto.
const resErr = (err) => postMessage({
  err: (err && err.name ? err.name + ': ' : '') + ((err && err.message) || String(err)),
});

onmessage = async (e) => {
  try {
    if (!e.data) return;

    /**
     * @param {Object} e.data
     *
     * Fine-control FS actions:
```

```js
      ].join(";

");
      this.worker = createWorker(completeCode);
      this.worker.onmessage = this.onRecvMsg.bind(this);
      this.worker.onerror = this.logger.error;
      // Daqui até o runtime ficar pronto o Worker busca o .wasm, compila e
      // acorda o pool de pthreads. Nada disso emitia um sinal: era a região
      // silenciosa que fazia a carga parecer travada.
      this.reportModelLoadActivity({
        stage: "wasm-boot",
        message: `compilando o runtime e acordando ${this.nbThread || 1} thread(s)`
      });
      const res = yield this.pushTask({
        verb: "module.init",
        args: [
          new Blob([moduleCode], { type: "text/javascript" }),
          this.useAsyncFile
        ],
        callbackId: this.taskId++
      });
```

```js
        stage: "wasm-ready",
        message: this.useAsyncFile ? "runtime pronto (leitura sob demanda)" : "runtime pronto (cópia para a memória)"
      });
      const nativeFiles = [];
      for (const file of ggufFiles) {
        const needAllocBuffer = !this.useAsyncFile;
        // Reservar o GGUF inteiro no heap WASM é UMA chamada só, e ela pode
        // demorar minutos num celular: avisar antes é a diferença entre uma
        // espera com nome e uma tela morta.
        if (needAllocBuffer) {
          this.reportModelLoadActivity({
            stage: "heapfs-reserve",
            message: `reservando ${file.blob.size} bytes na memória`
          });
        }
        const id = yield this.fileAlloc(
          file.name,
          file.blob.size,
          needAllocBuffer
        );
        nativeFiles.push(__spreadValues({ id }, file));
```

```js
      );
      let logLevel = (_c = params.log_level) != null ? _c : 2 /* INFO */;
      if (this.config.suppressNativeLog) {
        logLevel = 9999;
      }
      const modelFiles = yield prepareBlobs(blobs);
      // ── O DRAFT DA ESPECULATIVA PRECISA ESTAR NO FS, NÃO NUMA URL ──────
      //
      // `spec_draft_model` era repassado como string crua até o C++, e o
      // llama.cpp tentava abrir uma URL como arquivo:
      //
      //   srv load_model: failed to load draft model,
      //                   'http://127.0.0.1:3406/nanoimp.gguf'
      //
      // Ele não pode entrar em `blobs` junto do alvo: `prepareBlobs` renomeia
      // todo blob para `model-0000N-of-0000M.gguf` e o llama.cpp os junta como
      // FRAGMENTOS de um gguf dividido. Dois modelos viram um Frankenstein.
      //
      // `all` é o que MONTA no FS; `llm` é o que vira modelo. Pondo o draft só
      // em `all`, ele fica no disco virtual com nome próprio e fora da lista de
      // fragmentos — que é exatamente o que a especulativa precisa.
      if (params.spec_draft_blob) {
        modelFiles.all = [...modelFiles.all,
          { blob: params.spec_draft_blob, name: 'draft.gguf' }];
      }
      yield this.proxy.moduleInit(modelFiles.all);
      this.logger().debug("Calling wllamaStart...");
      const startResult = yield this.proxy.wllamaStart();
      if (!startResult.success) {
        throw new WllamaError(
          `Error while calling start function, result = ${startResult}`
        );
      }
      this.logger().debug("Loading model...");
```

```js
        lora_scales: (_g = params.lora_adapters) == null ? void 0 : _g.map((a) => {
          var _a2;
          return (_a2 = a.scale) != null ? _a2 : 1;
        }),
        lora_init_without_apply: params.lora_init_without_apply,
        spec_draft_model: params.spec_draft_blob ? 'models/draft.gguf' : params.spec_draft_model,
        // ── ESTA LINHA NÃO CHEGA AO C++, E FICA COMO REGISTRO ───────────
        //
        // Eu achei `speculative.types` nos strings do wasm e concluí que o
        // campo existia e era aninhado. Aquele string vem do llama.cpp
        // compilado junto (parser de argumentos e servidor), não desta ponte.
        //
        // A ponte serializa por ESQUEMA TIPADO — veja a lista de `"name"` lá
        // em cima. Existem sete campos de especulativa, todos `spec_draft_*`,
        // e nenhum `speculative`. O que não está no esquema não atravessa, e o
        // log responde `no implementations specified for speculative decoding`.
        //
        // Pelo turno também não vai: o `data_json` é JSON livre, mas o
        // `common_speculative_init` roda UMA vez na carga, não por pedido
        // (medido: 8,4 s com os tipos contra 7,2 s sem, os dois quentes).
        //
        // Então hoje, sem recompilar o wasm:
        //
        //     draft-simple .... alcançável, e por tabela: o wllama o escolhe
        //                       sozinho quando `spec_draft_model` está cheio
        //     draft-mtp ....... compilada, inalcançável  ← cabeça do revisor v2
        //     draft-eagle3 .... compilada, inalcançável
        //     ngram-cache ..... compilada, inalcançável  ← o único que ganhou
        //     ngram-mod ....... compilada, inalcançável
        //     ngram-simple .... compilada, inalcançável
        //
        // Fica a linha porque é inofensiva e porque o próximo a tentar merece
        // saber que este caminho já foi medido — duas vezes, nos dois pontos.
        speculative: params.spec_types ? { types: params.spec_types } : void 0,
        spec_draft_ngl: params.spec_draft_ngl,
        spec_draft_n_max: params.spec_draft_n_max,
        spec_draft_n_min: params.spec_draft_n_min,
        spec_draft_p_min: params.spec_draft_p_min,
        spec_draft_threads: params.spec_draft_threads,
        spec_draft_threads_batch: params.spec_draft_threads_batch,
        kv_overrides_keys: params.kv_overrides ? Object.keys(params.kv_overrides) : void 0,
        kv_overrides_vals: params.kv_overrides ? Object.values(params.kv_overrides) : void 0,
        reasoning_budget_tokens: params.reasoning_budget_tokens,
        reasoning_budget_message: params.reasoning_budget_message,
        reasoning_format: params.reasoning_format,
        skip_chat_parsing: params.skip_chat_parsing,
```
