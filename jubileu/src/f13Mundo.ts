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
/**
 * As sete casas num arco de 270° em volta do terreiro da Ilha das Casas,
 * portas para o centro; o quarto de volta aberto é o da ponte que vem da
 * praça. (Em duas fileiras alternadas, as de trás ficavam espremidas entre as
 * da frente: a porta delas só se via de dentro do beiral da vizinha.)
 */
/**
 * Em que vaga do arco cada casa fica. A do meio é a que se vê de frente ao
 * chegar pela ponte: ali mora a casa de luto (latão sob o pano preto, a pista
 * falsa) — a casa certa fica de lado, e não no fim do caminho resolvendo o
 * enigma de longe.
 */
const VAGA_DA_CASA = [0, 1, 2, 5, 4, 3, 6];
export const LUGAR_DAS_CASAS: ReadonlyArray<LugarDaCasa> = Object.freeze(CASAS.map((_, i) => {
    const c = ilha('casas');
    const th = Math.PI * .75 + Math.PI * 1.5 * VAGA_DA_CASA[i] / (CASAS.length - 1);
    const rr = 9.2;
    const x = c.x + Math.cos(th) * rr, z = c.z + Math.sin(th) * rr;
    // a porta aponta para o centro da ilha
    return { x, z, y: c.y, angulo: Math.atan2(c.x - x, c.z - z) };
}));
/**
 * A forma de cada casa: o giro (a porta para o centro, com uma torção própria)
 * e a escala (largura, altura, fundo) — cada uma com seu jeito. O desenho
 * (Floor13Mundo), a colisão e o botão de bater leem daqui.
 */
export const FORMA_DAS_CASAS: ReadonlyArray<{ giro: number; escala: readonly [number, number, number] }> = Object.freeze(LUGAR_DAS_CASAS.map((l, i) => ({
    giro: l.angulo + ((i * 37) % 7 - 3) * .03,
    escala: [.9 + (i % 3 - 1) * .05, 1 + ((i * 5) % 3 - 1) * .08, .88 + ((i * 3) % 4) * .045] as const,
})));
/** Meia largura e meio fundo da casa no modelo (tools/blender/f13_casa.py: 3,4 × 5,6 m). */
export const CASA_MEIA = Object.freeze({ x: 1.7, z: 2.8 });
/** A porta de verdade: o centro do vão no chão e a direção para fora dela. */
export function portaNoMundo(i: number): { x: number; z: number; fx: number; fz: number } {
    const l = LUGAR_DAS_CASAS[i], f = FORMA_DAS_CASAS[i];
    const fx = Math.sin(f.giro), fz = Math.cos(f.giro), d = (CASA_MEIA.z + .02) * f.escala[2];
    return { x: l.x + fx * d, z: l.z + fz * d, fx, fz };
}
/** Onde se fica para "bater" numa porta: um passo à frente dela. */
export const portaDaCasa = (i: number) => {
    const p = portaNoMundo(i);
    return { x: p.x + p.fx * .8, z: p.z + p.fz * .8 };
};
/** (x, z) cai dentro de alguma casa (com `folga` em volta)? */
export function dentroDeCasa(x: number, z: number, folga = 0): boolean {
    for (let i = 0; i < LUGAR_DAS_CASAS.length; i++) {
        const l = LUGAR_DAS_CASAS[i], f = FORMA_DAS_CASAS[i];
        const c = Math.cos(f.giro), s = Math.sin(f.giro), dx = x - l.x, dz = z - l.z;
        if (Math.abs(dx * c - dz * s) < CASA_MEIA.x * f.escala[0] + folga && Math.abs(dx * s + dz * c) < CASA_MEIA.z * f.escala[2] + folga) return true;
    }
    return false;
}
/**
 * Empurra (x, z) para fora do retângulo de cada casa, com `folga` (m). A casa
 * é comprida: um círculo que cobre a frente deixava entrar pelos lados, e um
 * que cobre o fundo afastava da porta.
 */
export function foraDasCasas(x: number, z: number, folga: number): { x: number; z: number } {
    for (let i = 0; i < LUGAR_DAS_CASAS.length; i++) {
        const l = LUGAR_DAS_CASAS[i], f = FORMA_DAS_CASAS[i];
        const c = Math.cos(f.giro), s = Math.sin(f.giro);
        // no espaço da casa: u para a direita (x do modelo), v para a porta (z)
        const dx = x - l.x, dz = z - l.z, u = dx * c - dz * s, v = dx * s + dz * c;
        const hu = CASA_MEIA.x * f.escala[0] + folga, hv = CASA_MEIA.z * f.escala[2] + folga;
        if (Math.abs(u) >= hu || Math.abs(v) >= hv) continue;
        // sai pelo lado mais perto
        const pu = hu - Math.abs(u), pv = hv - Math.abs(v);
        let nu = u, nv = v;
        if (pu < pv) nu = Math.sign(u || 1) * hu; else nv = Math.sign(v || 1) * hv;
        x = l.x + nu * c + nv * s; z = l.z - nu * s + nv * c;
    }
    return { x, z };
}

// ── QUEM ESTÁ ONDE ───────────────────────────────────────────────────────────
export const LUGAR_DOS_NPCS: Readonly<Record<IdNpc, { x: number; z: number; ronda?: number }>> = Object.freeze({
    ragnhild: { x: -5, z: 11 },
    ulfgar: { x: 5.5, z: 6 },
    eira: { x: 0, z: 12.2, ronda: 2 },   // corre em volta, não dentro, do poço
    brokk: { x: -21, z: 3.6 },   // ao lado da bigorna, fora do fogo
    sigrun: { x: -4.6, z: 1.6 },   // fora da casa de cenário da praça
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
/** Quem acha a porta por acaso não passa: ela só cede a quem juntou as três pistas. */
export const PORTA_TRANCADA: Fala[] = [{ quem: 'A porta', texto: '…O latão está frio e não cede. Tem um botão aqui, mas você não sabe o que ele faz. Ainda não. Pergunte aos moradores.' }];
export function baterNaCasa(e: Estado13, i: number): { certa: boolean; falas: Fala[] } {
    e.casasBatidas.add(i);
    if (i === CASA_CERTA && e.pistas.size < 3) return { certa: false, falas: PORTA_TRANCADA };
    return { certa: i === CASA_CERTA, falas: CASAS[i].resposta };
}
