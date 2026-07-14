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
    | 'platformer'        // o platformer 2.5D de crochê (a memória tecida)
    | 'memoriaRecuperada' // venceu; a memória volta
    | 'despertar'         // acorda zonzo na sala; o Arquivista: "você está pronto"
    | 'elevadorSumiu'     // manca até o sul, olha pra trás: o elevador SUMIU
    | 'arremesso'         // o Arquivista te ergue e te JOGA (tela gira → preto)
    | 'leave';            // acorda no elevador, subindo — e tem algo diferente nele

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
    | 'door21' | 'win' | 'wake' | 'gone' | 'throw' | 'boarding';
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
    f8.phase = 'platformer'; f8Bump();
}

/** Venceu o platformer (f8Platformer chama daqui): a memória volta. */
export function f8WinMemory(): void {
    if (f8.phase !== 'platformer') return;
    f8.phase = 'memoriaRecuperada';
    try {
        if (typeof window !== 'undefined') window.localStorage.setItem('tne_memoria_player', '1');
    } catch { /* ignore */ }
    emit('win'); f8Bump();
}

// ── O DESPERTAR: zonzo, "você está pronto", o elevador que sumiu, o arremesso ─
/** Acorda de volta na sala (zonzo, mal). O Arquivista já sabe. */
export const F8_DESPERTAR_LINES: ReadonlyArray<{ who: F8Speaker; t: string }> = [
    L('voce', '…a cabeça. *o chão gira; a luz da lâmpada dói* Onde… quanto tempo eu…'),
    L('arq', 'Vinte e um minutos. Você gritou duas vezes. *ele guarda a imagem na gaveta, com carinho* Bem-vindo de volta ao que você é.'),
    L('arq', 'Você está pronto.'),
];

/** Ao mancar de volta e olhar o vão: o elevador não está mais lá. */
export const F8_SUMIU_LINES: ReadonlyArray<{ who: F8Speaker; t: string }> = [
    L('voce', 'O… o elevador. SUMIU. Tem só tapume e fita. Como é que eu—'),
    L('arq', '*a voz dele vem de trás de você, perto demais* Em manutenção. Sempre está, quando alguém fica pronto.'),
    L('arq', 'O nono andar não se alcança por dentro do elevador, escolhido. Se alcança sendo ENTREGUE. *as mãos dele fecham no seu casaco*'),
    L('arq', 'Sua ficha agora tem um nome. Eu mesmo datilografei. Boa viagem.'),
];

/** memoriaRecuperada → despertar (o botão "Continuar" da vitória chama). */
export function f8Wake(): void {
    if (f8.phase !== 'memoriaRecuperada') return;
    f8.phase = 'despertar'; f8.line = 0; emit('wake'); f8Bump();
}

/** Avança as falas do despertar/elevadorSumiu. A última do sumiu = o arremesso. */
export function f8AdvanceWake(): void {
    if (f8.phase === 'despertar') {
        if (f8.line < F8_DESPERTAR_LINES.length) { f8.line++; f8Bump(); }
        return;
    }
    if (f8.phase === 'elevadorSumiu') {
        if (f8.line < F8_SUMIU_LINES.length - 1) { f8.line++; f8Bump(); }
        else { f8.phase = 'arremesso'; emit('throw'); f8Bump(); }
    }
}

/** Fim da animação do arremesso (wall-clock, o overlay dirige) → o elevador. */
export function f8ThrownDone(): void {
    if (f8.phase !== 'arremesso') return;
    f8.phase = 'leave'; emit('boarding'); f8Bump();
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
    // despertar: já falou tudo e mancou até o sul → percebe que o elevador sumiu
    if (s.phase === 'despertar' && s.line >= F8_DESPERTAR_LINES.length && playerZ < -7.5) {
        s.phase = 'elevadorSumiu';
        s.line = 0;
        emit('gone');
        f8Bump();
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
    if (s.phase === 'despertar' && s.line >= F8_DESPERTAR_LINES.length) return 'Volte ao elevador.';
    return null;
}
