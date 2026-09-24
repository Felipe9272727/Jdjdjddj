/**
 * f13Mundo.ts — o mapa de Vindhjem e o estado do andar 13.
 *
 * Tudo que é regra (onde dá para pisar, quem está onde, o que cada conversa
 * destrava) mora aqui, sem three.js e sem React, para ser testado.
 */
import { CASAS, CASA_CERTA, BUSCAS, npcPorId, type Fala, type IdBusca, type IdNpc, type Pista } from './f13Lore';

// ── AS ILHAS E AS PONTES ─────────────────────────────────────────────────────
export interface Ilha { id: string; x: number; z: number; y: number; r: number }
export const ILHAS: ReadonlyArray<Ilha> = Object.freeze([
    { id: 'pouso', x: 0, z: 30, y: 0, r: 7 },
    { id: 'praca', x: 0, z: 8, y: 0, r: 10 },
    { id: 'casas', x: 0, z: -24, y: 3, r: 12.5 },
    { id: 'forja', x: -23, z: 6, y: 1, r: 6.5 },
    { id: 'templo', x: 23, z: 4, y: 2, r: 6.5 },
]);
const ilha = (id: string) => ILHAS.find((i) => i.id === id)!;

export interface Ponte { de: string; para: string; largura: number }
export const PONTES: ReadonlyArray<Ponte> = Object.freeze([
    { de: 'pouso', para: 'praca', largura: 2.4 },
    { de: 'praca', para: 'casas', largura: 2.6 },
    { de: 'praca', para: 'forja', largura: 2.2 },
    { de: 'praca', para: 'templo', largura: 2.2 },
]);

/** Altura do chão em (x, z), ou `null` se ali é céu. */
export function chaoEm(x: number, z: number): number | null {
    let alto: number | null = null;
    for (const i of ILHAS) {
        if (Math.hypot(x - i.x, z - i.z) <= i.r) alto = Math.max(alto ?? -Infinity, i.y);
    }
    for (const p of PONTES) {
        const a = ilha(p.de), b = ilha(p.para);
        const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
        const px = a.x + dx * t, pz = a.z + dz * t;
        if (Math.hypot(x - px, z - pz) <= p.largura / 2) {
            // a ponte sobe de uma ilha à outra só no trecho fora das duas
            const L = Math.sqrt(L2), s = t * L;
            const k = Math.max(0, Math.min(1, (s - a.r) / Math.max(1e-3, L - a.r - b.r)));
            const y = a.y + (b.y - a.y) * k;
            alto = alto === null ? y : Math.max(alto, y);
        }
    }
    return alto;
}

// ── AS CASAS ─────────────────────────────────────────────────────────────────
export interface LugarDaCasa { x: number; z: number; y: number; angulo: number }
/** As sete casas em leque no fundo da Ilha das Casas, portas para o centro. */
export const LUGAR_DAS_CASAS: ReadonlyArray<LugarDaCasa> = Object.freeze(CASAS.map((_, i) => {
    const c = ilha('casas');
    const th = Math.PI + Math.PI * (i + .5) / CASAS.length;
    // alternando perto/longe: de longe as sete casas não viram um paredão só
    const rr = i % 2 ? 7.4 : 9.5;
    const x = c.x + Math.cos(th) * rr, z = c.z + Math.sin(th) * rr;
    // a porta aponta para o centro da ilha
    return { x, z, y: c.y, angulo: Math.atan2(c.x - x, c.z - z) };
}));
/** Onde se fica para "bater" numa porta: um passo à frente dela. */
export const portaDaCasa = (i: number) => {
    const l = LUGAR_DAS_CASAS[i];
    return { x: l.x + Math.sin(l.angulo) * 2.6, z: l.z + Math.cos(l.angulo) * 2.6 };
};

