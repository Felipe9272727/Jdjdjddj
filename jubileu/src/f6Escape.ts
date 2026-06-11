/**
 * f6Escape.ts — FLOOR 6: "O HÓSPEDE QUE SABIA DEMAIS" (escape room realista).
 *
 * A Suíte 612. O elevador quebra assim que o player desembarca — manutenção
 * "programada" — e as 3 peças do conserto estão escondidas atrás de uma
 * cadeia de puzzles: o código do banheiro está espalhado pelo quarto, a chave
 * da cozinha desceu pelo ralo, o relé está num bloco de gelo. O antigo
 * ocupante contou os andares (são VINTE, não sete) e pagou por saber.
 *
 * Pure module (sem imports de three/react): fases, flags, paredes, hotspots
 * e TODOS os textos. A cena (Floor6Suite), o overlay DOM e o Player leem
 * daqui — uma única fonte de verdade, padrão f4Lore/f5Race.
 */

// ── Phase machine ─────────────────────────────────────────────────────────────
export type F6Phase =
    | 'arrive'      // doors opened; the elevator still pretends to work
    | 'explore'     // BANG — panel blown, 3 parts missing; the escape room
    | 'blackout'    // crank turned, ding… lights die for a beat
    | 'guest'       // the one-armed guest is between you and the doors
    | 'guestIdle';  // dialogue done — he won't move. (Felipe writes what's next)

export type F6Item = 'cabide' | 'chave' | 'gelo' | 'manivela' | 'fusivel' | 'rele';
export type F6Part = 'manivela' | 'fusivel' | 'rele';

export interface F6State {
    phase: F6Phase;
    bathOpen: boolean;
    kitchenOpen: boolean;
    inv: Record<F6Item, boolean>;
    installed: Record<F6Part, boolean>;
    bedPulls: number;          // tugs on the mattress crank (needs 3)
    tapOn: boolean;            // bathroom hot tap running
    fogT: number;              // seconds of steam so far
    fogDone: boolean;          // mirror message revealed
    mirrorRead: boolean;       // player has read the steam message
    tvOn: boolean;
    despensaSeen: boolean;     // the truth wall — long text only the first time
    melting: boolean;          // ice block sitting in the pan
    meltT: number;
    crankT: number;            // 0..1 — hold-to-crank progress
    blackT: number;
    guestLine: number;
    version: number;
}

export const f6: F6State = {
    phase: 'arrive', bathOpen: false, kitchenOpen: false,
    inv: { cabide: false, chave: false, gelo: false, manivela: false, fusivel: false, rele: false },
    installed: { manivela: false, fusivel: false, rele: false },
    bedPulls: 0, tapOn: false, fogT: 0, fogDone: false, mirrorRead: false, tvOn: false,
    despensaSeen: false, melting: false, meltT: 0, crankT: 0, blackT: 0, guestLine: 0, version: 0,
};

let onChange: (() => void) | null = null;
export function f6SetOnChange(fn: (() => void) | null): void { onChange = fn; }
export function f6Bump(): void { f6.version++; onChange?.(); }

export function f6Reset(): void {
    f6.phase = 'arrive'; f6.bathOpen = false; f6.kitchenOpen = false;
    f6.inv = { cabide: false, chave: false, gelo: false, manivela: false, fusivel: false, rele: false };
    f6.installed = { manivela: false, fusivel: false, rele: false };
    f6.bedPulls = 0; f6.tapOn = false; f6.fogT = 0; f6.fogDone = false; f6.mirrorRead = false;
    f6.tvOn = false; f6.despensaSeen = false; f6.melting = false; f6.meltT = 0;
    f6.crankT = 0; f6.blackT = 0; f6.guestLine = 0;
    events.length = 0;
    f6Bump();
}

