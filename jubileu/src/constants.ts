import { Vector3, Euler } from 'three';
import { boxCollider } from './physics';
import { F6_STATIC_WALLS, F6_FURNITURE } from './f6Escape';
import { F8_STATIC_WALLS, F8_FURNITURE } from './f8Arquivo';
import { F9_STATIC_WALLS, F9_OCOS, F9_OCO_MOUTH, F9_RAIZ_MOUTH, F9_RAIZ_CHAMBER } from './f9Floresta';
import { F9_TREE_OBSTACLES } from './f9Eco';

// Keep in sync with `data.level <= MAX_LEVEL` in firestore.rules.
export const MAX_LEVEL = 100;

// Character/NPC GLBs are now imported as bundled assets (Vite inlines them as
// base64 data-URIs) so the single-file index.html works with no network — the
// previous raw.githubusercontent runtime fetches failed when installed as one
// standalone HTML. useGLTF() takes a data-URI just as happily as an https URL.
import { walkingModel, idleModel, npcWalkModel, npcIdleModel, blockyCharModel } from './assets/textureImports';

export const WALKING_URL = walkingModel;
export const IDLE_URL = idleModel;
export const NPC_WALK_URL = npcWalkModel;
export const NPC_IDLE_URL = npcIdleModel;
export const DUSSEKAR_URL = blockyCharModel;
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

