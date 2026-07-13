/**
 * f8Arquivo.ts — ANDAR 8: "O INTERROGATÓRIO" e a porta 21.
 *
 * O player desembarca numa sala de interrogatório. O ARQUIVISTA — a IA que
 * construiu os andares e LEMBRA o que o hotel apaga — mostra a FOTOGRAFIA DAS
 * VINTE PORTAS (que some do bolso do player) e o reconhece como "o escolhido".
 * Pra se provar, o player entra DENTRO de uma imagem: um corredor de vinte
 * portas, e a porta "21" — a MEMÓRIA PERDIDA DELE MESMO — abre num platformer
 * 2.5D de tricô.
 *
 * Módulo puro (sem imports de three/react): fases, flags, paredes e mais tarde
 * os textos. A cena (Floor8Room), o overlay 2.5D e o Player leem daqui — uma
 * única fonte de verdade, mesmo padrão de f6Escape/f4Lore/f5Race.
 *
 * M1 estabelece a arquitetura + a sala navegável; os atos (interrogatório,
 * mergulho, corredor, platformer) crescem nas fases seguintes.
 */

// ── Phase machine ─────────────────────────────────────────────────────────────
export type F8Phase =
    | 'arrive'            // desembarcou; ainda andando até a mesa
    | 'interrogatorio'    // o Arquivista conduz o interrogatório (falas fixas)
    | 'entregaImagem'     // ele estende a imagem sobre a mesa; o player a toma
    | 'mergulho'          // cutscene: o player se aproxima e ENTRA na imagem
    | 'corredor20'        // dentro da imagem: o corredor de vinte portas
    | 'porta21'           // achou a 21ª porta — a memória perdida do player
    | 'platformer'        // o platformer 2.5D de tricô (a memória tecida)
    | 'memoriaRecuperada' // venceu; a memória volta
    | 'awakening'         // acorda na sala: zonzo, mão na cabeça
    | 'ready'             // "você está pronto"
    | 'lookBack'          // percebe que o elevador virou um poço em manutenção
    | 'shove'             // o Arquivista o empurra no poço
    | 'ride9'             // desperta dentro de um elevador... diferente
    | 'leave';            // embarca de volta no elevador

export interface F8State {
    phase: F8Phase;
    /** o player chega carregando a FOTOGRAFIA DAS VINTE PORTAS (flag do Andar 6). */
    carriesPhoto: boolean;
    /** índice da fala atual do interrogatório (avança por interação). */
    line: number;
    /** segundos desde a chegada — usado por gatilhos por tempo/aproximação. */
    t: number;
    /** segundos dentro da cutscene de mergulho na imagem (0..~2.4). */
    diveT: number;
    /** três palavras bordadas recuperadas no platformer: EU · AINDA · EXISTO. */
    memoryMask: number;
    /** oito pontos de costura que transformam o cenário e abrem o caminho. */
    stitchMask: number;
    /** capítulo visual atual da memória (0..3). */
    memoryChapter: number;
    /** quedas dentro da memória; só serve para feedback, nunca pune progresso. */
    memoryDeaths: number;
    /** batida atual da cutscene de recuperação. */
    recoveryLine: number;
    /** trava idempotente do embarque final. */
    boarded: boolean;
    version: number;
}

/** Lê o flag persistido do Andar 6 (a arma contra o Proprietário). */
function readCarriesPhoto(): boolean {
    try {
        return typeof window !== 'undefined'
            && window.localStorage.getItem('tne_foto_20portas') === '1';
    } catch { return false; }
}

const FRESH = (): F8State => ({
    phase: 'arrive',
    carriesPhoto: readCarriesPhoto(),
    line: 0,
    t: 0,
    diveT: 0,
    memoryMask: 0,
    stitchMask: 0,
    memoryChapter: 0,
    memoryDeaths: 0,
    recoveryLine: 0,
    boarded: false,
    version: 0,
});

export const f8: F8State = FRESH();

