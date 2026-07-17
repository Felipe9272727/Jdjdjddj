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
 */

export type F9Species = 'saltito' | 'cervo' | 'vulto' | 'guardiao';

export interface F9SpeciesDef {
    speed: number; run: number; radius: number;
    sense: number;                        // raio de percepção
    eats: ReadonlyArray<F9Species | 'musgo'>;
    fears: ReadonlyArray<F9Species | 'player'>;
    hungerRate: number;                   // fome por segundo
    homeR: number;                        // território ao redor da toca
    perDen: number;                       // população por toca
}

export const F9_SPECIES: Record<F9Species, F9SpeciesDef> = {
    saltito: {
        speed: 2.1, run: 5.2, radius: 0.28, sense: 7,
        eats: ['musgo'], fears: ['vulto', 'guardiao', 'player', 'cervo'],
        hungerRate: 0.035, homeR: 9, perDen: 4,
    },
    cervo: {
        speed: 1.5, run: 6.4, radius: 0.8, sense: 10,
        eats: ['musgo'], fears: ['vulto', 'guardiao', 'player'],
        hungerRate: 0.02, homeR: 15, perDen: 2,
    },
    vulto: {
        speed: 2.0, run: 6.9, radius: 0.55, sense: 12,
        eats: ['saltito', 'cervo'], fears: ['guardiao'],
        hungerRate: 0.03, homeR: 18, perDen: 1,
    },
    guardiao: {
        speed: 0.85, run: 0.85, radius: 1.6, sense: 0,
        eats: [], fears: [], hungerRate: 0, homeR: 60, perDen: 1,
    },
};

export type F9AgentState =
    | 'wander' | 'graze' | 'lookout' | 'sniff'
    | 'stalk' | 'chase' | 'eat' | 'flee' | 'toDen' | 'denned' | 'dead';

export interface F9Agent {
    id: number; sp: F9Species;
    x: number; z: number; heading: number;
    state: F9AgentState;
    tx: number; tz: number;               // ponto-alvo atual
    targetId: number;                     // presa/ameaça (-1 = nenhum)
    hunger: number; fear: number;
    den: number;                          // índice da toca-mãe
    // personalidade (pesquisa: imperfeição proposital)
    brave: number; lazy: number; err: number;
    thinkT: number; stateT: number; deadT: number;
    anim: number; speedNow: number;
}

export interface F9Den { x: number; z: number; sp: F9Species }
export interface F9Moss { x: number; z: number; amount: number }

export type F9CyclePhase = 'calmo' | 'aviso' | 'onda' | 'renascer';
export type F9EcoEvent = 'alarme' | 'abate' | 'ondaComeca' | 'ondaTermina' | 'renasceu' | 'cacaPlayer' | 'bote';

export interface F9EcoState {
    agents: F9Agent[];
    dens: F9Den[];
    moss: F9Moss[];
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
    { x: 4, z: -46, sp: 'vulto' }, { x: -28, z: -44, sp: 'vulto' },
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
        thinkT: rnd() * 0.6, stateT: 0, deadT: 0,
        anim: rnd() * 10, speedNow: 0,
    };
}

function freshAgents(): F9Agent[] {
    const out: F9Agent[] = [];
    DENS.forEach((d, i) => {
        for (let k = 0; k < F9_SPECIES[d.sp].perDen; k++) out.push(spawnAgent(d.sp, i));
    });
    return out;
}

const FRESH = (): F9EcoState => ({
    agents: freshAgents(),
    dens: DENS,
    moss: MOSS.map((m) => ({ ...m })),
    t: 0, cycleT: 0, cycleLen: CYCLE_LEN,
    phase: 'calmo', waveT: 0, version: 0,
});

export const f9eco: F9EcoState = FRESH();

const events: F9EcoEvent[] = [];
function emit(e: F9EcoEvent): void { events.push(e); }
export function f9EcoDrainEvents(): F9EcoEvent[] { return events.splice(0, events.length); }

const listeners = new Set<() => void>();
export function f9EcoSubscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function f9EcoBump(): void { f9eco.version++; listeners.forEach((fn) => fn()); }

