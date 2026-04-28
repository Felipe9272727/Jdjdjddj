# jubileu/test/

Build de teste — **não é o canônico**.

## O que está aqui

`index.html` rebuildado a partir do source atual de `main` (commit `51f3302`).

| Item | Tamanho |
|------|---------|
| `index.html` (este teste) | 3.94 MB |
| `../../index.html` (canônico) | 4.09 MB |
| `../../backup/index.html` (60fps original) | 4.09 MB |

## Por que existe

Pra comparar performance entre o build novo (do source atual) e o canônico
sem sobrescrever o que já está no ar.

## Como foi gerado

```bash
cd jubileu
npm ci          # respeita o lock; nunca npm install solto
npm run build
node inline-build.mjs    # gera ../index.html
mv ../index.html test/index.html
git checkout -- ../index.html    # restaura o canônico
```

## Versões embutidas (verificadas)

- Three.js REVISION 184
- React 19.2.5

Idênticas às do backup — confirma que a toolchain é reprodutível.

## ⚠️ Observação importante

Este build vem do source de `main`, que **NÃO inclui** os fixes de FPS feitos
na branch `claude/review-memory-backup-6Ua0Z`:

- ❌ `<Html occlude>` ainda presente em `Dussekar` e `RemotePlayer`
  (causa drops pra 5fps perto da loja)
- ❌ Sem `useGLTF.preload` do Dussekar (load inicial em 4fps)
- ❌ Quality profiles ainda não diferenciam atmosfera/overlay/lights

Pra ter os fixes acima, precisa mergear a branch `claude/review-memory-backup-6Ua0Z`
no main.