// Bearded diver on Floor 2 — uses `EQUIP` and `LEAVE` as terminal action
// keys (handled in App.tsx, not as further nodes).
export const DIVER_DIALOGUE: Record<string, any> = {
  "greet": {
    "text": "Ahh... mais um turista. Eu estava te esperando, sabe? Há quanto tempo? Os relógios aqui embaixo... ficam confusos.",
    "options": [
      { "text": "Quem é você?", "next": "who" },
      { "text": "O que tem aí na sua mão?", "next": "what" }
    ]
  },
  "who": {
    "text": "Eu fui o mergulhador da casa. Antes dela ser uma casa. Antes dela ser qualquer coisa. Agora eu... eu cuido das pessoas que descem.",
    "options": [
      { "text": "E o que é isso aí?", "next": "what" },
      { "text": "Cuida como?", "next": "care" }
    ]
  },
  "care": {
    "text": "Faço com que vocês respirem. E faço com que vocês vejam. As duas coisas são igualmente importantes. Especialmente aqui embaixo.",
    "options": [
      { "text": "Me dá esse troço.", "next": "offer" }
    ]
  },
  "what": {
    "text": "Um respirador. Com binóculos. Você vai precisar dos dois. A água lá embaixo... não é só água. E está bem escuro lá embaixo.",
    "options": [
      { "text": "Por que está me oferecendo isso?", "next": "why" },
      { "text": "Tá, pode passar.", "next": "offer" }
    ]
  },
  "why": {
    "text": "Porque eu não quero ver mais ninguém afogado lá em baixo. Já tem gente demais lá embaixo. Coloca isso e vai.",
    "options": [
      { "text": "Tá bom, me dá.", "next": "offer" }
    ]
  },
  "offer": {
    "text": "Toma. Encaixa direitinho na cara. Depois é só apertar o botãozinho na lateral pra acender a visão. Aperta a tecla N — vai te lembrar disso.",
    "options": [
      { "text": "[Colocar o respirador]", "next": "EQUIP" },
      { "text": "Prefiro nadar sem.", "next": "refuse" }
    ]
  },
  "refuse": {
    "text": "Bem... então boa sorte. Eu fico aqui. Caso você mude de ideia, é só voltar. Se conseguir voltar.",
    "options": [
      { "text": "Pensando bem...", "next": "offer" },
      { "text": "[Sair]", "next": "LEAVE" }
    ]
  }
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

// Floor 3 — Endless Cartoon Parkour. Side walls at X: ±14 keep the player in
// the corridor; they run far into +Z because the climb is now infinite (see
// f3Parkour.ts). No far wall — falling into the void (y < -8) is the only way
// off the course, handled by the respawn logic in Player.tsx.
const F3_CORRIDOR_FAR_Z = 100000;   // effectively infinite — the climb never ends
const FLOOR3_BND: number[][] = [
    [-14, -10, -1.3, -10],            // left of elevator doorway
    [1.3,  -10,  14, -10],            // right of elevator doorway
    [-14,  -10, -14,  F3_CORRIDOR_FAR_Z],   // left boundary (endless)
    [ 14,  -10,  14,  F3_CORRIDOR_FAR_Z],   // right boundary (endless)
];

// Platform definitions for the Floor 3 obby.
// cx/cz = center, hw/hd = half-extents in XZ, topY = player foot level, h = visual height.
export interface F3Platform {
    cx: number; cz: number;
    hw: number; hd: number;
    topY: number;
    h: number;
    moving?: boolean;   // oscillates ±F3_MOVE_AMP in X
}

export const F3_MOVE_AMP = 2.8;   // moving platform X amplitude

export const F3_PLATFORMS: readonly F3Platform[] = [
    // Start floor (matches elevator area)
    { cx: 0,    cz: -5.0, hw: 6.5, hd: 4.5, topY: 0,   h: 0.5 },
    // Step 1 — tutorial hop (same height)
    { cx: 0,    cz:  2.0, hw: 1.8, hd: 1.8, topY: 0.1, h: 0.5 },
    // Step 2 — up, straight
    { cx: 0,    cz:  6.0, hw: 1.3, hd: 1.3, topY: 1.5, h: 0.5 },
    // Step 3 — up, offset left
    { cx: -1.5, cz: 10.0, hw: 1.3, hd: 1.3, topY: 3.0, h: 0.5 },
    // Step 4 — moving platform
    { cx: 0,    cz: 13.5, hw: 1.1, hd: 1.1, topY: 4.5, h: 0.5, moving: true },
    // GOAL
    { cx: 0,    cz: 17.5, hw: 2.5, hd: 2.5, topY: 6.0, h: 1.0 },
];

// Shared mutable: Floor3Environment writes the current X offset of the
// moving platform every frame; Player.tsx physics reads it for collision.
export const f3MovingX = { current: 0 };
const _WALLS_FLOOR3              = [...ELEV_W, ...FLOOR3_BND];
const _WALLS_FLOOR3_SEALED       = [..._WALLS_FLOOR3, DOOR_SEAL];
const _WALLS_HOUSE_OPEN          = _HOUSE_BASE;
const _WALLS_HOUSE_DOOR          = [..._HOUSE_BASE, HOUSE_DW];
const _WALLS_HOUSE_SEALED        = [..._HOUSE_BASE, DOOR_SEAL];
const _WALLS_HOUSE_DOOR_SEALED   = [..._HOUSE_BASE, HOUSE_DW, DOOR_SEAL];

// Level 2 (cave + underwater hole): elevator shell + cave walls at ±30.
// Without the cave walls the player could simply walk past the visible
// cave-floor mesh into the void — was the "atravesso o chão" bug.
// The walls do NOT extend through the hole; the hole's bounds are handled
// by the swim-mode logic in Player.tsx instead.
const CAVE_WALLS_L2: number[][] = [
    // Outer walls (60x60 cave, centered at origin)
    [-30, -30, -30,  30],   // left
    [ 30, -30,  30,  30],   // right
    [-30, -30,  30, -30],   // back (behind the elevator at z=-10)
    [-30,  30,  30,  30],   // front
];
const _LEVEL2_BASE = [...ELEV_W, ...ELEV_BLD, ...CAVE_WALLS_L2];
const _WALLS_LEVEL2_OPEN          = _LEVEL2_BASE;
const _WALLS_LEVEL2_SEALED        = [..._LEVEL2_BASE, DOOR_SEAL];

// Floors 4/5 — the 3D side is just the elevator on open ground (Floor 4 is the
// 2D overlay; Floor 5 is O NOVO BASEPLATE). Elevator shell + a far boundary at
// the plate's edge so nobody walks off the world.
const BASEPLATE_BND: number[][] = [
    [-58, -58, -58, 58], [58, -58, 58, 58], [-58, -58, 58, -58], [-58, 58, 58, 58],
];
const _WALLS_FLOOR5        = [...ELEV_W, ...ELEV_BLD, ...BASEPLATE_BND];
const _WALLS_FLOOR5_SEALED = [..._WALLS_FLOOR5, DOOR_SEAL];

// Floor 6 — a Suíte 612 (the escape room). Static shell + furniture; the
// LOCKED doors are dynamic (f6DoorWalls, resolved per-frame in Player.tsx)
// so unlocking them doesn't need a wallsForState recompute.
const F6_FURN_W = F6_FURNITURE.flatMap(([cx, cz, w, d]) => boxCollider(cx, cz, w, d));
const _WALLS_FLOOR6        = [...ELEV_W, ...F6_STATIC_WALLS, ...F6_FURN_W];
const _WALLS_FLOOR6_SEALED = [..._WALLS_FLOOR6, DOOR_SEAL];

// Floor 8 — a sala de interrogatório do Arquivista. Casca da sala + a mesa; o
// vão do elevador no sul casa com ELEV_W/DOOR_SEAL (mesmo padrão do Floor 6).
const F8_FURN_W = F8_FURNITURE.flatMap(([cx, cz, w, d]) => boxCollider(cx, cz, w, d));
const _WALLS_FLOOR8        = [...ELEV_W, ...F8_STATIC_WALLS, ...F8_FURN_W];
const _WALLS_FLOOR8_SEALED = [..._WALLS_FLOOR8, DOOR_SEAL];

// Andar 9 (O VIVEIRO) — colisão de verdade (revisão M18):
//  - ANEL COM VÃO: o tronco de cada oco e a câmara da Raiz são anéis de
//    segmentos com uma BOCA aberta no ângulo compartilhado com a cena
//    (F9_OCO_MOUTH/F9_RAIZ_MOUTH) — entra-se SÓ pela boca, nunca varando
//    a parede do tronco.
//  - as 12 árvores-mãe ganham caixa (o player varava os troncos).
const ringCollider = (cx: number, cz: number, r: number, segs: number, mouth: number, mouthHalf: number): number[][] => {
    const out: number[][] = [];
    for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
        let d = ((a0 + a1) / 2 - mouth) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < mouthHalf) continue;               // o vão da boca
        out.push([cx + Math.cos(a0) * r, cz + Math.sin(a0) * r, cx + Math.cos(a1) * r, cz + Math.sin(a1) * r]);
    }
    return out;
};
const _WALLS_FLOOR9 = [
    ...F9_STATIC_WALLS,
    ...F9_OCOS.flatMap(([cx, cz], i) => ringCollider(cx, cz, 2.05, 12, F9_OCO_MOUTH[i], 0.72)),
    ...ringCollider(F9_RAIZ_CHAMBER[0], F9_RAIZ_CHAMBER[1], F9_RAIZ_CHAMBER[2], 16, F9_RAIZ_MOUTH, 0.42),
    ...F9_TREE_OBSTACLES.flatMap(([tx, tz, tr]) => boxCollider(tx, tz, tr * 1.7, tr * 1.7)),
    // O ELEVADOR QUEBRADO no meio do Viveiro: o <ElevatorInterior> é renderizado
    // em (0,-13) em TODO nível (App.tsx) menos o 7 — inclusive aqui. Sem esta
    // caixa o player ATRAVESSAVA as paredes dele (bug do Felipe). Agora é SÓLIDO:
    // o elevador que te despejou aqui, engolido pela floresta. boxCollider usa
    // LARGURA CHEIA (hw=w/2) → o footprint do cab é EW6.5 × ED6.0 em (0,-13).
    ...boxCollider(0, -13, 6.5, 6.0),
];

