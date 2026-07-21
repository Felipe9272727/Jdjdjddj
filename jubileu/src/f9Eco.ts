/**
 * f9Eco.ts — o ECOSSISTEMA do Andar 9 (puro: sem three/react).
 *
 * À la Rain World: um mundo que existia antes do player e segue sem ele.
 * Cada bicho é um agente com DRIVES (fome, medo, território, toca) e uma
 * PERSONALIDADE própria (coragem/preguiça/erro) — bichos erram de propósito.
 * As espécies se relacionam por uma tabela presa/predador; o alimento
 * primário (musgo-brilho) rebrota; as populações vivem em TOCAS e renascem
 * nelas. A cada ~2 min passa a ONDA DE APAGAMENTO (a "chuva" daqui): aviso →
 * todos correm pras tocas → a onda apaga quem ficou de fora → renascer.
 *
 * LOD de simulação (as "abstract rooms" do Rain World, em escala de sala):
 * agentes perto do player tickam full por frame; longe, tickam abstrato a
 * ~2 Hz (movem em linha reta ao objetivo, sem manobra).
 *
 * ── OVERHAUL "RAIN WORLD" ──
 * A1 predação real: o vulto AGARRA a presa ('grabbed'), ARRASTA pra toca
 *    ('drag', 55% da velocidade) e só lá mata e come ('eat'); a presa luta
 *    ('struggle') e pode escapar (rolagem por tick de drag).
 * A2 percepção: visão exige linha de visão (troncos obstruem) e há SONS
 *    (fila `sounds`, cap 40, vida 6 s): alarme propaga em cadeia com latência
 *    individual, passos/galopes delatam quem corre, o grito da presa atrai
 *    outros vultos. O player é detectado por ruído (`hunt.noise`): parado é
 *    quase invisível, correndo é ouvido além do sense.
 * A3 memória (cap 5, ~40 s): presa vista, ameaça, comida. O vulto sem presa
 *    à vista INVESTIGA o ponto lembrado e seu wander vira PATRULHA.
 * A4 a onda mata por EXPOSIÇÃO progressiva (correr piora; toca/oco cura) —
 *    o fim da onda não mata mais ninguém diretamente.
 * A5 abrigo universal: toca se perto, senão o OCO mais próximo (`shelter`).
 * A6 vínculo (`bond`): player calado e perto cria confiança; saltito bondado
 *    SEGUE o player ('follow'); vulto bondado não caça o player.
 * A7 ritmo: frenesi pré-onda (fração 0.6–0.78: fome ×1.8, caça ao player
 *    mais fácil, herbívoros sem sentinela), fome altera risco (fearEff),
 *    necrofagia (cadáver fresco <6 s vira refeição direta).
 *
 * ── M19 "VOCÊ É SÓ MAIS UM BICHO" (a essência Rain World de verdade) ──
 * B1 FOME DO PLAYER (`fome` 0..1): sobe sempre; PASTAR musgo-brilho (parado
 *    colado, 0.5 s) ou CAÇAR saltito (encostar e segurar — desprevenido cai
 *    rápido, fugindo é difícil) derruba. fome=1 → 'inanicao' (a cena replanta).
 * B2 CAÇAR TEM PREÇO: o abate grita (atrai vultos) e TESTEMUNHAS com linha de
 *    visão aprendem: `playerFear` individual sobe — aquele bicho específico
 *    passa a te detectar de longe. Convivência calma habitua de volta.
 * B3 INDIVIDUALIDADE: além de brave/lazy/err, cada bicho nasce com `agress`
 *    (dominância), `curio` (chega mais perto do estranho) e um `playerFear`
 *    próprio; vultos DISPUTAM TERRITÓRIO (o menos dominante cede).
 * B4 APRENDIZADO LEVE: `foodMem` (o musgo que saciou — fome alta puxa o wander
 *    pra lá), `dangerMem` (~180 s: onde quase morri — o wander evita),
 *    `wounded` (escapou do agarrão → manca 60 s; predadores PREFEREM feridos).
 * B5 IMPERFEIÇÃO: perseguição longa cansa — o predador DESISTE no meio da
 *    caçada (player e presa), lembra o ponto e volta a patrulhar.
 * B6 DRAMA SENTÍVEL: `lastDrama` registra o último causo (agarrão, escape,
 *    abate, disputa) — o HUD narra o que aconteceu perto do player.
 *
 * V4 as 3 OFERENDAS (o objetivo do andar): a Raiz está DORMENTE e 3 frutos
 *    dourados esperam em spots perigosos (toca do vulto, oco longe do spawn,
 *    clareira do guardião) — presentes desde o início, objetivo legível de
 *    longe. Player a ≤1.2 u por 0.4 s PEGA (só 1 por vez: pegar outra exige
 *    entregar a atual; a carregada segue o player); a ≤3 u da Raiz ENTREGA
 *    (rootWake++). A 3ª entrega DESABROCHA a Raiz e abre a passagem
 *    (f9TryComplete no portal à frente dela). Carregando, o player é lento e
 *    barulhento (a cena aplica) e o vulto o fareja a ×1.6 de alcance
 *    (hunt.carry). Morreu carregando: f9DropOffering devolve o fruto ao spot.
 *
 * DETERMINISMO (rng semeado Park-Miller): os consumos de rnd() por tick são,
 * em ordem: sentinela/vagar do Guardião; rolagem de escape da presa agarrada
 * (1 por tick por presa, só no full-sim — no tick abstrato o arrasto é
 * garantido); jitter do alvo de fuga; jitter de mira da caça (presa/player);
 * thinkT + sorteio de sentinela/pausa + alvo de wander (com a patrulha do
 * vulto: cara-ou-coroa 50% memória × território e jitter do ponto). A
 * audição (latência, reação, reemissão) NÃO consome rnd.
 */

export type F9Species = 'saltito' | 'cervo' | 'vulto' | 'guardiao';

export interface F9SpeciesDef {
    speed: number; run: number; radius: number;
    sense: number;                        // raio de percepção visual
    hearR: number;                        // raio de audição (sons com loud=1)
    eats: ReadonlyArray<F9Species | 'musgo'>;
    fears: ReadonlyArray<F9Species | 'player'>;
    hungerRate: number;                   // fome por segundo
    homeR: number;                        // território ao redor da toca
    perDen: number;                       // população por toca
}

export const F9_SPECIES: Record<F9Species, F9SpeciesDef> = {
    saltito: {
        speed: 2.1, run: 5.2, radius: 0.28, sense: 7, hearR: 14,
        eats: ['musgo'], fears: ['vulto', 'guardiao', 'player', 'cervo'],
        hungerRate: 0.035, homeR: 9, perDen: 4,
    },
    cervo: {
        speed: 1.5, run: 6.4, radius: 0.8, sense: 10, hearR: 16,
        eats: ['musgo'], fears: ['vulto', 'guardiao', 'player'],
        hungerRate: 0.02, homeR: 15, perDen: 2,
    },
    vulto: {
        speed: 2.0, run: 6.9, radius: 0.55, sense: 12, hearR: 20,
        eats: ['saltito', 'cervo'], fears: ['guardiao'],
        hungerRate: 0.03, homeR: 18, perDen: 1,
    },
    guardiao: {
        speed: 0.85, run: 0.85, radius: 1.6, sense: 0, hearR: 0,
        eats: [], fears: [], hungerRate: 0, homeR: 60, perDen: 1,
    },
};

export type F9AgentState =
    | 'wander' | 'graze' | 'lookout' | 'sniff'
    | 'stalk' | 'chase' | 'eat' | 'flee' | 'toDen' | 'denned' | 'dead'
    // OVERHAUL RW: predação com agarrar/arrastar, investigação por memória, vínculo
    | 'grabbed' | 'drag' | 'investigate' | 'follow';

/** Uma lembrança do agente (presa vista, ameaça, comida) — decai com o tempo. */
export interface F9Memory { x: number; z: number; t: number; kind: 'prey' | 'threat' | 'food'; stale?: boolean }
/** Um som no mundo (percepção auditiva). `src` = id do emissor (-1/-2 = mundo/player). */
export interface F9Sound { x: number; z: number; t: number; kind: 'alarme' | 'passo' | 'thud' | 'grito'; loud: number; src?: number }
export type F9Shelter = 'den' | 'oco';

export interface F9Agent {
    id: number; sp: F9Species;
    x: number; z: number; heading: number;
    state: F9AgentState;
    tx: number; tz: number;               // ponto-alvo atual
    targetId: number;                     // presa/ameaça (-1 = nenhum; -2 = player)
    hunger: number; fear: number;
    den: number;                          // índice da toca-mãe
    // personalidade (pesquisa: imperfeição proposital)
    brave: number; lazy: number; err: number;
    // ── M19: individualidade Rain World ──
    agress: number;                       // dominância (disputas de território)
    curio: number;                        // curiosidade: tolera o estranho mais perto
    playerFear: number;                   // medo APRENDIDO do player (testemunha de caçada sobe; calma derrete)
    foodMem: { x: number; z: number } | null;              // o musgo que me saciou
    dangerMem: { x: number; z: number; t: number } | null; // onde quase morri (~180 s)
    wounded: number;                      // s restantes mancando (escapou de um agarrão)
    calmNearT: number;                    // convivência calma acumulada com o player (habituação)
    terrCd: number;                       // cooldown da disputa de território
    pursueT: number;                      // s em perseguição contínua (stalk/chase) — a caçada CANSA
    brain: F9Brain;                       // M20: o perceptron do indivíduo (disposições que aprendem)
    thinkT: number; stateT: number; deadT: number;
    anim: number; speedNow: number;
    // ── OVERHAUL RW ──
    carryingId: number;                   // presa sendo arrastada (-1 = nenhuma)
    grabbedBy: number;                    // predador que me agarrou (-1 = nenhum)
    bond: number;                         // 0..1 vínculo com o player
    exposure: number;                     // 0..1 exposição à onda de apagamento
    memory: F9Memory[];                   // lembranças (cap 5, ~40 s)
    shelter: F9Shelter;                   // onde estou abrigado quando 'denned'
    hearT: number;                        // latência de reação auditiva
    heardAt: number;                      // t do último som reagido (anti re-emissão infinita)
    // ── internos do overhaul (não fazem parte do contrato da cena) ──
    struggle: number;                     // luta acumulada enquanto agarrado [presa]
    grabCd: number;                       // cooldown pra agarrar de novo [predador]
    sfxT: number;                         // rate-limit da emissão de galope (1/0.3 s)
    bonded: boolean;                      // já emitiu 'vinculo' (1x por agente)
}