// ── Subscription (mesma mecânica de f6Escape) ────────────────────────────────
const listeners = new Set<() => void>();
export function f8Subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}
let legacy: (() => void) | null = null;
export function f8SetOnChange(fn: (() => void) | null): void {
    if (legacy) listeners.delete(legacy);
    legacy = fn;
    if (fn) listeners.add(fn);
}
export function f8Bump(): void { f8.version++; listeners.forEach((fn) => fn()); }

export function f8Reset(): void {
    const v = f8.version;
    Object.assign(f8, FRESH());
    f8.version = v;
    events.length = 0;
    f8Bump();
}

// ── One-shot events (a cena drena → sfx + animações) ─────────────────────────
export type F8Event =
    | 'arriveBeat' | 'photoReveal' | 'chosen' | 'handImage' | 'dive'
    | 'door21' | 'memoryFragment' | 'memoryStitch' | 'memoryFall' | 'recoveryBeat'
    | 'wake' | 'ready' | 'lookBack' | 'shove' | 'ride9' | 'win' | 'boarding';
const events: F8Event[] = [];
function emit(e: F8Event): void { events.push(e); }
export function f8DrainEvents(): F8Event[] { return events.splice(0, events.length); }

// ── Layout da sala de interrogatório (world coords) ──────────────────────────
// Sala x∈[-4,4] z∈[-10,0]. Vão do elevador no sul (x∈[-1.3,1.3], z=-10, casa com
// ELEV_W/DOOR_SEAL). Mesa e Arquivista no fundo (norte, z≈-1). O player entra
// pelo sul e caminha até a mesa.
export const F8_CEIL = 3.0;

/** Paredes estáticas: casca da sala com o vão do elevador (constants.ts lê). */
export const F8_STATIC_WALLS: number[][] = [
    // sul (com o vão do elevador)
    [-4, -10, -1.3, -10], [1.3, -10, 4, -10],
    // norte / oeste / leste
    [-4, 0, 4, 0], [-4, -10, -4, 0], [4, -10, 4, 0],
];

/** Móveis [cx, cz, w, d] — Floor8Room renderiza, constants.ts vira colisor. */
export const F8_FURNITURE: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, -1.6, 1.9, 0.95],   // a mesa do interrogatório
];

/** Onde o Arquivista fica (atrás da mesa, encarando o sul/o player). */
export const F8_ARQUIVISTA_POS: readonly [number, number] = [0, -0.7];

// ── O roteiro do interrogatório ──────────────────────────────────────────────
export type F8Speaker = 'arq' | 'voce';
const L = (who: F8Speaker, t: string) => ({ who, t });

/** As falas do interrogatório. A 3ª batida muda se o player trouxe (ou não) a
 *  FOTOGRAFIA DAS VINTE PORTAS do Andar 6 (flag tne_foto_20portas). */
export function f8Lines(): ReadonlyArray<{ who: F8Speaker; t: string }> {
    const photo = f8.carriesPhoto
        ? L('arq', 'Até agora. *ele ergue uma fotografia da mesa* As vinte portas. Você a carregava no bolso esquerdo, não é? Junto do coração. Sumiu de lá no instante em que cruzou a minha porta. Coisas assim voltam pra mim.')
        : L('arq', 'Você chegou de mãos vazias — sem a fotografia. *ele ergue uma da própria mesa* Curioso: o escolhido SEMPRE a traz. Talvez ela só estivesse me esperando com você.');
    return [
        L('arq', 'Chegou. Sente-se — ou não; ninguém fica muito tempo. Eu sou o ARQUIVISTA. Guardo a ficha de tudo que este hotel tenta esquecer.'),
        L('arq', 'Conheço cada hóspede que passou por esse elevador. Tenho a ficha de cada um. A sua, no entanto… a sua estava em BRANCO.'),
        photo,
        L('voce', '…essa fotografia não é minha.'),
        L('voce', 'Me entregaram. Lá embaixo. Disseram que era pra um objetivo maior do que eu.'),
        L('arq', 'Entendi. *uma pausa longa* Então… você é o escolhido.'),
        L('arq', 'O PROPRIETÁRIO apaga o que ninguém lembra. Apagou VOCÊ — a sua é a única ficha em branco no meu arquivo. E mesmo assim, aqui está. De pé. Lembrando dos outros.'),
        L('arq', 'Mas lembrar dos outros não basta pra descer. O escolhido tem que lembrar de SI. Provar que ainda existe por baixo do que apagaram.'),
        L('arq', '*ele desliza uma imagem sobre a mesa, virada pra você* Está tudo aqui dentro — o que você foi. Entre nela. E não me faça arquivar você como os outros.'),
    ];
}