// Floor 7 (pirate ship). The whole ship is scaled up so it reads as a SHIP, not
// a dinghy; the deck/spawn/water all use this one factor.
export const FLOOR7_SCALE = 1.85;

// The bulwark boundary follows the actual DECK OUTLINE (narrow at the pointed
// bow + bluff stern), not a rectangle, so the player can't walk through the
// hull where it tapers. Plus box colliders for the masts, capstan, ship's boat,
// companionway and the stern deckhouse so you can't walk through them. All in
// ship-local units, scaled by FLOOR7_SCALE to match the enlarged ship.
const _F7_DECK_HALF: [number, number][] = [
    [1.40, -6.6], [1.75, -5.0], [1.90, -2.4], [2.14, 1.0], [1.95, 3.0], [1.60, 4.8], [1.05, 6.2], [0.45, 7.2],
];

// Reachable deck props (ship-local, unscaled) clustered along the bulwarks and
// at the mast bases so the deck feels like a working ship at eye level. Shared:
// Floor7.tsx renders them, and the solid ones get colliders below. Kept clear
// of the central puddle-mopping zone (|x|<1.9, |z|<5).
export type F7PropKind = 'barrel' | 'crate' | 'rope' | 'bell';
export interface F7Prop { kind: F7PropKind; x: number; z: number; rot?: number; }
export const F7_DECK_PROPS: F7Prop[] = [
    { kind: 'barrel', x: 2.05, z: -2.0 }, { kind: 'barrel', x: 2.28, z: -2.5 }, { kind: 'barrel', x: 1.98, z: -1.5 },
    { kind: 'barrel', x: -2.05, z: 2.6 }, { kind: 'barrel', x: -2.25, z: 3.1 },
    { kind: 'crate', x: -2.1, z: -3.4, rot: 0.3 }, { kind: 'crate', x: -2.25, z: -2.85, rot: -0.2 }, { kind: 'crate', x: 2.15, z: 3.6, rot: 0.5 },
    { kind: 'rope', x: 1.95, z: 0.6 }, { kind: 'rope', x: -1.95, z: -0.6 }, { kind: 'rope', x: 2.0, z: 4.2 }, { kind: 'rope', x: -2.0, z: 4.4 },
    { kind: 'bell', x: 0.75, z: -5.0 },
];
const _WALLS_FLOOR7 = (() => {
    const S = FLOOR7_SCALE;
    const port = _F7_DECK_HALF.map(([x, z]) => [-x * S, z * S]);
    const star = [..._F7_DECK_HALF].reverse().map(([x, z]) => [x * S, z * S]);
    const loop = [...port, [0, 7.9 * S], ...star];
    const segs: number[][] = [];
    for (let i = 0; i < loop.length - 1; i++) segs.push([loop[i][0], loop[i][1], loop[i + 1][0], loop[i + 1][1]]);
    segs.push([1.40 * S, -6.6 * S, -1.40 * S, -6.6 * S]); // close across the transom
    // deck obstacles (centre-lane props the brain keeps clear of puddles)
    // NOTE: the thin masts deliberately have NO colliders — the player spawns
    // right by the foremast and must walk aft past it to reach the captain, so a
    // mast collider there pins them ("born stuck"). Walking through a thin mast
    // is far less bad than being unable to move.
    const obs: [number, number, number, number][] = [
        [0, 2.7, 0.55, 0.55], // capstan
        [0, -3.1, 0.7, 0.6],  // companionway
        [0, -5.9, 2.2, 1.4],  // stern deckhouse
    ];
    for (const [cx, cz, w, d] of obs) segs.push(...boxCollider(cx * S, cz * S, w * S, d * S));
    // colliders for the solid deck props (barrels/crates/bell); rope coils are flat
    for (const p of F7_DECK_PROPS) {
        if (p.kind === 'rope') continue;
        const sz = p.kind === 'bell' ? 0.5 : 0.62;
        segs.push(...boxCollider(p.x * S, p.z * S, sz * S, sz * S));
    }
    return segs;
})();

