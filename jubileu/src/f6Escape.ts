/**
 * f6Escape.ts — FLOOR 6: "O HÓSPEDE QUE SABIA DEMAIS" (escape room realista).
 *
 * A Suíte 612. O elevador estoura assim que o player desembarca — manutenção
 * "programada" — e as 3 peças do conserto estão atrás de uma cadeia de
 * puzzles: o código do banheiro está espalhado pelo quarto (e num canal de
 * TV), a chave da cozinha desceu pelo ralo, o relé está num bloco de gelo e
 * o fogão não acende sem os fósforos da despensa. O cab MORTO é enterável:
 * cada peça tem o seu próprio soquete lá dentro (caixa de fusíveis, painel
 * de comando, guincho de emergência) e a manivela gira de verdade.
 *
 * Pure module (sem imports de three/react): fases, flags, paredes, hotspots
 * e TODOS os textos. A cena (Floor6Suite), o overlay DOM e o Player leem
 * daqui — uma única fonte de verdade, padrão f4Lore/f5Race.
 */

// ── Phase machine ─────────────────────────────────────────────────────────────
export type F6Phase =
    | 'arrive'      // doors opened; the elevator still pretends to work
    | 'explore'     // BANG — cab dead and crooked, 3 parts missing
    | 'blackout'    // crank wound, ding… lights die for a beat
    | 'guest'       // the one-armed guest is between you and the doors
    | 'guestIdle';  // dialogue done — he won't move. (Felipe writes what's next)

export type F6Item =
    | 'cabide' | 'chave' | 'gelo' | 'abridor' | 'fosforos'
    | 'manivela' | 'fusivel' | 'rele';
export type F6Part = 'manivela' | 'fusivel' | 'rele';
export const F6_PARTS: readonly F6Part[] = ['fusivel', 'rele', 'manivela'];

export interface F6State {
    phase: F6Phase;
    bathOpen: boolean;
    kitchenOpen: boolean;
    inv: Record<F6Item, boolean>;
    installed: Record<F6Part, boolean>;
    // bedroom
    quadroMoved: boolean;      // painting swung aside, « 9 » exposed
    drawerOpen: boolean;       // desk drawer (abridor de cartas)
    camaCut: boolean;          // mattress tear opened with the letter knife
    wardrobeOpen: boolean;
    cabideTaken: boolean;
    tvOn: boolean;
    tvChannel: number;         // 1..9 — canal 2 é o que "só dá estática"
    // bathroom
    tapOn: boolean;            // hot tap running
    fogT: number;              // seconds of steam so far
    fogDone: boolean;          // mirror message revealed
    mirrorRead: boolean;
    lidOff: boolean;           // cistern lid slid off (fusível exposed)
    curtainOpen: boolean;      // shower curtain drawn aside
    // kitchen
    fridgeOpen: boolean;
    geloTaken: boolean;
    despensaOpen: boolean;     // pantry door (the truth wall + the matches)
    despensaSeen: boolean;
    stoveLit: boolean;
    melting: boolean;          // ice block sitting on the flame
    meltT: number;
    panRele: boolean;          // melted — the relay waits in the pan
    // cab
    crankT: number;            // 0..1 — hold-to-crank progress
    blackT: number;
    guestLine: number;
    /** Hotspot id with its examine card open right now (scene animates it). */
    inspecting: string | null;
    version: number;
}

const FRESH = (): F6State => ({
    phase: 'arrive', bathOpen: false, kitchenOpen: false,
    inv: {
        cabide: false, chave: false, gelo: false, abridor: false,
        fosforos: false, manivela: false, fusivel: false, rele: false,
    },
    installed: { manivela: false, fusivel: false, rele: false },
    quadroMoved: false, drawerOpen: false, camaCut: false, wardrobeOpen: false,
    cabideTaken: false, tvOn: false, tvChannel: 9,
    tapOn: false, fogT: 0, fogDone: false, mirrorRead: false, lidOff: false, curtainOpen: false,
    fridgeOpen: false, geloTaken: false, despensaOpen: false, despensaSeen: false,
    stoveLit: false, melting: false, meltT: 0, panRele: false,
    crankT: 0, blackT: 0, guestLine: 0, inspecting: null, version: 0,
});

export const f6: F6State = FRESH();

const listeners = new Set<() => void>();
/** Subscribe to state bumps; returns the unsubscribe. */
export function f6Subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}
let legacy: (() => void) | null = null;
/** Legacy single-slot subscription (the overlay uses this). */
export function f6SetOnChange(fn: (() => void) | null): void {
    if (legacy) listeners.delete(legacy);
    legacy = fn;
    if (fn) listeners.add(fn);
}
export function f6Bump(): void { f6.version++; listeners.forEach((fn) => fn()); }

export function f6Reset(): void {
    const v = f6.version;
    Object.assign(f6, FRESH());
    f6.version = v;
    events.length = 0;
    f6Bump();
}

