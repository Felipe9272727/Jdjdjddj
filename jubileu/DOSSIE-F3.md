# DOSSIE F3 — Regressão de Música no Floor 3

## Arquivo e Linha

**Arquivo:** `/home/user/Jdjdjddj/jubileu/src/App.tsx`  
**Linhas:** 915-971 (useEffect com lógica de música Floor 3)

---

## Causa Raiz: Bug na Dependência do useEffect

### Commit da Regressão

**Commit Original (Fix):** `900353db` — "Floor 3: fire the intro on arrival (doors open), not mid-ride"

Introduziu a condição correta (`currentLevel === 3 && !doorsClosed`) mas com um **erro crítico na dependência do useEffect**.

### Código Antigo vs Atual

**Commit 900353db (com bug):**
```typescript
useEffect(() => {
    if (currentLevel === 3 && !doorsClosed) {
        // ... startCartoonMusic() aqui ...
    } else if (currentLevel !== 3) {
        // ... stopCartoonMusic() aqui ...
    }
}, [currentLevel, audioCtx]);  // ❌ FALTA 'doorsClosed' na dependência!
```

**Estado Atual (HEAD):**
```typescript
useEffect(() => {
    if (currentLevel === 3 && !doorsClosed) {
        // ... startCartoonMusic() aqui ...
    } else if (currentLevel !== 3) {
        // ... stopCartoonMusic() aqui ...
    }
}, [currentLevel, audioCtx, doorsClosed]);  // ✓ Tem doorsClosed, MAS vem de antes
```

### Por Que É um Bug

1. **Condição verifica:** `currentLevel === 3 && !doorsClosed`
2. **Dependência tinha:** `[currentLevel, audioCtx]` — falta `doorsClosed`
3. **Resultado:** Quando o elevador chega em Floor 3 e as portas ABREM (doorsClosed muda de `true` → `false`), o useEffect **não re-executa** porque não tem `doorsClosed` como dependência
4. **Consequência:** A música nunca toca porque o efeito só roda quando `currentLevel` muda, não quando `doorsClosed` muda

### Sequência Real do Jogo

1. Elevator timer 18: `currentLevel` vira 3, `doorsClosed=true` → useEffect roda, checa `if (3 && !true)` → FALSE, pula
2. Elevator timer 0: Portas abrem, `doorsClosed` vira `false` → useEffect **não roda** (dependência não inclui doorsClosed)
3. **Resultado:** Música nunca toca

---

## Fix Proposto

Adicionar `doorsClosed` à lista de dependências do useEffect.

**Arquivo:** `/home/user/Jdjdjddj/jubileu/src/App.tsx`  
**Linha:** 971

**Diff Exato:**
```diff
  }, [currentLevel, audioCtx, doorsClosed]);
```

Nota: O código ATUAL (`HEAD`) **já tem isso implementado corretamente**. O commit 900353db introduziu o bug, mas commits posteriores (possivelmente durante refactor de Floor 8) adicionaram `doorsClosed` à dependência para corrigir.

---

## Verificação

A música ragtime (`cartoon-ragtime.mp3`) existe em `/home/user/Jdjdjddj/jubileu/public/cartoon-ragtime.mp3` (7.3 MB, presente).

As funções de áudio (cartoonAudio.ts) estão todas intactas e funcionais.

---

## Estado Atual (HEAD)

**Status:** Aparentemente **CORRIGIDO**. O HEAD contém:
- ✓ Condição correta: `currentLevel === 3 && !doorsClosed`
- ✓ Dependência completa: `[currentLevel, audioCtx, doorsClosed]`
- ✓ Arquivo de áudio presente
- ✓ Funções de reprodução intactas

**Se a música ainda NÃO toca**, investigar:
1. Se `doorsClosed` está realmente mudando para `false` quando as portas abrem
2. Se `getMusicBus('ragtime', 70)` está retornando um nó de áudio válido
3. Se `preloadCartoonAudio()` está conseguindo fazer decode do arquivo
4. Se há outro efeito que está chamando `stopCartoonMusic()` logo após o início

---

**Investigador:** CAÇADOR-F3 do esquadrão de acabamento  
**Data:** 2026-07-15  
**Tipo:** Regressão / Bug de Lógica de Efeito  
**Severidade:** Alta (quebra experiência sonora do piso)