export function f9EcoReset(): void {
    nextId = 1; rngS = 20177;
    const v = f9eco.version;
    Object.assign(f9eco, FRESH());
    f9eco.version = v;
    events.length = 0;
    f9EcoBump();
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

/** A presa viva mais próxima dentro do alcance (ou null). */
function nearestPrey(ag: F9Agent, def: F9SpeciesDef): F9Agent | null {
    let best: F9Agent | null = null, bd = def.sense * def.sense * 4;
    for (const o of f9eco.agents) {
        if (o.id === ag.id || o.state === 'dead' || o.state === 'denned') continue;
        if (!(def.eats as readonly string[]).includes(o.sp)) continue;
        const d = dist2(ag.x, ag.z, o.x, o.z);
        if (d < bd) { bd = d; best = o; }
    }
    return best;
}

/** A ameaça mais próxima (agente temido ou o player) e a distância². */
function nearestThreat(ag: F9Agent, def: F9SpeciesDef, px: number, pz: number): { x: number; z: number; d2: number } | null {
    let best: { x: number; z: number; d2: number } | null = null;
    const senseBase = def.sense * (1 - ag.brave * 0.45);
    const s2 = senseBase * senseBase;
    if ((def.fears as readonly string[]).includes('player')) {
        const d = dist2(ag.x, ag.z, px, pz);
        if (d < s2) best = { x: px, z: pz, d2: d };
    }
    for (const o of f9eco.agents) {
        if (o.state === 'dead' || o.state === 'denned') continue;
        if (!(def.fears as readonly string[]).includes(o.sp)) continue;
        const d = dist2(ag.x, ag.z, o.x, o.z);
        if (d < s2 && (!best || d < best.d2)) best = { x: o.x, z: o.z, d2: d };
    }
    return best;
}

// as árvores-mãe entram como obstáculos de steering (importar criaria ciclo —
// f9Floresta importa f9eco — então a lista vive aqui e a cena a reexporta).
export const F9_TREE_OBSTACLES: ReadonlyArray<readonly [number, number, number]> = [
    [-12, -14, 0.9], [9, -10, 0.8], [-5, -22, 1.0], [19, -18, 0.9],
    [-19, -24, 0.85], [3, -37, 1.0], [-13, -40, 0.9], [24, -30, 0.85],
    [-27, -16, 0.8], [14, -45, 0.9], [-8, -30, 0.7], [28, -42, 0.8],
];

/** anda em direção a (tx,tz) DESVIANDO das árvores-mãe; true se chegou. */
function stepToward(ag: F9Agent, speed: number, dt: number, eps = 0.6): boolean {
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
    ag.tx = tx; ag.tz = Math.min(2, tz);
}

/** contexto da caçada ao player (a cena informa por tick). */
interface HuntCtx { huntable: boolean; safeInOco: boolean; stillT: number }
const NO_HUNT: HuntCtx = { huntable: false, safeInOco: false, stillT: 0 };

/** o cérebro de um agente (full sim). */
function think(ag: F9Agent, dt: number, px: number, pz: number, hunt: HuntCtx = NO_HUNT): void {
    const def = F9_SPECIES[ag.sp];
    ag.stateT += dt;
    ag.thinkT -= dt;
    if (ag.sp !== 'guardiao') ag.hunger = Math.min(1, ag.hunger + def.hungerRate * dt);
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

    // aviso/onda: prioridade máxima = voltar pra toca (preguiçosos demoram)
    const den = f9eco.dens[ag.den];
    const cycleFrac = f9eco.cycleT / f9eco.cycleLen;
    const mustHome = f9eco.phase === 'onda'
        || (f9eco.phase === 'aviso' && cycleFrac > AVISO_AT + ag.lazy * 0.1);
    if (mustHome && ag.state !== 'denned' && ag.state !== 'dead') {
        ag.state = 'toDen'; ag.tx = den.x; ag.tz = den.z;
        if (stepToward(ag, def.run * 0.92, dt, 1.2)) { ag.state = 'denned'; ag.speedNow = 0; }
        return;
    }
    if (ag.state === 'denned') {
        // sai da toca quando o mundo renasce/acalma
        if (f9eco.phase === 'calmo') { ag.state = 'wander'; pickWander(ag, def); }
        else { ag.speedNow = 0; return; }
    }

    // medo: fugir na direção oposta (e alarmar vizinhos da espécie)
    const threat = nearestThreat(ag, def, px, pz);
    if (threat && ag.state !== 'flee') {
        ag.state = 'flee'; ag.stateT = 0; ag.fear = 1;
        emit('alarme');
        for (const o of f9eco.agents) {
            if (o.sp === ag.sp && o.id !== ag.id && dist2(ag.x, ag.z, o.x, o.z) < 64) o.fear = Math.max(o.fear, 0.7);
        }
    }
    if (ag.state === 'flee') {
        if (threat) {
            const away = Math.atan2(ag.x - threat.x, ag.z - threat.z);
            ag.tx = ag.x + Math.sin(away) * 7 + (rnd() - 0.5) * ag.err * 2.5;
            ag.tz = ag.z + Math.cos(away) * 7 + (rnd() - 0.5) * ag.err * 2.5;
        }
        stepToward(ag, def.run, dt, 1);
        if (!threat && ag.stateT > 1.6 + ag.brave) { ag.state = 'wander'; pickWander(ag, def); }
        return;
    }
    if (ag.fear > 0.6) { // alarmado por vizinho: corre pro território
        ag.state = 'flee'; ag.tx = den.x; ag.tz = den.z; ag.stateT = 0;
        return;
    }

    // ── ETOLOGIA: sentinela (para, ergue a cabeça, varre o entorno) ──
    if (ag.state === 'lookout') {
        ag.speedNow = 0;
        ag.heading += dt * 0.5 * Math.sin(ag.stateT * 1.3);
        if (ag.stateT > 2.2 + ag.lazy * 1.5) { ag.state = 'wander'; pickWander(ag, def); }
        return;
    }
    // ── CURIOSIDADE do saltito: player-bicho parado vira coisa a cheirar ──
    if (ag.sp === 'saltito') {
        const pd = Math.hypot(px - ag.x, pz - ag.z);
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
    // ── o VULTO caça o PLAYER-bicho (você faz parte da cadeia agora) ──
    if (ag.sp === 'vulto' && hunt.huntable && ag.hunger > 0.45) {
        const pd = Math.hypot(px - ag.x, pz - ag.z);
        if (hunt.safeInOco) {
            // a luz quente do oco repele — ronda a distância e desiste
            if (ag.targetId === -2) { ag.targetId = -1; ag.state = 'wander'; pickWander(ag, def); }
        } else if (pd < def.sense * 1.25) {
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
        } else if (ag.targetId === -2) { ag.targetId = -1; ag.state = 'wander'; }
    }

    // fome: musgo (herbívoros) ou caça (vulto)
    if (ag.hunger > 0.55) {
        if ((def.eats as readonly string[]).includes('musgo')) {
            const m = nearestMoss(ag.x, ag.z);
            if (m) {
                ag.tx = m.x + (rnd() - 0.5) * ag.err; ag.tz = m.z + (rnd() - 0.5) * ag.err;
                ag.state = 'graze';
                if (stepToward(ag, def.speed * 1.25, dt, 1.1)) {
                    ag.speedNow = 0;
                    m.amount = Math.max(0, m.amount - dt * 0.12);
                    ag.hunger = Math.max(0, ag.hunger - dt * 0.22);
                    if (ag.hunger <= 0.08 || m.amount <= 0.1) { ag.state = 'wander'; pickWander(ag, def); }
                }
                return;
            }
        } else {
            const prey = nearestPrey(ag, def);
            if (prey) {
                const d2p = dist2(ag.x, ag.z, prey.x, prey.z);
                ag.targetId = prey.id;
                // espreita devagar; perto, dispara (com erro de mira individual)
                ag.state = d2p > 20 ? 'stalk' : 'chase';
                ag.tx = prey.x + (rnd() - 0.5) * ag.err * (ag.state === 'chase' ? 1.6 : 0.4);
                ag.tz = prey.z + (rnd() - 0.5) * ag.err * (ag.state === 'chase' ? 1.6 : 0.4);
                stepToward(ag, ag.state === 'stalk' ? def.speed * 0.75 : def.run, dt, 0.8);
                if (d2p < (def.radius + F9_SPECIES[prey.sp].radius + 0.5) ** 2) {
                    prey.state = 'dead'; prey.deadT = 0; prey.speedNow = 0;
                    ag.state = 'eat'; ag.stateT = 0; ag.tx = prey.x; ag.tz = prey.z;
                    emit('abate');
                }
                return;
            }
        }
    }
    if (ag.state === 'eat') {
        ag.speedNow = 0;
        if (ag.stateT > 3.2) { ag.hunger = 0; ag.state = 'wander'; pickWander(ag, def); }
        return;
    }

    // vagar pelo território (com pausas e olhares — bicho também descansa)
    if (ag.thinkT <= 0) {
        ag.thinkT = 1.2 + rnd() * 2.4 + ag.lazy * 1.5;
        const roll = rnd();
        if (roll < 0.16 && ag.sp !== 'vulto') { ag.state = 'lookout'; ag.stateT = 0; return; }
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
    const mustHome = f9eco.phase === 'onda' || f9eco.phase === 'aviso';
    if (mustHome && ag.sp !== 'guardiao') { ag.tx = f9eco.dens[ag.den].x; ag.tz = f9eco.dens[ag.den].z; ag.state = 'toDen'; }
    else if (ag.hunger > 0.6 && (def.eats as readonly string[]).includes('musgo')) {
        const m = nearestMoss(ag.x, ag.z);
        if (m) {
            ag.tx = m.x; ag.tz = m.z;
            if (dist2(ag.x, ag.z, m.x, m.z) < 2) { m.amount = Math.max(0, m.amount - dt * 0.1); ag.hunger = Math.max(0, ag.hunger - dt * 0.2); }
        }
    } else if (dist2(ag.x, ag.z, ag.tx, ag.tz) < 1) pickWander(ag, def);
    const dx = ag.tx - ag.x, dz = ag.tz - ag.z, d = Math.hypot(dx, dz) || 1;
    const sp = ag.state === 'toDen' ? def.run * 0.8 : def.speed;
    const step = Math.min(d, sp * dt);
    ag.x += (dx / d) * step; ag.z += (dz / d) * step;
    ag.heading = Math.atan2(dx, dz);
    ag.anim += dt * sp * 2;
    if (ag.state === 'toDen' && d < 1.4) ag.state = 'denned';
}

// acumulador do tick abstrato (2 Hz)
let absAcc = 0;

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

    // ── o ciclo do APAGAMENTO ──
    const frac = s.cycleT / s.cycleLen;
    if (s.phase === 'calmo' && frac >= AVISO_AT) { s.phase = 'aviso'; f9EcoBump(); }
    else if (s.phase === 'aviso' && frac >= 1) {
        s.phase = 'onda'; s.waveT = 0; emit('ondaComeca'); f9EcoBump();
    } else if (s.phase === 'onda') {
        s.waveT += dt;
        if (s.waveT >= ONDA_LEN) {
            // apaga quem ficou de fora (menos o Guardião)
            for (const ag of s.agents) {
                if (ag.sp !== 'guardiao' && ag.state !== 'denned' && ag.state !== 'dead') { ag.state = 'dead'; ag.deadT = 0; }
            }
            s.phase = 'renascer'; s.waveT = 0; emit('ondaTermina'); f9EcoBump();
        }
    } else if (s.phase === 'renascer') {
        s.waveT += dt;
        if (s.waveT >= RENASCER_LEN) {
            // repõe populações nas tocas + musgo rebrota cheio
            const alive: Record<string, number[]> = {};
            s.agents = s.agents.filter((a) => a.state !== 'dead');
            s.agents.forEach((a) => { (alive[`${a.sp}:${a.den}`] ??= []).push(a.id); a.state = a.sp === 'guardiao' ? 'wander' : 'wander'; a.fear = 0; });
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

    // ── agentes: full perto, abstrato longe (2 Hz) ──
    absAcc += dt;
    const absStep = absAcc >= 0.5 ? absAcc : 0;
    const lod2 = lodR * lodR;
    for (const ag of s.agents) {
        if (ag.state === 'dead') { ag.deadT += dt; continue; }
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
