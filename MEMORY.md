# 🧠 MEMORY.md — Contexto Compartilhado

> **Este arquivo serve como memória persistente para o assistente AI.**
> Leia este arquivo no início de qualquer sessão para entender o projeto e o contexto do Felipe.

---

## 👤 Sobre o Felipe

- **GitHub:** Felipe9272727
- **Idioma:** Português (Brasil)
- **Comunicação:** Direto, informal, sem frescura
- **Projeto principal:** Jogo 3D multiplayer chamado **"The Normal Elevator"**

---

## 🎮 O Projeto: The Normal Elevator

Um jogo 3D multiplayer estilo Roblox, jogável direto no navegador.

### Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + TypeScript |
| 3D Engine | Three.js (via @react-three/fiber e @react-three/drei) |
| Multiplayer | Firebase Firestore (realtime sync) |
| Auth | Firebase Auth |
| Build | Vite |
| Styling | Tailwind CSS v4 |
| AI Features | Google Gemini API (via @google/genai) |
| Animações | Motion (Framer Motion) |

### Estrutura do Repo (`Jdjdjddj`)

```
/
├── index.html              ← Build principal (103k linhas, single-file)
├── index-18.html           ← Build anterior
├── index-readable.html     ← Build legível/comentada
├── jubileu/                ← Código fonte (app separada)
│   ├── src/
│   │   ├── App.tsx         ← App principal
│   │   ├── main.tsx        ← Entry point
│   │   ├── Player.tsx      ← Lógica do jogador
│   │   ├── Multiplayer.tsx ← Sync Firebase
│   │   ├── Elevator.tsx    ← Mecânica do elevador
│   │   ├── Bot.tsx         ← NPCs/bots
│   │   ├── UI.tsx          ← Interface/HUD
│   │   ├── MainMenu.tsx    ← Tela inicial
│   │   ├── Settings.tsx    ← Configurações
│   │   ├── AudioEngine.tsx ← Sistema de som
│   │   ├── LobbyEnv.tsx    ← Ambiente do lobby
│   │   ├── HouseEnv.tsx    ← Ambiente da casa
│   │   ├── Furniture.tsx   ← Móveis/objetos
│   │   ├── BuildingBlocks.tsx ← Blocos de construção
│   │   ├── Materials.tsx   ← Materiais/texturas
│   │   ├── RemotePlayer.tsx← Jogadores remotos
│   │   ├── physics.ts      ← Física do jogo
│   │   └── constants.ts    ← Constantes globais
│   ├── vite.config.ts
│   ├── firebase-applet-config.json
│   ├── firebase-blueprint.json
│   ├── firestore.rules     ← Regras de segurança
│   └── package.json
└── Jdjdjddj.zip            ← Pacote do projeto
```

### Firebase

- **Project ID:** `meu-jogo-62061`
- **Firestore Database:** `(default)`
- **Features:** Posições de jogadores em tempo real, sync multiplayer
- **Security:** Regras que garantem que cada jogador só atualiza sua própria posição

---

## 📋 Estado Atual (Abril 2025)

### Últimas mudanças (git log)
- Fixes de proporção e legibilidade em landscape
- Bug fixes via CodeRabbit analysis
- Rebuilds do index.html com todas as correções
- FOV smooth transition, HUD panel width, particles stability
- Fix crítico no inline-build.mjs (type='module')

### O que o Felipe está fazendo
- Desenvolvendo um jogo 3D multiplayer no estilo Roblox
- Versão single-file (index.html) para deploy rápido
- Versão com código fonte (jubileu/) para desenvolvimento
- Usa AI Studio (Gemini) para features de IA no jogo

---

## 🤖 Como Ajudar o Felipe

### Estilo de trabalho
- **Aja, não pergunte** — Felipe prefere que o assistente faça ao invés de ficar pedindo confirmação
- **Seja direto** — sem enrolação, sem "ótima pergunta!"
- **Use português** — a comunicação é em PT-BR
- **Entenda o contexto** — leia os arquivos do projeto antes de sugerir mudanças

### Tarefas comuns
1. **Debugar** — ler código, identificar bugs, propor fixes
2. **Rebuildar** — gerar novos builds do index.html a partir do código fonte
3. **Melhorar** — propor melhorias de performance, UX, visual
4. **Deploy** — ajudar com deploy e configuração
5. **Multiplayer** — melhorar sync, reduzir lag, adicionar features

### Comandos úteis
```bash
# Clonar o repo
gh repo clone Felipe9272727/Jdjdjddj

# Rodar localmente (dentro de jubileu/)
cd jubileu && npm install && npm run dev

# Build
npm run build
```

---

## ⚠️ Regras de Segurança

- **NÃO armazenar tokens/senhas** neste arquivo
- **NÃO expor credenciais do Firebase** em texto plano fora do repo
- **NÃO compartilhar** este arquivo com pessoas não autorizadas
- O token GitHub é para uso do assistente apenas, via `gh auth login`

---

*Última atualização: 2026-04-27*
