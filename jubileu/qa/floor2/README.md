# Floor 2 — reservatório

Base: `d6d628445418e66eb32a11ac89ac094d066b9d82`, branch `agent/floor12-gpt-compare`, conferida via fetch e refs remotas em 26/09/2026. Melhorias isoladas na branch `agent/floor2-overhaul-0925`. O `index.html` da raiz permanece intacto conforme orientação do usuário: esta entrega publica fontes.

## Mudanças

- Água circular com ondas nos dois eixos, normais derivadas da altura, ondulação de entrada, borda de espuma e reflexão estilizada da caverna; removido o espelho que renderizava novamente toda a cena.
- Rochas menos especulares, iluminação e névoa graduais pela profundidade, superfície legível, raios limitados à área submersa e halos suaves. Fachada local do elevador com placa do reservatório.
- Instrumento compacto de mergulho com profundidade, cinco fragmentos e rumo/distância do fragmento restante mais próximo; aviso de perseguição sem painel piscando sobre o contador.
- Nado diagonal normalizado, colisão em subpassos, pilares finitos e subida pela borda do poço sem cair imediatamente de volta.
- Pausa compartilhada entre coleta, perseguidor e movimento nas configurações; Shift limpo ao perder foco. A terceira coleta ativa a fúria.
- Estado síncrono arbitra quinto fragmento versus captura. Uma única transição terminal vence, e os callbacks atrasados verificam a identidade da partida. Sair do andar limpa fragmentos, fúria e stamina.

## Validação

- TypeScript: PASS.
- Oito testes novos: PASS (arbitragem, duplicatas, pausa, reinício, obstáculos, pilares, arcos, piso e saída pela borda).
- Suíte: 2.262 testes passaram e um foi ignorado. Os quatro testes de servidor restantes passaram ao repetir com `NODE_OPTIONS=--dns-result-order=ipv4first`; o ambiente resolve localhost em IPv6 e esses testes pedem 127.0.0.1.
- Build Vite de produção: PASS. HTML final da raiz não regenerado.
- Chromium/SwiftShader: seis vistas da cena, qualidades média/alta, incluindo 390×844 e 844×390, sem erros de execução ou shaders. Rechecadas água/fundo após o ajuste de materiais; duas capturas finais com HUD anexadas. Não é medição de FPS de celular físico.
- Crítico independente: PASS, sem bloqueadores funcionais nos fluxos alterados.
- App real: PASS nos seis checks — Player montado e dentro da água; pausa impede coleta/captura; terceira coleta ativa fúria; quinta coleta vence captura no mesmo turno e inicia viagem ao Floor 3; saída reinicia partida/stamina; captura bloqueia coleta e retorna ao lobby. Rodada final sem erros de execução. O ambiente exigiu transporte por curl dos bytes originais de texturas/fontes públicas; a tentativa sem esse transporte falhou. Os checks usam os callbacks reais via gancho DEV, não representam uma partida manual completa nem validam multiplayer/rede de produção.
- JEV indisponível: `TYPESAFE_API_KEY` ausente. Aplicado o fallback explícito de `tools/JEV.md`; nenhuma avaliação JEV é alegada.

## Reproduzir

Em `jubileu`:

```sh
npm run lint:types
npx vitest run src/__tests__/floor2Run.test.ts src/__tests__/floor2Swim.test.ts
npm run build
F2_CHROMIUM=/caminho/chromium node tools/floor2-shots.mjs
F2_CHROMIUM=/caminho/chromium F2_HUD=1 node tools/floor2-shots.mjs
F2_CHROMIUM=/caminho/chromium node tools/floor2-flow.mjs
```

`floor2.html?view=deep&quality=high&hud=1` abre a cena isolada. `view` aceita `rim`, `cave`, `deep` e `shards`. O teste de fluxo usa `__f2Test`, disponível somente em desenvolvimento. Em ambientes que bloqueiam transporte HTTP do navegador, `F2_PROXY_ASSETS=1` entrega os bytes públicos originais por curl, sem substituir imagens por mocks; não constitui teste do transporte normal de produção.