export interface F9Den { x: number; z: number; sp: F9Species }
export interface F9Moss { x: number; z: number; amount: number }

export type F9CyclePhase = 'calmo' | 'aviso' | 'onda' | 'renascer';
export type F9EcoEvent = 'alarme' | 'abate' | 'ondaComeca' | 'ondaTermina' | 'renasceu' | 'cacaPlayer' | 'bote'
    // OVERHAUL RW
    | 'agarrou' | 'escapou' | 'vinculo'
    // V4 — AS 3 OFERENDAS
    | 'oferendaPega' | 'oferendaEntregue' | 'raizDesabrocha' | 'f9Completo'
    // M19 — a sobrevivência do player + dramas do mundo
    | 'comeuMusgo' | 'cacouPresa' | 'inanicao' | 'territorio';

/** M19: o último "causo" do mundo — o HUD narra quando acontece perto. */
export interface F9Drama { kind: 'agarrou' | 'escapou' | 'abate' | 'territorio' | 'cacouPresa'; x: number; z: number; t: number }

// ── V4: AS 3 OFERENDAS (o objetivo do andar) ────────────────────────────────
export type F9OfferingSpot = 'vulto' | 'oco' | 'guardiao';
export type F9OfferingState = 'noChao' | 'carregada' | 'entregue';
export interface F9Offering {
    id: number;                         // 0..2
    spot: F9OfferingSpot;
    x: number; z: number;               // posição atual (noChao = spot; carregada = segue o player na cena)
    state: F9OfferingState;
}
export type F9RootState = 'dormente' | 'desabrochada';

export interface F9EcoState {
    agents: F9Agent[];
    dens: F9Den[];
    moss: F9Moss[];
    sounds: F9Sound[];                    // sons vivos do mundo (percepção auditiva)
    // V4
    offerings: F9Offering[];
    rootWake: number;                     // 0..3 corações acesos da Raiz
    rootState: F9RootState;
    // M19 — o player é só mais um bicho
    fome: number;                         // 0..1 fome do player (1 = inanição)
    lastDrama: F9Drama | null;
    t: number;
    cycleT: number; cycleLen: number;
    phase: F9CyclePhase;
    waveT: number;
    version: number;
}

// ── mundo: tocas e musgo (coordenadas do Andar 9: x∈[-32,32] z∈[-50,4]) ─────
const DENS: F9Den[] = [
    { x: -18, z: -10, sp: 'saltito' }, { x: 14, z: -20, sp: 'saltito' }, { x: -8, z: -38, sp: 'saltito' },
    { x: 22, z: -36, sp: 'cervo' }, { x: -24, z: -28, sp: 'cervo' },
    // vulto sul em (0,-44): guarda a aproximação da Raiz SEM morar dentro da
    // câmara nova (era (4,-46) — cairia DENTRO do anel de colisão M18) e fica
    // a ~10 u da toca de saltitos (-8,-38): a caça emergente continua viva.
    { x: 0, z: -44, sp: 'vulto' }, { x: -28, z: -44, sp: 'vulto' },
    { x: 0, z: -30, sp: 'guardiao' },
];
const MOSS: F9Moss[] = [
    { x: -12, z: -8, amount: 1 }, { x: 8, z: -14, amount: 1 }, { x: -20, z: -20, amount: 1 },
    { x: 18, z: -28, amount: 1 }, { x: -4, z: -34, amount: 1 }, { x: 26, z: -12, amount: 1 },
    { x: -30, z: -36, amount: 1 }, { x: 10, z: -42, amount: 1 }, { x: -14, z: -46, amount: 1 },
];

const CYCLE_LEN = 128;          // s por ciclo
const AVISO_AT = 0.78;          // fração do ciclo em que o aviso começa
const ONDA_LEN = 11;            // s de onda
const RENASCER_LEN = 6;

let nextId = 1;
let rngS = 20177;
const rnd = () => { rngS = (rngS * 16807) % 2147483647; return rngS / 2147483647; };

// ── M20: A REDE NEURAL de cada bicho ─────────────────────────────────────────
// Pesquisa (rainworld.miraheze.org): o Rain World NÃO roda rede neural — a
// "IA maravilhosa" dele é personalidade por indivíduo (energia, bravura,
// dominância…) semeada + regras simples. Nós JÁ temos isso (brave/agress/curio/
// playerFear/memórias). O Felipe pediu uma rede neural mesmo assim — então cada
// bicho ganha um PERCEPTRON MINÚSCULO por cima, como camada de disposição que
// APRENDE com a vida:
//   entrada(5) → oculta(5, tanh, PESOS FIXOS = as "features de personalidade"
//   semeadas) → saída(2, tanh, PESOS QUE APRENDEM por reforço).
// Saídas: [cautela, fome-drive]. A leitura linear (saída) aprende por regra
// Hebbiana modulada por recompensa (perigo↑cautela; comer↑forrageio) — barato
// (≈35 mults por bicho, ~13 bichos), sem backprop, e PERSISTENTE na vida do
// indivíduo. Determinismo: um RNG PRÓPRIO (brnd) semeia os pesos, então o
// stream principal rnd() (documentado no topo) fica intacto; avaliar/aprender
// não consome rnd. Perto do neutro ao nascer (pesos de saída pequenos): o
// ecossistema afinado de M16–M19 segue igual até o bicho VIVER e aprender.
const NN_IN = 5, NN_HID = 5, NN_OUT = 2;
let brainRngS = 990931;
const brnd = () => { brainRngS = (brainRngS * 16807) % 2147483647; return brainRngS / 2147483647; };

export interface F9Brain {
    w1: number[];   // NN_HID×NN_IN — features de personalidade (FIXAS)
    b1: number[];   // NN_HID
    w2: number[];   // NN_OUT×NN_HID — a leitura que APRENDE
    hid: number[];  // cache da última ativação oculta (pro aprendizado)
    out: number[];  // [cautela, fome-drive] da última avaliação
}

function makeBrain(): F9Brain {
    const w1: number[] = [], b1: number[] = [], w2: number[] = [];
    for (let i = 0; i < NN_HID * NN_IN; i++) w1.push((brnd() - 0.5) * 2.2); // features fortes
    for (let i = 0; i < NN_HID; i++) b1.push((brnd() - 0.5) * 1.2);
    for (let i = 0; i < NN_OUT * NN_HID; i++) w2.push((brnd() - 0.5) * 0.5); // leitura pequena (near-neutro)
    return { w1, b1, w2, hid: new Array(NN_HID).fill(0), out: [0, 0] };
}

/** avalia a rede do bicho com o estado atual (puro; não consome rnd). */
function brainEval(br: F9Brain, hunger: number, fear: number, pf: number, closeP: number, frac: number): void {
    const inp = [hunger, fear, pf, closeP, frac];
    for (let j = 0; j < NN_HID; j++) {
        let s = br.b1[j];
        for (let i = 0; i < NN_IN; i++) s += br.w1[j * NN_IN + i] * inp[i];
        br.hid[j] = Math.tanh(s);
    }
    for (let k = 0; k < NN_OUT; k++) {
        let s = 0;
        for (let j = 0; j < NN_HID; j++) s += br.w2[k * NN_HID + j] * br.hid[j];
        br.out[k] = Math.tanh(s);
    }
}

const NN_LR = 0.03;
/** aprendizado por reforço na leitura (saída): recompensa (±) reforça a
 *  associação entre a ativação oculta ATUAL e a disposição. `rC` mexe na
 *  cautela, `rF` no forrageio. Pesos limitados a [-2.5, 2.5]. */
function brainLearn(br: F9Brain, rC: number, rF: number): void {
    for (let j = 0; j < NN_HID; j++) {
        const h = br.hid[j];
        br.w2[0 * NN_HID + j] = Math.max(-2.5, Math.min(2.5, br.w2[0 * NN_HID + j] + NN_LR * rC * h));
        br.w2[1 * NN_HID + j] = Math.max(-2.5, Math.min(2.5, br.w2[1 * NN_HID + j] + NN_LR * rF * h));
    }
}

/** HUD/testes: as disposições aprendidas do indivíduo (cautela, fome-drive). */
export function f9BrainDisposition(id: number): { caution: number; forage: number } | null {
    const ag = f9eco.agents.find((a) => a.id === id);
    if (!ag) return null;
    return { caution: ag.brain.out[0], forage: ag.brain.out[1] };
}

/** superfície de TESTE da rede (pura): permite avaliar/aprender sem simular o
 *  mundo inteiro. Não usar em runtime. */
export const __f9Brain = { makeBrain, brainEval, brainLearn };

function spawnAgent(sp: F9Species, den: number, atDen = true): F9Agent {
    const d = DENS[den];
    const a = atDen ? rnd() * Math.PI * 2 : 0;
    const r = atDen ? rnd() * 3 : 0;
    return {
        id: nextId++, sp,
        x: d.x + Math.cos(a) * r, z: d.z + Math.sin(a) * r, heading: rnd() * Math.PI * 2,
        state: 'wander', tx: d.x, tz: d.z, targetId: -1,
        hunger: 0.25 + rnd() * 0.3, fear: 0,
        den,
        brave: rnd(), lazy: rnd(), err: 0.5 + rnd(),
        agress: rnd(), curio: rnd(), playerFear: 0.3 + rnd() * 0.4,
        foodMem: null, dangerMem: null, wounded: 0, calmNearT: 0, terrCd: 0, pursueT: 0,
        brain: makeBrain(),
        thinkT: rnd() * 0.6, stateT: 0, deadT: 0,
        anim: rnd() * 10, speedNow: 0,
        carryingId: -1, grabbedBy: -1, bond: 0, exposure: 0,
        memory: [], shelter: 'den', hearT: 0, heardAt: -1,
        struggle: 0, grabCd: 0, sfxT: 0, bonded: false,
    };
}

function freshAgents(): F9Agent[] {
    const out: F9Agent[] = [];
    DENS.forEach((d, i) => {
        for (let k = 0; k < F9_SPECIES[d.sp].perDen; k++) out.push(spawnAgent(d.sp, i));
    });
    return out;
}

