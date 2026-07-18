/**
 * f9Floresta.ts — ANDAR 9: "O VIVEIRO" (estado do andar; puro).
 *
 * O hotel PLANTA o que apaga: memórias esquecidas descem pelo fio vermelho e
 * daqui cresce floresta. O player chega ARREMESSADO (as portas abrem e não há
 * chão — a QUEDA pela copa). O objetivo é seguir o FIO VERMELHO até a RAIZ.
 * A onda de apagamento (f9Eco) obriga a se abrigar nos OCOS.
 */
import { f9eco } from './f9Eco';

export type F9Phase =
    | 'queda'        // caindo pela copa (cutscene)
    | 'chegada'      // acabou de pousar; primeira leitura do lugar
    | 'explorar'     // livre: siga o fio, sobreviva às ondas
    | 'lembranca'    // uma relíquia do hotel abriu na mão do player
    | 'apagando'     // pego fora do oco pela onda (veil + replantio)
    | 'raiz';        // alcançou a árvore-raiz (gancho do 10)

export type F9ReplantCause = 'onda' | 'vulto';

export interface F9State {
    phase: F9Phase;
    t: number;
    quedaT: number;
    /** o oco em que o player está (-1 = nenhum) */
    abrigo: number;
    /** quantas vezes o player foi apagado/replantado */
    apagos: number;
    /** bitset das três relíquias recuperadas */
    reliquias: number;
    /** relíquia cuja lembrança está aberta (-1 = nenhuma) */
    lembranca: number;
    /** a Raiz está perto o suficiente para responder ao player */
    pertoRaiz: boolean;
    /** oco de destino do próximo replantio */
    replantOco: number;
    /** o que derrubou o player */
    replantCause: F9ReplantCause | null;
    /** pequena imunidade enquanto o teleporte chega ao Player */
    replantGrace: number;
    version: number;
}

const FRESH = (): F9State => ({
    phase: 'queda', t: 0, quedaT: 0, abrigo: -1, apagos: 0,
    reliquias: 0, lembranca: -1, pertoRaiz: false,
    replantOco: 0, replantCause: null, replantGrace: 0, version: 0,
});
export const f9: F9State = FRESH();

const listeners = new Set<() => void>();
export function f9Subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function f9Bump(): void { f9.version++; listeners.forEach((fn) => fn()); }
export function f9Reset(): void {
    const v = f9.version;
    Object.assign(f9, FRESH());
    f9.version = v;
    events.length = 0;
    f9Bump();
}

export type F9Event = 'pousou' | 'reliquia' | 'apagado' | 'predador' | 'replantado' | 'raiz';
const events: F9Event[] = [];
function emit(e: F9Event): void { events.push(e); }
export function f9DrainEvents(): F9Event[] { return events.splice(0, events.length); }

// ── o mundo ──────────────────────────────────────────────────────────────────
/** OCOS (abrigos): troncos-mãe com brilho quente. [x, z, raio] */
export const F9_OCOS: ReadonlyArray<readonly [number, number, number]> = [
    [-6, -6, 2.2], [16, -24, 2.2], [-22, -34, 2.2], [18, -43, 2.4],
];

/** A trilha do FIO VERMELHO (waypoints até a RAIZ, no fundo do viveiro). */
export const F9_FIO: ReadonlyArray<readonly [number, number]> = [
    [0, 1.5], [-3, -4], [-10, -9], [-16, -16], [-12, -24], [-2, -28], [8, -33], [12, -40], [6, -47],
];

export interface F9Relic {
    x: number; z: number;
    /** linha 0..2 no atlas pintado */
    row: number;
    /** waypoint do fio do qual nasce o ramal visual */
    anchor: number;
    title: string;
    kicker: string;
    lines: ReadonlyArray<string>;
}

/**
 * Três lembranças enterradas fora do corredor principal. Elas fazem o player
 * abandonar a linha segura do fio, observar o ecossistema e encarar ao menos
 * parte de um ciclo antes que a Raiz aceite abrir.
 */
