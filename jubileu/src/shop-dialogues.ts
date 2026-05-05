/**
 * shop-dialogues.ts — Hotel reception dialogue tree.
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
  main: {
    mood: 'talk',
    text:
      '* Bem-vindo ao {y:Normal Hotel}!{p}\n' +
      '* Eu sou o recepcionista.{p:200}\n' +
      '* Posso ajudar?\n' +
      '^^' +
      '* (Ele te encara{p} sem piscar.){p:300}\n' +
      '* (O sorriso dele não{p} chega aos olhos.)',
    choices: [
      { label: 'Conversar', goto: 'talk' },
      { label: 'Hospedagem', goto: 'services' },
      { label: 'Sobre o hotel', goto: 'about' },
      { label: 'Sair', goto: 'bye' },
    ],
  },

  // ── CONVERSAR ─────────────────────────────────────────────────────────
  talk: {
    mood: 'idle',
    text: '* Sobre o que você quer\n  conversar?',
    choices: [
      { label: 'Você quem é?', goto: 'who' },
      { label: 'O hotel é seguro?', goto: 'safe' },
      { label: 'Coisas estranhas', goto: 'strange' },
      { label: 'O elevador', goto: 'elevator' },
      { label: 'Voltar', goto: 'main' },
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
    choices: [{ label: 'Voltar', goto: 'talk' }],
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
    choices: [{ label: 'Voltar', goto: 'talk' }],
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
      { label: 'Andares?', goto: 'floors' },
      { label: 'Voltar', goto: 'talk' },
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
    choices: [{ label: 'Voltar', goto: 'talk' }],
  },

  // ── SERVIÇOS ──────────────────────────────────────────────────────────
  services: {
    mood: 'talk',
    text: '* Como posso te servir?',
    choices: [
      { label: 'Quarto', goto: 'room' },
      { label: 'Cardápio', goto: 'menu' },
      { label: 'Mapa', goto: 'map' },
      { label: 'Dicas', goto: 'tips' },
      { label: 'Voltar', goto: 'main' },
    ],
  },

  room: {
    mood: 'sweat',
    text:
      '* Você quer um {y:quarto}?{p:300}\n' +
      '* ...{p:500}\n' +
      '* Você já tem um.\n' +
      '^^' +
      '* Todos têm.{p:400}\n' +
      '* O hotel sabe qual é\n  o seu.{p:300}\n' +
      '* É só apertar o botão\n  certo no elevador.\n' +
      '^^' +
      '* (Ele sorri{p} mas o sorriso\n  parece {f:emprestado}.)',
    choices: [{ label: 'Voltar', goto: 'services' }],
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
    choices: [{ label: 'Voltar', goto: 'services' }],
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
    choices: [{ label: 'Voltar', goto: 'services' }],
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
      '* * Mas não se preocupe!{p}\n' +
      '* É raro.',
    choices: [{ label: 'Voltar', goto: 'services' }],
  },

  // ── SOBRE O HOTEL ─────────────────────────────────────────────────────
  about: {
    mood: 'talk',
    text: '* O que você quer saber?',
    choices: [
      { label: 'Quem é o dono?', goto: 'owner' },
      { label: 'Quantos andares?', goto: 'floors' },
      { label: 'História', goto: 'history' },
      { label: 'Voltar', goto: 'main' },
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
    choices: [{ label: 'Voltar', goto: 'about' }],
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
    choices: [{ label: 'Voltar', goto: 'about' }],
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
    choices: [{ label: 'Voltar', goto: 'about' }],
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
    choices: [{ label: 'Tchau', goto: '__close__' }],
  },
};

export const ROOT_SCENE = 'main';
export const CLOSE_SCENE = '__close__';