// ── One-shot events (scene drains these into sfx + animations) ───────────────
export type F6Event =
    | 'bang' | 'unlock' | 'chain' | 'repaired' | 'guestAppear' | 'melted'
    | 'quadro' | 'drawer' | 'tug' | 'cut' | 'wardrobe' | 'tvflip'
    | 'lid' | 'curtain' | 'fridge' | 'match' | 'placeIce' | 'despensa' | 'fish'
    | `install:${F6Part}` | `pickup:${F6Item}`;
const events: F6Event[] = [];
function emit(e: F6Event): void { events.push(e); }
export function f6DrainEvents(): F6Event[] { return events.splice(0, events.length); }

// ── The bathroom padlock code: quadro · telefone · "o andar que não existe" · canal
export const F6_CODE = '9142';

// ── Suite layout (world coords; elevator doorway at x∈[-1.3,1.3], z=-10) ─────
// Bedroom x∈[-8,1.5] z∈[-10,7] · Bathroom x∈[1.5,6] z∈[-10,-3] · Kitchen x∈[1.5,6] z∈[-3,7]
// Dead cab (enterável depois do estouro): x∈[-3.25,3.25] z∈[-16,-10] (ELEV_W).
export const F6_CEIL = 3.0;

/** Static walls: outer shell + partitions + furniture (built once). */
export const F6_STATIC_WALLS: number[][] = [
    // outer shell (south wall has the elevator doorway gap)
    [-8, -10, -8, 7], [6, -10, 6, 7], [-8, 7, 6, 7],
    [-8, -10, -1.3, -10], [1.3, -10, 6, -10],
    // inner partition at x=1.5 with the two door gaps
    [1.5, -10, 1.5, -6.2], [1.5, -4.8, 1.5, 2.3], [1.5, 3.7, 1.5, 7],
    // bathroom/kitchen divider
    [1.5, -3, 6, -3],
];

/** Furniture footprints [cx, cz, w, d] — Floor6Suite renders them, constants.ts
 *  turns them into boxColliders. One list so visuals and physics never drift. */
export const F6_FURNITURE: ReadonlyArray<readonly [number, number, number, number]> = [
    [-7.0, 2.5, 1.9, 2.5],     // bed
    [-7.6, 4.4, 0.78, 0.78],   // nightstand
    [-3.5, 6.5, 1.7, 0.9],     // wardrobe
    [-5.5, -9.5, 1.7, 0.9],    // desk
    [1.15, 1.2, 0.62, 1.35],   // tv rack (against the partition)
    [3.2, -9.6, 0.95, 0.6],    // bathroom sink
    [5.6, -8.5, 0.75, 0.8],    // toilet
    [3.75, -3.6, 1.85, 0.9],   // tub
    [5.55, 1.2, 0.85, 3.6],    // kitchen counter (stove included)
    [5.55, -1.9, 0.9, 0.9],    // fridge
    [3.75, 6.6, 3.4, 0.65],    // pantry shelf
    [-2.0, 5.9, 0.9, 0.55],    // suitcase on the luggage rack
    [-4.6, 1.6, 0.95, 0.95],   // armchair (sitting area)
    [-3.5, 1.45, 0.6, 0.5],    // ottoman
    [-4.6, 2.85, 0.55, 0.55],  // side table
    [-5.5, 0.7, 0.38, 0.38],   // floor lamp
];

const DOOR_BATH: number[] = [1.5, -6.2, 1.5, -4.8];
const DOOR_KITCHEN: number[] = [1.5, 2.3, 1.5, 3.7];
const DOOR_ELEVATOR_BLOCK: number[] = [-1.45, -9.9, 1.45, -9.9];   // the guest won't move
// The slammed doors jam crooked leaving a squeeze gap x∈[-0.7, 0.7].
const DOOR_JAM_L: number[] = [-1.45, -9.9, -0.7, -9.9];
const DOOR_JAM_R: number[] = [0.7, -9.9, 1.45, -9.9];

const _DW_ARRIVE = [DOOR_BATH, DOOR_KITCHEN];
const JAM = [DOOR_JAM_L, DOOR_JAM_R];
const _DW_X_BOTH = [...JAM, DOOR_BATH, DOOR_KITCHEN];
const _DW_X_BATH = [...JAM, DOOR_BATH];
const _DW_X_KITCHEN = [...JAM, DOOR_KITCHEN];
const _DW_X_NONE = JAM;
const _DW_G_BOTH = [DOOR_ELEVATOR_BLOCK, DOOR_BATH, DOOR_KITCHEN];
const _DW_G_BATH = [DOOR_ELEVATOR_BLOCK, DOOR_BATH];
const _DW_G_KITCHEN = [DOOR_ELEVATOR_BLOCK, DOOR_KITCHEN];
const _DW_G_NONE = [DOOR_ELEVATOR_BLOCK];

/** Live LOCKED-door segments (resolved per-frame by Player.tsx on level 6).
 *  Prebuilt lists — zero allocation. During 'arrive' the doorway is open
 *  (walking out); after the bang the slammed doors leave a crooked squeeze
 *  gap into the dead cab; once repaired the guest stands in the way. */
