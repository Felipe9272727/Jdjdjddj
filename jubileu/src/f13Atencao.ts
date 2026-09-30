/**
 * f13Atencao.ts — "Os Olhos da Vila": o medidor de atenção de Vindhjem.
 *
 * Sem three.js e sem React (testável). O medidor vai de 0 a 100 e NUNCA
 * aparece como número: o HUD só abre mais ou menos um olho.
 *
 *   sobe:  porta errada, encarar o Halvard possuído / a entidade, repetir
 *          conversa com o mesmo morador, correr sem parar.
 *   desce: peixe para um gato, o cão trazendo o graveto, sentar com o Árni,
 *          a melodia dos sinos, ovelha devolvida, e um decaimento lento.
 *
 *   35: glitch sutil (ambiente desafina, o parado de um morador congela)
 *   65: a silhueta do Halvard possuído aparece atrás do jogador
 *   90: aviso verde — o que os moradores dizem pode estar errado
 *
 * Tudo é reversível: cair abaixo do limiar (com uma folga, para não piscar)
 * desliga o efeito. Sem alocação por quadro.
 */

export const LIMIARES = [35, 65, 90] as const;
/** Folga para descer: o efeito só some 3 pontos abaixo do limiar. */
export const HISTERESE = 3;

export const GANHO = {
    portaErrada: 12, portaRepetida: 5, portaTrancada: 8,
    conversaRepetida: 6,        // a partir da 3ª conversa com o mesmo morador
    encararPorSegundo: 5,       // depois de ENCARAR_ATE segundos olhando
    correrPorSegundo: 1.6,      // depois de CORRER_ATE segundos sem parar
} as const;
export const PERDA = {
    gato: 10, graveto: 8, sinos: 25, ovelha: 6,
    sentarUmaVez: 10, sentadoPorSegundo: 4,
    decaimentoPorSegundo: .35,
} as const;
export const ENCARAR_ATE = 3;
export const CORRER_ATE = 15;
export const CONVERSAS_ATE = 2;

export const atencao = {
    valor: 0,
    /** 0 = calmo, 1 = glitch sutil (>=35), 2 = silhueta (>=65), 3 = aviso (>=90). */
    nivel: 0,
    /** Maior nível já explicado ao jogador (cada limiar avisa uma vez). */
    explicado: 0,
    /** Nível recém-cruzado para cima pela primeira vez, à espera do HUD (0 = nada). */
    pendente: 0,
    tEncarando: 0,
    tCorrendo: 0,
    conversas: {} as Record<string, number>,
    vistos: { gatos: 0, graveto: 0, sinos: false, ovelhas: 0, sentado: false },
};

export function zerarAtencao(): void {
    const a = atencao;
    a.valor = 0; a.nivel = 0; a.explicado = 0; a.pendente = 0; a.tEncarando = 0; a.tCorrendo = 0;
    a.conversas = {};
    a.vistos.gatos = 0; a.vistos.graveto = 0; a.vistos.sinos = false; a.vistos.ovelhas = 0; a.vistos.sentado = false;
}

/** Nível para um valor, com histerese quando `atual` já está acima. */
export function nivelDe(v: number, atual = 0): number {
    let n = 0;
    for (let i = 0; i < LIMIARES.length; i++) {
        const lim = LIMIARES[i] - (atual > i ? HISTERESE : 0);
        if (v >= lim) n = i + 1;
    }
    return n;
}

function reavaliar(): void {
    const a = atencao, n = nivelDe(a.valor, a.nivel);
    if (n > a.nivel && n > a.explicado) { a.explicado = n; a.pendente = n; }
    a.nivel = n;
}

/** Soma (ou subtrai, se negativo) e reavalia os limiares. */
export function mudarAtencao(delta: number): void {
    atencao.valor = Math.max(0, Math.min(100, atencao.valor + delta));
    reavaliar();
}
/** Bancada: fixa o valor (o `__f13.atencao(v)`). */
export function fixarAtencao(v: number): void {
    atencao.valor = Math.max(0, Math.min(100, v));
    reavaliar();
}

