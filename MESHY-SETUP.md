# Conectar o Meshy MCP (pra o Claude gerar assets 3D direto)

O `.mcp.json` na raiz já declara o servidor Meshy. Falta só o teu lado:

## Passos (você)
1. **Chave da API do Meshy** — pegue em meshy.ai (Settings → API). Ela começa com `msy_`.
2. **Adicione como variável de ambiente** nas configurações do seu ambiente do
   Claude Code na web (claude.ai/code → o ambiente deste repo → Environment
   variables): `MESHY_API_KEY = msy_...`.
   - ⚠️ Ainda **não existe um cofre de segredos**: variáveis de ambiente ficam
     visíveis pra quem edita o ambiente. Sua chave, sua decisão. NÃO commite a
     chave no repo — o `.mcp.json` já a lê da env via `${MESHY_API_KEY}`.
3. **Acesso de rede**: o ambiente precisa alcançar `api.meshy.ai` (e o registry
   do npm pra baixar o pacote). Se seu ambiente usa rede restrita, libere esses
   destinos na allowlist.
4. **Inicie uma NOVA sessão** neste branch. MCP carrega no início da sessão — a
   sessão atual não pega. Na sessão nova o Claude terá as ferramentas
   `meshy_text_to_3d`, `meshy_image_to_3d`, `meshy_remesh`, etc.

## Tarefa pendente pro Claude da próxima sessão
**Elevador quebrado do Andar 9.** A colisão JÁ está pronta: uma caixa sólida em
`(0,-13)`, footprint `6.5 × 6.0`, em `_WALLS_FLOOR9` (`jubileu/src/constants.ts`),
guardada por `jubileu/src/__tests__/elevProbe.test.ts`. O `<ElevatorInterior>`
(`jubileu/src/Elevator.tsx`) é renderizado em `(0,-13)` em todo nível menos o 7.

Gerar com Meshy um **elevador enferrujado, portas emperradas meio-abertas,
coberto de vinhas e musgo, empoeirado** — GLB low-poly (~5–15k triângulos),
textura baked (~1024px), <3MB. Depois:
1. Baixar o GLB pra `jubileu/src/assets/models/elevadorQuebrado.glb`.
2. Importar (Vite inlina como data-URI no build single-file) + `useGLTF`.
3. Renderizar SÓ no Andar 9 (substituindo/cobrindo o `<ElevatorInterior>` genérico
   nesse nível), escala/rotação pra casar o footprint `6.5×6.0×~4` em `(0,-13)`,
   porta virada pro `+z`.
4. `npm run build && node inline-build.mjs`, conferir o tamanho do `index.html`.

Pipeline de assets confirmado: GLBs vão em `src/assets/`, carregam com `useGLTF`
(ver `Bot.tsx`), e o Vite inlina no bundle. Manter low-poly por causa do
single-file de ~77MB.