// ── One-shot events (scene/overlay drain these to fire sfx + visuals) ────────
export type F6Event = 'bang' | 'unlock' | 'chain' | 'install' | 'repaired' | 'guestAppear' | 'melted';
const events: F6Event[] = [];
function emit(e: F6Event): void { events.push(e); }
export function f6DrainEvents(): F6Event[] { return events.splice(0, events.length); }

// ── The bathroom padlock code: quadro · telefone · "o andar que não existe" · canal
export const F6_CODE = '9142';

// ── Suite layout (world coords; elevator doorway at x∈[-1.3,1.3], z=-10) ─────
// Bedroom x∈[-8,1.5] z∈[-10,7] · Bathroom x∈[1.5,6] z∈[-10,-3] · Kitchen x∈[1.5,6] z∈[-3,7]
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
];

const DOOR_BATH: number[] = [1.5, -6.2, 1.5, -4.8];
const DOOR_KITCHEN: number[] = [1.5, 2.3, 1.5, 3.7];
const DOOR_ELEVATOR_BLOCK: number[] = [-1.45, -9.9, 1.45, -9.9];   // the guest won't move

const _DW_BOTH = [DOOR_BATH, DOOR_KITCHEN];
const _DW_BATH = [DOOR_BATH];
const _DW_KITCHEN = [DOOR_KITCHEN];
const _DW_NONE: number[][] = [];

/** Live LOCKED-door segments (resolved per-frame by Player.tsx on level 6).
 *  Prebuilt lists — zero allocation. */
export function f6DoorWalls(): number[][] {
    const block = f6.phase === 'guest' || f6.phase === 'guestIdle' || f6.phase === 'blackout';
    const base = !f6.bathOpen
        ? (!f6.kitchenOpen ? _DW_BOTH : _DW_BATH)
        : (!f6.kitchenOpen ? _DW_KITCHEN : _DW_NONE);
    return block ? [...base, DOOR_ELEVATOR_BLOCK] : base;
}

// ── Hotspots ──────────────────────────────────────────────────────────────────
export interface F6Hotspot { id: string; x: number; z: number; label: string; reach?: number }

const H = (id: string, x: number, z: number, label: string, reach?: number): F6Hotspot =>
    ({ id, x, z, label, reach });

function allInstalled(): boolean {
    return f6.installed.manivela && f6.installed.fusivel && f6.installed.rele;
}

/** Hotspots the player can currently reach for (state-aware). */
export function f6Hotspots(): F6Hotspot[] {
    const s = f6;
    if (s.phase === 'arrive') return [];
    const list: F6Hotspot[] = [
        H('panel', 0.6, -9.5, allInstalled() ? 'Girar a manivela' : 'Painel do elevador'),
        H('quadro', -2.5, -9.4, 'Quadro torto'),
        H('maquina', -5.5, -8.9, 'Máquina de escrever'),
        H('cama', -6.6, 1.2, s.inv.manivela || s.installed.manivela ? 'Colchão rasgado' : 'Colchão'),
        H('diario', -6.9, 2.9, 'Diário'),
        H('telefone', -7.5, 4.5, 'Telefone'),
        H('janela', -7.7, -2.0, 'Janela'),
        H('guardaroupa', -3.5, 6.3, 'Guarda-roupa'),
        H('tv', 0.9, 1.2, s.tvOn ? 'Televisão (estática)' : 'Ligar a televisão'),
        H('portabanheiro', 1.5, -5.5, s.bathOpen ? '' : 'Cadeado do banheiro'),
        H('portacozinha', 1.5, 3.0, s.kitchenOpen ? '' : 'Porta da cozinha'),
    ];
    if (s.bathOpen) {
        list.push(
            H('pia', 3.2, -9.3, !s.tapOn && !s.fogDone ? 'Pia (torneira quente)' : s.fogDone && s.mirrorRead && !s.inv.chave ? 'Ralo da pia' : 'Pia do banheiro'),
            H('espelho', 3.2, -9.0, s.fogDone && !s.mirrorRead ? 'Espelho embaçado' : 'Espelho'),
            H('privada', 5.5, -8.3, 'Caixa de descarga'),
            H('banheira', 3.75, -4.2, 'Banheira'),
        );
    }
    if (s.kitchenOpen) {
        list.push(
            H('geladeira', 5.4, -1.9, 'Geladeira'),
            H('fogao', 5.4, 0.6, s.melting ? 'Panela (derretendo…)' : 'Fogão'),
            H('despensa', 3.75, 6.1, 'Despensa'),
        );
    }
    if (s.phase === 'guestIdle') list.push(H('hospede', 0, -8.2, 'O Hóspede', 2.2));
    return list.filter((h) => h.label !== '');
}

