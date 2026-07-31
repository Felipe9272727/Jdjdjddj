# DOSSIÉ CAÇADOR-F4 — RETRATO DO PRIMEIRO RECEPCIONISTA

## 1. FLUXO DA CONVERSA (Floor 4, Sala "Beyond")

**Arquivo:** `/jubileu/src/Floor4Interact.tsx` (linhas 360-401)

A conversa ocorre no painel tipo "cinematic" aberto quando player clica no ponto `keeper` (F4_POINTS.id='keeper', x=8.7, room='beyond'). O componente renderiza:

1. **Background cinematic**: img fullscreen `keeperSceneUrl` (fogueira + cenário do breu, gerado proceduralmente em Floor4Scene2D.tsx:1118)
2. **Cinema bar**: fita preta sutil no topo (height: 34px)
3. **Dialogue band**: gradiente preto opaco na base (52% opacidade em 0%, crescente)
4. **Nome do falante**: amarelo (#FFD54F), tamanho 10, letra-spacing 3, "O PRIMEIRO RECEPCIONISTA"
5. **Texto com typewriter**: linha de fala em branco (#f4f0e6), tamanho 13.5, minHeight 48px, Component Type responsivo
6. **Grid de perguntas**: 2 colunas, botões sem estilo (background: none, border: none), texto 11.5px
   - Pergunta final (id='leave') ocupa ambas as colunas (gridColumn: 1 / -1)
   - Perguntas já feitas perdem opacidade (opacity: 0.42)

**UI Atual:** Apenas a imagem de fundo + texto sobre gradiente. **Sem retrato do personagem.**

## 2. PERSONAGEM — DESCRIÇÃO VISUAL & LORE

**Nome:** O Primeiro Recepcionista / O Zelador do Andar 4

**Papel:** Guardião solitário da memória do andar esquecido; foi o primeiro recepcionista do hotel antes do andar 4 ser deletado dos mapas e botões.

**Tom de fala** (linhas 206-207, f4Lore.ts):
> "O tom dele é o OPOSTO do Zelador: calmo, gentil, cansado. Falas CURTAS — duas, três frases — cada uma com um espinho dentro."

**Aparência** (codificada em Floor4Scene2D.tsx:1238-1296, keeperSceneUrl procedural pixel art):

- **Postura:** Ereto, formal, "a man who still stands like it's a shift" — pés juntos, posição clássica de atendente
- **Roupa:** 
  - Sapatos pretos, salto junto (formal wear)
  - Calça cinzenta-azulada (#33364a / #2c2f40), vincos marcados
  - Vest charcoal (#3a3d4a) com lapela coluna (#4a4e60)
  - Camisa branca (#eded8), gola legível
  - Gravata vermelha #a3242c, nó firme
  - Badge de latão (#c89a3c) no lado direito do vest
  
- **Mãos & Acessório:**
  - Mão esquerda (próxima) segura caneca de café creme (#d8d2c2)
  - Mão direita (afastada) relaxada ao lado
  
- **Cabeça & Rosto:**
  - Cabelo escuro (#33241a), bagunçado/tidy-gone-messy
  - **Bandage branco** (#e8e0c6 / #f4eede) envolvendo a cabeça, cobrindo o olho direito (linha 1287-1289)
  - **Mancha antiga de sangue seco** (#8a3a30) visível sob o bandage (linha 1290)
  - Rosto em 3/4 toward fire: tez tostada (#dca87a / #e8bc8c no lado iluminado)
  - Olho bom (esquerdo): expressivo, sobrancelha (#3a2a22), pupila (#43301e), com bolsa de cansaço
  - Traço de quase-sorriso (#8a5a48 / #a87a58, linha 1285)
  - Nariz em direção à luz (#b8835c)

**Essência visual:** Um homem que **ainda trabalha como se fosse seu turno**, apesar do hotel ter o esquecido. Uniforme impecável, ferida velha cicatrizada, olhar cansado mas gentil.

---

## 3. PROMPT SUGERIDO PARA RETRATO (Geração de Imagem AI)

```
Pixel art portrait, 200x200px, retro gaming style (16-bit era):

A weary hotel receptionist in his 50s, three-quarter view facing slightly left,
looking directly at the camera with a tired but kind expression. He wears a 
charcoal vest over a crisp white dress shirt with a crimson tie (knotted), 
small brass buttons visible. His dark, slightly mussed hair is partly covered 
by a cream-colored bandage wrapped around his head, obscuring his right eye; 
beneath the bandage, a faint old bloodstain is visible (#8a3a30). His left eye 
is warm and expressive, with a subtle hint of a smile despite the sadness. His 
skin is warm-toned (#dca87a), weathered by long nights. He holds a cream-colored 
enamel coffee mug in his left hand. The background is pure black or firelight-dark.

Style: pixel art, dithered, warm firelight palette (yellows, oranges, browns, 
deep reds), ordered dithering, 16px color band quantization. Monochromatic 
shadows. No fancy effects—pure retro aesthetic. Evokes visual novel dialogue 
portrait + the breu's isolation.
```

---

## 4. ESPECIFICAÇÃO TÉCNICA — FIX DE IMPLEMENTAÇÃO

**Arquivo a alterar:** `/jubileu/src/Floor4Interact.tsx`

**Linhas afetadas:** 360-401 (o bloco inteiro do `panel.kind === 'talk'`)

### Imports necessários (topo do arquivo):
```typescript
// Adicionar após linha 33:
import balconistPortrait from './assets/f4/balconista.jpg';
```

### Local exato da alteração (linhas 361-363):
Após a `<img src={keeperSceneUrl} ...>`, inserir:

```tsx
{/* Retrato do First Receptionist — visual novel style, só aparece quando ELE fala */}
{talkAnswer && (
    <img 
        src={balconistPortrait}
        alt="O Primeiro Recepcionista"
        style={{
            position: 'absolute',
            right: 'calc(env(safe-area-inset-right) + 20px)',
            bottom: 'calc(env(safe-area-inset-bottom) + 130px)',
            width: 180,
            height: 180,
            objectFit: 'cover',
            border: '3px solid #f4f0e6',
            borderRadius: 2,
            boxShadow: '0 8px 0 rgba(0,0,0,0.6), inset 0 0 12px rgba(255,200,100,0.1)',
            imageRendering: 'pixelated',
            animation: 'f4PortraitIn 0.3s ease-out',
            opacity: 0.95,
        }}
    />
)}
```

### Estilo adicional (inserir no `<style>` existente, linha 399):
```css
@keyframes f4PortraitIn { 
    from { opacity: 0; transform: scale(0.9) }
    to { opacity: 0.95; transform: scale(1) }
}
```

**Asset path:** `/jubileu/src/assets/f4/balconista.jpg` (será gerado/importado como retrato de ~200x200px)

### Comportamento:
- **Aparece quando:** `talkAnswer !== null` (i.e., player já fez uma pergunta e keeper respondeu)
- **Desaparece quando:** painel fecha ou nova pergunta é clicada (antes da resposta aparecer)
- **Posicionamento:** Canto inferior direito (simetria: prompt está à direita do canvas)
- **Tamanho:** 180×180px (não ocupa a linha de diálogo; fica acima)
- **Efeito:** Fade-in suave (0.3s), leve shadow dourado (sugestão de luz da fogueira)
- **Qualidade pixel:** `imageRendering: 'pixelated'` para manter coerência visual com o estilo procedural do fundo

---

## RESUMO — 8 LINHAS

**Floor 4, "Beyond": Primeira conversa com o Zelador do andar esquecido.** Componente `Floor4Interact.tsx` (linhas 360-401) renderiza cinematic fullscreen com keeperSceneUrl (fogueira) + diálogo em gradient na base. Personagem: homem formal com bandage nos olhos, cicatrizes antigas, cansado mas gentil—uniforme de recepcionista intacto, expressão de quase-sorriso. **Fix:** Importar `balconista.jpg` em `src/assets/f4/`, renderizar retrato 180×180 no canto inferior direito **só quando talkAnswer ≠ null**, com fade-in e shadow dourado de fogueira. **Prompt IA sugerido:** *Pixel art retro (16-bit), homem ~50 anos, vest charcoal + gravata vermelha, bandage branco no olho direito (sangue seco visível), pele tostada, expressão cansada-gentil, caneca de café—background escuro, paleta firelight (amarelos, laranjas, vermelhos profundos), dithering ordenado.*

