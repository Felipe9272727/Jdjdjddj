/**
 * f13Mundo.ts — o mapa de Vindhjem e o estado do andar 13.
 *
 * Tudo que é regra (onde dá para pisar, quem está onde, o que cada conversa
 * destrava) mora aqui, sem three.js e sem React, para ser testado.
 *
 * Ninguém aqui dá pista de graça: quem sabe de alguma coisa cobra um favor
 * antes de contar — e o favor é sempre coisa que já existe no jogo (ver
 * O PREÇO EM FAVOR, mais abaixo). Como nenhum favor depende de outro, o
 * jogador paga na ordem que quiser.
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
    // a ilha do Árni: pequena, um pouco abaixo da praça, de frente para a vila
    { id: 'mirante', x: -17, z: 22, y: -.4, r: 5.5 },
]);
const ilha = (id: string) => ILHAS.find((i) => i.id === id)!;

export interface Ponte { de: string; para: string; largura: number }
export const PONTES: ReadonlyArray<Ponte> = Object.freeze([
    { de: 'pouso', para: 'praca', largura: 2.4 },
    { de: 'praca', para: 'casas', largura: 2.6 },
    { de: 'praca', para: 'forja', largura: 2.2 },
    { de: 'praca', para: 'templo', largura: 2.2 },
    { de: 'praca', para: 'mirante', largura: 1.8 },
]);

/** The deck and the walkable surface use the same inset, sag and thickness. */
export const ESPESSURA_TABUA = .09;
export const TRECHOS_DAS_PONTES = PONTES.map(p => {
    const a = ilha(p.de), b = ilha(p.para);
    const length = Math.hypot(b.x-a.x,b.z-a.z), dx=(b.x-a.x)/length, dz=(b.z-a.z)/length;
    return { largura:p.largura,
        a:{x:a.x+dx*(a.r-.4),y:a.y,z:a.z+dz*(a.r-.4)},
        b:{x:b.x-dx*(b.r-.4),y:b.y,z:b.z-dz*(b.r-.4)} };
});
export function alturaDoTablado(a: number, b: number, t: number): number {
    return a+(b-a)*t-Math.sin(Math.PI*t)*.35-.08;
}

/** Mesma posição no cenário e na colisão; a barraca leste ficava dentro da casa. */
export const BARRACAS_PRACA = Object.freeze([
    { x: -6, z: 12, giro: .4 }, { x: -3.2, z: 14, giro: .1 },
    { x: 4.5, z: 10, giro: -.4 },
]);

