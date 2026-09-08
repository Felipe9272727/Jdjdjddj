# Bancada independente do andar 10

Desenvolvimento do Nilo e da Sala 03:17 sem carregar o jogo principal.

## Rodar

Na pasta `jubileu`:

```sh
npm ci
npx vite --config vite.floor10.config.ts
```

Abra `/floor10.html`. No computador, use WASD e clique na sala para olhar; Esc libera o cursor. No celular, use o controle à esquerda e arraste a sala para olhar. A conversa pausa o movimento. `Recomeçar` reinicia somente esta sessão do andar.

```sh
npx tsc -p tsconfig.floor10.json
npx vite build --config vite.floor10.config.ts
node inline-build.floor10.mjs
```

A versão de teste é produzida em `floor10-preview/`, sem substituir o `index.html` do jogo. Os modelos de conversa continuam opcionais para completar o puzzle; o Nilo usa a mesma implementação de movimento, vontade, memória e conversa do módulo original.

## Escopo de trabalho

- `standalone.tsx`, `StandaloneControls.tsx`, `standalone.css`: entrada e controles exclusivos da bancada.
- `Floor10Module.tsx`, `Floor10Module.contract.ts`: conexão com qualquer host que use React Three Fiber.
- `Floor10Module.dependencies.json`: ponto de partida para localizar os componentes do andar e as dependências do Nilo. Consulte os arquivos necessários à tarefa, sem ler todos os andares.
- `../Floor10*`, `../NiloVisual.tsx`, `../floor10Redesign.css`: sala, personagem e interface.
- `../npc/`: implementação do Nilo. O módulo ainda compartilha utilitários comuns da base do projeto, identificados no manifesto; não é um pacote npm independente.
- `../../tools/floor10-smoke.mjs`: testa chat mobile, cooperação real, embarque e reinício, e rejeita carregamento de App, Player e outros andares.

## Reconectar depois

A bancada fica no branch `nilo/floor10-workshop`. Não faça merge de uma cópia antiga de `App.tsx` ou `Player.tsx` sobre o trabalho de outro agente.

Quando o usuário pedir a reintegração, parta do HEAD atualizado do jogo e transfira somente os arquivos de escopo do módulo. Resolva eventuais mudanças nas dependências compartilhadas antes de conectar:

```tsx
// Dentro do Canvas do jogo:
<Floor10Module
  active={currentLevel === 10}
  playerPositionRef={playerPositionRef}
  onExit={handleFloor10Exit}
/>

// Fora do Canvas, na interface do jogo:
<Floor10Interface active={currentLevel === 10} />
```

O host fornece a posição real do jogador e a transição do elevador. `onExit` só ocorre depois das duas trancas resolvidas e dos dois personagens dentro da cabine. A câmera, o movimento, o HUD e as transições do host não fazem parte da bancada. Ajuste a visibilidade do HUD do host enquanto a conversa estiver aberta, usando `useNpcOpen()`.

As dependências compartilhadas ainda podem exigir uma pequena conciliação futura; o contrato reduz a área de integração e evita substituir arquivos inteiros do jogo.
