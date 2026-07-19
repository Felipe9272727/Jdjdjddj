/**
 * f9Eco.test.ts — o ecossistema do Viveiro se comporta como um ecossistema:
 * fome leva ao musgo, o vulto caça, o medo espalha, o ciclo manda todo mundo
 * pra toca, a onda apaga os retardatários e o renascer repõe as populações.
 *
 * OVERHAUL "Rain World" (A1–A9): predação agarrar→arrastar→comer (com
 * escape), percepção por som + linha de visão, memória + investigação,
 * exposição progressiva na onda, abrigo universal nos ocos, vínculo/doma,
 * frenesi pré-onda e necrofagia.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    f9eco, f9EcoReset, f9EcoTick, f9EcoDrainEvents, f9EcoOn, f9EcoEmitSound,
    F9_SPECIES, F9_OCOS, F9_RAIZ, f9DropOffering, f9TryComplete, freshOfferings,
} from '../f9Eco';
import { f9, f9Reset, f9Tick, F9_OCOS as F9_OCOS_FLORESTA } from '../f9Floresta';

// player parado longe de tudo (canto do viveiro) pra não assustar ninguém
const PX = 30, PZ = 2;

function sim(seconds: number, step = 1 / 30, px = PX, pz = PZ): void {
    const n = Math.round(seconds / step);
    for (let i = 0; i < n; i++) f9EcoTick(step, px, pz, 200); // lodR alto = full sim em teste
}

/** isola os sujeitos do teste: cada espécie não-sujeito vai pro SEU canto
 *  (separados pra ninguém temer o vizinho — saltito teme cervo, vulto teme
 *  o Guardião), com fome zerada nos predadores — chame a CADA tick. */
function pinAllExcept(ids: number[]): void {
    for (const a of f9eco.agents) {
        if (ids.includes(a.id)) continue;
        if (a.sp === 'saltito') { a.x = 28; a.z = -48; }
        else if (a.sp === 'cervo') { a.x = 28; a.z = -6; }
        else if (a.sp === 'vulto') { a.x = -31; a.z = -48; a.hunger = 0; }
        else { a.x = -31; a.z = 3; }
        a.tx = a.x; a.tz = a.z;
    }
}

beforeEach(() => { f9EcoReset(); f9Reset(); });