/** V4 — as 3 OFERENDAS, espalhadas em 3 VEREDAS (direções distintas do spawn,
 *  sem amontoar num canto só): a FÁCIL no oco DIREITO [16,-24] (só herbívoros
 *  por perto — o player aprende o loop em segurança), a MÉDIA na clareira do
 *  GUARDIÃO [0,-30], a DIFÍCIL na toca do VULTO [-28,-44] (fundo-esquerda). O
 *  oco [6,-44] guarda a própria Raiz — nunca uma oferenda ali (trivializaria a
 *  entrega). Exportada pra cena/testes (a cena posiciona os faróis no 1º frame). */
export function freshOfferings(): F9Offering[] {
    return [
        { id: 0, spot: 'guardiao', x: 2, z: -29, state: 'noChao' },
        { id: 1, spot: 'oco', x: 15, z: -25, state: 'noChao' },
        { id: 2, spot: 'vulto', x: -26, z: -42, state: 'noChao' },
    ];
}

/** player morreu/replantou carregando: a oferenda volta pro spot dela. */
export function f9DropOffering(): void {
    const carregada = f9eco.offerings.find((o) => o.state === 'carregada');
    if (!carregada) return;
    const home = freshOfferings().find((o) => o.id === carregada.id)!;
    carregada.state = 'noChao'; carregada.x = home.x; carregada.z = home.z;
    f9EcoBump();
}

// V4: f9Completo dispara 1x por run — a cena pergunta por frame e o stinger
// de resolução não pode tocar em loop enquanto o player estiver no portal.
let completed = false;

/** a cena pergunta se o player está no portal da Raiz desabrochada (completar o andar).
 *  true enquanto estiver no portal; o EVENTO 'f9Completo' só sai na 1ª vez. */
export function f9TryComplete(px: number, pz: number): boolean {
    if (f9eco.rootState !== 'desabrochada') return false;
    const dx = px - F9_RAIZ[0], dz = pz - (F9_RAIZ[1] + 2.5);      // portal à frente da Raiz
    if (dx * dx + dz * dz > 1.8 * 1.8) return false;
    if (!completed) { completed = true; emit('f9Completo'); }
    return true;
}

const FRESH = (): F9EcoState => ({
    agents: freshAgents(),
    dens: DENS,
    moss: MOSS.map((m) => ({ ...m })),
    sounds: [],
    offerings: freshOfferings(),
    rootWake: 0, rootState: 'dormente',
    fome: 0.25, lastDrama: null,
    t: 0, cycleT: 0, cycleLen: CYCLE_LEN,
    phase: 'calmo', waveT: 0, version: 0,
});

export const f9eco: F9EcoState = FRESH();

const events: F9EcoEvent[] = [];
const ecoListeners = new Set<(e: F9EcoEvent) => void>();
function emit(e: F9EcoEvent): void {
    events.push(e);
    ecoListeners.forEach((fn) => fn(e));
}
export function f9EcoDrainEvents(): F9EcoEvent[] { return events.splice(0, events.length); }
/** fan-out de eventos (o drain continua funcionando; listeners recebem tudo na hora). */
export function f9EcoOn(fn: (e: F9EcoEvent) => void): () => void {
    ecoListeners.add(fn);
    return () => { ecoListeners.delete(fn); };
}

const listeners = new Set<() => void>();
export function f9EcoSubscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function f9EcoBump(): void { f9eco.version++; listeners.forEach((fn) => fn()); }

export function f9EcoReset(): void {
    nextId = 1; rngS = 20177; brainRngS = 990931;   // M20: o RNG dos cérebros também zera
    const v = f9eco.version;
    Object.assign(f9eco, FRESH());      // FRESH já limpa `sounds`
    f9eco.version = v;
    events.length = 0;
    absAcc = 0;                         // acumulador do tick abstrato (A8)
    stepSndT = 0;                       // rate-limit dos passos do player (A2)
    pickupId = -1; pickupT = 0;         // V4: "segurar pra pegar" da oferenda
    completed = false;                  // V4: o portal volta a poder completar
    eatT = 0;                           // M19: pastar do player
    pounceReq = false; pounceCd = 0;    // M20: o bote
    f9EcoBump();
}

/** M19: registra o último causo do mundo (o HUD narra quando perto). */
function drama(kind: F9Drama['kind'], x: number, z: number): void {
    f9eco.lastDrama = { kind, x, z, t: f9eco.t };
}

const dist2 = (ax: number, az: number, bx: number, bz: number) => {
    const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz;
};

/** O musgo mais próximo com comida (ou null). */
function nearestMoss(x: number, z: number): F9Moss | null {
    let best: F9Moss | null = null, bd = Infinity;
    for (const m of f9eco.moss) {
        if (m.amount < 0.2) continue;
        const d = dist2(x, z, m.x, m.z);
        if (d < bd) { bd = d; best = m; }
    }
    return best;
}

/** A presa mais próxima COM LINHA DE VISÃO (A2) — alcance consistente
 *  `sense*1.5` (A8: era 2× o sense). Aceita cadáveres frescos (deadT<6):
 *  necrofagia (A7). Presas agarradas por outro predador ficam de fora. */
function nearestPrey(ag: F9Agent, def: F9SpeciesDef): F9Agent | null {
    let best: F9Agent | null = null;
    const range = def.sense * 1.5;
    let bd = range * range;
    for (const o of f9eco.agents) {
        if (o.id === ag.id) continue;
        if (o.state === 'dead') { if (o.deadT >= 6) continue; }
        else if (o.state === 'denned' || o.state === 'grabbed') continue;
        if (!(def.eats as readonly string[]).includes(o.sp)) continue;
        // M19: sangue no ar — presa FERIDA (mancando) é preferida e "cheirada"
        // de mais longe (a distância efetiva encolhe pra ela)
        const d = dist2(ag.x, ag.z, o.x, o.z) * (o.wounded > 0 ? 0.35 : 1);
        if (d < bd && f9LineOfSight(ag.x, ag.z, o.x, o.z)) { bd = d; best = o; }
    }
    return best;
}

/** A ameaça mais próxima COM LINHA DE VISÃO (agente temido ou o player).
 *  O player é percebido por RUÍDO (A2): raio efetivo escala com `noise` —
 *  parado/agachado é quase invisível. Fome altera risco (A7): presa faminta
 *  percebe mais tarde (arrisca mais). Vínculo >0.6 tira o player dos fears. */
function nearestThreat(ag: F9Agent, def: F9SpeciesDef, px: number, pz: number, noise: number): { x: number; z: number; d2: number; player?: boolean } | null {
    let best: { x: number; z: number; d2: number; player?: boolean } | null = null;
    const risk = 1 - ag.hunger * 0.5; // fearEff nos limiares de detecção (A7)
    const senseBase = def.sense * (1 - ag.brave * 0.45) * risk;
    const s2 = senseBase * senseBase;
    if (ag.bond <= 0.6 && (def.fears as readonly string[]).includes('player')) {
        // M19: o medo do player é APRENDIDO por indivíduo — o bicho de base
        // (playerFear ~0.3-0.7) fica ~na vigilância normal (wary~1); quem
        // TESTEMUNHOU uma caçada dispara de bem mais longe (wary→1.6); o
        // curioso/habituado deixa chegar mais perto. O piso 0.96 no fresco
        // mantém o predador-evasor de sempre; o teto evita hipervigilância.
        const wary = Math.max(0.5, Math.min(1.6, 1 + ag.playerFear * 0.7 - ag.curio * 0.25));
        const eff = senseBase * (0.35 + 0.65 * noise) * wary;
        const d = dist2(ag.x, ag.z, px, pz);
        if (d < eff * eff && f9LineOfSight(ag.x, ag.z, px, pz)) best = { x: px, z: pz, d2: d, player: true };
    }
    for (const o of f9eco.agents) {
        if (o.state === 'dead' || o.state === 'denned' || o.state === 'grabbed') continue;
        if (!(def.fears as readonly string[]).includes(o.sp)) continue;
        const d = dist2(ag.x, ag.z, o.x, o.z);
        if (d < s2 && (!best || d < best.d2) && f9LineOfSight(ag.x, ag.z, o.x, o.z)) best = { x: o.x, z: o.z, d2: d };
    }
    return best;
}

/** Onde fica a RAIZ (fim do fio). Vive AQUI porque a IA entrega oferendas nela —
 *  f9Floresta reexporta para manter o contrato antigo. */
export const F9_RAIZ: readonly [number, number] = [6, -47];

/** OCOS (abrigos universais): troncos-mãe com brilho quente. [x, z, raio].
 *  Vivem AQUI (não em f9Floresta) porque a IA também se abriga neles —
 *  f9Floresta reexporta para manter o contrato antigo. */
export const F9_OCOS: ReadonlyArray<readonly [number, number, number]> = [
    // o guardião da Raiz saiu de (6,-44) → (9.5,-41.5): o anel de colisão M18
    // dele invadia o corredor da PORTA da câmara (a sonda de QA pegou).
    [-6, -6, 2.2], [16, -24, 2.2], [-22, -34, 2.2], [9.5, -41.5, 2.4],
];

// as árvores-mãe entram como obstáculos de steering (importar criaria ciclo —
// f9Floresta importa f9eco — então a lista vive aqui e a cena a reexporta).
export const F9_TREE_OBSTACLES: ReadonlyArray<readonly [number, number, number]> = [
    [-12, -14, 0.9], [9, -10, 0.8], [-5, -22, 1.0], [19, -18, 0.9],
    [-19, -24, 0.85], [3, -37, 1.0], [-13, -40, 0.9], [24, -30, 0.85],
    [-27, -16, 0.8], [14, -45, 0.9], [-8, -30, 0.7], [28, -42, 0.8],
];

/** linha de visão 2D: false se algum tronco-mãe obstrui o segmento a→b. */
export function f9LineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    for (const [ox, oz, or_] of F9_TREE_OBSTACLES) {
        const r = or_ + 0.15;
        let t = 0;
        if (len2 > 0.0001) t = Math.max(0, Math.min(1, ((ox - ax) * dx + (oz - az) * dz) / len2));
        const cx = ax + dx * t - ox, cz = az + dz * t - oz;
        if (cx * cx + cz * cz < r * r) return false;
    }
    return true;
}