export function f6DoorWalls(): number[][] {
    const s = f6;
    if (s.phase === 'arrive') return _DW_ARRIVE;
    if (s.phase === 'explore') {
        return !s.bathOpen
            ? (!s.kitchenOpen ? _DW_X_BOTH : _DW_X_BATH)
            : (!s.kitchenOpen ? _DW_X_KITCHEN : _DW_X_NONE);
    }
    return !s.bathOpen
        ? (!s.kitchenOpen ? _DW_G_BOTH : _DW_G_BATH)
        : (!s.kitchenOpen ? _DW_G_KITCHEN : _DW_G_NONE);
}

// ── Hotspots ──────────────────────────────────────────────────────────────────
export interface F6Hotspot {
    id: string; x: number; z: number; label: string; reach?: number;
    /** Player must be on this side of z to see the prompt (cab vs. room). */
    zMax?: number; zMin?: number;
}

const H = (id: string, x: number, z: number, label: string,
    extra?: Partial<F6Hotspot>): F6Hotspot => ({ id, x, z, label, ...extra });

function allInstalled(): boolean {
    return f6.installed.manivela && f6.installed.fusivel && f6.installed.rele;
}

/** Hotspots the player can currently reach for (state-aware). */
export function f6Hotspots(): F6Hotspot[] {
    const s = f6;
    if (s.phase === 'arrive') return [];
    const list: F6Hotspot[] = [
        // ── bedroom ──
        H('aviso', -1.7, -9.4, 'Bilhete no batente', { zMin: -9.9 }),
        H('quadro', -2.5, -9.4, s.quadroMoved ? 'Atrás do quadro' : 'Quadro torto', { zMin: -9.9 }),
        H('maquina', -5.8, -8.9, 'Máquina de escrever'),
        H('gaveta', -4.9, -8.9, s.drawerOpen && s.inv.abridor ? 'Gaveta (vazia)' : 'Gaveta da escrivaninha'),
        H('cama', -6.6, 1.2,
            !s.camaCut ? 'Colchão (tem algo dentro)'
                : s.inv.manivela || s.installed.manivela ? 'Rasgo do colchão'
                : 'Pegar a manivela'),
        H('diario', -6.9, 2.9, 'Diário'),
        H('telefone', -7.5, 4.5, 'Telefone'),
        H('janela', -7.7, -2.0, 'Janela'),
        H('guardaroupa', -3.5, 6.3,
            !s.wardrobeOpen ? 'Guarda-roupa'
                : !s.cabideTaken ? 'Pegar um cabide'
                : 'Guarda-roupa'),
        H('mala', -2.0, 5.9, 'Mala dele'),
        H('tv', 0.9, 1.2, !s.tvOn ? 'Ligar a televisão' : `Trocar de canal (${s.tvChannel})`),
        H('portabanheiro', 1.5, -5.5, s.bathOpen ? '' : 'Cadeado do banheiro'),
        H('portacozinha', 1.5, 3.0, s.kitchenOpen ? '' : 'Porta da cozinha'),
    ];
    // ── the dead cab (enterável só depois do estouro) ──
    if (s.phase === 'explore') {
        list.push(
            H('soq_fusivel', -2.7, -12.6,
                s.installed.fusivel ? 'Caixa de fusíveis' : 'Caixa de fusíveis (vazia)',
                { zMax: -10.1 }),
            H('soq_rele', 2.6, -11.2,
                s.installed.rele ? 'Painel de comando' : 'Painel de comando (soquete vazio)',
                { zMax: -10.1 }),
            H('botoeira', 2.6, -10.6, 'Botoeira do elevador', { zMax: -10.1 }),
            H('eixo', 0, -15.2,
                allInstalled() ? 'Girar a manivela'
                    : s.installed.manivela ? 'Guincho de emergência'
                    : 'Guincho de emergência (sem manivela)',
                { zMax: -10.1, reach: 2.0 }),
        );
    }
    if (s.bathOpen) {
        list.push(
            H('pia', 3.2, -9.3,
                !s.tapOn && !s.fogDone ? 'Pia (torneira quente)'
                    : s.fogDone && s.mirrorRead && !s.inv.chave && !s.kitchenOpen ? 'Pescar no ralo'
                    : 'Pia do banheiro'),
            H('privada', 5.5, -8.3,
                !s.lidOff ? 'Caixa de descarga'
                    : !s.inv.fusivel && !s.installed.fusivel ? 'Pegar o fusível'
                    : 'Caixa de descarga'),
            H('banheira', 3.75, -4.2, s.curtainOpen ? 'Banheira' : 'Cortina da banheira'),
        );
        // The mirror sits 30cm in front of the sink hotspot and would shadow
        // it forever — it only becomes a hotspot while there's something to
        // read in the steam (and again once the fishing chain is done).
        if (s.fogDone && (!s.mirrorRead || s.kitchenOpen)) {
            list.push(H('espelho', 3.2, -9.0, !s.mirrorRead ? 'Espelho embaçado' : 'Espelho'));
        }
    }
    if (s.kitchenOpen) {
        list.push(
            H('geladeira', 5.4, -1.9,
                !s.fridgeOpen ? 'Geladeira'
                    : !s.geloTaken ? 'Pegar o bloco de gelo'
                    : 'Geladeira'),
            H('fogao', 5.4, 0.6,
                s.melting ? 'Panela (derretendo…)'
                    : s.panRele ? 'Pegar o relé'
                    : !s.stoveLit ? 'Fogão (apagado)'
                    : s.inv.gelo ? 'Pôr o gelo na panela'
                    : 'Fogão'),
            H('despensa', 3.75, 6.1, s.despensaOpen ? 'A verdade dele' : 'Despensa'),
        );
        if (s.despensaOpen && !s.inv.fosforos && !s.stoveLit) {
            list.push(H('fosforos', 4.5, 6.1, 'Caixa de fósforos'));
        }
    }
    if (s.phase === 'guestIdle') list.push(H('hospede', 0, -8.2, 'O Hóspede', { reach: 2.2 }));
    return list.filter((h) => h.label !== '');
}

