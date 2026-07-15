# DOSSIÊ TÉCNICO — ANDAR 7 (NAVIO PIRATA)
## Investigação de Bugs — Felipe9272727

**Data**: 2026-07-15  
**Investigador**: CAÇADOR-F7 (Esquadrão de Acabamento)  
**Status**: Investigação concluída — 4 bugs mapeados com fixes propostos

---

## 1. MÃOS EM PRIMEIRA PESSOA — FLASHING/PISCAÇÃO

**Nível de Severidade**: MÉDIO (bug visual intermitente)

### Localização Exata
- **Arquivo Principal**: `/home/user/Jdjdjddj/jubileu/src/App.tsx:520`
- **Contexto**: Hook `useEffect` que finaliza intro do Floor 7

### Código Problemático
```typescript
// App.tsx:510-522
useEffect(() => {
  let id: ReturnType<typeof setTimeout> | undefined;
  if (f7IntroPrev.current && !f7Intro && currentLevel === 7) {
    setF7Settling(true);
    id = setTimeout(() => setF7Settling(false), 1800);
  }
  f7IntroPrev.current = f7Intro;
  return () => { if (id) clearTimeout(id); };
}, [f7Intro, currentLevel]);
// reacts one render late — that single frame was the FP hand still flashing in). Use
// this at every place the cutscene ends (natural onDone + manual skip).
```

### Causa Raiz
1. **Visibilidade controlada em**: `Floor7.tsx:1820` e `1859`
   ```typescript
   handsRef.current.visible = bucketState.held && b.elevFade() < 0.85;
   leftHandRef.current.visible = bucketState.held && b.elevFade() < 0.85;
   ```

2. **Problema**: Quando a intro termina (`f7Intro: true → false`), o `elevFade` sobe mas há um **frame de atraso**:
   - Frame N: `f7Intro` muda para `false`, mas `elevFade` ainda está baixo (<0.85)
   - Frame N+1: As mãos ficam visíveis (piscam) enquanto a transição de estado acontece
   - A dependência do `useEffect` em `App.tsx` reage um render DEPOIS que a mudança já ocorreu

3. **Contexto de Design**: O comentário em `App.tsx:520` já documenta isso: "that single frame was the FP hand still flashing in"

### Fix Proposto

**Opção A** (Preferida — sem alteração WASM):  
Em `Floor7.tsx:1819-1820`, adicionar gate mais estrito:
```typescript
// Linha 1819-1820, substituir:
handsRef.current.visible = bucketState.held && b.elevFade() < 0.85;
// Por:
handsRef.current.visible = bucketState.held && b.elevFade() < 0.85 && b.state() !== F7_STATE.FREE;
leftHandRef.current.visible = bucketState.held && b.elevFade() < 0.85 && b.state() !== F7_STATE.FREE;
```
**Efeito**: Mãos desaparecem imediatamente quando entramos em `ST_FREE` (elevator rematerializing), não piscam.

**Opção B** (Alternativa):  
Endurecer a visibilidade baseado em `elevFade` threshold (mudar 0.85 para 0.9 ou 0.95):
```typescript
handsRef.current.visible = bucketState.held && b.elevFade() < 0.90;  // mais severo
```

### Evidência Visual
- Frame onde piscam: enquanto intro-end cutscene transiciona
- Usuário relata: "A pior parte é a das MÃOS dele"

---

## 2. ELEVADOR — ORIENTAÇÃO INCORRETA AO REMATERIALIZAR

**Nível de Severidade**: ALTO (quebra de coerência narrativa)

### Localização Exata
- **Posição/Rotação**: `Floor7.tsx:1997`
  ```typescript
  <group ref={elevatorRef} name="elevCab" position={[0, 0, 5.2]} rotation={[0, 0.7, 0]}>
  ```
- **Posição**: [0, 0, 5.2] em ship-local (≈ [0, 0, 9.62] em world com FLOOR7_SCALE=1.85)
- **Rotação**: [0, 0.7, 0] radianos Y (~40.1°)

### Referências de Movimento
- `Floor7.tsx:1739`: Posição Y controlada por `elevFade` (sobe/desce)
- `Floor7.tsx:1886-1890`: Portas abrem quando `state === ST_FREE && elevFade > 0.95`

### Análise do Problema

**Convenção de Orientação** (em `Floor7.tsx:1200-1204`):
- Pirata authored facing +X (no modelo GLB)
- Brain usa convenção +Z = proa (bow), -Z = ré (stern)
- Transformação: `PIRATE_FACE_OFFSET = -π/2` converte +X → +Z

**Posicionamento Atual**:
- Elevador spawn: ELEV_Z = 5.2 (próximo à **proa**)
- Pirata quando rematerializa (ST_FREE): CAP_X = -0.45, CAP_Z = -5.3 (**helm/ré**)
- Comentário em `Floor7.tsx:1995`: "yawed so the doors face the off-bow look-back camera"