// ── All the words ─────────────────────────────────────────────────────────────
export const F6_NOTE_PANEL =
    'Um bilhete preso ao painel, datilografado. A tinta está úmida:\n\n"MANUTENÇÃO PROGRAMADA.\nAGUARDE NO QUARTO.\n— a administração"';

export const F6_TXT: Record<string, { title: string; text: string }> = {
    maquina: {
        title: 'MÁQUINA DE ESCREVER',
        text: 'Uma página pela metade, ainda presa no rolo:\n\n"eu contei os andares. não são sete como o robô do 5 jura — coitado, ele só conhece o dele. são VINTE. eu subi de serviço, contei as portas, FOTOGRAFEI.\n\namanhã fazem o meu check-out.\n\nse você está lendo isto, escondi os números onde eles não olham: atrás do quadro torto, embaixo do telefone, no andar que não existe, e no canal que só dá estática."',
    },
    quadro: {
        title: 'QUADRO TORTO',
        text: 'Está torto. Como o do andar 4.\n\nAtrás da moldura, riscado a faca na parede:\n\n« 9 »',
    },
    telefone: {
        title: 'TELEFONE',
        text: 'Você levanta o aparelho. Não há linha — só uma respiração, paciente, do outro lado.\n\nVocê desliga devagar e vira o telefone: colado embaixo, um papelzinho:\n\n« 1 »',
    },
    diario: {
        title: 'DIÁRIO',
        text: '"dia 47. eles sorriem quando eu pergunto do último andar. sorriem igual.\n\no terceiro número eu deixei onde só quem LEMBRA encontra: é o andar que não existe."',
    },
    tvon: {
        title: 'TELEVISÃO',
        text: 'O tubo estala e acende em chuvisco. No meio da estática, meio segundo de um frame congelado: um corredor de hotel que você nunca viu, comprido demais.\n\nNo canto da tela: CANAL 2.',
    },
    tvagain: {
        title: 'TELEVISÃO',
        text: 'Só estática. O canal 2 insiste em existir.\n\n« 2 »',
    },
    janela: {
        title: 'JANELA',
        text: 'A cortina está pesada de poeira. Lá fora, uma névoa parada feito fotografia.\n\nEla não se move. Nunca se move.',
    },
    guardaroupa: {
        title: 'GUARDA-ROUPA',
        text: 'Roupas de um homem organizado: três camisas iguais, um terno, um roupão faltando no gancho.\n\nNo fundo, cabides de arame. Você pega um CABIDE.',
    },
    guardaroupa2: {
        title: 'GUARDA-ROUPA',
        text: 'As camisas continuam esperando por ele.',
    },
    camapull: { title: 'COLCHÃO', text: 'Tem algo enfiado num rasgo do colchão. Está preso.\n\n(continue puxando)' },
    camapull2: { title: 'COLCHÃO', text: 'Cede um pouco. Quase…' },
    camagot: {
        title: 'COLCHÃO',
        text: 'Com um rasgo a mais, ela vem: uma MANIVELA de emergência, embrulhada numa fronha.\n\nEle sabia que iam quebrar o elevador.',
    },
    camadone: { title: 'COLCHÃO', text: 'O rasgo no colchão, agora vazio. Ele dormia em cima do plano de fuga.' },
    portabanheiro: {
        title: 'PORTA DO BANHEIRO',
        text: 'Um cadeado de 4 dígitos, novo, por fora da porta.\n\nQuem tranca um BANHEIRO por fora?',
    },
    portacozinha: {
        title: 'PORTA DA COZINHA',
        text: 'Corrente e fechadura. ELES trancaram a comida dele.\n\nPrecisa de uma chave pequena.',
    },
    pia_tap: {
        title: 'PIA',
        text: 'Você abre a torneira quente até o fim. A água sai fervendo; o vapor começa a subir pelo espelho.',
    },
    pia_wait: { title: 'PIA', text: 'A água quente segue correndo. O espelho está embaçando…' },
    espelho_clean: { title: 'ESPELHO', text: 'Seu reflexo, num banheiro trancado por fora. Nada mais. Por enquanto.' },
    espelho_msg: {
        title: 'ESPELHO EMBAÇADO',
        text: 'No vapor, letras aparecem — escritas do lado de DENTRO, há muito tempo:\n\n"ELES TRANCARAM MINHA COMIDA.\nA CHAVE DESCEU PELO RALO."',
    },
    ralo_nada: {
        title: 'RALO DA PIA',
        text: 'Algo brilha lá no fundo do ralo, fora do alcance dos dedos.\n\nPrecisa de algo comprido e fino.',
    },
    ralo_chave: {
        title: 'RALO DA PIA',
        text: 'Você desentorta o cabide, faz um gancho, e pesca no escuro do cano…\n\n…uma CHAVE pequena, fria e limpa demais.',
    },
    privada: {
        title: 'CAIXA DE DESCARGA',
        text: 'Você levanta a tampa de louça. Dentro, acima da linha d\'água, preso com fita: um FUSÍVEL industrial embrulhado em plástico.\n\nEle escondeu o conserto inteiro. Só não teve tempo de usar.',
    },
    privada2: { title: 'CAIXA DE DESCARGA', text: 'Só água parada e o resto da fita adesiva.' },
    banheira: {
        title: 'BANHEIRA',
        text: 'Atrás da cortina, um embrulho de toalhas, amarrado com um cuidado que dá frio.\n\nA etiqueta, datilografada:\n\n"PARTE QUE SOBRA — TRATAR BEM.\n— a administração"\n\nVocê decide não abrir.',
    },
    geladeira: {
        title: 'GELADEIRA',
        text: 'Marmitas etiquetadas à mão: DIA 1… DIA 46… DIA 47. A última está intacta.\n\nNo congelador, um bloco de gelo com algo escuro dentro — parece um RELÉ.\n\nVocê pega o bloco. Vai precisar derreter.',
    },
    geladeira2: { title: 'GELADEIRA', text: 'As marmitas dele. Ninguém vai comer a do dia 47.' },
    fogao_no: { title: 'FOGÃO', text: 'Uma boca ainda funciona. Tem uma panela seca em cima, esperando.' },
    fogao_melt: {
        title: 'FOGÃO',
        text: 'Você acende a boca e deita o bloco de gelo na panela.\n\nO gelo chia. É esperar.',
    },
    fogao_done: { title: 'FOGÃO', text: 'Na panela, na água ainda morna: o RELÉ. Você seca na manga e guarda.' },
    despensa: {
        title: 'A DESPENSA',
        text: 'A porta da despensa abre para a verdade dele:\n\nUm mapa desenhado à mão — VINTE andares, um sobre o outro, ligados por barbante vermelho. Polaroids nos primeiros cinco: a casa, a água escura, o desenho animado, o saguão destruído, a pista do robô.\n\nDo 7 ao 19: pontos de interrogação.\n\nNo 20, riscado com tanta força que rasgou o papel:\n\n"ELE MORA NO ÚLTIMO."',
    },
    despensa2: {
        title: 'A DESPENSA',
        text: 'O barbante vermelho treme quando você respira perto.\n\n"ELE MORA NO ÚLTIMO."',
    },
    hospede_idle: {
        title: 'O HÓSPEDE',
        text: 'Ele não sai da frente da porta. A respiração dele é o único relógio do quarto.\n\n"Me escuta. Só me escuta."',
    },
};