/** A2: um som novo entra no mundo (fila cap 40 — some o mais antigo).
 *  Exportado também pra cena/testes; o motor usa internamente pra alarmes,
 *  galopes, gritos e os passos do player (via `hunt.noise` no tick). */
export function f9EcoEmitSound(x: number, z: number, kind: F9Sound['kind'], loud: number, src = -1): void {
    f9eco.sounds.push({ x, z, t: f9eco.t, kind, loud, src });
    if (f9eco.sounds.length > 40) f9eco.sounds.shift();
}

function byId(id: number): F9Agent | undefined {
    return f9eco.agents.find((a) => a.id === id);
}

/** A3: lembrança nova (cap 5). Funde com uma fresca parecida (≤6 s, ≤4 u)
 *  em vez de duplicar; limpa as expiradas (>40 s) quando empurra. */
function remember(ag: F9Agent, kind: F9Memory['kind'], x: number, z: number): void {
    for (const m of ag.memory) {
        if (m.kind === kind && !m.stale && f9eco.t - m.t < 6 && dist2(m.x, m.z, x, z) < 16) {
            m.t = f9eco.t; m.x = x; m.z = z;
            return;
        }
    }
    ag.memory.push({ x, z, t: f9eco.t, kind });
    if (ag.memory.length > 5) ag.memory.shift();
    if (ag.memory.some((m) => f9eco.t - m.t > 40)) ag.memory = ag.memory.filter((m) => f9eco.t - m.t <= 40);
}

/** A lembrança viva (≤40 s, não gasta) mais recente de um tipo (ou null). */
function freshMemory(ag: F9Agent, kind: F9Memory['kind']): F9Memory | null {
    let best: F9Memory | null = null;
    for (const m of ag.memory) {
        if (m.kind !== kind || m.stale || f9eco.t - m.t > 40) continue;
        if (!best || m.t > best.t) best = m;
    }
    return best;
}

/** estados em que o agente para pra OUVIR e reagir (A2). */
function hearableState(st: F9AgentState): boolean {
    return st === 'wander' || st === 'graze' || st === 'lookout' || st === 'sniff'
        || st === 'investigate' || st === 'stalk' || st === 'follow';
}

/** o som audível e ainda não reagido mais recente (ou null). */
function hearScan(ag: F9Agent, def: F9SpeciesDef): F9Sound | null {
    let best: F9Sound | null = null;
    for (const sn of f9eco.sounds) {
        if (sn.src === ag.id || sn.t <= ag.heardAt || f9eco.t - sn.t > 6) continue;
        const range = def.hearR * sn.loud;
        if (dist2(ag.x, ag.z, sn.x, sn.z) < range * range && (!best || sn.t > best.t)) best = sn;
    }
    return best;
}

function fleeFrom(ag: F9Agent, x: number, z: number): void {
    const away = Math.atan2(ag.x - x, ag.z - z);
    ag.tx = ag.x + Math.sin(away) * 7;
    ag.tz = ag.z + Math.cos(away) * 7;
}

/** A2: reação a um som ouvido (depois da latência individual).
 *  'alarme' faz herbívoro fugir e RE-EMITIR (cadeia; 1x por som por agente —
 *  `heardAt` foi marcado antes). 'grito' atrai vultos (investigam o ponto).
 *  passos/galopes só assustam quando perto demais (45% do alcance). */
function hearReact(ag: F9Agent, def: F9SpeciesDef, sn: F9Sound): void {
    const preyEar = ag.sp !== 'vulto' && def.fears.length > 0; // herbívoros
    if (sn.kind === 'alarme' && preyEar) {
        ag.state = 'flee'; ag.fear = 1; ag.stateT = 0;
        remember(ag, 'threat', sn.x, sn.z);
        fleeFrom(ag, sn.x, sn.z);
        f9EcoEmitSound(ag.x, ag.z, 'alarme', 1, ag.id); // propagação em cadeia
        return;
    }
    if (sn.kind === 'grito') {
        if (preyEar) {
            ag.state = 'flee'; ag.fear = 1; ag.stateT = 0;
            remember(ag, 'threat', sn.x, sn.z);
            fleeFrom(ag, sn.x, sn.z);
        } else if (ag.sp === 'vulto') {
            // emergente: caçar perto de outro vulto é arriscado — mas vale a carne
            remember(ag, 'prey', sn.x, sn.z);
            if (hearableState(ag.state)) { ag.state = 'investigate'; ag.stateT = 0; ag.tx = sn.x; ag.tz = sn.z; }
        }
        return;
    }
    if ((sn.kind === 'passo' || sn.kind === 'thud') && preyEar) {
        const range = def.hearR * sn.loud;
        if (dist2(ag.x, ag.z, sn.x, sn.z) < range * range * 0.2025) { // 45% do alcance
            ag.state = 'flee'; ag.fear = Math.max(ag.fear, 0.85); ag.stateT = 0;
            remember(ag, 'threat', sn.x, sn.z);
            fleeFrom(ag, sn.x, sn.z);
        }
    }
}

/** A5: abrigo mais sensato — a toca se está perto (≤25 u); senão o oco mais
 *  próximo (os ocos salvam qualquer espécie, não só o player). */
function pickShelter(ag: F9Agent): { x: number; z: number; eps: number; kind: F9Shelter } {
    const d = f9eco.dens[ag.den];
    if (dist2(ag.x, ag.z, d.x, d.z) <= 25 * 25) return { x: d.x, z: d.z, eps: 1.2, kind: 'den' };
    let bx = d.x, bz = d.z, bd = Infinity;
    for (const [ox, oz] of F9_OCOS) {
        const dd = dist2(ag.x, ag.z, ox, oz);
        if (dd < bd) { bd = dd; bx = ox; bz = oz; }
    }
    return { x: bx, z: bz, eps: 1.8, kind: 'oco' };
}

/** anda em direção a (tx,tz) DESVIANDO das árvores-mãe; true se chegou. */
function stepToward(ag: F9Agent, speed: number, dt: number, eps = 0.6): boolean {
    if (ag.wounded > 0) speed *= 0.78;  // M19: quem escapou de um agarrão MANCA
    const dx = ag.tx - ag.x, dz = ag.tz - ag.z;
    const d = Math.hypot(dx, dz);
    ag.speedNow = speed;
    if (d < eps) return true;
    // direção desejada + empurrão pra fora dos troncos próximos
    let mx = dx / d, mz = dz / d;
    for (const [ox, oz, or_] of F9_TREE_OBSTACLES) {
        const ax = ag.x - ox, az = ag.z - oz;
        const ad = Math.hypot(ax, az);
        const clear = or_ + 0.6;
        if (ad < clear + 1.2 && ad > 0.001) {
            const f = Math.max(0, (clear + 1.2 - ad)) * 1.6;
            mx += (ax / ad) * f; mz += (az / ad) * f;
        }
    }
    const ml = Math.hypot(mx, mz) || 1;
    const want = Math.atan2(mx / ml, mz / ml);
    let dh = want - ag.heading;
    while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    ag.heading += dh * Math.min(1, dt * 6);
    ag.x += Math.sin(ag.heading) * speed * dt;
    ag.z += Math.cos(ag.heading) * speed * dt;
    // limites do viveiro
    ag.x = Math.max(-32, Math.min(32, ag.x));
    ag.z = Math.max(-50, Math.min(4, ag.z));
    ag.anim += dt * speed * 2.2;
    return false;
}

/** ponto aleatório no território da toca (com o erro do indivíduo).
 *  Cervos têm COESÃO DE MANADA: o alvo é puxado pro centro dos outros cervos. */
function pickWander(ag: F9Agent, def: F9SpeciesDef): void {
    const d = f9eco.dens[ag.den];
    const a = rnd() * Math.PI * 2;
    const r = rnd() * def.homeR;
    let tx = d.x + Math.cos(a) * r + (rnd() - 0.5) * ag.err * 2;
    let tz = d.z + Math.sin(a) * r + (rnd() - 0.5) * ag.err * 2;
    if (ag.sp === 'cervo') {
        let cx = 0, cz = 0, n = 0;
        for (const o of f9eco.agents) {
            if (o.sp !== 'cervo' || o.id === ag.id || o.state === 'dead' || o.state === 'denned') continue;
            cx += o.x; cz += o.z; n++;
        }
        if (n > 0) { tx = tx * 0.55 + (cx / n) * 0.45; tz = tz * 0.55 + (cz / n) * 0.45; }
    }
    // A3: o wander do vulto é uma PATRULHA — metade das rondas passa pelas
    // lembranças de presa ainda vivas, metade pelo território da toca
    if (ag.sp === 'vulto') {
        const mem = freshMemory(ag, 'prey');
        if (mem && rnd() < 0.5) { tx = mem.x + (rnd() - 0.5) * 3; tz = mem.z + (rnd() - 0.5) * 3; }
    }
    // M19: APRENDIZADO no vagar — fome alta puxa o alvo pro musgo que saciou
    // (foodMem); alvo caindo perto de um susto recente (dangerMem ~180 s) é
    // empurrado pra longe: o bicho passa a EVITAR o lugar onde quase morreu.
    if (ag.foodMem && ag.hunger > 0.45 && (def.eats as readonly string[]).includes('musgo')) {
        tx = tx * 0.35 + ag.foodMem.x * 0.65; tz = tz * 0.35 + ag.foodMem.z * 0.65;
    }
    const dm = ag.dangerMem;
    if (dm && f9eco.t - dm.t < 180) {
        const dd = Math.hypot(tx - dm.x, tz - dm.z);
        if (dd < 7) {
            const ux = dd > 0.01 ? (tx - dm.x) / dd : 1, uz = dd > 0.01 ? (tz - dm.z) / dd : 0;
            tx = dm.x + ux * 9; tz = dm.z + uz * 9;
        }
    }
    // A8: alvos sempre dentro do viveiro (o Guardião não anda mais contra a parede)
    ag.tx = Math.max(-32, Math.min(32, tx));
    ag.tz = Math.max(-50, Math.min(2, tz));
}

/** contexto da caçada ao player (a cena informa por tick).
 *  `noise`: 0..1 barulho do player (0 = parado/agachado, 1 = correndo). */