**O Problema Real**:
- Rotação Y = 0.7 foi tuned para a cutscene de look-back (câmera afastada)
- Quando elevator rematerializa em ST_FREE (linha em `floor7.c:373`), **está longe do pirata**
- O pirata está no **stern** (-Z, helm), mas elevador está na **proa** (+Z, 5.2)
- As portas (+Z) enfrentam a câmera, não o pirata ❌
- Pirata não vê o elevador reaparecendo de frente; vê a lateral

### Cálculo de Orientação Correta

Código WASM (`floor7.c:336-339`):
```c
case ST_DONE: {
    float k = f7_clamp01((S.stTimer - 0.8f) / 3.2f);
    S.capX = CAP_X + (HELM_X - CAP_X) * e;  // -0.45
    S.capZ = CAP_TALK_Z + (HELM_Z - CAP_TALK_Z) * e; // -5.3 (stern)
    S.capFace = 3.14159f;  // π = facing -Z (stern)
```

Vetor pirata→elevador em ST_FREE:
- Pirata: (-0.45, -5.3)
- Elevador: (0, 5.2)
- Vetor: (0.45, 10.5) — principalmente +Z (proa)
- atan2(0.45, 10.5) ≈ 0.043 rad (quase direto +Z)

**Rotação Correta**: ~0.0 ou π (180° de opposição)  
**Rotação Atual**: 0.7 (intermediária) ❌

### Fix Proposto

Em `Floor7.tsx:1997`, alterar a rotação:
```typescript
// Antes:
<group ref={elevatorRef} name="elevCab" position={[0, 0, 5.2]} rotation={[0, 0.7, 0]}>

// Depois:
<group ref={elevatorRef} name="elevCab" position={[0, 0, 5.2]} rotation={[0, 0.0, 0]}>
```

**Lógica**: Pirata está no stern (-Z), elevador na proa (+Z), portas devem enfrentar +Z direto, não virado para câmera de look-back.

**Alternativa** se o look-back da intro ficar ruim:  
Criar variável condicional:
```typescript
const elevRotY = (b.state() === F7_STATE.FREE) ? 0.0 : 0.7;
<group ref={elevatorRef} name="elevCab" position={[0, 0, 5.2]} rotation={[0, elevRotY, 0]}>
```

---

## 3. PIRATA ATRAVESSA PAREDE — AUSÊNCIA DE COLISÃO

**Nível de Severidade**: CRÍTICO (quebra física do jogo)

### Localização Exata
- **Brain**: `/home/user/Jdjdjddj/jubileu/wasm/floor7.c:1-441` (sem colisão implementada)
- **Movimento**: linhas 200-349 (switch de estados ST_INTRO → ST_FREE)
- **Posição**: `capX`, `capZ` atualizadas via interpolação linear/smoothstep, **sem constraint**

### Colisores Existentes
Em `/home/user/Jdjdjddj/jubileu/src/constants.ts:317-343`:
```typescript
const _WALLS_FLOOR7 = (() => {
    const S = FLOOR7_SCALE;
    const port = _F7_DECK_HALF.map(([x, z]) => [-x * S, z * S]);  // bulwark port side
    const star = [..._F7_DECK_HALF].reverse().map(([x, z]) => [x * S, z * S]); // bulwark starboard
    const loop = [...port, [0, 7.9 * S], ...star];
    const segs: number[][] = [];
    for (let i = 0; i < loop.length - 1; i++) 
        segs.push([loop[i][0], loop[i][1], loop[i + 1][0], loop[i + 1][1]]);
    // ...colliders para capstan, companionway, stern deckhouse, deck props...
})();
```

### O Problema
- **Player** tem colisão: `wallsForState(7, ...)` retorna `_WALLS_FLOOR7` (linhas 351)
- **Pirata (NPC)**: **nenhuma colisão implementada**
- Pirata se move apenas por interpolação WASM (Bezier smoothstep em `floor7.c:203`, `337`)
- **Nenhum teste against deck boundaries** durante movimento

### Movimento Pirata (floor7.c)
```c
// ST_INTRO: walk from bow to talk spot (linha 203)
S.capZ = CAP_BOW_Z + (CAP_TALK_Z - CAP_BOW_Z) * e;  // -2.0 → 2.2, sem clamp!

// ST_DONE: stride to helm (linha 336-337)
S.capX = CAP_X + (HELM_X - CAP_X) * e;  // 0.6 → -0.45
S.capZ = CAP_TALK_Z + (HELM_Z - CAP_TALK_Z) * e; // 2.2 → -5.3
```

Não há verificação `if (distToWall < pirateRadius)` em lugar nenhum.

### Fix Proposto

