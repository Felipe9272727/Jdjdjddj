# DOSSIÊ CAÇADOR-F6: BLOCO DE GELO — SUÍTE 612

**Critério**: "no floor 6, a parte do GELO poderia ser mais realista, e queria ver uma ANIMAÇÃO melhor"  
**Data**: 2026-07-15  
**Investigador**: CAÇADOR-F6 (equipe de acabamento)

---

## 1. LOCALIZAÇÃO E ESTADO ATUAL

### Geometria
- **Arquivo**: `/home/user/Jdjdjddj/jubileu/src/Floor6Props.tsx` (linhas 105–109)
- **Tipo**: `BoxGeometry args={[0.26, 0.2, 0.2]}` — cubo simples, 26cm × 20cm × 20cm
- **Posição em-jogo**: Geladeira (prateleira do congelador), posição de entrega [5.5, 1.5, -1.85]
- **Nota interior**: Uma caixa escura (F6M.dark, o relé congelado) dentro do gelo

### Material Atual
**Arquivo**: `/home/user/Jdjdjddj/jubileu/src/Floor6Textures.ts` (linha 859)  
```typescript
ice: new THREE.MeshPhysicalMaterial({
    color: '#bfe2ec',           // azul-claro pálido (ok)
    transparent: true,
    opacity: 0.78,              // semitransparente
    roughness: 0.12,            // liso (realista para gelo)
    transmission: 0,            // ❌ SEM REFRAÇÃO FÍSICA
    envMapIntensity: 1.3        // reflete ambiente
})
```

**Problemas**:
- `transmission: 0` desativa refração — o gelo fica opaco como plástico fosco
- Nenhuma textura/detalhe (sem rachaduras, sem variação)
- Material estático (não muda com derretimento)

### Animação de Derretimento
**Arquivo**: `/home/user/Jdjdjddj/jubileu/src/Floor6Wet.tsx` (linhas 592–601)  
```typescript
const melt01 = f6.melting ? Math.min(1, f6.meltT / 9) : 0;  // 0→1 em 9 segundos
if (show) {
    const s = 1 - melt01 * 0.92;                     // encolhe 92%
    ice.current.scale.set(s, s * (1 - melt01 * 0.3), s);  // Y encolhe +30%
    ice.current.position.y = 1.04 - melt01 * 0.025;        // desce 2.5cm
}
```

**Problemas**:
- Só animação de escala + posição (muito simples)
- Falta opacity: continua opaco enquanto derrete
- Falta roughness: não fica molhado/cristalino
- Nenhum efeito de cristais crescendo ou gotas caindo

---

## 2. PROPOSTA UPGRADE REALISTA

### Material Melhorado (não quebra mobile)
Modificar **Floor6Textures.ts:859** para:
```typescript
ice: new THREE.MeshPhysicalMaterial({
    color: '#bfe2ec',
    transparent: true,
    opacity: 0.65,              // reduz: mais cristalino
    roughness: 0.12,
    transmission: 0.85,         // 🔑 ATIVA refração física (como vidro/gelo real)
    ior: 1.31,                  // índice refração do gelo autêntico
    metalness: 0.05,            // 🔑 pequeno brilho especular (cristais)
    envMapIntensity: 1.3,
    // opcional (pode desabilitar se mobile frear):
    // thickness: 0.1          // só se MeshPhysicalMaterial suportar
})
```

**Benefício**: transmission ativa refração/dispersão sem overhead de shader custom. MeshPhysicalMaterial o compila para WebGL nativo.

