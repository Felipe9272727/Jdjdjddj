import { Vector3, Euler } from 'three';

export const WALKING_URL = "https://raw.githubusercontent.com/Felipe9272727/Bancon...../main/Walking(1).glb";
export const IDLE_URL = "https://raw.githubusercontent.com/Felipe9272727/BACON-PROJETO-FUNCIONALLLLL/main/Idle.glb";
export const NPC_WALK_URL = "https://raw.githubusercontent.com/Felipe9272727/Npc-test/main/npc%20walking.glb";
export const NPC_IDLE_URL = "https://raw.githubusercontent.com/Felipe9272727/Npc-test/main/npc%20idle.glb";
export const DUSSEKAR_URL = "https://raw.githubusercontent.com/Felipe9272727/Vers-o-definitiva/main/blocky%20character%203d%20model.glb";
export const BARNEY_URL = "https://raw.githubusercontent.com/Felipe9272727/For-my-game/main/1776639536329.png";

export const COLORS = { wall: "#D7CCC8", wood: "#6D4C41", ceiling: "#BCAAA4", metal: "#B0BEC5", elevTrim: "#3E2723", elevFloor: "#F5F0EB", elevDiamond: "#FFD54F", elevDoor: "#9E9E9E", elevPanel: "#78909C", grass: "#66BB6A", sky: "#81D4FA", houseWall: "#EFEBE9", houseRoof: "#6D4C41", bed: "#1565C0", sofa: "#4E342E", light: "#FFE0B2" };
export const ASSETS = { noise: "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/moon_1024.jpg", grass: "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg", wood: "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/hardwood2_diffuse.jpg", lobbyFloor: "https://raw.githubusercontent.com/Felipe9272727/Textura-/main/file_00000000febc71f5992f1ccc1b591002.png", wallPanel: "https://raw.githubusercontent.com/Felipe9272727/Textura-amadeirada-/main/file_0000000040e871f59722d8404d631582.png", wall: "https://raw.githubusercontent.com/Felipe9272727/Textura-da-parede/main/file_000000005dc071f5ba34d550bd83847b.png", ceiling: "https://raw.githubusercontent.com/Felipe9272727/Textura-de-teto/refs/heads/main/Screenshot_2026-01-18-12-39-26-946_com.openai.chatgpt-edit.jpg" };

export const BARNEY_DIALOGUE: Record<string, any> = {
  "greet": {
    "text": "Oh... olá! Que bom que você veio me visitar! Eu sou o Barney. Você parece cansado... quer entrar e tomar um cafézinho comigo?",
    "options": [
      { "text": "Claro, obrigado!", "next": "accept_coffee" },
      { "text": "Por que você está sozinho aqui?", "next": "why_alone" },
      { "text": "Não, obrigado. Preciso ir.", "next": "refuse" }
    ]
  },
  "why_alone": {
    "text": "Sozinho? Eu não estou sozinho... eu TENHO você agora. *sorri de um jeito estranho* Vamos, o café já está pronto.",
    "options": [
      { "text": "Tá... tudo bem.", "next": "accept_coffee" },
      { "text": "Melhor eu ir.", "next": "refuse" }
    ]
  }
};

export const DIALOGUE_TREE: Record<string, any> = {
  "start": {
    "text": "Bem-vindo. Eu sou o Supervisor do Saguão. Este é um elevador normal. Por favor, aja com naturalidade.",
    "options": [
      { "text": "Para onde esse elevador vai?", "next": "destiny" },
      { "text": "Quantos andares existem?", "next": "floors" },
      { "text": "Isso é seguro?", "next": "safety" },
      { "text": "[Sair]", "next": null }
    ]
  },
  "destiny": {
    "text": "Ele vai exatamente para onde você espera. Ou para o andar logo depois do fim.",
    "options": [
      { "text": "O que você quer dizer com isso?", "next": "meaning" },
      { "text": "Existe um andar que não deveria existir?", "next": "forbidden" },
      { "text": "Prefiro não saber.", "next": "ignorance" }
    ]
  },
  "floors": {
    "text": "Existem os andares necessários. Alguns aparecem apenas quando são lembrados com força suficiente.",
    "options": [
      { "text": "Como assim, lembrados?", "next": "memory" },
      { "text": "Posso escolher qualquer um?", "next": "choice" },
      { "text": "Isso não parece normal.", "next": "abnormal" }
    ]
  },
  "safety": {
    "text": "A maioria das pessoas chega inteira. As partes que sobram também são bem tratadas.",
    "options": [
      { "text": "O que você fez com os outros?", "next": "others" },
      { "text": "Quero sair agora.", "next": "exit_demand" },
      { "text": "Você está brincando comigo?", "next": "joke" }
    ]
  },
  "meaning": { "text": "Significado é como fumaça neste poço. Concentre-se apenas em subir. E descer. E expandir.", "options": [{ "text": "Voltar", "next": "start" }] },
  "forbidden": { "text": "Se não deveria existir, não podemos falar sobre ele. As paredes têm ouvidos. E bocas.", "options": [{ "text": "...", "next": "start" }] },
  "ignorance": { "text": "Uma escolha sábia. A ignorância é um colete salva-vidas aqui.", "options": [{ "text": "Voltar", "next": "start" }] },
  "memory": { "text": "Memórias são tijolos. Se você esquecer o chão, ele pode deixar de te segurar.", "options": [{ "text": "Entendi...", "next": "start" }] },
  "choice": { "text": "Você pode apertar qualquer botão. Se o botão aceitará seu toque, é outra questão.", "options": [{ "text": "Certo.", "next": "start" }] },
  "abnormal": { "text": "Normal é apenas uma média estatística. Você está fora da curva agora.", "options": [{ "text": "Voltar", "next": "start" }] },
  "others": { "text": "Eles estão por aí. Às vezes nas paredes, às vezes no som do vento nos dutos.", "options": [{ "text": "Credo.", "next": "start" }] },
  "exit_demand": { "text": "A saída é uma porta. Mas nem todas as portas levam para fora.", "options": [{ "text": "...", "next": "start" }] },
  "joke": { "text": "Eu não tenho senso de humor. Fui fabricado sem ele.", "options": [{ "text": "Ah.", "next": "start" }] }
};

export const SPEED = 4.0;
export const PR = 0.5;
export const EZ_START = -10.0;
export const HOUSE_DOOR_Z = 6;
export const HOUSE_DOOR_X = 0;

export const LOBBY_W = [[-10,10,10,10],[-10,-10,-10,10],[10,-10,10,10],[-10,-10,-1.3,-10],[1.3,-10,10,-10]];
export const ELEV_W = [[-3.25,-16,-3.25,-10],[3.25,-16,3.25,-10],[-3.25,-16,3.25,-16]];
export const HOUSE_EX = [[-4,14,4,14],[4,6,4,14],[-4,6,-4,14],[-4,6,-0.7,6],[0.7,6,4,6]];
export const HOUSE_IN = [[0,10,4,10],[0,10,0,14]];
export const HOUSE_DW = [-0.7,6,0.7,6];
export const L1_BND = [[-25,-25,25,-25],[25,-25,25,25],[-25,25,25,25],[-25,-25,-25,25]];
export const ELEV_BLD = [[-5.5,-16.5,5.5,-16.5],[-5.5,-10,-5.5,-16.5],[5.5,-10,5.5,-16.5],[-5.5,-10,-1.3,-10],[1.3,-10,5.5,-10],[-25,-10,-5.5,-10],[5.5,-10,25,-10]];
export const DOOR_SEAL = [-1.3,-10,1.3,-10];