interface HuntCtx { huntable: boolean; safeInOco: boolean; stillT: number; noise: number; carry: boolean }
const NO_HUNT: HuntCtx = { huntable: false, safeInOco: false, stillT: 0, noise: 0, carry: false };

/** o cérebro de um agente (full sim). */
function think(ag: F9Agent, dt: number, px: number, pz: number, hunt: HuntCtx = NO_HUNT): void {
    const def = F9_SPECIES[ag.sp];
    ag.stateT += dt;
    ag.thinkT -= dt;
    ag.grabCd -= dt;
    ag.sfxT -= dt;
    // M19: a manqueira do escapado e o cooldown de disputa derretem com o tempo
    if (ag.wounded > 0) ag.wounded = Math.max(0, ag.wounded - dt);
    if (ag.terrCd > 0) ag.terrCd -= dt;
    // M19: o cronômetro da perseguição — só corre enquanto ESPREITA/PERSEGUE
    if (ag.state === 'stalk' || ag.state === 'chase') ag.pursueT += dt; else ag.pursueT = 0;
    // A7: frenesi pré-onda — a fome aperta pra todo mundo antes do apagamento
    const frac = f9eco.cycleT / f9eco.cycleLen;
    const frenzy = frac >= 0.6 && frac < AVISO_AT;
    if (ag.sp !== 'guardiao') ag.hunger = Math.min(1, ag.hunger + def.hungerRate * (frenzy ? 1.8 : 1) * dt);
    ag.fear = Math.max(0, ag.fear - dt * 0.25);

    // o Guardião: só anda o mundo, imune a tudo — você não é o centro daqui
    if (ag.sp === 'guardiao') {
        if (ag.thinkT <= 0 || dist2(ag.x, ag.z, ag.tx, ag.tz) < 4) {
            ag.thinkT = 6 + rnd() * 6;
            pickWander(ag, def);
        }
        stepToward(ag, def.speed, dt, 1.4);
        ag.state = 'wander';
        return;
    }

    const den = f9eco.dens[ag.den];
    const pd = Math.hypot(px - ag.x, pz - ag.z);

    // M20: avalia a REDE do indivíduo com o estado atual → disposições.
    // `caution` (>0 = mais medroso/prudente) e `forage` (>0 = mais faminto por
    // buscar comida). São NUDGES pequenos por cima da personalidade e das
    // regras; o aprendizado (perigo/comida) desloca a leitura ao longo da vida.
    brainEval(ag.brain, ag.hunger, ag.fear, ag.playerFear, Math.max(0, 1 - pd / 18), frac);
    const caution = ag.brain.out[0];
    const forage = ag.brain.out[1];

    // A2: quem corre faz barulho — chase/flee emitem 'thud' de galope (1/0.3 s)
    if ((ag.state === 'flee' || ag.state === 'chase') && ag.sfxT <= 0 && ag.speedNow > def.run * 0.5) {
        f9EcoEmitSound(ag.x, ag.z, 'thud', Math.min(1, ag.speedNow / def.run), ag.id);
        ag.sfxT = 0.3;
    }

    // A2: audição — reage a sons com latência individual (0.2 + err*0.3 s).
    // heardAt guarda o t do som-GATILHO (a reação é pra ele, não pro mais novo —
    // senão um thud inócuo roubava a reação do alarme que assustou); cada som
    // é reagido no máximo 1x por agente.
    if (ag.hearT > 0) {
        ag.hearT -= dt;
        if (ag.hearT <= 0 && hearableState(ag.state)) {
            const sn = f9eco.sounds.find((s2) => s2.t === ag.heardAt);
            if (sn) hearReact(ag, def, sn);
        }
    } else if (def.hearR > 0 && hearableState(ag.state)) {
        const sn = hearScan(ag, def);
        if (sn) { ag.heardAt = sn.t; ag.hearT = 0.2 + ag.err * 0.3; }
    }

    // ── A1: presa AGARRADA — vai na boca do predador, luta, pode escapar ──
    if (ag.state === 'grabbed') {
        const pred = byId(ag.grabbedBy);
        if (!pred || pred.state === 'dead' || pred.carryingId !== ag.id) {
            // o predador morreu (ex.: na onda) ou largou — liberdade
            ag.state = 'flee'; ag.fear = 1; ag.stateT = 0; ag.grabbedBy = -1; ag.struggle = 0;
            return;
        }
        // pendurada atrás da boca do predador
        ag.x = pred.x - Math.sin(pred.heading) * (def.radius + 0.35);
        ag.z = pred.z - Math.cos(pred.heading) * (def.radius + 0.35);
        ag.heading = pred.heading; ag.speedNow = pred.speedNow;
        ag.struggle += dt;
        // rolagem de escape: chance POR SEGUNDO (coragem ajuda; predador errático
        // segura melhor) — dt*30 mantém a taxa que o design tinha a 30 Hz
        const pEsc = (ag.brave * 0.10 - pred.err * 0.02) * dt * 30 + dt * 0.3;
        if (ag.struggle > 0.15 && rnd() < pEsc) {
            ag.state = 'flee'; ag.fear = 1; ag.stateT = 0; ag.grabbedBy = -1; ag.struggle = 0;
            pred.carryingId = -1; pred.grabCd = 1.4; // cooldown antes de agarrar de novo
            pred.state = 'chase'; pred.stateT = 0; pred.targetId = ag.id;
            // M19: escapou FERIDO — manca 60 s (predadores preferem feridos) e
            // APRENDE: o lugar do agarrão vira memória de perigo (~180 s)
            ag.wounded = 60;
            ag.dangerMem = { x: ag.x, z: ag.z, t: f9eco.t };
            drama('escapou', ag.x, ag.z);
            emit('escapou');
        }
        return;
    }

    // ── A1: predador ARRASTANDO a presa pra toca — a morte só vem lá ──
    if (ag.state === 'drag') {
        const prey = byId(ag.carryingId);
        if (!prey || prey.state === 'dead' || prey.grabbedBy !== ag.id) {
            ag.carryingId = -1; ag.state = 'wander'; pickWander(ag, def);
            return;
        }
        ag.tx = den.x; ag.tz = den.z;
        if (stepToward(ag, def.speed * 0.55, dt, 1.5)) { // pesado: 55% da velocidade
            prey.state = 'dead'; prey.deadT = 0; prey.speedNow = 0; prey.grabbedBy = -1;
            ag.carryingId = -1; ag.state = 'eat'; ag.stateT = 0; ag.tx = prey.x; ag.tz = prey.z;
            drama('abate', prey.x, prey.z);
            emit('abate'); // o abate acontece na toca, não no contato
        }
        return;
    }

    // aviso/onda: prioridade máxima = abrigo — toca se perto, senão o OCO (A5)
    const mustHome = f9eco.phase === 'onda'
        || (f9eco.phase === 'aviso' && frac > AVISO_AT + ag.lazy * 0.1);
    if (mustHome && ag.state !== 'denned' && ag.state !== 'dead') {
        const sh = pickShelter(ag);
        ag.state = 'toDen'; ag.tx = sh.x; ag.tz = sh.z;
        if (stepToward(ag, def.run * 0.92, dt, sh.eps)) { ag.state = 'denned'; ag.shelter = sh.kind; ag.speedNow = 0; }
        return;
    }
    if (ag.state === 'denned') {
        // sai da toca quando o mundo renasce/acalma
        if (f9eco.phase === 'calmo') { ag.state = 'wander'; pickWander(ag, def); }
        else { ag.speedNow = 0; return; }
    }

    // medo: fugir na direção oposta — visão com oclusão e ruído (A2)
    const threat = nearestThreat(ag, def, px, pz, hunt.noise);
    if (threat && ag.state !== 'flee') {
        ag.state = 'flee'; ag.stateT = 0; ag.fear = 1;
        remember(ag, 'threat', threat.x, threat.z); // A3
        // M19: cada susto com o player REFORÇA o medo aprendido (individual)
        if (threat.player) { ag.playerFear = Math.min(1, ag.playerFear + 0.1); ag.calmNearT = 0; }
        brainLearn(ag.brain, 1, 0);   // M20: levar susto ENSINA cautela (reforço)
        emit('alarme');
        // o contágio agora é por OUVIDO: quem foge grita 'alarme' e os outros reagem
        f9EcoEmitSound(ag.x, ag.z, 'alarme', 1, ag.id);
    }
    if (ag.state === 'flee') {
        if (threat) {
            const away = Math.atan2(ag.x - threat.x, ag.z - threat.z);
            ag.tx = ag.x + Math.sin(away) * 7 + (rnd() - 0.5) * ag.err * 2.5;
            ag.tz = ag.z + Math.cos(away) * 7 + (rnd() - 0.5) * ag.err * 2.5;
        }
        stepToward(ag, def.run, dt, 1);
        // M20: o cauteloso demora mais pra baixar a guarda (caution nudge)
        if (!threat && ag.stateT > 1.6 + ag.brave + caution * 0.7) { ag.state = 'wander'; pickWander(ag, def); }
        return;
    }
    // A7: fome altera risco — presa faminta dá menos peso ao alarme alheio
    if (ag.fear * (1 - ag.hunger * 0.5) > 0.6) { // alarmado: corre pro território
        ag.state = 'flee'; ag.tx = den.x; ag.tz = den.z; ag.stateT = 0;
        return;
    }

    // ── A6: vínculo/doma com o player (Fiapo) ──
    if (hunt.stillT > 2 && pd < 6 && !threat) ag.bond = Math.min(1, ag.bond + dt * 0.03);
    // M19: HABITUAÇÃO — perto do player, sem barulho e sem susto, o medo
    // aprendido derrete devagar (o mesmo bicho que te temia volta a chegar)
    if (pd < 7 && hunt.noise < 0.35 && !threat) {
        ag.calmNearT += dt;
        if (ag.calmNearT > 4) ag.playerFear = Math.max(0, ag.playerFear - dt * 0.02);
    } else if (ag.calmNearT > 0) ag.calmNearT = Math.max(0, ag.calmNearT - dt);
    // oferta de comida: player parado colado num musgo bom (proxy da oferta)
    if (hunt.stillT > 1.5 && pd < 10 && (def.eats as readonly string[]).includes('musgo')) {
        for (const m of f9eco.moss) {
            if (m.amount > 0.3 && dist2(px, pz, m.x, m.z) < 4) { ag.bond = Math.min(1, ag.bond + dt * 0.18); break; }
        }
    }
    // susto: player barulhento dentro do sense corrói o vínculo
    if (hunt.noise > 0.6 && pd < def.sense) ag.bond = Math.max(0, ag.bond - dt * 1.2);
    if (!ag.bonded && ag.bond > 0.6) { ag.bonded = true; emit('vinculo'); } // 1x por agente

    // ── ETOLOGIA: sentinela (para, ergue a cabeça, varre o entorno) ──
    if (ag.state === 'lookout') {
        ag.speedNow = 0;
        ag.heading += dt * 0.5 * Math.sin(ag.stateT * 1.3);
        if (ag.stateT > 2.2 + ag.lazy * 1.5) { ag.state = 'wander'; pickWander(ag, def); }
        return;
    }
    // ── CURIOSIDADE do saltito: player-bicho parado vira coisa a cheirar ──
    // (bondado não cheira — ele já confia; segue o player no 'follow' abaixo)
    if (ag.sp === 'saltito' && ag.bond <= 0.6) {
        if (ag.state === 'sniff') {
            if (pd < 2.6 || ag.stateT > 6) {
                ag.speedNow = 0;
                if (ag.stateT > 6 || pd < 1.4) { ag.fear = 0.75; ag.state = 'flee'; ag.stateT = 0; }
                return;
            }
            ag.tx = px; ag.tz = pz;
            stepToward(ag, def.speed * 0.55, dt, 2.4);
            return;
        }
        if (ag.state === 'wander' && hunt.stillT > 3.5 && pd > 5 && pd < 11 && ag.fear < 0.2 && ag.brave > 0.35) {
            ag.state = 'sniff'; ag.stateT = 0;
            return;
        }
    }
    // ── A6: saltito bondado SEGUE o player (a 2.5 u; desiste se ficar pra trás) ──
    if (ag.sp === 'saltito' && ag.bond > 0.6 && (ag.state === 'wander' || ag.state === 'graze' || ag.state === 'follow')) {
        if (ag.state === 'follow' ? pd < 12 : (pd > 2 && pd < 8)) {
            if (ag.state !== 'follow') { ag.state = 'follow'; ag.stateT = 0; }
            ag.tx = px; ag.tz = pz;
            if (stepToward(ag, def.speed * 1.35, dt, 2.5)) ag.speedNow = 0;
            return;
        }
        if (ag.state === 'follow') { ag.state = 'wander'; pickWander(ag, def); }
    }

    // ── M19: TERRITÓRIO — dois vultos perto demais DISPUTAM; o menos dominante
    // (brave+agress) cede e corre; o dominante fica de guarda. Emergente: a
    // disputa pode salvar uma presa (o caçador larga a ronda) ou empurrar um
    // vulto pro caminho do player.
    if (ag.sp === 'vulto' && ag.terrCd <= 0
        && (ag.state === 'wander' || ag.state === 'investigate')) {
        for (const o of f9eco.agents) {
            if (o.sp !== 'vulto' || o.id === ag.id || o.terrCd > 0) continue;
            if (o.state === 'dead' || o.state === 'denned' || o.state === 'drag' || o.state === 'grabbed') continue;
            if (dist2(ag.x, ag.z, o.x, o.z) > 6 * 6) continue;
            const loser = (ag.brave + ag.agress) < (o.brave + o.agress) ? ag : o;
            const winner = loser === ag ? o : ag;
            loser.state = 'flee'; loser.stateT = 0; loser.fear = 0.8;
            fleeFrom(loser, winner.x, winner.z);
            loser.tx = loser.x + (loser.tx - loser.x) * 1.5; // cede LONGE, não só um passo
            loser.dangerMem = { x: winner.x, z: winner.z, t: f9eco.t };
            winner.state = 'lookout'; winner.stateT = 0;
            ag.terrCd = 22; o.terrCd = 22;
            drama('territorio', winner.x, winner.z);
            emit('territorio');
            break;
        }
    }

    // ── o VULTO caça o PLAYER-bicho (você faz parte da cadeia agora) ──
    // A6: vulto bondado (bond>0.6) NÃO caça o player. A7: no frenesi o limiar cai.
    if (ag.sp === 'vulto' && hunt.huntable && ag.bond <= 0.6 && ag.state !== 'eat' && ag.hunger > (frenzy ? 0.25 : 0.45) + caution * 0.1) {
        if (hunt.safeInOco) {
            // a luz quente do oco repele — ronda a distância e desiste
            if (ag.targetId === -2) { ag.targetId = -1; ag.state = 'wander'; pickWander(ag, def); }
        } else {
            // A2: precisa VER (com oclusão) ou OUVIR o player (passos barulhentos)
            // V4: carregando uma OFERENDA (hunt.carry) o player se destaca —
            // lento e barulhento, os vultos o farejam a ×1.6 de alcance
            const carryR = hunt.carry ? 1.6 : 1;
            const seesPlayer = pd < def.sense * 1.25 * carryR && f9LineOfSight(ag.x, ag.z, px, pz);
            const hearsPlayer = hunt.noise > 0.25 && pd < def.hearR * hunt.noise * carryR;
            // M19: perseguição longa CANSA — o predador DESISTE no meio da
            // caçada (imperfeição RW), lembra o ponto e para pra recuperar o
            // fôlego (lookout ~2-4 s). A presa "ganha" essa. Sem rnd: o
            // lookout não chama pickWander.
            if (ag.targetId === -2 && (ag.state === 'chase' || ag.state === 'stalk')
                && ag.pursueT > 5 + ag.brave * 5 && pd > 2.5) {
                ag.targetId = -1;
                remember(ag, 'prey', px, pz);
                ag.state = 'lookout'; ag.stateT = 0;
                return;
            }
            if (seesPlayer || hearsPlayer) {
                ag.targetId = -2;
                ag.state = pd > 6.5 ? 'stalk' : 'chase';
                ag.tx = px + (rnd() - 0.5) * ag.err * (ag.state === 'chase' ? 1.2 : 0.3);
                ag.tz = pz + (rnd() - 0.5) * ag.err * (ag.state === 'chase' ? 1.2 : 0.3);
                if (ag.state === 'chase' && pd < 6.5 && ag.stateT < 0.05) emit('bote');
                stepToward(ag, ag.state === 'stalk' ? def.speed * 0.7 : def.run, dt, 0.5);
                if (pd < 1.15) {
                    emit('cacaPlayer');
                    ag.hunger = Math.max(0, ag.hunger - 0.45);
                    ag.state = 'lookout'; ag.stateT = 0; ag.targetId = -1;
                }
                return;
            }
            if (ag.targetId === -2) { ag.targetId = -1; ag.state = 'wander'; }
        }
    }

    // fome: musgo (herbívoros) ou caça (vulto).
    // A1: o bloco de caça NÃO executa durante 'eat'/'drag' (fix do eat roubado)
    // — 'drag' nem chega aqui: o arrasto retorna lá em cima, antes do mustHome.
    // M20: forage nudge — o mais "forrageiro" (rede) busca comida com um pouco
    // menos de fome; o preguiçoso-de-barriga, um pouco mais. (limiar 0.55∓0.12)
    if (ag.hunger > 0.55 - forage * 0.12 && ag.state !== 'eat') {
        if ((def.eats as readonly string[]).includes('musgo')) {
            const m = nearestMoss(ag.x, ag.z);
            if (m) {
                if (m.amount > 0.5) remember(ag, 'food', m.x, m.z); // A3: musgo bom vira lembrança
                ag.tx = m.x + (rnd() - 0.5) * ag.err; ag.tz = m.z + (rnd() - 0.5) * ag.err;
                ag.state = 'graze';
                if (stepToward(ag, def.speed * 1.25, dt, 1.1)) {
                    ag.speedNow = 0;
                    m.amount = Math.max(0, m.amount - dt * 0.12);
                    ag.hunger = Math.max(0, ag.hunger - dt * 0.22);
                    if (ag.hunger <= 0.08 || m.amount <= 0.1) {
                        // M19: saciou → ESTE musgo vira a memória de comida do indivíduo
                        if (ag.hunger <= 0.08) { ag.foodMem = { x: m.x, z: m.z }; brainLearn(ag.brain, -0.4, 1); } // M20: comer bem RELAXA e reforça forrageio
                        ag.state = 'wander'; pickWander(ag, def);
                    }
                }
                return;
            }
        } else {
            // VULTO × PRESAS (A1): espreita → persegue → AGARRA → arrasta → come na toca
            const prey = nearestPrey(ag, def);
            if (prey) {
                const d2p = dist2(ag.x, ag.z, prey.x, prey.z);
                const reach = def.radius + F9_SPECIES[prey.sp].radius + 0.5;
                if (prey.state === 'dead') {
                    // A7: necrofagia — cadáver fresco é refeição direta, sem espreita
                    ag.targetId = prey.id; ag.tx = prey.x; ag.tz = prey.z;
                    stepToward(ag, def.speed * 1.1, dt, 0.8);
                    if (d2p < reach * reach) { ag.state = 'eat'; ag.stateT = 0; ag.targetId = -1; }
                    return;
                }
                remember(ag, 'prey', prey.x, prey.z); // A3: registra onde viu a presa
                // M19: a caçada à presa também cansa — desistir no meio é o que
                // torna o mundo imprevisível (a presa "ganha" às vezes). Para
                // pra recuperar (lookout), sem re-travar na mesma presa na hora.
                if ((ag.state === 'chase' || ag.state === 'stalk') && ag.targetId === prey.id
                    && ag.pursueT > 6 + ag.brave * 3 && d2p > 4) {
                    ag.targetId = -1; ag.state = 'lookout'; ag.stateT = 0;
                    return;
                }
                ag.targetId = prey.id;
                // espreita devagar; perto, dispara (com erro de mira individual)
                ag.state = d2p > 20 ? 'stalk' : 'chase';
                ag.tx = prey.x + (rnd() - 0.5) * ag.err * (ag.state === 'chase' ? 1.6 : 0.4);
                ag.tz = prey.z + (rnd() - 0.5) * ag.err * (ag.state === 'chase' ? 1.6 : 0.4);
                stepToward(ag, ag.state === 'stalk' ? def.speed * 0.75 : def.run, dt, 0.8);
                if (d2p < reach * reach && ag.grabCd <= 0 && prey.state !== 'grabbed') {
                    // AGARROU — a presa vai arrastada pra toca; o grito dela atrai rivais
                    prey.state = 'grabbed'; prey.grabbedBy = ag.id; prey.struggle = 0; prey.speedNow = 0;
                    brainLearn(prey.brain, 1.5, 0);   // M20: ser agarrado é a lição de cautela mais dura
                    ag.carryingId = prey.id; ag.state = 'drag'; ag.stateT = 0; ag.targetId = -1;
                    ag.tx = den.x; ag.tz = den.z;
                    drama('agarrou', prey.x, prey.z);
                    emit('agarrou');
                    f9EcoEmitSound(prey.x, prey.z, 'grito', 1.6, prey.id);
                }
                return;
            }
            // A3: sem presa à vista mas com lembrança viva → investiga o ponto
            // (NÃO retorna: cai no bloco 'investigate' logo abaixo, no mesmo tick)
            const mem = freshMemory(ag, 'prey');
            if (mem) {
                if (ag.state !== 'investigate') { ag.state = 'investigate'; ag.stateT = 0; }
                ag.targetId = -1; ag.tx = mem.x; ag.tz = mem.z;
            }
        }
    }
    if (ag.state === 'eat') {
        ag.speedNow = 0;
        if (ag.stateT > 3.2) { ag.hunger = 0; ag.state = 'wander'; pickWander(ag, def); }
        return;
    }

    // A3: INVESTIGAÇÃO — focinho no chão até o ponto lembrado; nada ali → esquece
    if (ag.state === 'investigate') {
        if (stepToward(ag, def.speed * 0.85, dt, 1.5) || ag.stateT > 14) {
            const mem = freshMemory(ag, 'prey');
            if (mem) mem.stale = true;
            ag.state = 'wander'; pickWander(ag, def);
        }
        return;
    }

    // vagar pelo território (com pausas e olhares — bicho também descansa)
    if (ag.thinkT <= 0) {
        ag.thinkT = 1.2 + rnd() * 2.4 + ag.lazy * 1.5;
        const roll = rnd();
        // A7: no frenesi pré-onda os herbívoros ignoram a sentinela — é comer e correr
        if (roll < 0.16 && ag.sp !== 'vulto' && !frenzy) { ag.state = 'lookout'; ag.stateT = 0; return; }
        if (roll < 0.3 + ag.lazy * 0.3) { ag.tx = ag.x; ag.tz = ag.z; }
        else pickWander(ag, def);
    }
    ag.state = 'wander';
    if (stepToward(ag, def.speed, dt, 0.7)) ag.speedNow = 0;
}

