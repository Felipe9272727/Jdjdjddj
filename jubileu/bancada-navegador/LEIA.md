# Bancada de navegador — o runtime N-gram, medido de verdade

Esta pasta existe porque durante três rodadas o diagnóstico do Andar 10 foi
feito por leitura de código e por print de celular, e as duas primeiras
conclusões estavam erradas. O que resolveu foi abrir um Chromium de verdade.

Ela **não** faz parte do jogo: nada aqui é importado por `src/`, nada vai para o
`dist/`. É ferramenta de investigação, e roda na máquina de quem desenvolve.

## O que ela mede

`ngram.html` carrega o par `public/wllama-espec/{index.js,wllama.wasm}` — o
mesmo que vai para o jogo — e alterna, no MESMO modelo e na MESMA máquina:

- **normal** — sem parâmetro nenhum de especulativa;
- **ngram** — `spec_draft_model: 'types:ngram-cache'`.

Os dois lados geram com `temperature: 0` e `top_k: 1`. Isso é de propósito: a
decodificação especulativa promete o MESMO texto, mais rápido. Se os textos
saírem diferentes, não é otimização, é perda de inteligência — e a bancada
falaria antes do jogador.

Ela também imprime `draft_n` / `draft_n_accepted`, direto do llama.cpp: quantos
tokens o n-grama propôs e quantos o modelo aceitou.

## Como rodar

```bash
# 1. um GGUF pequeno qualquer, uma vez só (este tem 386 MB)
curl -sSL -o /tmp/modelo.gguf \
  https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q8_0.gguf
cp /tmp/modelo.gguf bancada-navegador/modelo.gguf

# 2. servidor com COOP/COEP — sem isolamento não há SharedArrayBuffer,
#    e sem SharedArrayBuffer o wllama multithread não sobe
node bancada-navegador/servidor.mjs "$PWD/bancada-navegador" 8710 &

# 3. o navegador de verdade
node bancada-navegador/rodar.mjs http://127.0.0.1:8710/ngram.html 400000
```

`?prompt=conversa` troca o texto repetitivo pelo diálogo — a diferença entre os
dois é o resultado mais importante que esta bancada já deu (veja abaixo).

O `wllama-espec/` é lido de `../public/wllama-espec` por link; se o servidor
reclamar, copie a pasta para dentro de `bancada-navegador/`.

## O que ela já encontrou

**1. A carga do N-gram não era lenta: era eterna.** O emscripten desta build
ignora `Module.mainScriptUrlOrBlob` e cria cada pthread a partir de
`_scriptName`, que dentro de um Worker de Blob aponta para o próprio worker do
wllama — sem o bootstrap de pthread. Os workers subiam, o handshake nunca
fechava, `addRunDependency('loading-workers')` nunca era removido e
`onRuntimeInitialized` nunca disparava. Medido aqui: `runDeps=1` aos 4,8 s e
ainda 1 depois de 90 s. No celular do Felipe era o mesmo travamento — 1280 s
numa vez, 402 s na outra, e nenhuma das duas ia terminar.

O conserto está em `public/wllama-espec/index.js`, são duas linhas, e um teste
em `src/__tests__/floor10Especulativa.test.ts` reprova qualquer rebuild que as
perca.

**2. O ganho do n-grama depende inteiramente do texto** (SmolLM2-360M Q8, 4
threads, 3 rodadas de cada lado, greedy, mesmo modelo em cache):

| prompt | normal | n-gram | ganho | rascunho aceito |
|---|---|---|---|---|
| repetitivo (o modelo ecoa o contexto) | 11,57 tok/s | 16,75 tok/s | **1,45×** | 68/81 |
| conversa (pergunta e resposta livre) | 11,87 tok/s | 11,90 tok/s | **1,00×** | 18/27 |

O texto saiu **idêntico** nos dois casos, nas seis rodadas. Ou seja: a promessa
de "mesma inteligência" se confirma, e a de velocidade só vale quando a resposta
repete pedaços do que já está no contexto. Em conversa livre o n-grama não
atrapalha, mas também não paga.