// ── All the words ─────────────────────────────────────────────────────────────
export const F6_NOTE_PANEL =
    'Um bilhete preso ao batente, datilografado. A tinta está úmida:\n\n"MANUTENÇÃO PROGRAMADA.\nAGUARDE NO QUARTO.\n— a administração"';

export const F6_TXT: Record<string, { title: string; text: string }> = {
    aviso: { title: 'BILHETE NO BATENTE', text: F6_NOTE_PANEL },
    maquina: {
        title: 'MÁQUINA DE ESCREVER',
        text: 'Uma página pela metade, ainda presa no rolo:\n\n"eu contei os andares. não são sete como o robô do 5 jura — coitado, ele só conhece o dele. são VINTE. eu subi de serviço, contei as portas, FOTOGRAFEI.\n\namanhã fazem o meu check-out.\n\nse você está lendo isto, escondi os números do cadeado NESTA ORDEM:\n\n1º — atrás do quadro torto\n2º — embaixo do telefone\n3º — o andar que não existe\n4º — o canal que só dá estática"',
    },
    quadro: {
        title: 'QUADRO TORTO',
        text: 'Está torto. Como o do andar 4.\n\nVocê afasta a moldura. Riscado a faca na parede, fundo:\n\n« 9 »',
    },
    quadro2: {
        title: 'ATRÁS DO QUADRO',
        text: 'O risco na parede não saiu de lá:\n\n« 9 »',
    },
    gaveta: {
        title: 'GAVETA DA ESCRIVANINHA',
        text: 'A gaveta range e cede. Dentro: papel timbrado do hotel, um vidro de tinta seca…\n\n…e um ABRIDOR DE CARTAS de latão, afiado demais para cartas.',
    },
    gaveta2: { title: 'GAVETA', text: 'Papel timbrado e poeira. Mais nada.' },
    telefone: {
        title: 'TELEFONE',
        text: 'Você levanta o aparelho. Não há linha — só uma respiração, paciente, do outro lado.\n\nVocê desliga devagar e vira o telefone: colado embaixo, um papelzinho:\n\n« 1 »',
    },
    diario: {
        title: 'DIÁRIO',
        text: '"dia 47. eles sorriem quando eu pergunto do último andar. sorriem igual.\n\no terceiro número é o andar que não existe. o ELEVADOR sabe qual é: olha a botoeira lá dentro e conta o buraco entre os botões."',
    },
    tvon: {
        title: 'TELEVISÃO',
        text: 'O tubo estala, a imagem abre numa linha e incha até encher a tela: chuvisco colorido, um canal morto.\n\nNo seletor de canais, alguém raspou a tinta do número 2.',
    },
    tv2: {
        title: 'CANAL 2',
        text: 'Estática pura — o canal que só dá estática.\n\nNo meio do chuvisco, meio segundo de um frame congelado: um corredor de hotel comprido demais. Depois, queimado no fósforo do tubo:\n\n« 2 »',
    },
    janela: {
        title: 'JANELA',
        text: 'A cortina está pesada de poeira. Lá fora, uma névoa parada feito fotografia.\n\nEla não se move. Nunca se move.',
    },
    guardaroupa: {
        title: 'GUARDA-ROUPA',
        text: 'As portas abrem para as roupas de um homem organizado: três camisas iguais, um terno, um roupão faltando no gancho.\n\nNo fundo, uma fileira de cabides de arame.',
    },
    cabide: {
        title: 'CABIDE DE ARAME',
        text: 'Você solta um CABIDE da barra. Arame fino, fácil de desentortar.\n\nAs camisas continuam esperando por ele.',
    },
    guardaroupa2: { title: 'GUARDA-ROUPA', text: 'As camisas continuam esperando por ele.' },
    mala: {
        title: 'A MALA',
        text: 'Aberta no porta-malas, arrumada para um check-out que não houve: camisas dobradas, um vidro de remédio, um mapa do estado com o hotel circulado…\n\n…e o canto de uma fotografia queimada. Sobrou só a legenda, à mão: "as VINTE portas".',
    },
    cama_locked: {
        title: 'COLCHÃO',
        text: 'Tem algo rígido enfiado fundo num rasgo do colchão — você puxa e o tecido segura como uma mordida.\n\nO rasgo é pequeno demais. Precisa de algo afiado.',
    },
    cama_cut: {
        title: 'COLCHÃO',
        text: 'O abridor de latão abre o rasgo num gesto.\n\nDentro, embrulhada numa fronha: uma MANIVELA de emergência.\n\nEle dormia em cima do plano de fuga.',
    },
    cama_take: {
        title: 'MANIVELA',
        text: 'Ferro fundido, pesada, o encaixe quadrado ainda limpo.\n\nServe num guincho de elevador.',
    },
    cama_done: { title: 'COLCHÃO', text: 'O rasgo no colchão, agora vazio.' },
    portabanheiro: {
        title: 'PORTA DO BANHEIRO',
        text: 'Um cadeado de 4 dígitos, novo, por fora da porta.\n\nQuem tranca um BANHEIRO por fora?',
    },
    portacozinha: {
        title: 'PORTA DA COZINHA',
        text: 'Corrente e fechadura. ELES trancaram a comida dele.\n\nPrecisa de uma chave pequena.',
    },
    cozinha_open: {
        title: 'PORTA DA COZINHA',
        text: 'A chave gira; a corrente escorrega elo por elo e cai pesada no carpete.\n\nA cozinha dele, destrancada 47 dias tarde demais.',
    },
    pia_tap: {
        title: 'PIA',
        text: 'Você abre a torneira quente até o fim. O cano tosse, cospe, e a água sai fervendo — o vapor começa a subir pelo espelho.',
    },
    pia_wait: { title: 'PIA', text: 'A água quente segue correndo. O espelho está embaçando…' },
    pia_idle: { title: 'PIA', text: 'A louça da pia, gelada apesar do vapor.' },
    espelho_clean: { title: 'ESPELHO', text: 'Seu reflexo, num banheiro trancado por fora. Nada mais. Por enquanto.' },
    espelho_msg: {
        title: 'ESPELHO EMBAÇADO',
        text: 'No vapor, letras aparecem — escritas do lado de DENTRO, há muito tempo:\n\n"ELES TRANCARAM MINHA COMIDA.\nA CHAVE DESCEU PELO RALO."',
    },
    ralo_chave: {
        title: 'RALO DA PIA',
        text: 'Você desentorta o cabide, dobra um gancho na ponta, e pesca no escuro do cano…\n\n…uma CHAVE pequena, fria e limpa demais.',
    },
    privada_lid: {
        title: 'CAIXA DE DESCARGA',
        text: 'Você empurra a tampa de louça — ela desliza com um gemido de pedra.\n\nDentro, acima da linha d\'água, preso com fita isolante: um FUSÍVEL industrial embrulhado em plástico.',
    },
    privada_take: {
        title: 'FUSÍVEL',
        text: 'Você descola a fita e seca o embrulho na manga.\n\nEle escondeu o conserto inteiro. Só não teve tempo de usar.',
    },
    privada2: { title: 'CAIXA DE DESCARGA', text: 'Só água parada e o resto da fita isolante.' },
    banheira_curtain: {
        title: 'CORTINA DA BANHEIRA',
        text: 'As argolas guincham no cano quando você puxa a cortina.\n\nAtrás dela, um embrulho de toalhas, amarrado com um cuidado que dá frio. A etiqueta, datilografada:\n\n"PARTE QUE SOBRA — TRATAR BEM.\n— a administração"\n\nVocê decide não abrir.',
    },
    banheira2: {
        title: 'BANHEIRA',
        text: 'O embrulho de toalhas não se mexeu.\n\nVocê decide, de novo, não abrir.',
    },
    geladeira_open: {
        title: 'GELADEIRA',
        text: 'A porta abre com um beijo de borracha e a luzinha pisca antes de firmar.\n\nMarmitas etiquetadas à mão: DIA 1… DIA 46… DIA 47. A última está intacta.\n\nNo congelador, um bloco de gelo com algo escuro dentro.',
    },
    gelo_take: {
        title: 'BLOCO DE GELO',
        text: 'Pesado, queimando de frio. No núcleo, uma sombra retangular — parece um RELÉ.\n\nVai precisar derreter.',
    },
    geladeira2: { title: 'GELADEIRA', text: 'As marmitas dele. Ninguém vai comer a do dia 47.' },
    fogao_dead: {
        title: 'FOGÃO',
        text: 'Uma boca ainda parece boa, com uma panela seca em cima — mas o acendedor clica no vazio. Sem faísca, sem chama.\n\nPrecisa de fogo.',
    },
    fogao_lit: {
        title: 'FOGÃO',
        text: 'O fósforo risca na segunda tentativa. A boca acende num anel azul, baixinho, como se pedisse desculpa.\n\nA panela começa a esquentar.',
    },
    fogao_melt: {
        title: 'FOGÃO',
        text: 'Você deita o bloco de gelo na panela quente.\n\nO gelo grita. É esperar.',
    },
    fogao_wait: { title: 'FOGÃO', text: 'O gelo ainda chia na panela. Quase.' },
    fogao_take: {
        title: 'RELÉ',
        text: 'Na água ainda morna da panela: o RELÉ, intacto dentro do plástico.\n\nVocê seca na manga e guarda.',
    },
    fogao_idle: { title: 'FOGÃO', text: 'A chama azul, paciente, esquentando panela vazia.' },
    despensa: {
        title: 'A DESPENSA',
        text: 'A porta da despensa abre para a verdade dele:\n\nUm mapa desenhado à mão — VINTE andares, um sobre o outro, ligados por barbante vermelho. Polaroids nos primeiros cinco: a casa, a água escura, o desenho animado, o saguão destruído, a pista do robô.\n\nDo 7 ao 19: pontos de interrogação.\n\nNo 20, riscado com tanta força que rasgou o papel:\n\n"ELE MORA NO ÚLTIMO."',
    },
    despensa2: {
        title: 'A DESPENSA',
        text: 'O barbante vermelho treme quando você respira perto.\n\n"ELE MORA NO ÚLTIMO."',
    },
    fosforos: {
        title: 'FÓSFOROS',
        text: 'Uma caixa de fósforos do próprio hotel — "THE NORMAL ELEVATOR · desde sempre".\n\nChacoalha meio cheia.',
    },
    // ── the dead cab ──
    soq_fusivel: {
        title: 'CAIXA DE FUSÍVEIS',
        text: 'A portinhola pende aberta, o fusível de dentro virou carvão estilhaçado.\n\nOs bornes esperam um FUSÍVEL novo.',
    },
    soq_fusivel_in: {
        title: 'CAIXA DE FUSÍVEIS',
        text: 'O fusível encaixa nos bornes com um estalo gordo.\n\nEm algum lugar atrás da chapa, um zumbido tenta começar.',
    },
    soq_fusivel_done: { title: 'CAIXA DE FUSÍVEIS', text: 'O fusível novo, firme nos bornes.' },
    botoeira: {
        title: 'BOTOEIRA',
        text: 'Uma coluna de botões amarelados, mortos:\n\n1 · 2 · 3 · ▢ · 5 · 6 · 7\n\nEntre o 3 e o 5, um soquete vazio, queimado há muito tempo. O hotel nunca deu botão ao andar que não existe.\n\n« 4 »',
    },
    soq_rele: {
        title: 'PAINEL DE COMANDO',
        text: 'A chapa do painel pende torta, por dentro é fumaça seca e cobre derretido.\n\nNo meio, um soquete octal vazio — o RELÉ de comando evaporou.',
    },
    soq_rele_in: {
        title: 'PAINEL DE COMANDO',
        text: 'O relé assenta no soquete octal, pino por pino.\n\nO painel dá UM clique — e fica esperando o resto.',
    },
    soq_rele_done: { title: 'PAINEL DE COMANDO', text: 'O relé no soquete, esperando energia.' },
    eixo: {
        title: 'GUINCHO DE EMERGÊNCIA',
        text: 'Atrás de uma plaquinha "SÓ PESSOAL AUTORIZADO": um eixo quadrado saindo da parede do cab.\n\nFalta a MANIVELA.',
    },
    eixo_manivela: {
        title: 'GUINCHO DE EMERGÊNCIA',
        text: 'A manivela desliza no eixo quadrado e trava com um TUNC de ferro.\n\nAgora é girar — quando o resto estiver no lugar.',
    },
    eixo_falta: {
        title: 'GUINCHO DE EMERGÊNCIA',
        text: 'A manivela está no eixo, pronta.\n\nMas girar agora seria girar um elevador morto: ainda faltam peças no painel.',
    },
    hospede_idle: {
        title: 'O HÓSPEDE',
        text: 'Ele não sai da frente da porta. A respiração dele é o único relógio do quarto.\n\n"Me escuta. Só me escuta."',
    },
};