/** Panel text variants. */
export function f6PanelText(): { title: string; text: string } {
    const missing: string[] = [];
    if (!f6.installed.fusivel) missing.push('FUSÍVEL');
    if (!f6.installed.rele) missing.push('RELÉ');
    if (!f6.installed.manivela) missing.push('MANIVELA');
    if (missing.length === 3 && !f6.inv.fusivel && !f6.inv.rele && !f6.inv.manivela) {
        return {
            title: 'PAINEL DO ELEVADOR',
            text: F6_NOTE_PANEL + '\n\nO painel pende aberto, queimado. Três soquetes vazios:\nFUSÍVEL · RELÉ · MANIVELA.',
        };
    }
    return {
        title: 'PAINEL DO ELEVADOR',
        text: missing.length
            ? `Soquetes vazios: ${missing.join(' · ')}.`
            : 'Tudo no lugar. Falta girar a manivela.',
    };
}

// ── The guest ────────────────────────────────────────────────────────────────
export const F6_GUEST_LINES: ReadonlyArray<string> = [
    'Você consertou. Claro que consertou. Eles SABIAM que você consertaria… as peças não caíram, foram DEIXADAS. Pra você. Pra medir você.',
    'Eu subi uma vez. O andar de cima não é um andar. O elevador me trouxe de volta… em partes. E eles cuidaram muito bem das partes que sobraram.',
    'Antes de apertar qualquer botão… me escuta. Só me escuta.',
];

