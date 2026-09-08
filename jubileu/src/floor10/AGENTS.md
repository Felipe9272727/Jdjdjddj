# Andar 10: desenvolvimento isolado

- Esta bancada existe para desenvolver o andar 10 sem depender das mudanças nos outros andares.
- Comece por `README.md` e pelo manifesto do módulo. Leia somente arquivos necessários à mudança.
- Por preferência explícita do usuário, delegue leitura/análise/pesquisa a subagentes GPT-5.6-Luna; o agente principal implementa e integra.
- Não use `App.tsx`, `Player.tsx`, o HUD global ou outros andares como ponto de entrada da bancada.
- Não copie versões antigas desses arquivos para o jogo. Na reintegração, use o contrato do módulo sobre o HEAD mais recente do jogo.
- O branch de trabalho é `nilo/floor10-workshop`. Reintegrar/publicar no branch do jogo fica para um pedido posterior do usuário.
- Alterações visuais e de interface não devem adicionar inferências nem downloads de modelos.
- Preserve a cooperação real, o cancelamento de convites e a condição de embarque dos dois.