// ── The guest ────────────────────────────────────────────────────────────────
export const F6_GUEST_LINES: ReadonlyArray<string> = [
    'Você consertou. Claro que consertou. Eles SABIAM que você consertaria… as peças não caíram, foram DEIXADAS. Pra você. Pra medir você.',
    'Eu subi uma vez. O andar de cima não é um andar. O elevador me trouxe de volta… em partes. E eles cuidaram muito bem das partes que sobraram.',
    'Antes de apertar qualquer botão… me escuta. Só me escuta.',
];

// ── Interactions ──────────────────────────────────────────────────────────────
export type F6Sfx =
    | 'paper' | 'click' | 'clank' | 'water' | 'static' | 'unlock' | 'chain'
    | 'drawer' | 'breath' | 'creak' | 'none';

export type F6Action =
    | { kind: 'text'; title: string; text: string; sfx: F6Sfx; delay?: number }
    | { kind: 'fx'; sfx: F6Sfx }
    | { kind: 'keypad' }
    | { kind: 'crank' }
    | { kind: 'none' };

const TXT = (k: string, sfx: F6Sfx = 'paper', delay?: number): F6Action =>
    ({ kind: 'text', title: F6_TXT[k].title, text: F6_TXT[k].text, sfx, delay });

/** Overlay marks the open card's hotspot so the scene can animate it. */
export function f6SetInspecting(id: string | null): void {
    if (f6.inspecting !== id) { f6.inspecting = id; f6Bump(); }
}