/** tick abstrato (longe do player): sem manobra, só progresso e drives. */
function thinkAbstract(ag: F9Agent, dt: number): void {
    const def = F9_SPECIES[ag.sp];
    if (ag.sp !== 'guardiao') ag.hunger = Math.min(1, ag.hunger + def.hungerRate * dt);
    // M19: os relógios individuais correm também no LOD longe
    if (ag.wounded > 0) ag.wounded = Math.max(0, ag.wounded - dt);
    if (ag.terrCd > 0) ag.terrCd -= dt;
    // A1 no LOD longe: presa agarrada só acompanha o predador (o escape é
    // uma rolagem do full-sim — no abstrato o arrasto é garantido)
    if (ag.state === 'grabbed') {
        const pred = byId(ag.grabbedBy);
        if (!pred || pred.state === 'dead' || pred.carryingId !== ag.id) {
            ag.state = 'flee'; ag.fear = 1; ag.grabbedBy = -1; ag.struggle = 0;
            return;
        }
        ag.x = pred.x - Math.sin(pred.heading) * (def.radius + 0.35);
        ag.z = pred.z - Math.cos(pred.heading) * (def.radius + 0.35);
        return;
    }
    if (ag.state === 'drag') {
        const prey = byId(ag.carryingId);
        if (!prey || prey.state === 'dead' || prey.grabbedBy !== ag.id) { ag.carryingId = -1; ag.state = 'wander'; return; }
        const d0 = f9eco.dens[ag.den];
        ag.tx = d0.x; ag.tz = d0.z;
        if (dist2(ag.x, ag.z, d0.x, d0.z) < 1.5 * 1.5) {
            prey.state = 'dead'; prey.deadT = 0; prey.speedNow = 0; prey.grabbedBy = -1;
            ag.carryingId = -1; ag.state = 'eat'; ag.stateT = 0;
            emit('abate');
            return;
        }
    }
    if (ag.state === 'eat') { ag.hunger = 0; ag.state = 'wander'; } // abstrato: a refeição conclui direto
    const mustHome = f9eco.phase === 'onda' || f9eco.phase === 'aviso';
    let eps = 1.4; let shelter: F9Shelter = 'den';
    // (o 'drag' já tem a toca como destino — mustHome não o interrompe, como no full-sim)
    if (mustHome && ag.sp !== 'guardiao' && ag.state !== 'drag') {
        const sh = pickShelter(ag); // A5: toca perto, senão oco
        ag.tx = sh.x; ag.tz = sh.z; ag.state = 'toDen'; eps = sh.eps; shelter = sh.kind;
    } else if (ag.state !== 'drag' && ag.hunger > 0.6 && (def.eats as readonly string[]).includes('musgo')) {
        const m = nearestMoss(ag.x, ag.z);
        if (m) {
            ag.tx = m.x; ag.tz = m.z;
            if (dist2(ag.x, ag.z, m.x, m.z) < 2) { m.amount = Math.max(0, m.amount - dt * 0.1); ag.hunger = Math.max(0, ag.hunger - dt * 0.2); }
        }
    } else if (ag.state !== 'drag' && dist2(ag.x, ag.z, ag.tx, ag.tz) < 1) pickWander(ag, def);
    const dx = ag.tx - ag.x, dz = ag.tz - ag.z, d = Math.hypot(dx, dz) || 1;
    const sp = (ag.state === 'toDen' ? def.run * 0.8 : ag.state === 'drag' ? def.speed * 0.55 : def.speed)
        * (ag.wounded > 0 ? 0.78 : 1);
    const step = Math.min(d, sp * dt);
    ag.x += (dx / d) * step; ag.z += (dz / d) * step;
    // A8: clamp nos limites do viveiro (igual stepToward)
    ag.x = Math.max(-32, Math.min(32, ag.x));
    ag.z = Math.max(-50, Math.min(4, ag.z));
    ag.heading = Math.atan2(dx, dz);
    ag.speedNow = sp;
    ag.anim += dt * sp * 2;
    if (ag.state === 'toDen' && d < eps) { ag.state = 'denned'; ag.shelter = shelter; }
}