describe('f9Eco — o Viveiro vive sem o player', () => {
    it('população inicial nasce das tocas conforme as espécies', () => {
        const bySp = (sp: string) => f9eco.agents.filter((a) => a.sp === sp).length;
        expect(bySp('saltito')).toBe(3 * F9_SPECIES.saltito.perDen);
        expect(bySp('cervo')).toBe(2 * F9_SPECIES.cervo.perDen);
        expect(bySp('vulto')).toBe(2 * F9_SPECIES.vulto.perDen);
        expect(bySp('guardiao')).toBe(1);
    });

    it('FOME: herbívoros procuram musgo e comem (fome cai; o musgo é consumido)', () => {
        for (const a of f9eco.agents) if (a.sp === 'saltito') a.hunger = 0.9;
        // O food chain é competitivo (à la Rain World): 12 saltitos famintos vs
        // 9 tufos que rebrotam devagar → o musgo é gasto e ALGUÉM sacia a fome em
        // algum instante, mas a escassez faz a fome voltar. Checamos o momento,
        // não o estado final.
        let mossDipped = false;
        const everFed = new Set<number>();
        for (let i = 0; i < 900; i++) {
            f9EcoTick(1 / 30, PX, PZ, 200);
            if (f9eco.moss.some((m) => m.amount < 0.9)) mossDipped = true;
            for (const a of f9eco.agents) if (a.sp === 'saltito' && a.hunger < 0.6) everFed.add(a.id);
        }
        expect(mossDipped).toBe(true);
        expect(everFed.size).toBeGreaterThan(0);
    });

    it('CAÇA: o abate agora é uma sequência — agarrou → arrastou → abate (A1)', () => {
        for (const a of f9eco.agents) {
            if (a.sp === 'vulto') a.hunger = 0.95;
            if (a.sp === 'saltito') { a.brave = 0; }   // sem coragem = sem escape: o arrasto vira abate
        }
        const prey0 = f9eco.agents.filter((a) => a.sp === 'saltito' || a.sp === 'cervo').length;
        let sawGrab = false, sawKill = false;
        for (let i = 0; i < 90 * 30; i++) {
            f9EcoTick(1 / 30, PX, PZ, 200);
            for (const e of f9EcoDrainEvents()) {
                if (e === 'agarrou') sawGrab = true;
                if (e === 'abate') sawKill = true;
            }
        }
        const preyAlive = f9eco.agents.filter((a) => (a.sp === 'saltito' || a.sp === 'cervo') && a.state !== 'dead').length;
        expect(sawGrab).toBe(true);          // o contato não mata mais: primeiro AGARRA
        expect(sawKill).toBe(true);          // a morte ('abate') vem depois, na toca
        expect(preyAlive).toBeLessThan(prey0);
    });

    it('MEDO: saltito perto do player foge (estado flee)', () => {
        const ag = f9eco.agents.find((a) => a.sp === 'saltito')!;
        ag.brave = 0;
        // player em cima dele
        sim(1.2, 1 / 30, ag.x + 1.2, ag.z + 1.2);
        expect(['flee', 'toDen']).toContain(ag.state);
    });

    it('CICLO: no aviso todos correm pra toca; a onda apaga retardatários por EXPOSIÇÃO; o renascer repõe', () => {
        // um retardatário de propósito: longe da toca na hora da onda — a
        // exposição (A4) vai vencê-lo antes de alcançar qualquer abrigo
        const tardio = f9eco.agents.find((a) => a.sp === 'saltito')!;
        tardio.x = 28; tardio.z = -48; tardio.tx = 28; tardio.tz = -48;
        // pula pro fim do ciclo
        f9eco.cycleT = f9eco.cycleLen * 0.985;
        let sawExposure = false; // A4: a onda agora mata por exposição progressiva
        for (let i = 0; i < 6 * 30; i++) {
            f9EcoTick(1 / 30, PX, PZ, 200);
            for (const a of f9eco.agents) if (a.exposure > 0.05) sawExposure = true;
        }
        expect(f9eco.phase === 'onda' || f9eco.phase === 'aviso').toBe(true);
        // captura o momento EXATO do renascer: musgo cheio e populações repostas
        // (depois disso a predação normal volta a valer — um vulto faminto pode
        // abater um saltito-sentinela em segundos, e isso é o ecossistema certo).
        let mossFullOnRebirth = false;
        let popsOnRebirth: { saltito: number; cervo: number } | null = null;
        for (let i = 0; i < 22 * 30; i++) {
            const wasRenascer = f9eco.phase === 'renascer';
            f9EcoTick(1 / 30, PX, PZ, 200);
            for (const a of f9eco.agents) if (a.exposure > 0.05) sawExposure = true;
            if (wasRenascer && f9eco.phase === 'calmo') {
                mossFullOnRebirth = f9eco.moss.every((m) => m.amount > 0.9);
                const bySp = (sp: string) => f9eco.agents.filter((a) => a.sp === sp && a.state !== 'dead').length;
                popsOnRebirth = { saltito: bySp('saltito'), cervo: bySp('cervo') };
            }
        }
        expect(f9eco.phase).toBe('calmo');
        expect(sawExposure).toBe(true); // alguém ficou de fora tempo suficiente pra se expor
        expect(tardio.state).toBe('dead'); // o retardatário foi apagado pela exposição
        expect(mossFullOnRebirth).toBe(true);
        expect(popsOnRebirth).not.toBeNull();
        expect(popsOnRebirth!.saltito).toBe(3 * F9_SPECIES.saltito.perDen);
        expect(popsOnRebirth!.cervo).toBe(2 * F9_SPECIES.cervo.perDen);
    });

    it('CAÇA AO PLAYER: vulto faminto persegue e pega o player-bicho (evento cacaPlayer)', () => {
        const v = f9eco.agents.find((a) => a.sp === 'vulto')!;
        v.hunger = 0.95; v.err = 0.2;
        // player-bicho parado perto do vulto, fora de oco
        const px = v.x + 4, pz = v.z;
        let caught = false;
        for (let i = 0; i < 30 * 30 && !caught; i++) {
            f9EcoTick(1 / 30, px, pz, 200, { huntable: true, safeInOco: false, stillT: 0 });
            if (f9EcoDrainEvents().includes('cacaPlayer')) caught = true;
        }
        expect(caught).toBe(true);
    });

    it('OCO REPELE: com o player dentro do oco, o vulto desiste da caçada', () => {
        const v = f9eco.agents.find((a) => a.sp === 'vulto')!;
        v.hunger = 0.95;
        const px = v.x + 3, pz = v.z;
        let caught = false;
        for (let i = 0; i < 15 * 30; i++) {
            f9EcoTick(1 / 30, px, pz, 200, { huntable: true, safeInOco: true, stillT: 0 });
            if (f9EcoDrainEvents().includes('cacaPlayer')) caught = true;
        }
        expect(caught).toBe(false);
    });

    it('CURIOSIDADE: saltito corajoso se aproxima do player-bicho parado (sniff)', () => {
        // um saltito corajoso a ~8 de distância de um player imóvel há tempo
        const s = f9eco.agents.find((a) => a.sp === 'saltito')!;
        s.brave = 0.9; s.fear = 0; s.hunger = 0.2; s.state = 'wander';
        const px = s.x + 8, pz = s.z;
        let sniffed = false;
        for (let i = 0; i < 20 * 30 && !sniffed; i++) {
            f9EcoTick(1 / 30, px, pz, 200, { huntable: false, safeInOco: false, stillT: 10 });
            if ((s.state as string) === 'sniff') sniffed = true;
        }
        expect(sniffed).toBe(true);
    });

    it('GUARDIÃO: nunca vira presa, nunca se abriga, segue andando na onda', () => {
        f9eco.cycleT = f9eco.cycleLen * 0.99;
        sim(20);
        const g = f9eco.agents.find((a) => a.sp === 'guardiao')!;
        expect(g).toBeDefined();
        expect(g.state).not.toBe('dead');
        expect(g.state).not.toBe('denned');
    });
});