// ── QUEM ESTÁ ONDE ───────────────────────────────────────────────────────────
export const LUGAR_DOS_NPCS: Readonly<Record<IdNpc, { x: number; z: number; ronda?: number }>> = Object.freeze({
    ragnhild: { x: -5, z: 11 },
    ulfgar: { x: 5.5, z: 6 },
    eira: { x: 0, z: 9, ronda: 3.2 },
    brokk: { x: -23, z: 4.5 },
    sigrun: { x: -6, z: 3.5 },
    torvald: { x: 20, z: 8 },
    astrid: { x: 1.8, z: -12.5 },
    halvard: { x: -1.6, z: -1.2 },
});

export const MARTELO = Object.freeze({ x: 3.4, z: 32.5 });
export const SINO = Object.freeze({ x: 24.5, z: 1.5 });
export const OVELHAS: ReadonlyArray<{ x: number; z: number }> = Object.freeze([
    { x: -25.5, z: 8.5 },   // gosta da forja
    { x: 21, z: 0.5 },      // gosta do templo
    { x: 0, z: -12 },       // no fim da ponte de cima
]);
export const INICIO = Object.freeze({ x: 0, z: 29 });

// ── O ESTADO ─────────────────────────────────────────────────────────────────
export type EstadoDaBusca = 'nova' | 'ativa' | 'pronta' | 'feita';
export interface Estado13 {
    pistas: Set<Pista>;
    conversou: Set<IdNpc>;
    buscas: Record<IdBusca, EstadoDaBusca>;
    temMartelo: boolean;
    ovelhas: boolean[];
    sinoTocou: boolean;
    entidade: 'nao' | 'falando' | 'caido';
    casasBatidas: Set<number>;
}
export const novoEstado13 = (): Estado13 => ({
    pistas: new Set(), conversou: new Set(),
    buscas: { martelo: 'nova', ovelhas: 'nova', sino: 'nova' },
    temMartelo: false, ovelhas: [false, false, false], sinoTocou: false,
    entidade: 'nao', casasBatidas: new Set(),
});

/** Quem dá qual pista só de conversar. */
const PISTA_DE: Partial<Record<IdNpc, Pista>> = { ragnhild: 'latao', ulfgar: 'fumaca', eira: 'botao' };
const BUSCA_DE: Partial<Record<IdNpc, IdBusca>> = { brokk: 'martelo', sigrun: 'ovelhas', torvald: 'sino' };

/** Conversa com um morador. Devolve as falas e atualiza o estado. */
export function falarCom(e: Estado13, id: IdNpc): Fala[] {
    const ficha = npcPorId(id);
    const busca = BUSCA_DE[id];
    if (busca && e.buscas[busca] === 'pronta') {
        e.buscas[busca] = 'feita';
        const b = BUSCAS.find((x) => x.id === busca)!;
        if (b.entrega) e.pistas.add(b.entrega);
        return b.recompensa;
    }
    const primeira = !e.conversou.has(id);
    e.conversou.add(id);
    const p = PISTA_DE[id];
    if (p) e.pistas.add(p);
    if (busca && e.buscas[busca] === 'nova') e.buscas[busca] = 'ativa';
    return primeira ? ficha.primeira : ficha.depois;
}

/** Pega o martelo, uma ovelha ou toca o sino. */
export function pegarMartelo(e: Estado13): void {
    if (e.temMartelo) return;
    e.temMartelo = true;
    if (e.buscas.martelo !== 'feita') e.buscas.martelo = 'pronta';
}
export function acharOvelha(e: Estado13, i: number): void {
    e.ovelhas[i] = true;
    if (e.ovelhas.every(Boolean) && e.buscas.ovelhas !== 'feita') e.buscas.ovelhas = 'pronta';
}
export function tocarSino(e: Estado13): void {
    e.sinoTocou = true;
    if (e.buscas.sino !== 'feita') e.buscas.sino = 'pronta';
}

/** A entidade só entra quando o jogador já sabe o bastante para ouvir. */
export const entidadeAcorda = (e: Estado13) => e.entidade === 'nao' && e.pistas.size >= 2;

/** Bater numa porta: `certa` = é o elevador. */
export function baterNaCasa(e: Estado13, i: number): { certa: boolean; falas: Fala[] } {
    e.casasBatidas.add(i);
    return { certa: i === CASA_CERTA, falas: CASAS[i].resposta };
}