export const F9_RELICS: ReadonlyArray<F9Relic> = [
    {
        x: 23, z: -13, row: 0, anchor: 2,
        title: 'A MALA 9–14', kicker: 'OBJETO SEM HÓSPEDE',
        lines: [
            'As roupas são de uma criança. O livro insiste que nenhuma criança se hospedou aqui naquele inverno.',
            'A mala respira quando você tenta lembrar o nome dela. O fio vermelho aperta e guarda a tentativa.',
        ],
    },
    {
        x: -25, z: -28, row: 1, anchor: 4,
        title: 'A CAMPAINHA', kicker: 'RECEPÇÃO · TURNO DA MADRUGADA',
        lines: [
            'Uma página inteira repete o mesmo quarto em cento e oito caligrafias diferentes.',
            'A campainha toca sozinha. Por um segundo, todos os bichos da mata param — menos o Guardião.',
        ],
    },
    {
        x: 24, z: -42, row: 2, anchor: 7,
        title: 'A CHAVE 1000', kicker: 'NÃO ENTREGAR AO PROPRIETÁRIO',
        lines: [
            'A etiqueta diz 1000. O hotel só tinha nove andares quando esta chave foi cortada.',
            'No verso, riscado até quase sumir: “quando a Raiz abrir, não olhe para cima”.',
        ],
    },
];
export const F9_RELIC_ALL = (1 << F9_RELICS.length) - 1;
export function f9RelicCount(mask = f9.reliquias): number {
    let n = 0;
    for (let bits = mask; bits; bits >>>= 1) n += bits & 1;
    return n;
}

/** Onde fica a RAIZ (fim do fio). */
export const F9_RAIZ: readonly [number, number] = [6, -47];

/** ponto de pouso da queda */
export const F9_POUSO: readonly [number, number] = [0, -1.5];

/** limites andáveis do viveiro */
export const F9_STATIC_WALLS: number[][] = [
    [-34, 4, 34, 4], [-34, -52, 34, -52], [-34, -52, -34, 4], [34, -52, 34, 4],
];

export interface F9TreeSpot {
    x: number; z: number; scale: number; rotation: number;
    crownX: number; crownZ: number; crown2X: number; crown2Z: number;
}

const dSeg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number): number => {
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
};

function routeClearance(x: number, z: number): number {
    let best = Infinity;
    for (let i = 0; i < F9_FIO.length - 1; i++) {
        const [ax, az] = F9_FIO[i], [bx, bz] = F9_FIO[i + 1];
        best = Math.min(best, dSeg(x, z, ax, az, bx, bz) - (i >= F9_FIO.length - 3 ? 1.1 : 0));
    }
    for (const relic of F9_RELICS) {
        const [ax, az] = F9_FIO[relic.anchor];
        best = Math.min(best, dSeg(x, z, ax, az, relic.x, relic.z));
    }
    return best;
}

/** Árvores compartilhadas por render e colisão: o tronco visto é o tronco sólido. */
export const F9_TREES: ReadonlyArray<F9TreeSpot> = (() => {
    let seed = 910;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const spots: F9TreeSpot[] = [];
    for (let tries = 0; tries < 420 && spots.length < 76; tries++) {
        const x = (random() * 2 - 1) * 32.5, z = -51 + random() * 55;
        if (Math.hypot(x - F9_POUSO[0], z - F9_POUSO[1]) < 6.4) continue;
        if (routeClearance(x, z) < 3.45) continue;
        if (Math.hypot(x - F9_RAIZ[0], z - F9_RAIZ[1]) < 7.2) continue;
        if (F9_OCOS.some(([ox, oz, r]) => Math.hypot(x - ox, z - oz) < r + 2.1)) continue;
        if (F9_RELICS.some((relic) => Math.hypot(x - relic.x, z - relic.z) < 3.7)) continue;
        spots.push({
            x, z, scale: .72 + random() * 1.25, rotation: random() * Math.PI * 2,
            crownX: (random() - .5) * .7, crownZ: (random() - .5) * .7,
            crown2X: (random() - .5) * 1.1, crown2Z: (random() - .5) * 1.1,
        });
    }
    return spots;
})();

/** A queda terminou (o Floor9Cutscene chama) → chegada. */
export function f9QuedaDone(): void {
    if (f9.phase !== 'queda') return;
    f9.phase = 'chegada'; f9.t = 0; emit('pousou'); f9Bump();
}

/** As primeiras legendas de chegada terminaram → livre. */
export function f9ChegadaDone(): void {
    if (f9.phase !== 'chegada') return;
    f9.phase = 'explorar'; f9Bump();
}

/** Fecha a lembrança da relíquia e devolve o controle. */
export function f9LembrancaDone(): void {
    if (f9.phase !== 'lembranca') return;
    f9.phase = 'explorar'; f9.lembranca = -1; f9Bump();
}

function nearestOco(px: number, pz: number): number {
    let best = 0, bestD = Infinity;
    F9_OCOS.forEach(([x, z], i) => {
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < bestD) { best = i; bestD = d; }
    });
    return best;
}

function beginReplant(cause: F9ReplantCause, px: number, pz: number): void {
    if (f9.phase !== 'explorar' || f9.replantGrace > 0) return;
    // O oco protege também do Vulto: ele não atravessa madeira-mãe.
    if (cause === 'vulto' && f9.abrigo >= 0) return;
    f9.phase = 'apagando';
    f9.apagos++;
    f9.replantCause = cause;
    f9.replantOco = nearestOco(px, pz);
    emit(cause === 'onda' ? 'apagado' : 'predador');
    f9Bump();
}