describe('f9Eco — OVERHAUL Rain World (A1–A9)', () => {
    it('A1 AGARRAR: contato vira grabbed/drag (não morte) e a presa segue o predador', () => {
        const v = f9eco.agents.find((a) => a.sp === 'vulto')!;
        const s = f9eco.agents.find((a) => a.sp === 'saltito')!;
        const den = f9eco.dens[v.den];
        v.x = den.x + 3; v.z = den.z; v.tx = v.x; v.tz = v.z;
        v.hunger = 0.95; v.err = 1;
        s.x = v.x + 1.0; s.z = v.z; s.tx = s.x; s.tz = s.z;
        s.brave = 0; s.err = 0.5; // brave 0 → não escapa (testado no A1 ESCAPE)
        pinAllExcept([v.id, s.id]);
        f9EcoTick(1 / 30, PX, PZ, 200);
        expect(s.state).toBe('grabbed');
        expect(s.grabbedBy).toBe(v.id);
        expect(v.state).toBe('drag');
        expect(v.carryingId).toBe(s.id);
        expect(f9EcoDrainEvents()).toContain('agarrou');
        expect(s.state === 'dead').toBe(false); // o contato NÃO mata mais
        // arrastada: a presa acompanha o predador a cada tick
        for (let i = 0; i < 15; i++) {
            pinAllExcept([v.id, s.id]);
            f9EcoTick(1 / 30, PX, PZ, 200);
            expect(Math.hypot(s.x - v.x, s.z - v.z)).toBeLessThan(1.5);
            expect(s.state).toBe('grabbed');
        }
    });

    it('A1 ARRASTAR: a presa só morre na toca; eat depois; hunger zera ao fim', () => {
        const v = f9eco.agents.find((a) => a.sp === 'vulto')!;
        const s = f9eco.agents.find((a) => a.sp === 'saltito')!;
        const den = f9eco.dens[v.den];
        v.x = den.x + 3; v.z = den.z; v.tx = v.x; v.tz = v.z;
        v.hunger = 0.95; v.err = 1;
        s.x = v.x + 1.0; s.z = v.z; s.tx = s.x; s.tz = s.z;
        s.brave = 0; s.err = 0.5;
        let deathAtDen = false;
        let diedFarFromDen = false;
        let dead = false;
        const order: string[] = [];
        for (let i = 0; i < 12 * 30 && !dead; i++) {
            pinAllExcept([v.id, s.id]);
            f9EcoTick(1 / 30, PX, PZ, 200);
            for (const e of f9EcoDrainEvents()) if (e === 'agarrou' || e === 'abate') order.push(e);
            const dDen = Math.hypot(v.x - den.x, v.z - den.z);
            if (s.state === 'dead') {
                dead = true;
                if (dDen < 2) deathAtDen = true;
                else diedFarFromDen = true;
            } else if (dDen > 2.5 && s.state !== 'grabbed') {
                // antes da toca a presa tem que estar viva (grabbed) — e não solta
                diedFarFromDen = true;
            }
        }
        expect(dead).toBe(true);
        expect(deathAtDen).toBe(true);
        expect(diedFarFromDen).toBe(false);
        expect(order.indexOf('agarrou')).toBeGreaterThanOrEqual(0);
        expect(order.indexOf('abate')).toBeGreaterThan(order.indexOf('agarrou'));
        expect(v.state).toBe('eat');
        // depois dos 3.2 s de refeição a fome zera
        for (let i = 0; i < 4 * 30; i++) { pinAllExcept([v.id, s.id]); f9EcoTick(1 / 30, PX, PZ, 200); }
        expect(v.hunger).toBeLessThan(0.05);
        expect(v.state).not.toBe('eat');
    });

    it('A1 ESCAPE: presa corajosa escapa do arrasto e vira flee (evento escapou)', () => {
        const v = f9eco.agents.find((a) => a.sp === 'vulto')!;
        const s = f9eco.agents.find((a) => a.sp === 'saltito')!;
        const den = f9eco.dens[v.den];
        v.x = den.x + 6; v.z = den.z; v.tx = v.x; v.tz = v.z;
        v.hunger = 0.95; v.err = 0.5;
        s.x = v.x + 1.0; s.z = v.z; s.tx = s.x; s.tz = s.z;
        s.brave = 1; s.err = 0.5; // corajosa: p de escape ~0.09/tick → escapa em ~0.4 s
        let escaped = false;
        let sawEscapou = false;
        for (let i = 0; i < 3 * 30 && !escaped; i++) {
            pinAllExcept([v.id, s.id]);
            f9EcoTick(1 / 30, PX, PZ, 200);
            if (f9EcoDrainEvents().includes('escapou')) sawEscapou = true;
            if (sawEscapou && s.state === 'flee') escaped = true;
        }
        expect(sawEscapou).toBe(true);
        expect(escaped).toBe(true);
        expect(s.grabbedBy).toBe(-1);
        expect(v.carryingId).toBe(-1);
        expect(s.state === 'dead').toBe(false);
    });

    it('A2 SOM: alarme propaga A→B (espécie diferente) com latência e B→C por re-emissão', () => {
        const a = f9eco.agents.filter((x) => x.sp === 'saltito')[0];
        const b = f9eco.agents.find((x) => x.sp === 'cervo')!;
        const c = f9eco.agents.filter((x) => x.sp === 'saltito')[1];
        a.x = 0; a.z = -20; a.tx = 0; a.tz = -20;
        b.x = 10; b.z = -20; b.tx = 10; b.tz = -20;   // dentro do hearR do cervo (16)
        c.x = 20; c.z = -20; c.tx = 20; c.tz = -20;   // FORA do alcance de A (14), perto de B
        const keep = [a.id, b.id, c.id];
        pinAllExcept(keep);
        f9EcoEmitSound(0, -20, 'alarme', 1); // o grito de alarme de A
        let tB = -1, tC = -1;
        for (let i = 0; i < 4 * 30; i++) {
            a.x = 0; a.z = -20; b.x = 10; b.z = -20; c.x = 20; c.z = -20; // pinados (mas livres pra reagir)
            pinAllExcept(keep);
            f9EcoTick(1 / 30, PX, PZ, 200);
            if (tB < 0 && b.state === 'flee') tB = f9eco.t;
            if (tC < 0 && c.state === 'flee') tC = f9eco.t;
        }
        const latencyB = 0.2 + b.err * 0.3;
        expect(tB).toBeGreaterThanOrEqual(latencyB);           // não reage antes da latência
        expect(tB).toBeLessThan(latencyB + 0.15);              // nem muito depois (quantização do tick)
        expect(tC).toBeGreaterThan(tB);                        // C só foge DEPOIS de B (re-emissão)
        expect(tC).toBeLessThan(tB + 1.0);
    });

    it('A2 VISÃO: atrás de tronco o player não é visto; com barulho, é ouvido', () => {
        const setup = () => {
            const s = f9eco.agents.find((x) => x.sp === 'saltito')!;
            s.brave = 0; s.hunger = 0; s.fear = 0; s.state = 'wander';
            s.x = -5; s.z = -19; s.tx = -5; s.tz = -19; // 4.5 u ao norte do tronco (-5,-22)
            return s;
        };
        // (a) player atrás do tronco, ruído médio → nem visto nem perto o bastante pra assustar
        let s = setup();
        let fled = false;
        for (let i = 0; i < 2 * 30; i++) {
            s.x = -5; s.z = -19; pinAllExcept([s.id]);
            f9EcoTick(1 / 30, -5, -23.5, 200, { huntable: false, safeInOco: false, stillT: 0, noise: 0.5 });
            if (s.state === 'flee') fled = true;
        }
        expect(fled).toBe(false);
        // (b) controle: mesma distância SEM tronco no meio → visto → foge
        f9EcoReset(); f9Reset();
        s = setup();
        fled = false;
        for (let i = 0; i < 2 * 30 && !fled; i++) {
            s.x = -5; s.z = -19; pinAllExcept([s.id]);
            f9EcoTick(1 / 30, -0.5, -19, 200, { huntable: false, safeInOco: false, stillT: 0, noise: 0.5 });
            if (s.state === 'flee') fled = true;
        }
        expect(fled).toBe(true);
        // (c) atrás do tronco mas CORRENDO (noise 1) → os passos são ouvidos → foge
        f9EcoReset(); f9Reset();
        s = setup();
        fled = false;
        for (let i = 0; i < 2 * 30 && !fled; i++) {
            s.x = -5; s.z = -19; pinAllExcept([s.id]);
            f9EcoTick(1 / 30, -5, -23.5, 200, { huntable: false, safeInOco: false, stillT: 0, noise: 1 });
            if (s.state === 'flee') fled = true;
        }
        expect(fled).toBe(true);
    });

    it('A3 MEMÓRIA: presa some do sense → vulto investiga o ponto antes de vagar', () => {
        const v = f9eco.agents.find((a) => a.sp === 'vulto')!;
        const s = f9eco.agents.find((a) => a.sp === 'saltito')!;
        v.x = -2; v.z = -16; v.tx = -2; v.tz = -16;
        v.hunger = 0.9;
        s.x = -2; s.z = -27; s.tx = -2; s.tz = -27; // à vista (11 u), linha limpa
        s.brave = 0;
        const keep = [v.id, s.id];
        for (let i = 0; i < 30; i++) { pinAllExcept(keep); f9EcoTick(1 / 30, PX, PZ, 200); }
        expect(v.state === 'stalk' || v.state === 'chase').toBe(true);
        const mem = v.memory.find((m) => m.kind === 'prey');
        expect(mem).toBeDefined();
        const mx = mem!.x, mz = mem!.z;
        // a presa "some" do alcance de uma vez
        s.x = 28; s.z = -48; s.tx = 28; s.tz = -48;
        let investigated = false;
        for (let i = 0; i < 10 && !investigated; i++) {
            pinAllExcept(keep); f9EcoTick(1 / 30, PX, PZ, 200);
            if (v.state === 'investigate') investigated = true;
        }
        expect(investigated).toBe(true);
        expect(Math.hypot(v.tx - mx, v.tz - mz)).toBeLessThan(4);
        // vai até o ponto lembrado; não achando nada, gasta a memória e volta a vagar
        let closest = Infinity;
        let backToWander = false;
        for (let i = 0; i < 20 * 30 && !backToWander; i++) {
            pinAllExcept(keep); f9EcoTick(1 / 30, PX, PZ, 200);
            closest = Math.min(closest, Math.hypot(v.x - mx, v.z - mz));
            if (v.state === 'wander' && closest < 2) backToWander = true;
        }
        expect(closest).toBeLessThan(2);
        expect(backToWander).toBe(true);
    });

    it('A4 EXPOSIÇÃO: a 2 u da toca sobrevive; a 30 u morre no caminho', () => {
        const s1 = f9eco.agents.filter((a) => a.sp === 'saltito')[0]; // toca (-18,-10)
        const s2 = f9eco.agents.filter((a) => a.sp === 'saltito')[4]; // toca (14,-20)
        const d1 = f9eco.dens[s1.den];
        s1.x = d1.x + 2; s1.z = d1.z; s1.tx = s1.x; s1.tz = s1.z; s1.lazy = 0;
        s2.x = -16; s2.z = -20; s2.tx = s2.x; s2.tz = s2.z; s2.lazy = 0; // 30 u da toca
        expect(Math.hypot(s2.x - f9eco.dens[s2.den].x, s2.z - f9eco.dens[s2.den].z)).toBeGreaterThan(25);
        const keep = [s1.id, s2.id];
        // onda direta (sem aviso): a exposição é o relógio
        f9eco.phase = 'onda'; f9eco.waveT = 0;
        for (let i = 0; i < 5 * 30; i++) { pinAllExcept(keep); f9EcoTick(1 / 30, PX, PZ, 200); }
        expect(s1.state).toBe('denned');
        expect(s1.exposure).toBeLessThan(1);
        expect(s2.state).toBe('dead');
        expect(s2.exposure).toBeGreaterThanOrEqual(1 - s2.lazy * 0.3 - 0.001);
    });

    it('A5 OCO: longe da toca (40 u) e colado num oco (3 u), abriga-se no oco e sobrevive', () => {
        const s = f9eco.agents.filter((a) => a.sp === 'saltito')[0]; // toca (-18,-10)
        const [ox, oz] = F9_OCOS[3]; // (6,-44) — oco a ~40 u da toca dele
        s.x = ox; s.z = oz + 3; s.tx = s.x; s.tz = s.z; s.lazy = 0;
        expect(Math.hypot(s.x - f9eco.dens[s.den].x, s.z - f9eco.dens[s.den].z)).toBeGreaterThan(25);
        f9eco.phase = 'onda'; f9eco.waveT = 0;
        for (let i = 0; i < 12 * 30 && f9eco.phase === 'onda'; i++) {
            pinAllExcept([s.id]);
            f9EcoTick(1 / 30, PX, PZ, 200);
        }
        expect(s.state).toBe('denned');
        expect(s.shelter).toBe('oco');
        expect(s.state === 'dead').toBe(false);
    });

    it('A6 VÍNCULO: player calado e perto cria vínculo; saltito passa a seguir (follow + vinculo)', () => {
        const s = f9eco.agents.find((a) => a.sp === 'saltito')!;
        s.brave = 1; s.hunger = 0.1; s.state = 'wander';
        let heardVinculo = false;
        let followed = false;
        for (let i = 0; i < 45 * 30 && !followed; i++) {
            pinAllExcept([s.id]);
            // player imóvel há tempo, sempre a 5 u do saltito
            f9EcoTick(1 / 30, s.x + 5, s.z, 200, { huntable: false, safeInOco: false, stillT: 10, noise: 0 });
            if (f9EcoDrainEvents().includes('vinculo')) heardVinculo = true;
            if ((s.state as string) === 'follow') followed = true;
        }
        expect(s.bond).toBeGreaterThan(0.6);
        expect(heardVinculo).toBe(true);
        expect(followed).toBe(true);
        // seguindo: chega perto do player e para (2.5 u)
        for (let i = 0; i < 6 * 30; i++) {
            pinAllExcept([s.id]);
            f9EcoTick(1 / 30, s.x + 5, s.z, 200, { huntable: false, safeInOco: false, stillT: 10, noise: 0 });
        }
        expect(s.state).toBe('follow');
    });

    it('A6 VÍNCULO: vulto bondado NÃO caça o player, mesmo faminto', () => {
        const v = f9eco.agents.find((a) => a.sp === 'vulto')!;
        v.bond = 0.7; v.hunger = 0.95;
        let caught = false;
        for (let i = 0; i < 5 * 30; i++) {
            pinAllExcept([v.id]);
            // player parado e calado a 4 u — sem o vínculo, seria caça na hora
            f9EcoTick(1 / 30, v.x + 4, v.z, 200, { huntable: true, safeInOco: false, stillT: 0, noise: 0 });
            if (f9EcoDrainEvents().includes('cacaPlayer')) caught = true;
        }
        expect(caught).toBe(false);
        expect(v.targetId).not.toBe(-2);
    });

    it('A7 FRENESI: na fração [0.6, 0.78) os herbívoros passam mais tempo em graze', () => {
        const grazeTime = (frac0: number): number => {
            f9EcoReset(); f9Reset();
            f9eco.cycleT = f9eco.cycleLen * frac0;
            for (const a of f9eco.agents) if (a.sp !== 'guardiao') a.hunger = 0.08; // recém-alimentados
            let count = 0;
            for (let i = 0; i < 20 * 30; i++) {
                // predadores fora da jogada (o teste mede fome × pasto, não caça)
                for (const a of f9eco.agents) {
                    if (a.sp === 'vulto' || a.sp === 'guardiao') { a.x = -31; a.z = 3; a.tx = -31; a.tz = 3; if (a.sp === 'vulto') a.hunger = 0; }
                }
                f9EcoTick(1 / 30, PX, PZ, 200);
                for (const a of f9eco.agents) if (a.state === 'graze') count++;
            }
            return count;
        };
        const calm = grazeTime(0.04);   // início do ciclo: sem pressa
        const frenzy = grazeTime(0.615); // frenesi pré-onda: fome ×1.8, sem sentinela
        expect(frenzy).toBeGreaterThan(calm * 1.3);
    });

    it('A7 NECROFAGIA: vulto faminto come cadáver fresco direto, sem stalk/chase', () => {
        const v = f9eco.agents.find((a) => a.sp === 'vulto')!;
        const s = f9eco.agents.find((a) => a.sp === 'saltito')!;
        v.x = -2; v.z = -16; v.tx = -2; v.tz = -16;
        v.hunger = 0.9;
        s.state = 'dead'; s.deadT = 1; s.x = -2; s.z = -21; // cadáver fresco a 5 u
        const keep = [v.id, s.id];
        let sawStalk = false, sawChase = false, ate = false;
        for (let i = 0; i < 4 * 30 && !ate; i++) {
            pinAllExcept(keep);
            f9EcoTick(1 / 30, PX, PZ, 200);
            if (v.state === 'stalk') sawStalk = true;
            if (v.state === 'chase') sawChase = true;
            if (v.state === 'eat') ate = true;
        }
        expect(ate).toBe(true);
        expect(sawStalk).toBe(false);
        expect(sawChase).toBe(false);
    });

    it('A8 EVENTOS: f9EcoOn (fan-out) recebe tudo sem quebrar o drain', () => {
        const got: string[] = [];
        const off = f9EcoOn((e) => got.push(e));
        const s = f9eco.agents.find((a) => a.sp === 'saltito')!;
        s.brave = 0;
        f9EcoTick(1 / 30, s.x + 1, s.z + 1, 200); // player em cima → alarme
        off();
        const drained = f9EcoDrainEvents();
        expect(got).toContain('alarme');      // o listener recebeu na hora
        expect(drained).toContain('alarme');  // e o drain continuou com a fila
    });
});