**Opção A** (Simples, código-side):  
Adicionar bouncing/clipping pré-render em `Floor7.tsx:1259-1264` (PirateCaptain):

```typescript
// Após calcular c (captain pos do WASM), antes de aplicar g.position:
const c = b.captain();
// clip captain to deck boundaries
let capX = c.x, capZ = c.z;
const S = FLOOR7_SCALE;

// bulwark half-widths (from floor7_geo.cpp's sheer curve)
// rough bounds: |x| < 1.9 when |z| < 4.5, taper at ends
const getMaxX = (z: number) => {
    const tz = (z + 7.0) / 15.2; // normalize to [0,1]
    // deck half-width lookup; hand-tuned approximation of deck outline
    if (tz < 0.43) return 1.7 + (1 - tz) * 0.3;  // stern taper
    if (tz > 0.50) return 1.4 - (tz - 0.50) * 0.2; // bow taper
    return 1.85; // mid-deck max width
};
const maxX = getMaxX(capZ);
capX = Math.max(-maxX, Math.min(maxX, capX));

g.position.set(capX, -lurch, capZ);
```

**Opção B** (Robusto, WASM-side):  
Em `floor7.c`, após cada movimento de pirata, adicionar:
```c
// Após atualizar S.capX, S.capZ
static void clamp_captain_to_deck(void) {
    float z = S.capZ;
    float maxX = (z > 4.5f) ? (1.4f - (z - 4.5f) * 0.2f) : 1.85f;
    if (S.capX > maxX) S.capX = maxX;
    if (S.capX < -maxX) S.capX = -maxX;
    // future: also clamp Z if needed
}
```
Chamar antes de cada `break` em `floor7.c:196-382`.

**Recomendação**: Opção A (mais rápida, código-side), pois não altera WASM compilado. Se comportamento físico estranho, migrar para Opção B.

---

## 4. LEME (SHIP'S WHEEL) — STATUS

**Nível de Severidade**: RESOLVIDO (leme já existe)

### Localização Exata
- **Renderização**: `Floor7.tsx:742-750`
- **Posição ship-local**: [0, 0.95, -6.8]
- **Posição world (com scale)**: [0, 1.7575, -12.58]

### Código Atual
```typescript
// Floor7.tsx:739-750
{/* binnacle: pedestal base for the helm (ship's wheel) */}
<mesh position={[0, 0.35, -6.8]} material={M.rail}><boxGeometry args={[0.5, 0.7, 0.4]} /></mesh>
{/* helm (ship's wheel) at the stern — repositioned atop the binnacle */}
<group position={[0, 0.95, -6.8]}>
    <mesh material={M.wheel}><torusGeometry args={[0.42, 0.06, 8, 18]} /></mesh>
    {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]} material={M.wheel}>
            <boxGeometry args={[0.06, 1.0, 0.06]} />
        </mesh>
    ))}
    <mesh material={M.metal}><cylinderGeometry args={[0.07, 0.07, 0.2, 8]} /></mesh>
</group>
```

### Análise
✅ **Leme já implementado**:
- Torus (aro): raio 0.42, espessura 0.06
- 6 raios (spokes): box geometry
- Eixo central: cylinder

✅ **Posição correta**: stern (ré), z = -6.8  
✅ **Associado ao pirata**: Pirata vai para HELM_X=-0.45, HELM_Z=-5.3 (próximo)  

### Observação Final
"O pirata ATRAVESSA A PAREDE" e "NÃO TEM UM LEME" são dois bugs separados:
- **Leme**: ✅ Existe e está bem colocado
- **Atravessamento**: ❌ Ausência de colisão (ver Bug #3 acima)

---

## RESUMO EXECUTIVO

| Bug | Arquivo | Linha | Severidade | Status |
|-----|---------|-------|-----------|--------|
| 1. FP Hands Flashing | App.tsx, Floor7.tsx | 520, 1820 | MÉDIO | Gate state check |
| 2. Elevator Orientation | Floor7.tsx | 1997 | ALTO | Trocar rotation Y: 0.7 → 0.0 |
| 3. Captain Collision | floor7.c (todo) | 200-349 | CRÍTICO | Adicionar clipping deck-side |
| 4. Ship's Wheel | Floor7.tsx | 742 | ✅ RESOLVIDO | Já existe |

## PRÓXIMAS AÇÕES
1. **Prioridade 1**: Fix #3 (captain clipping) — quebra física crítica
2. **Prioridade 2**: Fix #2 (elevator rotation) — visual/gameplay
3. **Prioridade 3**: Fix #1 (hand flashing) — cosmético
4. **Verificação**: Após fixes, testar cutscene look-back (pode sofrer com rotation change)

---

**Relatório preparado para**: Esquadrão de Acabamento — The Normal Elevator  
**Código**: CAÇADOR-F7  
**Timestamp**: 2026-07-15T12:00Z
