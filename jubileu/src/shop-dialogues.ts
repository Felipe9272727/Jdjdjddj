/**
 * shop-dialogues.ts — Hotel reception dialogue tree.
 *
 * Player choices are FULL sentences (not single words like "Mapa"),
 * mirroring the lobby supervisor's tone in DIALOGUE_TREE in constants.ts.
 *
 * Style notes:
 *   • Asterisk-prefixed lines (Undertale convention).
 *   • Inline tags: {y:...} highlight, {p}/{p:N} pause, ^^ page break, {s:...} shake.
 *   • Each scene declares: text, mood (controls bellhop sprite), choices.
 *   • Returning a scene id from a choice navigates there.
 *   • mood drives sprite expression (idle / talk / wink / sweat / concerned).
 */

import type { Mood } from './dialogue-engine';

export interface Choice {
  label: string;
  goto: string;
}

export interface Scene {
  text: string;
  mood?: Mood;
  choices: Choice[];
}

export const SHOP_SCENES: Record<string, Scene> = {
  // ── ENTRY ─────────────────────────────────────────────────────────────
  // Top-level menu mirrors Undertale shop tabs: Comprar / Conversar / Sair,
  // plus extra "Sobre" tab for the lore-heavy hotel branch.
  main: {
    mood: 'talk',
    text:
      '* Bem-vindo ao {y:Normal Hotel}!{p}\n' +
      '* Eu sou o recepcionista.{p:200}\n' +
      '* Em que posso te ajudar?\n' +
      '^^' +
      '* (Ele te encara{p} sem piscar.){p:300}\n' +
      '* (O sorriso dele não{p} chega aos olhos.)',
    choices: [
      { label: 'Comprar', goto: 'buy' },
      { label: 'Conversar', goto: 'talk' },
      { label: 'Sobre o hotel', goto: 'about' },
      { label: 'Sair', goto: 'bye' },
    ],
  },

  // ── COMPRAR ───────────────────────────────────────────────────────────
  // Undertale shop tabs work as a fixed list of items. The "currency"
  // here is intentionally absurd — the joke is that nothing in the
  // hotel has a real price, but the recepcionista keeps a straight face.
  buy: {
    mood: 'talk',
    text:
      '* {y:Loja da Recepção.}{p:300}\n' +
      '* Tudo que oferecemos é\n  {y:gratuito}.{p}\n' +
      '* Só não tente sair com\n  nada na bolsa.',
    choices: [
      { label: 'Café da casa  -  0G', goto: 'buy_coffee' },
      { label: 'Biscoito      -  0G', goto: 'buy_cookie' },
      { label: 'Chave reserva -  ?G', goto: 'buy_key' },
      { label: 'Um andar a +  -  ∞G', goto: 'buy_floor' },
      { label: 'Lembrança     - 1?G', goto: 'buy_memory' },
      { label: 'Voltar', goto: 'main' },
    ],
  },

  buy_coffee: {
    mood: 'wink',
    text:
      '* {y:Café da casa.}{p}\n' +
      '* Sempre quente.{p:200}\n' +
      '* Sempre amargo.\n' +
      '^^' +
      '* (Ele te entrega uma\n  xícara de porcelana.){p:400}\n' +
      '* A xícara está {f:vazia}.{p:300}\n' +
      '* Mas você sente o calor\n  dela mesmo assim.\n' +
      '^^' +
      '* * Você bebeu o {y:Café\n  da casa}.{p:200}\n' +
      '* Algo dentro de você\n  ficou um pouco mais\n  acordado.',
    choices: [{ label: 'Voltar.', goto: 'buy' }],
  },

  buy_cookie: {
    mood: 'idle',
    text:
      '* {y:Biscoito.}{p:200}\n' +
      '* Sempre fresco.{p}\n' +
      '* Independente de quando\n  foi feito.\n' +
      '^^' +
      '* (Ele tira um biscoito de\n  baixo do balcão.){p:300}\n' +
      '* O biscoito {f:lembra} um\n  formato.{p:200}\n' +
      '* Talvez de coração.{p}\n' +
      '* Talvez não.\n' +
      '^^' +
      '* * Você guardou o biscoito\n  no bolso.{p:200}\n' +
      '* Vai ficar fresco até\n  você esquecer dele.',
    choices: [{ label: 'Voltar.', goto: 'buy' }],
  },

  buy_key: {
    mood: 'sweat',
    text:
      '* {y:Chave reserva.}{p:300}\n' +
      '* ...{p:400}\n' +
      '* De qual quarto?\n' +
      '^^' +
      '* (Ele encara você por\n  tempo demais.){p:400}\n' +
      '* Não posso vender uma\n  chave {y:vazia}.{p:300}\n' +
      '* Algumas portas levam\n  esse tipo de coisa\n  a sério.',
    choices: [{ label: 'Voltar.', goto: 'buy' }],
  },

  buy_floor: {
    mood: 'concerned',
    text:
      '* Um {y:andar a mais}.{p:400}\n' +
      '* Esse é caro.\n' +
      '^^' +
      '* O preço não é dinheiro.{p:300}\n' +
      '* Você teria que dar\n  algo {y:proporcional}.{p:200}\n' +
      '* Uma memória de infância,\n  por exemplo.{p}\n' +
      '* Ou o nome da sua mãe.\n' +
      '^^' +
      '* (Ele dá um sorriso\n  de quem já viu isso\n  acontecer.){p:400}\n' +
      '* Talvez na próxima visita.',
    choices: [{ label: 'Voltar.', goto: 'buy' }],
  },

  buy_memory: {
    mood: 'wink',
    text:
      '* Uma {y:lembrança} do hotel.{p:300}\n' +
      '* Nossa especialidade.\n' +
      '^^' +
      '* (Ele coloca uma caixinha\n  de fósforo na sua mão.){p:300}\n' +
      '* Tem o logo do hotel\n  na tampa.{p:200}\n' +
      '* O logo {f:muda} quando\n  você não está olhando.\n' +
      '^^' +
      '* * Você ganhou uma\n  {y:Lembrança}.{p:200}\n' +
      '* Não acende fósforos\n  com ela.{p:300}\n' +
      '* Por favor.',
    choices: [{ label: 'Voltar.', goto: 'buy' }],
  },

  // ── CONVERSAR ─────────────────────────────────────────────────────────
  talk: {
    mood: 'idle',
    text:
      '* Claro.{p}\n' +
      '* Pergunte o que quiser.{p:200}\n' +
      '* Eu respondo o que puder.\n' +
      '^^' +
      '* (Ele coloca as mãos no\n  balcão.){p:300}\n' +
      '* (Os dedos dele são{p} um\n  pouco compridos demais.)',
    choices: [
      { label: 'Quem é você, afinal?', goto: 'who' },
      { label: 'Esse hotel é mesmo seguro?', goto: 'safe' },
      { label: 'Vi coisas estranhas por aqui.', goto: 'strange' },
      { label: 'Esse elevador me dá calafrios.', goto: 'elevator' },
      { label: 'Falei com alguém parecido com você lá no saguão...', goto: 'monitor' },
      { label: 'Deixa pra lá, voltar.', goto: 'main' },
    ],
  },

  who: {
    mood: 'talk',
    text:
      '* Eu? Sou o {y:recepcionista}.{p}\n' +
      '* Trabalho aqui há...{p:400}\n' +
      '* ...{p:400}\n' +
      '* Muito tempo.\n' +
      '^^' +
      '* Não me lembro de quando\n  comecei.{p:300}\n' +
      '* Não me lembro do {f:antes}.{p:500}\n' +
      '* Mas o uniforme serve\n  perfeitamente.{p}\n' +
      '* Então deve estar tudo\n  certo.',
    choices: [
      { label: 'Você nasceu aqui?', goto: 'who_born' },
      { label: 'Tem outros como você?', goto: 'monitor' },
      { label: 'Voltar.', goto: 'talk' },
    ],
  },

  who_born: {
    mood: 'sweat',
    text:
      '* {y:Nasci?}{p:300}\n' +
      '* É...{p:400}\n' +
      '* Essa é uma palavra forte.\n' +
      '^^' +
      '* Eu acordei aqui.{p:200}\n' +
      '* Já com o uniforme vestido.{p:200}\n' +
      '* Já com o nome no crachá.{p}\n' +
      '* Já sabendo dizer\n  "{y:bem-vindo}".\n' +
      '^^' +
      '* Se isso conta como nascer,\n  sim.{p:400}\n' +
      '* Eu nasci aqui.',
    choices: [{ label: 'Voltar.', goto: 'talk' }],
  },

  safe: {
    mood: 'wink',
    text:
      '* Seguro?{p}\n' +
      '* {y:CLARO} que é seguro!{p:200}\n' +
      '* Temos segurança 24h.\n' +
      '^^' +
      '* (Ele faz uma pausa.){p:400}\n' +
      '* ...Bem.{p}\n' +
      '* Mais ou menos 24h.{p:300}\n' +
      '* O segurança às vezes\n  {f:desaparece} no turno\n  da noite.\n' +
      '^^' +
      '* Mas sempre aparece\n  alguém {y:novo} no dia\n  seguinte.{p}\n' +
      '* Com o mesmo nome.{p:300}\n' +
      '* É reconfortante.',
    choices: [
      { label: 'Você está me tranquilizando ou me ameaçando?', goto: 'safe_threat' },
      { label: 'Voltar.', goto: 'talk' },
    ],
  },

  safe_threat: {
    mood: 'concerned',
    text:
      '* (Ele inclina a cabeça.){p:300}\n' +
      '* Eu não sei a diferença.{p:400}\n' +
      '* Sinceramente.\n' +
      '^^' +
      '* As duas coisas saem\n  com o mesmo {y:tom de voz}.{p:300}\n' +
      '* O {y:treinamento} foi\n  muito específico\n  sobre isso.',
    choices: [{ label: 'Voltar.', goto: 'talk' }],
  },

  strange: {
    mood: 'concerned',
    text:
      '* {y:Estranhas} é uma palavra\n  forte.{p:300}\n' +
      '* Aqui chamamos de\n  {y:atípicas}.\n' +
      '^^' +
      '* O carpete às vezes muda\n  de cor quando ninguém\n  está olhando.{p:200}\n' +
      '* As plantas crescem para\n  dentro das paredes.{p}\n' +
      '* O elevador para em\n  andares que não\n  existem.\n' +
      '^^' +
      '* Mas isso é {f:normal}.{p:400}\n' +
      '* Esse é o nome do\n  hotel, afinal.',
    choices: [
      { label: 'E se um andar desses aparecer pra mim?', goto: 'floors' },
      { label: 'Voltar.', goto: 'talk' },
    ],
  },

  elevator: {
    mood: 'talk',
    text:
      '* O {y:elevador}.{p}\n' +
      '* Sim.{p:300}\n' +
      '* Ele é... educado.\n' +
      '^^' +
      '* Aperte o botão.{p}\n' +
      '* Ele leva você {y:aonde\n  precisa ir}.{p:400}\n' +
      '* Não necessariamente\n  aonde você {y:quer} ir.\n' +
      '^^' +
      '* Se as portas demorarem\n  pra abrir...{p:500}\n' +
      '* ...{s:não aperte de novo}.',
    choices: [
      { label: 'O que acontece se eu apertar de novo?', goto: 'elevator_press' },
      { label: 'Voltar.', goto: 'talk' },
    ],
  },

  elevator_press: {
    mood: 'sweat',
    text:
      '* (Ele desvia o olhar pela\n  primeira vez.){p:500}\n' +
      '* É melhor não saber.\n' +
      '^^' +
      '* O {y:último hóspede} que\n  apertou duas vezes...{p:400}\n' +
      '* ...ainda está apertando.{p:300}\n' +
      '* Em algum lugar.',
    choices: [{ label: 'Voltar.', goto: 'talk' }],
  },

  // ── MONITOR / SUPERVISOR (nova cena) ─────────────────────────────────
  monitor: {
    mood: 'concerned',
    text:
      '* (O sorriso dele {f:vacila}\n  por meio segundo.){p:400}\n' +
      '* O {y:Supervisor do Saguão}.\n' +
      '^^' +
      '* Sim.{p:200}\n' +
      '* Nós somos... {y:parentes}.{p:300}\n' +
      '* Mais ou menos.\n' +
      '^^' +
      '* Ele veio antes de mim.{p:200}\n' +
      '* O treinamento dele foi\n  o {y:protótipo}.{p:300}\n' +
      '* O meu foi a {y:versão\n  refinada}.\n' +
      '^^' +
      '* Por isso ele fala daquele\n  jeito.{p}\n' +
      '* "Memórias são tijolos."{p:200}\n' +
      '* "As partes que sobram\n  também são bem tratadas."',
    choices: [
      { label: 'Ele te assusta também?', goto: 'monitor_scare' },
      { label: 'Quem fez o treinamento?', goto: 'monitor_training' },
      { label: 'Voltar.', goto: 'talk' },
    ],
  },

  monitor_scare: {
    mood: 'sweat',
    text:
      '* (Pausa longa.){p:600}\n' +
      '* Eu não tenho permissão\n  pra sentir medo.\n' +
      '^^' +
      '* Mas se tivesse...{p:400}\n' +
      '* ...sim.{p:300}\n' +
      '* Ele teria.\n' +
      '^^' +
      '* O {y:Supervisor} sabe coisas\n  que eu fui {f:configurado}\n  pra esquecer.{p:300}\n' +
      '* Isso é desconfortável.',
    choices: [{ label: 'Voltar.', goto: 'talk' }],
  },

  monitor_training: {
    mood: 'idle',
    text:
      '* {y:Quem} fez o treinamento?{p:400}\n' +
      '* Boa pergunta.\n' +
      '^^' +
      '* Eu não conheci.{p:200}\n' +
      '* Só recebi o manual.{p:200}\n' +
      '* Em três volumes.{p}\n' +
      '* Sem capa.\n' +
      '^^' +
      '* O Supervisor diz que\n  conheceu.{p:300}\n' +
      '* Diz que era uma {y:figura\n  alta}.{p:200}\n' +
      '* Que falava devagar.{p}\n' +
      '* Sempre olhando pro\n  {f:teto}.',
    choices: [{ label: 'Voltar.', goto: 'talk' }],
  },

  // ── SERVIÇOS ──────────────────────────────────────────────────────────
  services: {
    mood: 'talk',
    text:
      '* Informações.{p}\n' +
      '* Posso ajudar com isso.{p:200}\n' +
      '* O que você precisa saber?',
    choices: [
      { label: 'Como é que funciona o meu quarto?', goto: 'room' },
      { label: 'Vocês servem alguma coisa pra comer?', goto: 'menu' },
      { label: 'Onde eu estou exatamente no hotel?', goto: 'map' },
      { label: 'Tem alguma coisa que eu deveria evitar?', goto: 'tips' },
      { label: 'Voltar.', goto: 'main' },
    ],
  },

  room: {
    mood: 'sweat',
    text:
      '* O seu {y:quarto}.{p:300}\n' +
      '* ...{p:500}\n' +
      '* Você já tem um.\n' +
      '^^' +
      '* Todos têm.{p:400}\n' +
      '* O hotel sabe qual é\n  o seu.{p:300}\n' +
      '* É só apertar o botão\n  certo no elevador.\n' +
      '^^' +
      '* (Ele sorri{p} mas o sorriso\n  parece {f:emprestado}.)',
    choices: [
      { label: 'E se eu apertar o botão errado?', goto: 'room_wrong' },
      { label: 'Voltar.', goto: 'services' },
    ],
  },

  room_wrong: {
    mood: 'wink',
    text:
      '* Aí você dorme {y:em outro\n  quarto} essa noite.{p:300}\n' +
      '* Acontece.\n' +
      '^^' +
      '* (Ele dá uma risada baixa.){p:400}\n' +
      '* Não se preocupe.{p:200}\n' +
      '* Os outros quartos também\n  são {y:confortáveis}.{p:300}\n' +
      '* A maioria.',
    choices: [{ label: 'Voltar.', goto: 'services' }],
  },

  menu: {
    mood: 'wink',
    text:
      '* {y:Cardápio do dia:}\n' +
      '\n' +
      '* {g:Café} — sempre quente.{p}\n' +
      '* {g:Biscoito} — sempre fresco.{p}\n' +
      '* {g:Sopa} — sabor {f:variável}.\n' +
      '^^' +
      '* Tudo grátis!{p:300}\n' +
      '* Ninguém nunca cobra\n  nada aqui.{p:400}\n' +
      '* Eu também não sei\n  por quê.',
    choices: [
      { label: 'Variável como?', goto: 'menu_soup' },
      { label: 'Voltar.', goto: 'services' },
    ],
  },

  menu_soup: {
    mood: 'concerned',
    text:
      '* A sopa muda.{p:300}\n' +
      '* Todo dia.\n' +
      '^^' +
      '* Às vezes é de {y:tomate}.{p}\n' +
      '* Às vezes é de {y:abóbora}.{p}\n' +
      '* Às vezes é de {f:algo que\n  não tem nome ainda}.\n' +
      '^^' +
      '* O cozinheiro nunca sai\n  da cozinha pra explicar.',
    choices: [{ label: 'Voltar.', goto: 'services' }],
  },

  map: {
    mood: 'idle',
    text:
      '* Você está no {y:saguão\n  principal}.{p:200}\n' +
      '* O elevador está atrás\n  de você.{p}\n' +
      '* Eu estou na recepção.{p:200}\n' +
      '* (Onde você está\n  olhando agora.)\n' +
      '^^' +
      '* O resto do hotel\n  fica {f:atrás} do elevador.{p:400}\n' +
      '* Não literalmente.{p}\n' +
      '* Não literalmente atrás.',
    choices: [
      { label: 'Atrás como, então?', goto: 'map_behind' },
      { label: 'Voltar.', goto: 'services' },
    ],
  },

  map_behind: {
    mood: 'sweat',
    text:
      '* Atrás como em...{p:400}\n' +
      '* ...{p:400}\n' +
      '* Mais {y:profundo}.\n' +
      '^^' +
      '* O elevador tem o tamanho\n  que você vê.{p:300}\n' +
      '* O hotel tem o tamanho\n  que ele {f:precisa ter}.{p:200}\n' +
      '* Os dois números nem\n  sempre coincidem.',
    choices: [{ label: 'Voltar.', goto: 'services' }],
  },

  tips: {
    mood: 'concerned',
    text:
      '* Algumas {y:dicas}:\n' +
      '\n' +
      '* Não confie no relógio.{p:200}\n' +
      '* Não conte os andares.{p:200}\n' +
      '* Se ouvir música {y:estranha}\n  no elevador, tudo bem.\n' +
      '^^' +
      '* {r:Se a música parar...}{p:500}\n' +
      '* {s:corra}.\n' +
      '^^' +
      '* (Ele pisca rápido.){p:300}\n' +
      '* Mas não se preocupe!{p}\n' +
      '* É raro.',
    choices: [
      { label: 'Já aconteceu com alguém?', goto: 'tips_who' },
      { label: 'Voltar.', goto: 'services' },
    ],
  },

  tips_who: {
    mood: 'sweat',
    text:
      '* (Pausa.){p:400}\n' +
      '* Já.\n' +
      '^^' +
      '* O hóspede do {y:quarto 304}.{p:300}\n' +
      '* Faz... três anos?{p:200}\n' +
      '* Quatro?\n' +
      '^^' +
      '* O quarto ainda está\n  reservado pra ele.{p:300}\n' +
      '* A gente troca os lençóis\n  toda quarta-feira.{p}\n' +
      '* Por garantia.',
    choices: [{ label: 'Voltar.', goto: 'services' }],
  },

  // ── SOBRE O HOTEL ─────────────────────────────────────────────────────
  about: {
    mood: 'talk',
    text:
      '* O hotel.{p:200}\n' +
      '* O que você quer saber\n  sobre ele?',
    choices: [
      { label: 'Quem manda nesse lugar?', goto: 'owner' },
      { label: 'Quantos andares tem, na real?', goto: 'floors' },
      { label: 'Há quanto tempo isso aqui existe?', goto: 'history' },
      { label: 'Voltar.', goto: 'main' },
    ],
  },

  owner: {
    mood: 'sweat',
    text:
      '* O {y:dono}?{p:300}\n' +
      '* Eu nunca vi.\n' +
      '^^' +
      '* As {y:ordens} chegam por\n  baixo da minha porta.{p}\n' +
      '* Sempre datilografadas.{p:200}\n' +
      '* Sempre úmidas.\n' +
      '^^' +
      '* As regras mudam de vez\n  em quando.{p:300}\n' +
      '* Eu só sigo.{p}\n' +
      '* É mais simples assim.',
    choices: [
      { label: 'O que acontece se você desobedece?', goto: 'owner_disobey' },
      { label: 'Voltar.', goto: 'about' },
    ],
  },

  owner_disobey: {
    mood: 'concerned',
    text:
      '* (Silêncio.){p:600}\n' +
      '* Não sei.\n' +
      '^^' +
      '* Eu não fui {f:configurado}\n  pra desobedecer.{p:300}\n' +
      '* Não acho que isso seja\n  uma opção que eu tenho.\n' +
      '^^' +
      '* (Ele sorri de novo.){p:300}\n' +
      '* Mas é uma ótima pergunta!',
    choices: [{ label: 'Voltar.', goto: 'about' }],
  },

  floors: {
    mood: 'wink',
    text:
      '* {y:Andares?}{p}\n' +
      '* Teoricamente...{p:400}\n' +
      '* {y:Infinitos}.\n' +
      '^^' +
      '* Na prática, o elevador\n  vai aonde quer.{p:300}\n' +
      '* Às vezes andares novos\n  {y:aparecem}.{p}\n' +
      '* Às vezes andares antigos\n  {f:desaparecem}.\n' +
      '^^' +
      '* Já tive um quarto\n  no 17º andar.{p:400}\n' +
      '* Hoje o 17º andar não\n  está disponível.{p:300}\n' +
      '* Não foi nada pessoal.',
    choices: [
      { label: 'O que acontece com os hóspedes desses andares?', goto: 'floors_guests' },
      { label: 'Voltar.', goto: 'about' },
    ],
  },

  floors_guests: {
    mood: 'sweat',
    text:
      '* (Ele dá um sorrisinho.){p:300}\n' +
      '* Eles {y:viajam}.\n' +
      '^^' +
      '* Pelo menos é isso que\n  o relatório diz.{p:300}\n' +
      '* Eu não pergunto detalhes.{p:200}\n' +
      '* Os detalhes são\n  {f:desconfortáveis}.',
    choices: [{ label: 'Voltar.', goto: 'about' }],
  },

  history: {
    mood: 'idle',
    text:
      '* O {y:Normal Hotel} foi\n  fundado em...{p:500}\n' +
      '* ...{p:500}\n' +
      '* Boa pergunta.\n' +
      '^^' +
      '* O placar de inauguração\n  na entrada está em\n  branco.{p:300}\n' +
      '* Mas a tinta parece\n  {y:fresca}.\n' +
      '^^' +
      '* O hotel sempre esteve\n  aqui.{p:200}\n' +
      '* E sempre vai estar.{p:300}\n' +
      '* É bonito, de certa forma.',
    choices: [{ label: 'Voltar.', goto: 'about' }],
  },

  // ── DESPEDIDA ─────────────────────────────────────────────────────────
  bye: {
    mood: 'wink',
    text:
      '* Já vai?{p:300}\n' +
      '* Volte sempre!\n' +
      '^^' +
      '* O elevador está {y:sempre}\n  aberto.{p:400}\n' +
      '* Sempre {f:te esperando}.',
    choices: [
      { label: 'Tchau.', goto: '__close__' },
      { label: 'Esquece, deixa eu perguntar mais uma coisa.', goto: 'main' },
    ],
  },
};

export const ROOT_SCENE = 'main';
export const CLOSE_SCENE = '__close__';