export function f6Interact(id: string): F6Action {
    const s = f6;
    switch (id) {
        // ── bedroom ──
        case 'aviso': return TXT('aviso');
        case 'maquina': return TXT('maquina');
        case 'diario': return TXT('diario');
        case 'telefone': return TXT('telefone', 'click');
        case 'janela': return TXT('janela', 'none');
        case 'mala': return TXT('mala', 'paper');
        case 'quadro':
            if (!s.quadroMoved) {
                s.quadroMoved = true; emit('quadro'); f6Bump();
                return TXT('quadro', 'creak', 650);
            }
            return TXT('quadro2', 'none');
        case 'gaveta':
            if (!s.drawerOpen) {
                s.drawerOpen = true; emit('drawer'); f6Bump();
                if (!s.inv.abridor) {
                    s.inv.abridor = true; emit('pickup:abridor');
                    return TXT('gaveta', 'drawer', 700);
                }
                return TXT('gaveta2', 'drawer', 500);
            }
            return TXT('gaveta2', 'none');
        case 'guardaroupa':
            if (!s.wardrobeOpen) {
                s.wardrobeOpen = true; emit('wardrobe'); f6Bump();
                return TXT('guardaroupa', 'creak', 650);
            }
            if (!s.cabideTaken) {
                s.cabideTaken = true; s.inv.cabide = true; emit('pickup:cabide'); f6Bump();
                return TXT('cabide', 'clank', 400);
            }
            return TXT('guardaroupa2', 'none');
        case 'tv':
            if (!s.tvOn) { s.tvOn = true; s.tvChannel = 9; emit('tvflip'); f6Bump(); return TXT('tvon', 'static', 800); }
            s.tvChannel = (s.tvChannel % 9) + 1; emit('tvflip'); f6Bump();
            if (s.tvChannel === 2) return TXT('tv2', 'static', 900);
            return { kind: 'fx', sfx: 'static' };
        case 'cama': {
            if (s.camaCut) {
                if (s.inv.manivela || s.installed.manivela) return TXT('cama_done', 'none');
                s.inv.manivela = true; emit('pickup:manivela'); f6Bump();
                return TXT('cama_take', 'clank', 400);
            }
            if (s.inv.abridor) {
                s.camaCut = true; emit('cut'); f6Bump();
                return TXT('cama_cut', 'none', 950);
            }
            emit('tug');
            return TXT('cama_locked', 'drawer');
        }
        case 'portabanheiro':
            return s.bathOpen ? { kind: 'none' } : { kind: 'keypad' };
        case 'portacozinha':
            if (s.kitchenOpen) return { kind: 'none' };
            if (s.inv.chave) {
                s.inv.chave = false; s.kitchenOpen = true; emit('chain'); f6Bump();
                return TXT('cozinha_open', 'none', 1100);
            }
            return TXT('portacozinha', 'click');
        // ── bathroom ──
        case 'pia': {
            if (!s.tapOn && !s.fogDone) { s.tapOn = true; f6Bump(); return TXT('pia_tap', 'water', 450); }
            if (s.tapOn && !s.fogDone) return TXT('pia_wait', 'water');
            if (s.fogDone && s.mirrorRead && !s.inv.chave && !s.kitchenOpen && s.inv.cabide) {
                s.inv.cabide = false; s.inv.chave = true; emit('fish'); emit('pickup:chave'); f6Bump();
                return TXT('ralo_chave', 'click', 1500);
            }
            if (s.fogDone && s.mirrorRead && !s.inv.chave && !s.kitchenOpen) {
                return { kind: 'text', title: 'RALO DA PIA', text: 'Algo brilha lá no fundo do ralo, fora do alcance dos dedos.\n\nPrecisa de algo comprido e fino.', sfx: 'none' };
            }
            return TXT('pia_idle', 'none');
        }
        case 'espelho':
            if (s.fogDone) {
                if (!s.mirrorRead) { s.mirrorRead = true; f6Bump(); }
                return TXT('espelho_msg', 'none');
            }
            return TXT('espelho_clean', 'none');
        case 'privada':
            if (!s.lidOff) {
                s.lidOff = true; emit('lid'); f6Bump();
                return TXT('privada_lid', 'none', 800);
            }
            if (!s.inv.fusivel && !s.installed.fusivel) {
                s.inv.fusivel = true; emit('pickup:fusivel'); f6Bump();
                return TXT('privada_take', 'clank', 400);
            }
            return TXT('privada2', 'water');
        case 'banheira':
            if (!s.curtainOpen) {
                s.curtainOpen = true; emit('curtain'); f6Bump();
                return TXT('banheira_curtain', 'none', 700);
            }
            return TXT('banheira2', 'none');
        // ── kitchen ──
        case 'geladeira':
            if (!s.fridgeOpen) {
                s.fridgeOpen = true; emit('fridge'); f6Bump();
                return TXT('geladeira_open', 'creak', 700);
            }
            if (!s.geloTaken) {
                s.geloTaken = true; s.inv.gelo = true; emit('pickup:gelo'); f6Bump();
                return TXT('gelo_take', 'clank', 400);
            }
            return TXT('geladeira2', 'none');
        case 'fogao':
            if (s.melting) return TXT('fogao_wait', 'none');
            if (s.panRele) {
                s.panRele = false; s.inv.rele = true; emit('pickup:rele'); f6Bump();
                return TXT('fogao_take', 'clank', 400);
            }
            if (!s.stoveLit) {
                if (s.inv.fosforos) {
                    s.stoveLit = true; emit('match'); f6Bump();
                    return TXT('fogao_lit', 'none', 900);
                }
                return TXT('fogao_dead', 'click');
            }
            if (s.inv.gelo) {
                s.inv.gelo = false; s.melting = true; s.meltT = 0; emit('placeIce'); f6Bump();
                return TXT('fogao_melt', 'none', 600);
            }
            return TXT('fogao_idle', 'none');
        case 'despensa':
            if (!s.despensaOpen) {
                s.despensaOpen = true; s.despensaSeen = true; emit('despensa'); f6Bump();
                return TXT('despensa', 'creak', 750);
            }
            return TXT('despensa2', 'paper');
        case 'fosforos':
            if (!s.inv.fosforos) {
                s.inv.fosforos = true; emit('pickup:fosforos'); f6Bump();
                return TXT('fosforos', 'drawer', 350);
            }
            return { kind: 'none' };
        // ── the dead cab ──
        case 'soq_fusivel':
            if (s.installed.fusivel) return TXT('soq_fusivel_done', 'none');
            if (s.inv.fusivel) {
                s.inv.fusivel = false; s.installed.fusivel = true; emit('install:fusivel'); f6Bump();
                return TXT('soq_fusivel_in', 'none', 800);
            }
            return TXT('soq_fusivel', 'click');
        case 'botoeira': return TXT('botoeira', 'click');
        case 'soq_rele':
            if (s.installed.rele) return TXT('soq_rele_done', 'none');
            if (s.inv.rele) {
                s.inv.rele = false; s.installed.rele = true; emit('install:rele'); f6Bump();
                return TXT('soq_rele_in', 'none', 800);
            }
            return TXT('soq_rele', 'click');
        case 'eixo':
            if (allInstalled()) return { kind: 'crank' };
            if (!s.installed.manivela && s.inv.manivela) {
                s.inv.manivela = false; s.installed.manivela = true; emit('install:manivela'); f6Bump();
                if (allInstalled()) return { kind: 'crank' };
                return TXT('eixo_manivela', 'none', 800);
            }
            if (s.installed.manivela) return TXT('eixo_falta', 'clank');
            return TXT('eixo', 'click');
        case 'hospede': return TXT('hospede_idle', 'breath');
    }
    return { kind: 'none' };
}