describe('f9Floresta — o player dentro do ciclo', () => {
    it('fora de oco durante a onda → apagando (replantio)', () => {
        f9.phase = 'explorar';
        f9eco.phase = 'onda'; f9eco.waveT = 3;
        f9Tick(1 / 30, 0, -15);   // longe de qualquer oco
        expect(f9.phase).toBe('apagando');
        expect(f9.apagos).toBe(1);
    });

    it('dentro de um oco a onda não pega', () => {
        f9.phase = 'explorar';
        f9eco.phase = 'onda'; f9eco.waveT = 3;
        const [ox, oz] = F9_OCOS_FLORESTA[0];
        f9Tick(1 / 30, ox, oz + 1.2);
        expect(f9.phase).toBe('explorar');
    });

    it('chegar na RAIZ de mãos vazias NÃO fecha o andar (v4: quem fecha é o portal das 3 oferendas)', () => {
        f9.phase = 'explorar';
        f9eco.rootState = 'dormente';
        f9Tick(1 / 30, F9_RAIZ[0], F9_RAIZ[1]);       // encostar na árvore-mãe
        expect(f9.phase).toBe('explorar');             // sem beco-sem-saída do v1
        // o portal só completa com a Raiz DESABROCHADA (as 3 oferendas entregues)
        expect(f9TryComplete(F9_RAIZ[0], F9_RAIZ[1] + 2.5)).toBe(false);
        f9eco.rootState = 'desabrochada';
        expect(f9TryComplete(F9_RAIZ[0] + 6, F9_RAIZ[1] + 2.5)).toBe(false); // longe do portal
        expect(f9TryComplete(F9_RAIZ[0], F9_RAIZ[1] + 2.5)).toBe(true);      // dentro do portal
    });
});