// ── Interactions ──────────────────────────────────────────────────────────────
export type F6Sfx =
    | 'paper' | 'click' | 'clank' | 'water' | 'static' | 'unlock' | 'chain'
    | 'drawer' | 'breath' | 'none';

export type F6Action =
    | { kind: 'text'; title: string; text: string; sfx: F6Sfx }
    | { kind: 'keypad' }
    | { kind: 'crank' }
    | { kind: 'none' };

const TXT = (k: string, sfx: F6Sfx = 'paper'): F6Action =>
    ({ kind: 'text', title: F6_TXT[k].title, text: F6_TXT[k].text, sfx });

export function f6Interact(id: string): F6Action {
    const s = f6;
    switch (id) {
        case 'panel': {
            if (s.installed.manivela && s.installed.fusivel && s.installed.rele) return { kind: 'crank' };
            // install whatever parts we carry, one tap = all (each clanks in the scene)
            let installedNow = 0;
            (['fusivel', 'rele', 'manivela'] as F6Part[]).forEach((p) => {
                if (s.inv[p] && !s.installed[p]) { s.inv[p] = false; s.installed[p] = true; installedNow++; emit('install'); }
            });
            if (installedNow > 0) {
                f6Bump();
                if (s.installed.manivela && s.installed.fusivel && s.installed.rele) return { kind: 'crank' };
                const t = f6PanelText();
                return { kind: 'text', title: t.title, text: `Encaixado. ${t.text}`, sfx: 'clank' };
            }
            const t = f6PanelText();
            return { kind: 'text', title: t.title, text: t.text, sfx: 'paper' };
        }
        case 'quadro': return TXT('quadro');
        case 'maquina': return TXT('maquina');
        case 'diario': return TXT('diario');
        case 'telefone': return TXT('telefone', 'click');
        case 'janela': return TXT('janela', 'none');
        case 'guardaroupa':
            if (!s.inv.cabide) { s.inv.cabide = true; f6Bump(); return TXT('guardaroupa', 'drawer'); }
            return TXT('guardaroupa2', 'drawer');
        case 'tv':
            if (!s.tvOn) { s.tvOn = true; f6Bump(); return TXT('tvon', 'static'); }
            return TXT('tvagain', 'static');
        case 'cama': {
            if (s.inv.manivela || s.installed.manivela) return TXT('camadone', 'none');
            s.bedPulls++;
            if (s.bedPulls >= 3) { s.inv.manivela = true; f6Bump(); return TXT('camagot', 'clank'); }
            f6Bump();
            return TXT(s.bedPulls === 1 ? 'camapull' : 'camapull2', 'drawer');
        }
        case 'portabanheiro':
            return s.bathOpen ? { kind: 'none' } : { kind: 'keypad' };
        case 'portacozinha':
            if (s.kitchenOpen) return { kind: 'none' };
            if (s.inv.chave) {
                s.inv.chave = false; s.kitchenOpen = true; emit('chain'); f6Bump();
                return { kind: 'text', title: 'PORTA DA COZINHA', text: 'A chave gira; a corrente escorrega e cai pesada no carpete.\n\nA cozinha dele, destrancada 47 dias tarde demais.', sfx: 'chain' };
            }
            return TXT('portacozinha', 'click');
        case 'pia': {
            if (!s.tapOn && !s.fogDone) { s.tapOn = true; f6Bump(); return TXT('pia_tap', 'water'); }
            if (s.tapOn && !s.fogDone) return TXT('pia_wait', 'water');
            if (s.fogDone && s.mirrorRead && !s.inv.chave && s.inv.cabide) {
                s.inv.cabide = false; s.inv.chave = true; f6Bump();
                return TXT('ralo_chave', 'click');
            }
            if (s.fogDone && s.mirrorRead && !s.inv.chave) return TXT('ralo_nada', 'none');
            return { kind: 'text', title: 'PIA', text: 'A louça da pia, gelada apesar do vapor.', sfx: 'none' };
        }
        case 'espelho':
            if (s.fogDone) {
                if (!s.mirrorRead) { s.mirrorRead = true; f6Bump(); }
                return TXT('espelho_msg', 'none');
            }
            return TXT('espelho_clean', 'none');
        case 'privada':
            if (!s.inv.fusivel && !s.installed.fusivel) { s.inv.fusivel = true; f6Bump(); return TXT('privada', 'water'); }
            return TXT('privada2', 'water');
        case 'banheira': return TXT('banheira', 'none');
        case 'geladeira':
            if (!s.inv.gelo && !s.inv.rele && !s.installed.rele && !s.melting) {
                s.inv.gelo = true; f6Bump(); return TXT('geladeira', 'drawer');
            }
            return TXT('geladeira2', 'drawer');
        case 'fogao':
            if (s.inv.gelo) { s.inv.gelo = false; s.melting = true; s.meltT = 0; f6Bump(); return TXT('fogao_melt', 'click'); }
            if (s.melting) return { kind: 'text', title: 'FOGÃO', text: 'O gelo ainda chia na panela. Quase.', sfx: 'none' };
            if (s.inv.rele || s.installed.rele) return { kind: 'text', title: 'FOGÃO', text: 'A panela, com a água do gelo já fria.', sfx: 'none' };
            return TXT('fogao_no', 'click');
        case 'despensa':
            if (!s.despensaSeen) { s.despensaSeen = true; f6Bump(); return TXT('despensa', 'paper'); }
            return TXT('despensa2', 'paper');
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
    f6.crankT = Math.min(1, f6.crankT + dt / 2.6);
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
        if (s.meltT >= 7) { s.melting = false; s.inv.rele = true; emit('melted'); f6Bump(); }
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
    const have = ['manivela', 'fusivel', 'rele'].filter((p) => s.installed[p as F6Part]).length;
    const carrying = ['manivela', 'fusivel', 'rele'].filter((p) => s.inv[p as F6Item]).length;
    if (have === 3) return 'Gire a manivela do painel.';
    if (have + carrying === 3) return 'Instale as peças no painel do elevador.';
    return `O elevador quebrou. Peças do conserto: ${have + carrying}/3`;
}
