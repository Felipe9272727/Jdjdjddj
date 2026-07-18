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
    | 'apagando'     // pego fora do oco pela onda (veil + replantio)
    | 'raiz';        // alcançou a árvore-raiz (gancho do 10)

export interface F9State {
    phase: F9Phase;
    t: number;
    quedaT: number;
    /** o oco em que o player está (-1 = nenhum) */
    abrigo: number;
    /** quantas vezes o player foi apagado/replantado */
    apagos: number;
    version: number;
}

const FRESH = (): F9State => ({ phase: 'queda', t: 0, quedaT: 0, abrigo: -1, apagos: 0, version: 0 });
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

export type F9Event = 'pousou' | 'apagado' | 'replantado' | 'raiz';
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
/** Onde fica a RAIZ (fim do fio). */
export const F9_RAIZ: readonly [number, number] = [6, -47];

/** ponto de pouso da queda */
export const F9_POUSO: readonly [number, number] = [0, -1.5];

/** limites andáveis do viveiro */
export const F9_STATIC_WALLS: number[][] = [
    [-34, 4, 34, 4], [-34, -52, 34, -52], [-34, -52, -34, 4], [34, -52, 34, 4],
];

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

/** Fim do replantio (overlay dirige o tempo do veil). */
export function f9ReplantioDone(): void {
    if (f9.phase !== 'apagando') return;
    f9.phase = 'explorar'; emit('replantado'); f9Bump();
}

/** Por frame: abrigo, onda×player, chegada na raiz. */
export function f9Tick(dt: number, px: number, pz: number): void {
    const s = f9;
    s.t += dt;
    if (s.phase === 'queda') { s.quedaT += dt; return; }

    // em qual oco o player está?
    let ab = -1;
    F9_OCOS.forEach(([x, z, r], i) => {
        const dx = px - x, dz = pz - z;
        if (dx * dx + dz * dz < r * r) ab = i;
    });
    if (ab !== s.abrigo) { s.abrigo = ab; f9Bump(); }

    // a onda pega quem está fora de um oco
    if (s.phase === 'explorar' && f9eco.phase === 'onda' && f9eco.waveT > 2.2 && ab < 0) {
        s.phase = 'apagando'; s.apagos++; emit('apagado'); f9Bump();
        return;
    }

    // a raiz
    if (s.phase === 'explorar') {
        const dx = px - F9_RAIZ[0], dz = pz - F9_RAIZ[1];
        if (dx * dx + dz * dz < 6.5) {
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
        return 'Siga o fio vermelho até a raiz.';
    }
    if (f9.phase === 'raiz') return null;
    return null;
}

/** Legendas da chegada (o overlay avança por toque). */
export const F9_CHEGADA_LINES: ReadonlyArray<string> = [
    'Você atravessa a copa inteira antes do chão te aceitar.',
    'Isto não deveria caber num hotel. E há OLHOS entre as árvores — nenhum se importa com você.',
    'O fio vermelho continua aqui embaixo, amarrado de galho em galho, fundo adentro.',
];

/** As falas da RAIZ (v1: o gancho). */
export const F9_RAIZ_LINES: ReadonlyArray<string> = [
    'A árvore-raiz. Cada anel do tronco é um corredor; cada nó, uma porta.',
    'No meio dela, cravada como uma unha: a chave do DÉCIMO. O fio vermelho termina… não. Ele SOBE.',
];