/** Pick the right pre-built wall list. No allocation per frame. */
export const wallsForState = (level: number, doorsClosed: boolean, houseDoorOpen: boolean): number[][] => {
    if (level === 0) return doorsClosed ? _WALLS_LOBBY_SEALED : _WALLS_LOBBY_OPEN;
    if (level === 2) return doorsClosed ? _WALLS_LEVEL2_SEALED : _WALLS_LEVEL2_OPEN;
    if (level === 3) return doorsClosed ? _WALLS_FLOOR3_SEALED : _WALLS_FLOOR3;
    if (level === 6) return doorsClosed ? _WALLS_FLOOR6_SEALED : _WALLS_FLOOR6;
    if (level === 7) return _WALLS_FLOOR7;
    if (level === 8) return doorsClosed ? _WALLS_FLOOR8_SEALED : _WALLS_FLOOR8;
    if (level === 9) return _WALLS_FLOOR9;
    if (level >= 4) return doorsClosed ? _WALLS_FLOOR5_SEALED : _WALLS_FLOOR5;
    if (houseDoorOpen) return doorsClosed ? _WALLS_HOUSE_SEALED : _WALLS_HOUSE_OPEN;
    return doorsClosed ? _WALLS_HOUSE_DOOR_SEALED : _WALLS_HOUSE_DOOR;
};

// ── Cashier / Reception ──────────────────────────────────────────────────
export const CASHIER_INTERACT_DIST = 2.5;
export const CASHIER_POS = { x: 7.65, z: -7.5 } as const;