/** Altura do chão em (x, z), ou `null` se ali é céu. */
export function chaoEm(x: number, z: number): number | null {
    let alto: number | null = null;
    for (const i of ILHAS) {
        if (Math.hypot(x - i.x, z - i.z) <= i.r) alto = Math.max(alto ?? -Infinity, i.y);
    }
    for (const {a,b,largura} of TRECHOS_DAS_PONTES) {
        const dx=b.x-a.x, dz=b.z-a.z, length2=dx*dx+dz*dz;
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/length2));
        if (Math.hypot(x-a.x-dx*t,z-a.z-dz*t) <= largura/2) {
            const y=alturaDoTablado(a.y,b.y,t)+ESPESSURA_TABUA/2;
            alto=alto===null?y:Math.max(alto,y);
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

/** As casas de cenário (fora do arco): posição, giro e escala uniforme — as mesmas de Floor13Mundo. */
export const CASAS_DE_CENARIO: ReadonlyArray<{ x: number; y: number; z: number; giro: number; escala: number }> = Object.freeze([
    { x: -19.6, y: -.4, z: 24.4, giro: Math.atan2(-15.2 - -19.6, 20.2 - 24.4), escala: .72 },
    { x: -7.5, y: 0, z: 4, giro: 1.1, escala: .9 },
    { x: 7.8, y: 0, z: 12.5, giro: -2.2, escala: .9 },
]);
/**
 * O telhado avança além da parede (modelo: .55 m nas laterais, .45 m na frente e
 * no fundo) e o beiral fica à altura dos olhos (1,54–1,80 m): a colisão do corpo
 * (parede + .38) deixava o olho e o plano próximo da câmera entrarem nele.
 * Empurra o ponto (x, y, z) — o olho — para fora do retângulo do telhado + `folga`.
 */
export function foraDoTelhado(x: number, y: number, z: number, folga: number): { x: number; z: number } {
    const caixas: Array<{ x: number; y: number; z: number; giro: number; sx: number; sz: number }> = [];
    for (let i = 0; i < LUGAR_DAS_CASAS.length; i++) {
        const l = LUGAR_DAS_CASAS[i], f = FORMA_DAS_CASAS[i];
        caixas.push({ x: l.x, y: l.y, z: l.z, giro: f.giro, sx: f.escala[0], sz: f.escala[2] });
    }
    for (const c of CASAS_DE_CENARIO) caixas.push({ x: c.x, y: c.y, z: c.z, giro: c.giro, sx: c.escala, sz: c.escala });
    // duas passadas: sair de uma casa pode cair no beiral da vizinha
    for (const c of [...caixas, ...caixas]) {
        if (y < c.y + .3 || y > c.y + 4.2 * Math.max(c.sx, c.sz)) continue;
        const co = Math.cos(c.giro), si = Math.sin(c.giro);
        const dx = x - c.x, dz = z - c.z, u = dx * co - dz * si, v = dx * si + dz * co;
        const hu = (CASA_MEIA.x + .55) * c.sx + folga, hv = (CASA_MEIA.z + .45) * c.sz + folga;
        if (Math.abs(u) >= hu || Math.abs(v) >= hv) continue;
        const pu = hu - Math.abs(u), pv = hv - Math.abs(v);
        let nu = u, nv = v;
        if (pu < pv) nu = Math.sign(u || 1) * hu; else nv = Math.sign(v || 1) * hv;
        x = c.x + nu * co + nv * si; z = c.z - nu * si + nv * co;
    }
    return { x, z };
}

// ── CÂMERA DE CONVERSA ───────────────────────────────────────────────────────
/** Para onde a câmera vai durante uma conversa (calculado UMA vez ao abrir o diálogo). */
export const conversaCam = { ativo: false, x: 0, z: 0 };
const FORJA = ILHAS.find((i) => i.id === 'forja');
/** Os quatro postes do telheiro da forja (f13Forja.tsx) e o retângulo do telhado. */
const POSTES_DA_FORJA: ReadonlyArray<readonly [number, number]> = FORJA
    ? [[-1.4, -1], [1.4, -1], [-1.4, 1.6], [1.4, 1.6]].map(([dx, dz]) => [FORJA.x + dx, FORJA.z - 1.5 + dz] as const)
    : [];
const OFFSETS_DE_CONVERSA = [0, .35, -.35, .7, -.7, 1.05, -1.05, 1.4, -1.4, 1.8, -1.8, 2.3, -2.3, Math.PI];

type Redondo = { x: number; z: number; r: number; soProcura?: boolean };
function olhoLivre(x: number, z: number, fx: number, fz: number, y: number, obst: ReadonlyArray<Redondo> = []): boolean {
    if (chaoEm(x, z) === null) return false;
    const f = foraDoTelhado(x, y, z, .5);
    if (Math.abs(f.x - x) > 1e-6 || Math.abs(f.z - z) > 1e-6) return false;
    if (FORJA) {
        // sob o telhado da forja o beiral fica na altura do olho
        if (Math.abs(x - FORJA.x) < 2.3 && Math.abs(z - (FORJA.z - 1.2)) < 2.15) return false;
    }
    const vx = fx - x, vz = fz - z, v2 = vx * vx + vz * vz || 1;
    for (const [px, pz] of POSTES_DA_FORJA) {
        if (Math.hypot(px - x, pz - z) < .8) return false;
        const t = Math.max(0, Math.min(1, ((px - x) * vx + (pz - z) * vz) / v2));
        if (Math.hypot(x + vx * t - px, z + vz * t - pz) < .4) return false;
    }
    // postes, tochas, barracas e o poço: nem o olho dentro deles, nem no meio do caminho até o rosto
    // (o trecho para 0,6 m antes do rosto: quem vende fica colado na própria barraca)
    const ate = Math.max(0, 1 - .6 / Math.sqrt(v2));
    for (const o of obst) {
        if (o.soProcura) continue;
        const t = Math.max(0, Math.min(ate, ((o.x - x) * vx + (o.z - z) * vz) / v2));
        if (Math.hypot(x + vx * t - o.x, z + vz * t - o.z) < o.r + .15) return false;
    }
    return true;
}

/**
 * O olho da conversa: ~2,2 m de quem fala, do lado de onde o jogador veio, girando
 * para o lado aberto quando esse ponto cairia sob um telhado, num poste ou fora do chão.
 * Roda só ao abrir o diálogo (nada por quadro).
 */
export function posicionarConversaCam(px: number, pz: number, fx: number, fz: number, obst: ReadonlyArray<Redondo> = []): void {
    const base = Math.atan2(px - fx, pz - fz), yEsp = (chaoEm(fx, fz) ?? 0) + 1.7;
    // perto: o rosto enche o quadro acima da caixa de fala (a 2,2 m era corpo inteiro)
    for (const r of [1.45, 1.2, 2.2]) {
        for (const o of OFFSETS_DE_CONVERSA) {
            const x = fx + Math.sin(base + o) * r, z = fz + Math.cos(base + o) * r;
            if (olhoLivre(x, z, fx, fz, yEsp, obst)) { conversaCam.x = x; conversaCam.z = z; conversaCam.ativo = true; return; }
        }
    }
    conversaCam.ativo = false;
}

// ── QUEM ESTÁ ONDE ───────────────────────────────────────────────────────────
export const LUGAR_DOS_NPCS: Readonly<Record<IdNpc, { x: number; z: number; ronda?: number }>> = Object.freeze({
    ragnhild: { x: -5, z: 11 },
    ulfgar: { x: 5.5, z: 6 },
    eira: { x: 0, z: 12.2, ronda: 2 },   // corre em volta, não dentro, do poço
    brokk: { x: -21.9, z: 4.65 },   // de frente para a bigorna (a 0,85 m), entre a fornalha e os mourões
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

/** Quem dá qual pista — mas só depois do favor (ver abaixo). */
const PISTA_DE: Partial<Record<IdNpc, Pista>> = { ragnhild: 'latao', ulfgar: 'fumaca', eira: 'botao' };
const BUSCA_DE: Partial<Record<IdNpc, IdBusca>> = { brokk: 'martelo', sigrun: 'ovelhas', torvald: 'sino' };

// ── O PREÇO EM FAVOR ─────────────────────────────────────────────────────────
/**
 * Em Vindhjem ninguém abre a boca de graça: quem sabe de uma pista cobra um
 * favor antes de contar. E o favor é sempre coisa que já existe no jogo — uma
 * conversa a mais, o sino tocado, uma busca entregue. Como nenhum deles
 * depende do outro, o jogador paga na ordem que quiser.
 */
const PEDIDO_DE: Readonly<Partial<Record<IdNpc, Fala[]>>> = Object.freeze({
    ragnhild: [{ quem: 'Ragnhild', texto: 'Segredo não se dá, se troca. Fala com mais dois por aí e volta. Aí eu conto.' }],
    ulfgar: [{ quem: 'Ulfgar', texto: 'Saga sem sino é conversa de feira. Toca o sino do templo, que eu canto o resto.' }],
    eira: [{ quem: 'Eira', texto: 'Conto! Mas antes você me ajuda: traz as ovelhas da Sigrun, ou o martelo do Brokk. Um dos dois!' }],
});

/** A pista na boca de quem cobrou o favor, no dia em que ele é pago. */
const ENTREGA_DE: Readonly<Partial<Record<IdNpc, Fala[]>>> = Object.freeze({
    ragnhild: [{ quem: 'Ragnhild', texto: 'Está bem, você mereceu. Das portas daqui, todas são de carvalho. Todas, menos uma: aquela é de latão. Ninguém aqui forja latão.' }],
    ulfgar: [{ quem: 'Ulfgar', texto: 'Sino tocado, história contada. Tem uma casa lá em cima que nunca soltou fumaça. Nem no inverno. Casa sem fogo não é casa: é outra coisa.' }],
    eira: [{ quem: 'Eira', texto: 'Você voltou! Então ó: a casa tem um botão na parede, do lado da porta. Eu apertei e fez DING! Casa não faz ding.' }],
});

/** O favor que ele cobra já foi pago? (Só olha o que já existe no estado.) */
export function favorFeito(e: Estado13, id: IdNpc): boolean {
    switch (id) {
        case 'ragnhild': return e.conversou.size >= 3;   // a fofoca: ela e mais dois
        case 'ulfgar': return e.sinoTocou;               // o sino do templo
        case 'eira': return e.buscas.ovelhas === 'feita' || e.buscas.martelo === 'feita';
        default: return true;
    }
}

/**
 * Conversa com um morador. Devolve as falas e atualiza o estado.
 * Se ele cobra um favor ainda não pago, quem fala é o pedido — e a pista só
 * entra no estado quando o jogador volta com o favor feito.
 */
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
    if (busca && e.buscas[busca] === 'nova') e.buscas[busca] = 'ativa';
    const p = PISTA_DE[id];
    if (p && !e.pistas.has(p)) {
        if (!favorFeito(e, id)) return PEDIDO_DE[id]!;
        e.pistas.add(p);
        // quem paga o favor na primeira conversa ouve a história inteira;
        // quem já ouviu o pedido ouve a pista direta.
        return primeira ? ficha.primeira : ENTREGA_DE[id]!;
    }
    return primeira ? ficha.primeira : ficha.depois;
}

/**
 * A marca sobre a cabeça de um morador: '!' dourado = há novidade a receber
 * (primeira conversa, pista pronta para entregar, busca pronta para cobrar);
 * '?' prateado = ele espera um favor que você ainda não fez; null = nada a tratar.
 */
export function marcaDoMorador(e: Estado13, id: IdNpc): '!' | '?' | null {
    if (id === 'halvard') return null;
    const busca = BUSCA_DE[id];
    if (busca && e.buscas[busca] === 'pronta') return '!';
    if (!e.conversou.has(id)) return '!';
    const p = PISTA_DE[id];
    if (p && !e.pistas.has(p)) return favorFeito(e, id) ? '!' : '?';
    return null;
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