/** O ecossistema avisa quando um Vulto alcança o player. */
export function f9PredadorPegou(px: number, pz: number): void {
    beginReplant('vulto', px, pz);
}

/**
 * Fim do replantio (overlay dirige o tempo do veil). Retorna o ponto real para
 * que App/runner teleportem o Player; antes a frase dizia "perto de um oco",
 * mas o corpo continuava no mesmo lugar.
 */
export function f9ReplantioDone(): readonly [number, number] | null {
    if (f9.phase !== 'apagando') return null;
    const [x, z, r] = F9_OCOS[f9.replantOco] ?? F9_OCOS[0];
    f9.phase = 'explorar';
    f9.abrigo = f9.replantOco;
    f9.replantGrace = 1.2;
    emit('replantado'); f9Bump();
    return [x, z + r * .62];
}

/** Por frame: abrigo, onda×player, chegada na raiz. */
export function f9Tick(dt: number, px: number, pz: number): void {
    const s = f9;
    s.t += dt;
    s.replantGrace = Math.max(0, s.replantGrace - dt);
    if (s.phase === 'queda') { s.quedaT += dt; return; }

    // em qual oco o player está?
    let ab = -1;
    F9_OCOS.forEach(([x, z, r], i) => {
        const dx = px - x, dz = pz - z;
        if (dx * dx + dz * dz < r * r) ab = i;
    });
    if (ab !== s.abrigo) { s.abrigo = ab; f9Bump(); }

    // a onda pega quem está fora de um oco
    if (s.phase === 'explorar' && f9eco.phase === 'onda' && f9eco.waveT > 2.2 && ab < 0 && s.replantGrace <= 0) {
        beginReplant('onda', px, pz);
        return;
    }

    // relíquias laterais: cada uma abre uma lembrança e acende 1/3 do nó.
    if (s.phase === 'explorar') {
        for (let i = 0; i < F9_RELICS.length; i++) {
            if (s.reliquias & (1 << i)) continue;
            const relic = F9_RELICS[i];
            if ((px - relic.x) ** 2 + (pz - relic.z) ** 2 < 4.4) {
                s.reliquias |= 1 << i;
                s.lembranca = i;
                s.phase = 'lembranca';
                emit('reliquia'); f9Bump();
                return;
            }
        }

        // A Raiz responde de longe, mas só abre quando as três memórias voltam.
        const dx = px - F9_RAIZ[0], dz = pz - F9_RAIZ[1];
        const perto = dx * dx + dz * dz < 42;
        if (perto !== s.pertoRaiz) { s.pertoRaiz = perto; f9Bump(); }
        if (dx * dx + dz * dz < 6.5 && s.reliquias === F9_RELIC_ALL) {
            s.phase = 'raiz';
            try { if (typeof window !== 'undefined') window.localStorage.setItem('tne_raiz_9', '1'); } catch { /* ignore */ }
            emit('raiz'); f9Bump();
        }
    }
}

/** A linha-objetivo do HUD. */
export function f9Objective(): string | null {
    if (f9.phase === 'explorar') {
        if (f9eco.phase === 'aviso') return 'O ar está clareando demais. ACHE UM OCO.';
        if (f9eco.phase === 'onda') return 'A ONDA. Fique no oco.';
        const found = f9RelicCount();
        if (f9.pertoRaiz && found < F9_RELICS.length) {
            const left = F9_RELICS.length - found;
            return `A RAIZ está muda. ${left} ${left === 1 ? 'relíquia ainda prende' : 'relíquias ainda prendem'} o fio.`;
        }
        if (found === F9_RELICS.length) return 'O nó da RAIZ acordou. Volte ao fim do fio vermelho.';
        return `O fio se ramifica. Recupere as relíquias esquecidas (${found}/${F9_RELICS.length}).`;
    }
    if (f9.phase === 'raiz') return null;
    return null;
}

/** Legendas da chegada (o overlay avança por toque). */
export const F9_CHEGADA_LINES: ReadonlyArray<string> = [
    'Você atravessa a copa inteira antes do chão te aceitar.',
    'Isto não deveria caber num hotel. E há OLHOS entre as árvores — nenhum se importa com você.',
    'O fio vermelho continua aqui embaixo — mas se divide. Três coisas esquecidas ainda pesam antes da Raiz.',
];

/** As falas da RAIZ (gancho do Andar 10). */
export const F9_RAIZ_LINES: ReadonlyArray<string> = [
    'As três relíquias entram no nó. A árvore-raiz abre um olho de madeira: cada anel do tronco é um corredor; cada nó, uma porta.',
    'No meio dela, cravada como uma unha: a chave do DÉCIMO. O fio vermelho termina… não. Ele SOBE.',
];