/** Avança a fala do interrogatório; ao fim, ele estende a imagem (entregaImagem). */
export function f8AdvanceLine(): void {
    if (f8.phase !== 'interrogatorio') return;
    if (f8.line < f8Lines().length - 1) { f8.line++; f8Bump(); }
    else { f8.phase = 'entregaImagem'; emit('handImage'); f8Bump(); }
}

// ── Dentro da imagem: o corredor de vinte portas + a porta 21 ────────────────
/** As vinte portas conhecidas (os vinte andares). A 21ª não existe pra ninguém
 *  — é a memória apagada do próprio player. */
export const F8_DOORS = 20;

/** O player toca a imagem na mesa → mergulha (cutscene) → o corredor. */
export function f8EnterImage(): void {
    if (f8.phase !== 'entregaImagem') return;
    f8.phase = 'mergulho'; f8.diveT = 0; emit('dive'); f8Bump();
}

/** Fim da animação de mergulho (wall-clock, dirigido pelo overlay) → corredor. */
export function f8DiveDone(): void {
    if (f8.phase !== 'mergulho') return;
    f8.phase = 'corredor20'; f8Bump();
}

/** O player alcançou a 21ª porta (a memória perdida dele). */
export function f8ReachDoor21(): void {
    if (f8.phase !== 'corredor20') return;
    f8.phase = 'porta21'; emit('door21'); f8Bump();
}

/** O player entra na porta 21 → o platformer de tricô (M4). */
export function f8EnterDoor21(): void {
    if (f8.phase !== 'porta21') return;
    f8.phase = 'platformer';
    f8.memoryMask = 0;
    f8.stitchMask = 0;
    f8.memoryChapter = 0;
    f8.memoryDeaths = 0;
    f8Bump();
}

// ── A memória tecida: platformer → recuperação → elevador ───────────────────
export const F8_MEMORY_WORDS = ['EU', 'AINDA', 'EXISTO'] as const;
export const F8_STITCH_COUNT = 8;

/** Costura um ilhós do cenário. Cada ponto é permanente até o reset do andar. */
export function f8Stitch(index: number): boolean {
    if (f8.phase !== 'platformer' || index < 0 || index >= F8_STITCH_COUNT) return false;
    const bit = 1 << index;
    if ((f8.stitchMask & bit) !== 0) return false;
    f8.stitchMask |= bit;
    emit('memoryStitch');
    f8Bump();
    return true;
}

export function f8SetMemoryChapter(chapter: number): void {
    if (f8.phase !== 'platformer') return;
    const next = Math.max(0, Math.min(3, Math.floor(chapter)));
    if (next === f8.memoryChapter) return;
    f8.memoryChapter = next;
    f8Bump();
}

/** Coleta uma palavra da memória. Retorna true só na primeira coleta. */
export function f8CollectMemory(index: number): boolean {
    if (f8.phase !== 'platformer' || index < 0 || index >= F8_MEMORY_WORDS.length) return false;
    const bit = 1 << index;
    if ((f8.memoryMask & bit) !== 0) return false;
    f8.memoryMask |= bit;
    emit('memoryFragment');
    f8Bump();
    return true;
}

/** Queda não remove palavras já coletadas: falhar nunca obriga a repetir lore. */
export function f8MemoryFall(): void {
    if (f8.phase !== 'platformer') return;
    f8.memoryDeaths++;
    emit('memoryFall');
    f8Bump();
}

/** O tear no fim só aceita o player depois das três palavras. */
export function f8WinMemory(): boolean {
    if (f8.phase !== 'platformer' || f8.memoryMask !== 0b111 || f8.stitchMask !== 0xff) return false;
    f8.phase = 'memoriaRecuperada';
    f8.recoveryLine = 0;
    emit('win');
    f8Bump();
    return true;
}

