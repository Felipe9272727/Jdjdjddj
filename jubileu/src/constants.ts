import { Vector3, Euler } from 'three';
import { boxCollider } from './physics';

// Keep in sync with `data.level <= MAX_LEVEL` in firestore.rules.
export const MAX_LEVEL = 100;

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

// ─── Gameplay Constants ───────────────────────────────────────────────────
export const BARNEY_CATCH_DIST = 1.2;       // Distance to trigger jumpscare
export const DOOR_INTERACT_DIST = 3.0;      // Distance to interact with house door
export const NPC_INTERACT_DIST = 4.0;       // Distance to interact with lobby NPC
export const BED_INTERACT_DIST = 3.0;       // Distance to interact with bed
export const ELEVATOR_ZONE_X = 3.1;         // Half-width of elevator entrance
export const ELEVATOR_ZONE_Z = -10;         // Z threshold for elevator interior
export const MP_GHOST_TTL_MS = 15000;       // Ghost player timeout
export const MP_WRITE_INTERVAL = 200;       // Firestore write interval (ms)
export const MP_WRITE_THRESHOLD = 0.1;      // Min position change to trigger write
export const MP_ROTATION_THRESHOLD = 0.1;   // Min rotation change to trigger write
export const MP_FORCE_WRITE_MS = 2500;      // Force write even if no change
export const CHAT_TTL_MS = 30000;           // Chat message lifetime
export const CHAT_MAX_LEN = 200;            // Max chat message length
export const CHAT_CLEAR_DELAY = 30000;      // Auto-clear chat after this
export const PLAYER_NAME_MAX_LEN = 20;      // Max player name length

export const LOBBY_W = [[-10,10,10,10],[-10,-10,-10,10],[10,-10,10,10],[-10,-10,-1.3,-10],[1.3,-10,10,-10]];
export const ELEV_W = [[-3.25,-16,-3.25,-10],[3.25,-16,3.25,-10],[-3.25,-16,3.25,-16]];
export const HOUSE_EX = [[-4,14,4,14],[4,6,4,14],[-4,6,-4,14],[-4,6,-0.7,6],[0.7,6,4,6]];
export const HOUSE_IN = [[0,10,4,10],[0,10,0,14]];
export const HOUSE_DW = [-0.7,6,0.7,6];
export const L1_BND = [[-25,-25,25,-25],[25,-25,25,25],[-25,25,25,25],[-25,-25,-25,25]];
export const ELEV_BLD = [[-5.5,-16.5,5.5,-16.5],[-5.5,-10,-5.5,-16.5],[5.5,-10,5.5,-16.5],[-5.5,-10,-1.3,-10],[1.3,-10,5.5,-10],[-25,-10,-5.5,-10],[5.5,-10,25,-10]];
export const DOOR_SEAL = [-1.3,-10,1.3,-10];

// Furniture colliders — keep positions in sync with LobbyEnv.tsx and HouseEnv.tsx.
// Sizes carry slight padding so the player doesn't graze the visible geometry.
const ARMCHAIR_W = 1.1, ARMCHAIR_D = 1.0;

export const LOBBY_FURNITURE_W: number[][] = [
    ...boxCollider(7, -7.5, 3.5, 0.7, -Math.PI / 2),
    ...[2, 3.5, -2, -3.5].flatMap(z => boxCollider(-8.7, z, ARMCHAIR_W, ARMCHAIR_D, Math.PI / 2)),
    ...[-4, -2.5, 2.5, 4].flatMap(x => boxCollider(x, 8.8, ARMCHAIR_W, ARMCHAIR_D, Math.PI)),
];

// Furniture positions in HouseEnv.tsx are LOCAL to the House group, which is
// itself rendered at world (0, 0, 10) with rotation Y = π. We have to apply
// that transform here, otherwise the colliders end up in the front yard
// instead of inside the house. R(π): (lx, lz) -> (-lx, -lz); then +10 on Z.
export const HOUSE_FURNITURE_W: number[][] = [
    ...boxCollider( 2.5,  7.5, 2.0, 0.9, Math.PI / 4),   // sofa (local -2.5, 2.5)
    ...boxCollider( 2.0,  8.5, 1.2, 0.8, 0),             // coffee table (local -2.0, 1.5)
    ...boxCollider( 3.0, 13.5, 1.5, 0.8, 0),             // kitchen counter L (local -3.0, -3.5)
    ...boxCollider( 1.0, 13.5, 1.5, 0.8, 0),             // kitchen counter R (local -1.0, -3.5)
    ...boxCollider(-2.5, 12.5, 1.9, 2.3, 0),             // bed incl. headboard (local 2.5, -2.5)
];

// Pre-built per-frame wall lists. Player and Bot pick one of these by
// (level, doorsClosed, houseDoorOpen) instead of allocating a fresh array
// every frame. Lobby alone went from 8 to 44 segments after furniture
// colliders, and wl was being reallocated 60×/sec — this hoists all that.
const _LOBBY_BASE = [...ELEV_W, ...LOBBY_W, ...LOBBY_FURNITURE_W];
const _HOUSE_BASE = [...ELEV_W, ...L1_BND, ...ELEV_BLD, ...HOUSE_EX, ...HOUSE_IN, ...HOUSE_FURNITURE_W];

const _WALLS_LOBBY_OPEN          = _LOBBY_BASE;
const _WALLS_LOBBY_SEALED        = [..._LOBBY_BASE, DOOR_SEAL];
const _WALLS_HOUSE_OPEN          = _HOUSE_BASE;
const _WALLS_HOUSE_DOOR          = [..._HOUSE_BASE, HOUSE_DW];
const _WALLS_HOUSE_SEALED        = [..._HOUSE_BASE, DOOR_SEAL];
const _WALLS_HOUSE_DOOR_SEALED   = [..._HOUSE_BASE, HOUSE_DW, DOOR_SEAL];

/** Pick the right pre-built wall list. No allocation per frame. */
export const wallsForState = (level: number, doorsClosed: boolean, houseDoorOpen: boolean): number[][] => {
    if (level === 0) return doorsClosed ? _WALLS_LOBBY_SEALED : _WALLS_LOBBY_OPEN;
    if (houseDoorOpen) return doorsClosed ? _WALLS_HOUSE_SEALED : _WALLS_HOUSE_OPEN;
    return doorsClosed ? _WALLS_HOUSE_DOOR_SEALED : _WALLS_HOUSE_DOOR;
};

// ── Cashier / Reception ──────────────────────────────────────────────────
export const CASHIER_INTERACT_DIST = 2.5;
export const CASHIER_POS = { x: 7.65, z: -7.5 } as const;