/** Try the bathroom padlock. */
export function f6TryCode(code: string): boolean {
    if (code === F6_CODE && !f6.bathOpen) {
        f6.bathOpen = true; emit('unlock'); f6Bump();
        return true;
    }
    return false;
}

/** Hold-to-crank. Returns true the moment the elevator comes back. */
export function f6Crank(dt: number): boolean {
    if (f6.phase !== 'explore') return false;
    f6.crankT = Math.min(1, f6.crankT + dt / 3.2);
    if (f6.crankT >= 1) {
        f6.phase = 'blackout'; f6.blackT = 0;
        emit('repaired');
        f6Bump();
        return true;
    }
    return false;
}

/** Advance the guest's dialogue (tap). */
export function f6AdvanceGuest(): void {
    if (f6.phase !== 'guest') return;
    if (f6.guestLine < F6_GUEST_LINES.length - 1) { f6.guestLine++; f6Bump(); }
    else { f6.phase = 'guestIdle'; f6Bump(); }
}

/** Per-frame director: bang trigger, steam, melt, blackout→guest. Called by
 *  Floor6Suite's useFrame with the live player Z. */
export function f6Tick(dt: number, playerZ: number): void {
    const s = f6;
    if (s.phase === 'arrive') {
        if (playerZ > -7) { s.phase = 'explore'; emit('bang'); f6Bump(); }
        return;
    }
    if (s.tapOn && !s.fogDone) {
        s.fogT += dt;
        if (s.fogT >= 6) { s.fogDone = true; s.tapOn = false; f6Bump(); }
    }
    if (s.melting) {
        s.meltT += dt;
        if (s.meltT >= 9) { s.melting = false; s.panRele = true; emit('melted'); f6Bump(); }
    }
    if (s.phase === 'blackout') {
        s.blackT += dt;
        if (s.blackT >= 1.6) { s.phase = 'guest'; s.guestLine = 0; emit('guestAppear'); f6Bump(); }
    }
}

/** The HUD's one-line objective. */
export function f6Objective(): string | null {
    const s = f6;
    if (s.phase === 'arrive') return null;
    if (s.phase === 'blackout' || s.phase === 'guest') return null;
    if (s.phase === 'guestIdle') return 'Ele não sai da frente da porta.';
    const have = F6_PARTS.filter((p) => s.installed[p]).length;
    const carrying = F6_PARTS.filter((p) => s.inv[p]).length;
    if (have === 3) return 'Gire o guincho de emergência, dentro do elevador.';
    if (carrying > 0) return `Instale as peças dentro do elevador morto. (${have}/3 instaladas)`;
    return `O elevador estourou. Peças do conserto: ${have + carrying}/3`;
}