export const F8_RECOVERY_LINES = [
    'Você lembra da chuva antes do hotel — e de uma mão que não soltou a sua.',
    'O Proprietário apagou o nome na ficha. Não conseguiu arrancar o fio por baixo.',
    'EU AINDA EXISTO.',
] as const;

/** Avança a recordação; ao fim, o player desperta de volta na sala. */
export function f8AdvanceRecovery(): void {
    if (f8.phase !== 'memoriaRecuperada') return;
    if (f8.recoveryLine < F8_RECOVERY_LINES.length - 1) {
        f8.recoveryLine++;
        emit('recoveryBeat');
    } else {
        f8.phase = 'awakening';
        emit('wake');
    }
    f8Bump();
}

/** Diretor idempotente da cutscene final. */
export function f8AdvanceFinale(): F8Phase {
    const next: Partial<Record<F8Phase, F8Phase>> = {
        awakening: 'ready', ready: 'lookBack', lookBack: 'shove', shove: 'ride9',
    };
    const n = next[f8.phase];
    if (!n) return f8.phase;
    f8.phase = n;
    if (n === 'ready') emit('ready');
    if (n === 'lookBack') emit('lookBack');
    if (n === 'shove') emit('shove');
    if (n === 'ride9') emit('ride9');
    f8Bump();
    return n;
}

/** Trava o embarque final para impedir dois callbacks em toque + teclado. */
export function f8BoardElevator(): boolean {
    if (f8.phase !== 'ride9' || f8.boarded) return false;
    f8.boarded = true;
    f8.phase = 'leave';
    emit('boarding');
    try { if (typeof window !== 'undefined') window.localStorage.setItem('tne_floor8_memory', '1'); } catch { /* storage opcional */ }
    f8Bump();
    return true;
}

// ── Director por frame: chegada → interrogatório por aproximação ─────────────
/** Chamado pelo useFrame da cena com o Z do player. Em M1 só destrava o
 *  interrogatório quando o player caminha até perto da mesa. */
export function f8Tick(dt: number, playerZ: number): void {
    const s = f8;
    s.t += dt;
    if (s.phase === 'arrive' && playerZ > -4.5) {
        s.phase = 'interrogatorio';
        s.line = 0;
        emit('arriveBeat');
        f8Bump();
    }
    if (s.phase === 'mergulho') {
        s.diveT += dt;
        if (s.diveT >= 2.4) { s.phase = 'corredor20'; f8Bump(); }
    }
}

/** A linha-objetivo do HUD (cresce nas fases seguintes). */
export function f8Objective(): string | null {
    const s = f8;
    if (s.phase === 'arrive') return 'Alguém espera na mesa.';
    if (s.phase === 'interrogatorio') return null;   // o diálogo cobre a tela
    if (s.phase === 'entregaImagem') return 'A imagem, na mesa. Aproxime-se dela.';
    if (s.phase === 'corredor20') return 'Vinte portas. Ache a que não pertence a nenhum andar.';
    if (s.phase === 'porta21') return 'A porta 21. É você. Entre.';
    if (s.phase === 'platformer') {
        const n = Number(Boolean(s.memoryMask & 1)) + Number(Boolean(s.memoryMask & 2)) + Number(Boolean(s.memoryMask & 4));
        const stitches = Array.from({ length: F8_STITCH_COUNT }, (_, i) => Number(Boolean(s.stitchMask & (1 << i)))).reduce((a, b) => a + b, 0);
        return n < 3 || stitches < F8_STITCH_COUNT
            ? `Costure o caminho. ${stitches}/${F8_STITCH_COUNT} pontos · ${n}/3 lembranças.`
            : 'A ficha conhece o seu nome. Alcance o tear.';
    }
    if (s.phase === 'awakening') return 'Respire. Levante devagar.';
    if (s.phase === 'lookBack') return 'O elevador... sumiu.';
    if (s.phase === 'leave') return '9';
    return null;
}