### Textura Procedural de Rachaduras
Adicionar a **Floor6Textures.ts** (após função `dataTex`):
```typescript
/** Texture canvas: rachaduras de gelo (Voronoi simples + noise). */
const drawIceCracks: Draw = (ctx, W, H) => {
    const r = rng(42);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);  // branco (neutral)
    // linhas recurvas (rachaduras principais)
    const pts = Array.from({ length: 3 }, () => ({
        x: r() * W, y: r() * H,
        dx: (r() - 0.5) * 0.8, dy: (r() - 0.5) * 0.8
    }));
    ctx.strokeStyle = 'rgba(150,170,180,0.4)';  // azul-cinzento
    ctx.lineWidth = 1.5;
    pts.forEach(p => {
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        for (let i = 0; i < 6; i++) {
            p.x += p.dx * W * 0.15; p.y += p.dy * H * 0.15;
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    });
    // ruído fino (superfície de gelo)
    for (let i = 0; i < 800; i++) {
        const a = 128 + r() * 60;
        ctx.fillStyle = `rgb(${a},${a},${a})`;
        ctx.fillRect(r() * W, r() * H, 1, 1);
    }
};

export const iceNormal = dataTex(256, 256, drawIceCracks, 1, 1);
```

Aplicar ao material:
```typescript
ice: new THREE.MeshPhysicalMaterial({
    // ... (anterior)
    normalMap: iceNormal,       // rachaduras como relevo
    normalScale: new THREE.Vector2(0.3, 0.3),  // sutil
})
```

**Custo**: Uma tela 256×256 renderizada 1×. Mobile suporta.

### Animação de Derretimento Melhorada
Modificar **Floor6Wet.tsx**, na função `useFrame` da Stove (após linha 601):
```typescript
if (ice.current) {
    const show = f6.melting;
    ice.current.visible = show;
    if (show) {
        const s = 1 - melt01 * 0.92;
        ice.current.scale.set(s, s * (1 - melt01 * 0.3), s);
        ice.current.position.y = 1.04 - melt01 * 0.025;
        
        // 🔑 NOVO: animar material
        if (ice.current.children[0]?.material) {
            const mat = ice.current.children[0].material as THREE.MeshPhysicalMaterial;
            mat.opacity = 0.65 - melt01 * 0.35;      // fica aquoso (0.65 → 0.30)
            mat.roughness = 0.12 + melt01 * 0.35;   // fica molhado/fosco (0.12 → 0.47)
            mat.needsUpdate = true;
        }
    }
}
```

**Efeito**: Gelo vai ficando progressivamente mais transparente e molhado enquanto derrete.

### Opcional: Brilho de Gotas (Futuro Aprimoramento)
Se quiser gotas derretendo no próximo sprint:
- Usar 2–3 pequenas meshes (sphereGeometry, r=0.015) posicionadas aleatoriamente
- AnimarY (caem) e scale (encolhem) com delay
- Acionar `f6.melting && Math.random() < melt01 * 0.3`

---

## 3. PLANO DE IMPLEMENTAÇÃO

| Arquivo | Linha | O quê | Esforço |
|---------|-------|-------|---------|
| Floor6Textures.ts | 859 | Trocar material: transmission 0→0.85, ior, metalness, normal map | 5 min |
| Floor6Textures.ts | 105 | Adicionar `drawIceCracks` + `iceNormal` const | 10 min |
| Floor6Wet.tsx | 601 | Animar opacity + roughness no `useFrame` | 5 min |
| **Total** | — | — | **20 min** |

**Mobile performance**: Sem impacto. Transmission em MeshPhysicalMaterial é WebGL nativo (não shader custom). Normal map é estático.

---

## 4. RESUMO TÉCNICO

**Estado atual**: BoxGeometry liso, material opaco (transmission=0), animação só escala.

**Upgrade proposto**:
1. Material com `transmission: 0.85` (refração como vidro de verdade)
2. Normal map procedural com rachaduras sutis
3. Animação: opacity 0.65→0.30 + roughness 0.12→0.47 durante derretimento
4. Sem libs novas; performance OK para mobile

**Realismo alcançado**:
- Gelo cristalino com refração (luz passa através)
- Brilho especular (cristais)
- Rachaduras texturizadas (não geométricas)
- Transição convincente para "água" conforme derrete
- Compatível com estilo *realism pass* do jogo (texturas 512px + PBR)

---

**Assinado**: CAÇADOR-F6  
**Status**: Dossiê pronto. Aguardando deploy.