/** Bateu numa porta que não abriu. `primeiraVez` = primeira batida nessa casa. */
export function aoBaterErrado(primeiraVez: boolean, trancada = false): void {
    mudarAtencao(trancada ? GANHO.portaTrancada : primeiraVez ? GANHO.portaErrada : GANHO.portaRepetida);
}
/** Falou com um morador: da terceira conversa com o mesmo em diante a vila repara. */
export function aoConversar(id: string): void {
    const n = (atencao.conversas[id] ?? 0) + 1;
    atencao.conversas[id] = n;
    if (n > CONVERSAS_ATE) mudarAtencao(GANHO.conversaRepetida);
}

export interface EntradaDoQuadro {
    /** Câmera apontada para o Halvard possuído / a entidade, de perto. */
    encarando: boolean;
    /** Andando (o jogo tem uma velocidade só: "correr" = andar sem parar). */
    andando: boolean;
    sentado: boolean;
}
export interface Fontes { gatos: number; graveto: number; sinos: boolean; ovelhas: number }

/** Um passo de `dt` segundos. Chame uma vez por quadro (ou a cada poucos décimos). */
export function passoDaAtencao(dt: number, e: EntradaDoQuadro, f: Fontes): void {
    const a = atencao, v = a.vistos;
    let d = 0;
    // fontes que baixam: cada evento novo conta uma vez
    if (f.gatos > v.gatos) d -= PERDA.gato * (f.gatos - v.gatos);
    if (f.graveto > v.graveto) d -= PERDA.graveto * (f.graveto - v.graveto);
    if (f.sinos && !v.sinos) d -= PERDA.sinos;
    if (f.ovelhas > v.ovelhas) d -= PERDA.ovelha * (f.ovelhas - v.ovelhas);
    v.gatos = f.gatos; v.graveto = f.graveto; v.sinos = f.sinos; v.ovelhas = f.ovelhas;
    if (e.sentado) {
        if (!v.sentado) d -= PERDA.sentarUmaVez;
        d -= PERDA.sentadoPorSegundo * dt;
    }
    v.sentado = e.sentado;
    // encarar: só conta depois de uns segundos; soltar o olhar zera
    if (e.encarando) { a.tEncarando += dt; if (a.tEncarando > ENCARAR_ATE) d += GANHO.encararPorSegundo * dt; } else a.tEncarando = 0;
    // andar sem parar
    if (e.andando) { a.tCorrendo += dt; if (a.tCorrendo > CORRER_ATE) d += GANHO.correrPorSegundo * dt; } else a.tCorrendo = Math.max(0, a.tCorrendo - dt * 2);
    d -= PERDA.decaimentoPorSegundo * dt;
    if (d !== 0) mudarAtencao(d);
}

/**
 * Para uso futuro: a pista que o morador dá deve ser dita torta? Hoje só diz
 * se a vila já está de olho (>= 90). Não mexe na lógica das pistas.
 */
export function pistaDistorcida(): boolean {
    return atencao.nivel >= 3;
}

/** Fração de abertura do olho (0 fechado, 1 aberto), para o HUD. */
export const aberturaDoOlho = (v: number = atencao.valor) => Math.max(0, Math.min(1, v / 100));

/** Desafino do ambiente em centésimos de tom (0 abaixo de 35). */
export function desafinoEmCents(v: number = atencao.valor, nivel: number = atencao.nivel): number {
    if (nivel < 1) return 0;
    return -Math.round(Math.min(90, 18 + Math.max(0, v - 35) * 1.1));
}

// ── o parado de um morador congela por um instante (nível >= 1) ───────────────
const hashes = new Map<string, number>();
function hashDe(id: string): number {
    let h = hashes.get(id);
    if (h === undefined) { h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; hashes.set(id, h); }
    return h;
}
export const JANELA_DO_CONGELA = 6;
export const DURACAO_DO_CONGELA = 1.3;
/** Este morador está congelado agora? (t = relógio em segundos.) */
export function congelaIdle(id: string, t: number, nivel: number = atencao.nivel): boolean {
    if (nivel < 1) return false;
    const janela = Math.floor(t / JANELA_DO_CONGELA);
    if (t - janela * JANELA_DO_CONGELA > DURACAO_DO_CONGELA) return false;
    return (janela * 7 + 3) % 9 === hashDe(id) % 9;
}
