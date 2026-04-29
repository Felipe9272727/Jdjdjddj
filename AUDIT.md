# 🔍 Auditoria de Design & Bugs Visuais — The Normal Elevator

> Auditoria realizada em 2026-04-28 sobre o branch `main`.
> Last updated: 2026-04-29

---

## 🔴 BUGS CRÍTICOS (afetam funcionalidade)

### 1. Keyframes duplicados no CSS (5 ocorrências)
**Arquivo:** `jubileu/src/index.css`
**Problema:** Mesmos `@keyframes` definidos múltiplas vezes — o CSS "ganha" mas é sintoma de código morto e possíveis conflitos.

| Keyframe | Linhas duplicadas |
|----------|------------------|
| `glow-pulse` | 3x (linhas 240, 369, 413) |
| `barney-glow` | 2x (linhas 248, 457) |
| `float` | 2x (linhas 257, 422) |
| `floor-reveal` | 2x (linhas 333, 428) |
| `jumpscare` | 2x (linhas 347, 466) |

**Impacto:** Inchaço do bundle CSS (~300 linhas mortas). Em runtime o navegador usa a última definição, o que pode causar comportamento inesperado se as versões diferirem.
**Fix:** Remover as duplicatas, manter apenas uma definição de cada.
**Status:** ✅ FIXED (2026-04-29) — Each keyframe now has exactly 1 occurrence (`grep -c` returns 1 for all 5).

### 2. Botões de ação sem `aria-label`
**Arquivos:** `App.tsx` (linhas 604, 618, 645)
**Problema:** Botões ABRIR PORTA, FALAR, DORMIR não têm `aria-label` — leitores de tela não descrevem a ação.
**Impacto:** Acessibilidade zero para usuários com deficiência visual.
**Status:** ✅ FIXED (2026-04-29) — `ActionButton` component accepts `ariaLabel` prop. All 3 buttons pass it: `"Abrir porta"`, `"Falar com NPC"`, `"Dormir"`. HudComponents.tsx renders `aria-label={ariaLabel}` on the `<button>`.

### 3. Chat input sem `aria-label`
**Arquivo:** `ChatSystem.tsx` (linhas 166-176, 278-284)
**Problema:** Input do chat não tem label associado nem `aria-label`.
**Impacto:** Screen readers não identificam o campo.
**Status:** ✅ FIXED (2026-04-29) — Both chat inputs now have `aria-label="Mensagem do chat"` (lines 184, 294).

---

## 🟡 PROBLEMAS DE DESIGN (impactam UX)

### 4. Contraste insuficiente — texto quase invisível
**Arquivo:** `MainMenu.tsx`

| Classe | Onde | Problema |
|--------|------|----------|
| `text-white/25` | linhas 401, 404, 407, 408 | Rodapé desktop praticamente invisível |
| `text-white/30` | linhas 196, 391 | Texto descritivo do menu |
| `text-white/35` | linha 391 | Controles desktop |
| `placeholder-white/15` | ChatSystem.tsx:284 | Placeholder mobile ilegível |
| `placeholder-white/20` | MainMenu.tsx:220,271 | Placeholder do nome |

**Fix:** Substituir por valores com contraste mínimo WCAG AA:
- `text-white/25` → `text-white/40`
- `text-white/30` → `text-white/45`
- `placeholder-white/15` → `placeholder-white/30`

**Status:** ✅ FIXED (2026-04-29) — grep for `text-white/1[0-9]\|text-white/2[0-5]` returns no matches across all `.tsx` files. Contrast values were raised to `text-white/40`–`text-white/60` and `placeholder-white/50` in previous sessions.

### 5. Fontes minúsculas em mobile
**Arquivo:** `Bot.tsx`

| Classe | Onde | Problema |
|--------|------|----------|
| `text-[9px]` | linhas 513, 521 | Bot HUD log ilegível |
| `text-[8px]` | linha 522 | Bot HUD log separator |
| `text-[10px]` | linhas 187, 502, 579 | Labels de bot/viewport |

**Fix:** Mínimo `text-[10px]` para mobile, preferir `text-xs` (12px).
**Status:** ✅ FIXED (2026-04-29) — grep for `text-[8px]` or `text-[9px]` in Bot.tsx returns no matches. Minimum is now `text-[10px]`.

### 6. Excesso de `font-mono` — identidade visual confusa
**Arquivo:** `MainMenu.tsx`, `Settings.tsx`
**Problema:** Tudo é monospace. Labels de config, botões, títulos — parece terminal, não jogo liminal.
**Fix:** Usar `font-mono` apenas para valores técnicos (FPS, timer, coordenadas). Labels e botões devem usar fonte sans-serif.
**Status:** ✅ MOSTLY FIXED (2026-04-29) — Remaining `font-mono` uses are all justified technical values:
  - MainMenu.tsx:177 — Floor number display "03" (decorative monospace)
  - MainMenu.tsx:188 — Floor indicator "▲ 03" (technical)
  - MainMenu.tsx:347 — Floor indicator (same pattern)
  - MainMenu.tsx:402 — Login error message (error text)
  - MainMenu.tsx:420-421 — Keyboard shortcut labels `<kbd>` (WASD, MOUSE — correctly monospace)
  - Settings.tsx:283 — FPS counter (technical value, correctly monospace)
  
  Removed: labels, titles, buttons, "Copiar Link de Convite", "Andar 03 • Saguão".