// acumulador do tick abstrato (2 Hz)
let absAcc = 0;
// rate-limit da emissão dos passos do player (A2: 1 som a cada 0.3 s)
let stepSndT = 0;
// V4: "segurar pra pegar" — id da oferenda sob o pé do player e o tempo
// contínuo a ≤1.2 u dela (0.4 s pega; sair do raio zera)
let pickupId = -1;
let pickupT = 0;
// M19: "segurar pra comer" do player (pastar musgo — o mesmo padrão do pickup)
let eatT = 0;
// M20: o BOTE (pounce) — a caça agora é ATIVA (botão), não mais "encostar e
// segurar" (impossível: a presa foge antes). O player pede o bote; a cena
// (Fiapo) consome com a direção do olhar; um cooldown evita spam.
let pounceReq = false;
let pounceCd = 0;

/** HUD: progresso do "segurar pra colher" (0..1) e qual fruto — null se não
 *  está colhendo. O motor era invisível aqui: o player ficava 0.4 s parado sem
 *  NENHUM feedback e não descobria a mecânica. */
export function f9PickupProgress(): { id: number; k: number } | null {
    if (pickupId < 0) return null;
    return { id: pickupId, k: Math.min(1, pickupT / 0.4) };
}

/** M19 HUD: progresso do "pastando o musgo…" (0..1; 0 = não está comendo). */
export function f9EatProgress(): number { return Math.min(1, eatT / 0.5); }
/** M20: o player pede o BOTE (o botão da cena chama). */
export function f9RequestPounce(): void { pounceReq = true; }
/** M20 HUD: o bote está pronto (fora do cooldown)? */
export function f9PounceReady(): boolean { return pounceCd <= 0; }
/** M20 HUD: fração do cooldown do bote já recuperada (0..1). */
export function f9PounceCooldown(): number { return Math.max(0, Math.min(1, 1 - pounceCd / POUNCE_CD)); }
const POUNCE_CD = 0.9;

/** M20: as testemunhas de uma caçada APRENDEM a temer o player (playerFear sobe)
 *  e as presas fogem. Vultos ficam de fora (o grito já os atrai). Reusado pelo
 *  BOTE e por qualquer abate causado pelo player. */
function witnessPlayerKill(px: number, pz: number, quarryId: number): void {
    for (const w of f9eco.agents) {
        if (w.id === quarryId || w.sp === 'vulto' || w.sp === 'guardiao') continue;
        if (w.state === 'dead' || w.state === 'denned') continue;
        if (dist2(w.x, w.z, px, pz) > 12 * 12) continue;
        if (!f9LineOfSight(w.x, w.z, px, pz)) continue;
        w.playerFear = Math.min(1, w.playerFear + 0.55);   // aprendizado individual
        w.dangerMem = { x: px, z: pz, t: f9eco.t };
        w.state = 'flee'; w.fear = 1; w.stateT = 0;
        fleeFrom(w, px, pz);
    }
}

/** M20: O BOTE — a cena (Fiapo) chama quando o player deu o bote, com a POSIÇÃO
 *  e a DIREÇÃO do olhar. Pega o saltito mais próximo à frente (≤2.6 u, cone de
 *  ~60°). Devolve 'catch' (abateu), 'whiff' (errou) ou null (não pediu/cooldown).
 *  A caça é ATIVA e possível: o player espreita/corre até a presa e dá o bote. */