describe('f9Eco — V4: as 3 OFERENDAS (o objetivo do andar)', () => {
    const bySpot = (spot: 'vulto' | 'oco' | 'guardiao') => f9eco.offerings.find((o) => o.spot === spot)!;

    it('SPOTS: 3 oferendas no chão desde o início, em spots válidos e distintos', () => {
        expect(f9eco.offerings).toHaveLength(3);
        expect(f9eco.offerings.map((o) => o.spot).sort()).toEqual(['guardiao', 'oco', 'vulto']);
        expect(f9eco.offerings.every((o) => o.state === 'noChao')).toBe(true);
        // posições distintas entre si
        for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
            const a = f9eco.offerings[i], b = f9eco.offerings[j];
            expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(5);
        }
        // 'guardiao': na clareira do guardião (perto da toca dele)
        const g = bySpot('guardiao');
        const gDen = f9eco.dens.find((d) => d.sp === 'guardiao')!;
        expect(Math.hypot(g.x - gDen.x, g.z - gDen.z)).toBeLessThan(4);
        // 'oco': colado num oco (fora o [6,-44], que guarda a própria Raiz), na
        // VEREDA DIREITA — o objetivo agora se ESPALHA em 3 direções, sem
        // amontoar as oferendas todas no fundo-esquerda como antes
        const oc = bySpot('oco');
        let bd = Infinity;
        F9_OCOS.forEach(([ox, oz]) => { bd = Math.min(bd, Math.hypot(oc.x - ox, oc.z - oz)); });
        expect(bd).toBeLessThan(4);
        // as 3 oferendas em VEREDAS distintas: pelo menos uma à direita e uma à esquerda
        const xs = f9eco.offerings.map((o) => o.x);
        expect(Math.max(...xs)).toBeGreaterThan(8);   // vereda DIREITA
        expect(Math.min(...xs)).toBeLessThan(-8);     // vereda ESQUERDA
        // 'vulto': perto de uma toca de vulto (perigo de verdade)
        const v = bySpot('vulto');
        expect(f9eco.dens.some((d) => d.sp === 'vulto' && Math.hypot(v.x - d.x, v.z - d.z) < 4)).toBe(true);
    });

    it('PEGAR: ≤1.2 u por 0.4 s vira carregada (oferendaPega) e segue o player; antes do tempo, não', () => {
        const o = bySpot('guardiao');
        sim(0.3, 1 / 30, o.x, o.z);
        expect(o.state).toBe('noChao');              // 0.3 < 0.4: encostar de passagem não pega
        sim(0.2, 1 / 30, o.x, o.z);
        expect(o.state).toBe('carregada');           // 0.5 ≥ 0.4 contínuos: pegou
        expect(f9EcoDrainEvents()).toContain('oferendaPega');
        sim(0.2, 1 / 30, 8, -29);                    // a carregada segue o player
        expect(o.x).toBeCloseTo(8, 5);
        expect(o.z).toBeCloseTo(-29, 5);
    });

    it('PEGAR: sair do raio zera o timer; e só UMA por vez até entregar', () => {
        const o0 = bySpot('guardiao');
        const o1 = bySpot('oco');
        sim(0.3, 1 / 30, o0.x, o0.z);
        sim(0.3, 1 / 30, o0.x + 5, o0.z);            // sai do raio → o timer zera
        sim(0.3, 1 / 30, o0.x, o0.z);
        expect(o0.state).toBe('noChao');             // 0.3 + 0.3 NÃO soma
        sim(0.2, 1 / 30, o0.x, o0.z);
        expect(o0.state).toBe('carregada');
        f9EcoDrainEvents();
        // carregando: ficar 1 s em cima de outra NÃO pega (pegar outra exige entregar a atual)
        sim(1.0, 1 / 30, o1.x, o1.z);
        expect(o1.state).toBe('noChao');
        expect(f9EcoDrainEvents()).not.toContain('oferendaPega');
        expect(o0.state).toBe('carregada');
        expect(o0.x).toBeCloseTo(o1.x, 5);           // e a carregada foi junto
        expect(o0.z).toBeCloseTo(o1.z, 5);
    });

    it('ENTREGAR: carregada a ≤3 u da Raiz → entregue, rootWake++, oferendaEntregue', () => {
        expect(f9TryComplete(F9_RAIZ[0], F9_RAIZ[1] + 2.5)).toBe(false); // Raiz dormente: sem portal
        const o = bySpot('guardiao');
        sim(0.5, 1 / 30, o.x, o.z);
        expect(o.state).toBe('carregada');
        f9EcoDrainEvents();
        sim(0.5, 1 / 30, F9_RAIZ[0], F9_RAIZ[1] + 4);   // a 4 u: perto, mas não entrega
        expect(o.state).toBe('carregada');
        expect(f9eco.rootWake).toBe(0);
        sim(0.2, 1 / 30, F9_RAIZ[0], F9_RAIZ[1] + 2.5); // a 2.5 u: entrega
        expect(o.state).toBe('entregue');
        expect(f9eco.rootWake).toBe(1);
        expect(f9eco.rootState).toBe('dormente');       // 1ª entrega acorda 1 estágio só
        const ev = f9EcoDrainEvents();
        expect(ev).toContain('oferendaEntregue');
        expect(ev).not.toContain('raizDesabrocha');
    });

    it('CARRY: carregando oferenda, o vulto caça o player a ×1.6 de alcance', () => {
        const v = f9eco.agents.find((a) => a.sp === 'vulto')!;
        v.hunger = 0.7; v.bond = 0;
        // 19 u: fora do alcance normal de visão (12×1.25 = 15), dentro do ×1.6 (24), linha limpa
        const px = 0, pz = -29;
        // (a) SEM carry: longe demais — não detecta
        for (let i = 0; i < 30; i++) {
            v.x = 0; v.z = -10; v.tx = 0; v.tz = -10;
            pinAllExcept([v.id]);
            f9EcoTick(1 / 30, px, pz, 200, { huntable: true, safeInOco: false, stillT: 0, noise: 0, carry: false });
        }
        expect(v.targetId).not.toBe(-2);
        expect(['stalk', 'chase']).not.toContain(v.state);
        // (b) COM carry: o farejo estendido alcança — espreita vira caçada
        let cacou = false;
        for (let i = 0; i < 30 && !cacou; i++) {
            v.x = 0; v.z = -10; v.tx = 0; v.tz = -10;
            pinAllExcept([v.id]);
            f9EcoTick(1 / 30, px, pz, 200, { huntable: true, safeInOco: false, stillT: 0, noise: 0, carry: true });
            if (v.targetId === -2 && (v.state === 'stalk' || v.state === 'chase')) cacou = true;
        }
        expect(cacou).toBe(true);
    });

    it('3ª ENTREGA: a Raiz DESABROCHA (raizDesabrocha) e o portal emite f9Completo 1x', () => {
        (['guardiao', 'oco', 'vulto'] as const).forEach((spot, k) => {
            const o = bySpot(spot);
            sim(0.5, 1 / 30, o.x, o.z);                     // pega a próxima
            expect(o.state).toBe('carregada');
            sim(0.2, 1 / 30, F9_RAIZ[0], F9_RAIZ[1] + 2.5); // entrega
            expect(o.state).toBe('entregue');
            expect(f9eco.rootWake).toBe(k + 1);
        });
        expect(f9eco.rootState).toBe('desabrochada');
        const ev = f9EcoDrainEvents();
        expect(ev.filter((e) => e === 'oferendaEntregue')).toHaveLength(3);
        expect(ev.filter((e) => e === 'raizDesabrocha')).toHaveLength(1);
        // o portal à frente da Raiz: completa o andar — e o evento sai só 1x
        expect(f9TryComplete(F9_RAIZ[0], F9_RAIZ[1] + 2.5)).toBe(true);
        expect(f9EcoDrainEvents()).toContain('f9Completo');
        expect(f9TryComplete(F9_RAIZ[0], F9_RAIZ[1] + 2.5)).toBe(true);
        expect(f9EcoDrainEvents()).not.toContain('f9Completo');
    });

    it('DROP: morrer carregando devolve a oferenda pro spot dela (noChao)', () => {
        const o = bySpot('oco');
        const sx = o.x, sz = o.z;
        sim(0.5, 1 / 30, sx, sz);
        expect(o.state).toBe('carregada');
        sim(0.3, 1 / 30, 10, -10);                        // carrega pra longe do spot
        expect(Math.hypot(o.x - 10, o.z + 10)).toBeLessThan(0.01);
        f9DropOffering();                                  // a cena chama na morte do player
        expect(o.state).toBe('noChao');
        expect(o.x).toBeCloseTo(sx, 5);
        expect(o.z).toBeCloseTo(sz, 5);
    });

    it('RESET: oferendas frescas no chão, rootWake 0, Raiz dormente, timer e portal zerados', () => {
        const o = bySpot('guardiao');
        sim(0.5, 1 / 30, o.x, o.z);
        sim(0.2, 1 / 30, F9_RAIZ[0], F9_RAIZ[1] + 2.5);
        expect(f9eco.rootWake).toBe(1);
        const o1 = bySpot('oco');
        sim(0.3, 1 / 30, o1.x, o1.z);                     // timer parcial na 2ª (0.3 < 0.4)
        expect(o1.state).toBe('noChao');
        f9EcoReset();
        expect(f9eco.rootWake).toBe(0);
        expect(f9eco.rootState).toBe('dormente');
        expect(f9eco.offerings).toHaveLength(3);
        expect(f9eco.offerings.every((x) => x.state === 'noChao')).toBe(true);
        // tudo de volta aos spots originais
        for (const x of f9eco.offerings) {
            const home = freshOfferings().find((h) => h.id === x.id)!;
            expect(x.x).toBe(home.x);
            expect(x.z).toBe(home.z);
        }
        // o timer também zerou: mais 0.3 s em cima NÃO pega (senão 0.3+0.3 ≥ 0.4)
        const oc = bySpot('oco');
        sim(0.3, 1 / 30, oc.x, oc.z);
        expect(oc.state).toBe('noChao');
        // e o portal voltou a não completar (Raiz dormente)
        expect(f9TryComplete(F9_RAIZ[0], F9_RAIZ[1] + 2.5)).toBe(false);
    });
});