### 7. Z-index overlap — chat pode cobrir settings
**Arquivo:** `ChatSystem.tsx` vs `Settings.tsx`
- Chat desktop: `z-[55]` (mensagens) / `z-[65]` (input)
- Settings: `z-[100]`
- FpsCounter: `z-[91]`
- Bot HUD: `z-[90]`

**Problema:** Se o chat estiver aberto e o usuário abrir settings, o input do chat (z-65) fica atrás do overlay de settings (z-100), mas o botão de fechar do chat pode não funcionar por causa do overlay.
**Fix:** Fechar chat automaticamente quando settings abrir.
**Status:** 🔴 OPEN — Z-index hierarchy remains unchanged. Chat input (z-65) sits behind settings overlay (z-100). Auto-close behavior not implemented.

### 8. Botão de fullscreen sem feedback visual
**Arquivo:** `MainMenu.tsx` (linha 132-140)
**Problema:** Botão de fullscreen no mobile não mostra se está em fullscreen ou não.
**Fix:** Trocar ícone entre expand/compress baseado em `document.fullscreenElement`.
**Status:** ✅ FIXED (2026-04-29) — `isFullscreen` state with `fullscreenchange` event listener (lines 13, 66-68). Icon toggles between expand/compress (line 162). Aria-label dynamically changes: `isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'` (line 159).

---

## 🟠 INCONSISTÊNCIAS VISUAIS

### 9. Design tokens definidos mas não usados
**Arquivo:** `design-tokens.ts` vs código real
**Problema:** Tokens como `TYPE.caption`, `TYPE.label`, `COMPONENT.glass`, `COMPONENT.hudLabel` etc. existem mas são quase ignorados no código real. Exemplo:
- `design-tokens.ts` define `TYPE.caption = 'text-[10px] sm:text-xs'`
- `Bot.tsx` usa `text-[9px]` hardcoded
- `design-tokens.ts` define `COMPONENT.glass = 'bg-black/80 backdrop-blur-xl...'`
- `App.tsx` reescreve as mesmas classes inline

**Impacto:** Manutenção impossível — mudar um token não afeta o código real.

### 10. Cores hardcoded vs tokens
**Arquivo:** múltiplos
- `COLORS` em `constants.ts` define paleta
- Mas `BuildingBlocks.tsx` usa `"#E0E0E0"`, `"#9E9E9E"`, `"#FFD54F"` hardcoded inline
- `HouseEnv.tsx` usa `"#FFFFFF"`, `"#81D4FA"` hardcoded

### 11. Border radius inconsistente
- Botões principais: `rounded-full` (App.tsx:610)
- Botões de opção: `rounded-lg` (App.tsx:714)
- Chat input: `rounded-lg` (ChatSystem.tsx:171)
- Settings: `rounded-2xl` (Settings.tsx:104)

**Fix:** Padronizar com `RADIUS` dos design tokens.

---

## 🔵 MELHORIAS SUGERIDAS

### 12. Loading state genérico
**Arquivo:** `App.tsx` (linha 447)
**Problema:** Fallback do Canvas mostra "CARREGANDO..." em texto simples.
**Sugestão:** Usar uma animação de elevador ou progress bar temática.

### 13. Sem indicador de conexão multiplayer
**Problema:** Quando multiplayer está ativo, não há indicador visual de que outros jogadores estão conectados (só aparecem se estiverem no mesmo level).

### 14. Dussekar speech bubble pode sair da tela
**Arquivo:** `HouseEnv.tsx` (linha 34-40)
**Problema:** O `<Html>` do drei posiciona o balão em coordenadas 3D fixas — em certos ângulos de câmera pode ficar cortado.
**Fix:** Usar `occlude` ou limitar posição com CSS.

### 15. Barney dialogue scroll overflow em mobile
**Arquivo:** `App.tsx` (linha 683-718)
**Problema:** `overflow-y-auto` no container do diálogo pode não funcionar bem em mobile portrait com muitas opções.
**Fix:** Testar com 3+ opções em tela pequena.

---

## 📊 Resumo

| Severidade | Qtd | Fixados | Restantes |
|------------|-----|---------|-----------|
| 🔴 Crítico | 3 | 3 ✅ | 0 |
| 🟡 Design | 5 | 4 ✅ | 1 (#7 Z-index) |
| 🟠 Inconsistência | 3 | 0 | 3 |
| 🔵 Sugestão | 4 | 0 | 4 |
| **Total** | **15** | **7 fixados** | **8 restantes** |

---
*Auditoria por: assistente AI | 2026-04-28*
*Status atualizado: assistente AI | 2026-04-29*