export function f9EcoTryPounce(px: number, pz: number, theta: number): 'catch' | 'whiff' | null {
    if (!pounceReq) return null;
    pounceReq = false;
    if (pounceCd > 0) return null;
    pounceCd = POUNCE_CD;
    const fx = -Math.sin(theta), fz = -Math.cos(theta); // frente do player
    let best: F9Agent | null = null, bd = Infinity;
    for (const o of f9eco.agents) {
        if (o.sp !== 'saltito') continue;
        if (o.state === 'dead' || o.state === 'denned' || o.state === 'grabbed') continue;
        const dx = o.x - px, dz = o.z - pz, d = Math.hypot(dx, dz);
        if (d > 2.6) continue;
        const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
        if (dot < 0.5) continue;                        // ~60° à frente
        if (d < bd) { bd = d; best = o; }
    }
    if (!best) { emit('bote'); return 'whiff'; }        // errou: só o whoosh
    best.state = 'dead'; best.deadT = 0; best.speedNow = 0; best.grabbedBy = -1;
    f9eco.fome = Math.max(0, f9eco.fome - 0.75);
    drama('cacouPresa', best.x, best.z);
    emit('cacouPresa');
    f9EcoEmitSound(best.x, best.z, 'grito', 1.5, best.id);
    witnessPlayerKill(px, pz, best.id);
    f9EcoBump();
    return 'catch';
}

/**
 * O tick do mundo. `px,pz` = player; `lodR` = raio de simulação full.
 * `hunt` (opcional): o player é caçável? está num oco? há quanto tempo parado?
 * Chame por frame; o abstrato interno roda a 2 Hz sozinho.
 */
export function f9EcoTick(dt: number, px: number, pz: number, lodR = 24, hunt?: Partial<HuntCtx>): void {
    const huntCtx: HuntCtx = { ...NO_HUNT, ...hunt };
    return f9EcoTickInner(dt, px, pz, lodR, huntCtx);
}

function f9EcoTickInner(dt: number, px: number, pz: number, lodR: number, hunt: HuntCtx): void {
    const s = f9eco;
    s.t += dt;
    s.cycleT += dt;

    // A2: sons têm vida ~6 s (a fila é ordenada por t — sai o mais velho)
    while (s.sounds.length > 0 && s.t - s.sounds[0].t > 6) s.sounds.shift();
    // A2: passos do player — a cena informa `noise` no tick e o motor emite
    // o som (parado/agachado = silêncio; correndo delata até fora do sense)
    stepSndT -= dt;
    if (hunt.noise > 0.25 && stepSndT <= 0) {
        f9EcoEmitSound(px, pz, 'passo', Math.max(0.3, hunt.noise), -2);
        stepSndT = 0.3;
    }

    // ── o ciclo do APAGAMENTO ──
    const frac = s.cycleT / s.cycleLen;
    if (s.phase === 'calmo' && frac >= AVISO_AT) { s.phase = 'aviso'; f9EcoBump(); }
    else if (s.phase === 'aviso' && frac >= 1) {
        s.phase = 'onda'; s.waveT = 0; emit('ondaComeca'); f9EcoBump();
    } else if (s.phase === 'onda') {
        s.waveT += dt;
        // A4: o FIM da onda não mata mais ninguém — quem aguentou a exposição
        // e alcançou um abrigo sobrevive ("quase não deu", o momento RW)
        if (s.waveT >= ONDA_LEN) { s.phase = 'renascer'; s.waveT = 0; emit('ondaTermina'); f9EcoBump(); }
    } else if (s.phase === 'renascer') {
        s.waveT += dt;
        if (s.waveT >= RENASCER_LEN) {
            // repõe populações nas tocas + musgo rebrota cheio
            const alive: Record<string, number[]> = {};
            s.agents = s.agents.filter((a) => a.state !== 'dead');
            s.agents.forEach((a) => {
                (alive[`${a.sp}:${a.den}`] ??= []).push(a.id);
                a.state = 'wander'; // A8: sem o ternário morto — todos voltam a vagar
                a.fear = 0; a.exposure = 0;
                a.carryingId = -1; a.grabbedBy = -1; a.struggle = 0; // solta tudo ao renascer
            });
            DENS.forEach((d, i) => {
                const have = alive[`${d.sp}:${i}`]?.length ?? 0;
                for (let k = have; k < F9_SPECIES[d.sp].perDen; k++) s.agents.push(spawnAgent(d.sp, i));
            });
            for (const m of s.moss) m.amount = 1;
            s.phase = 'calmo'; s.cycleT = 0; s.waveT = 0;
            emit('renasceu'); f9EcoBump();
        }
    }

    // musgo rebrota devagar sempre
    for (const m of s.moss) m.amount = Math.min(1, m.amount + dt * 0.008);

    // ── M19/M20: a FOME do player — você é só mais um bicho: coma ou apague ──
    // (determinístico: nada aqui consome rnd — a ordem do topo se mantém)
    if (pounceCd > 0) pounceCd -= dt;                    // M20: cooldown do bote
    if (hunt.huntable) {
        // M20: fome mais gentil (0.0034/s ≈ 4,5 min do zero) — a morte por fome
        // é evitável de sobra com a bússola apontando pro musgo mais próximo.
        s.fome = Math.min(1, s.fome + dt * 0.0034);
        // PASTAR (a comida CONFIÁVEL, não foge): parado colado num musgo-brilho.
        // Raio generoso (1,6) e 0,45 s de mastigar — a fome nunca é beco-sem-saída.
        let mossNear: F9Moss | null = null;
        for (const m of s.moss) {
            if (m.amount > 0.2 && dist2(px, pz, m.x, m.z) <= 1.6 * 1.6) { mossNear = m; break; }
        }
        if (mossNear && s.fome > 0.1 && hunt.noise < 0.55) {
            eatT += dt;
            if (eatT >= 0.45) {
                mossNear.amount = Math.max(0, mossNear.amount - 0.32);
                s.fome = Math.max(0, s.fome - 0.42);
                eatT = 0;
                emit('comeuMusgo');
                f9EcoBump();
            }
        } else eatT = 0;
        // CAÇAR é ATIVO agora: o BOTE (f9EcoTryPounce, chamado pela cena com a
        // direção do olhar). Não há mais "encostar e segurar" — a presa fugia
        // antes de você segurar. Caçar dá muito mais comida que pastar, mas faz
        // barulho (grito atrai vultos) e ensina as testemunhas a te temer.
        // INANIÇÃO: fome cheia apaga o player por dentro (a cena drena o
        // evento e replanta via f9Faminto; o reset pra 0.55 evita o loop)
        if (s.fome >= 1) { s.fome = 0.55; emit('inanicao'); }
    }

    // ── V4: AS 3 OFERENDAS — pegar (≤1.6 u por 0.4 s), carregar, entregar (≤3 u) ──
    // (determinístico: não consome rnd — a ordem de consumo do topo se mantém)
    const carregada = s.offerings.find((o) => o.state === 'carregada');
    if (carregada) {
        // a carregada segue o player (a cena lê x/z pro glow sobre a cabeça);
        // e só 1 por vez: enquanto houver carregada nenhuma outra é pega
        carregada.x = px; carregada.z = pz;
        pickupId = -1; pickupT = 0;
        if (dist2(px, pz, F9_RAIZ[0], F9_RAIZ[1]) <= 3 * 3) {
            carregada.state = 'entregue'; // fica onde foi entregue: a cena voa ela pro coração
            s.rootWake = Math.min(3, s.rootWake + 1);
            emit('oferendaEntregue');
            if (s.rootWake >= 3 && s.rootState !== 'desabrochada') {
                s.rootState = 'desabrochada'; // a 3ª entrega DESABROCHA a Raiz (finale)
                emit('raizDesabrocha');
            }
            f9EcoBump();
        }
    } else {
        let cand: F9Offering | null = null;
        for (const o of s.offerings) {
            if (o.state !== 'noChao') continue;
            // raio 1.6 (era 1.2): em 1ª pessoa de bicho o player não vê os pés —
            // o raio apertado fazia parecer que o fruto "não pegava"
            if (dist2(px, pz, o.x, o.z) <= 1.6 * 1.6) { cand = o; break; }
        }
        if (!cand) { pickupId = -1; pickupT = 0; }
        else {
            if (pickupId !== cand.id) { pickupId = cand.id; pickupT = 0; }
            pickupT += dt;
            if (pickupT >= 0.4) {
                cand.state = 'carregada';
                pickupId = -1; pickupT = 0;
                emit('oferendaPega');
                f9EcoBump();
            }
        }
    }

    // ── agentes: full perto, abstrato longe (2 Hz) ──
    absAcc += dt;
    const absStep = absAcc >= 0.5 ? absAcc : 0;
    const lod2 = lodR * lodR;
    for (const ag of s.agents) {
        if (ag.state === 'dead') { ag.deadT += dt; continue; }
        // A4: exposição progressiva à onda — fora de abrigo (toca/oco) acumula,
        // correndo acumula mais rápido; no abrigo (ou fora da onda) recupera.
        // Preguiçosos aguentam menos (chegaram mais tarde): morre em 1-lazy*0.3.
        if (ag.sp !== 'guardiao') {
            let sheltered = ag.state === 'denned';
            if (!sheltered && dist2(ag.x, ag.z, s.dens[ag.den].x, s.dens[ag.den].z) < 1.8 * 1.8) sheltered = true;
            if (!sheltered) {
                for (const [ox, oz, or_] of F9_OCOS) {
                    if (dist2(ag.x, ag.z, ox, oz) < or_ * or_) { sheltered = true; break; }
                }
            }
            if (s.phase === 'onda' && !sheltered) {
                ag.exposure += dt * (0.28 + ag.speedNow * 0.04);
                if (ag.exposure >= 1 - ag.lazy * 0.3) { ag.state = 'dead'; ag.deadT = 0; ag.speedNow = 0; continue; }
            } else if (ag.exposure > 0) {
                ag.exposure = Math.max(0, ag.exposure - dt * 2);
            }
        }
        if (dist2(ag.x, ag.z, px, pz) <= lod2) think(ag, dt, px, pz, hunt);
        else if (absStep > 0) thinkAbstract(ag, absStep);
    }
    if (absStep > 0) absAcc = 0;

    // cadáveres somem (viram floresta)
    s.agents = s.agents.filter((a) => a.state !== 'dead' || a.deadT < 8);
}

/** Fração 0..1 do ciclo (HUD/céu). */
export function f9CycleFrac(): number { return Math.min(1, f9eco.cycleT / f9eco.cycleLen); }
export const F9_AVISO_AT = AVISO_AT;
