/**
 * f6Escape.test.ts — walks the whole Suíte 612 puzzle chain end-to-end and
 * pokes the locks/gates from the wrong side first (the way real players do).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    f6, f6Reset, f6Interact, f6TryCode, f6Tick, f6Crank, f6DoorWalls,
    f6Hotspots, f6DrainEvents, f6AdvanceGuest, f6Objective, F6_CODE,
} from '../f6Escape';

const tick = (s: number, z = 0) => { for (let i = 0; i < s * 10; i++) f6Tick(0.1, z); };

beforeEach(() => { f6Reset(); f6DrainEvents(); });

describe('arrival and the bang', () => {
    it('starts pretending, blows when the player walks in', () => {
        expect(f6.phase).toBe('arrive');
        expect(f6Hotspots()).toHaveLength(0);
        f6Tick(0.016, -8.5);
        expect(f6.phase).toBe('arrive');
        f6Tick(0.016, -6.5);
        expect(f6.phase).toBe('explore');
        expect(f6DrainEvents()).toContain('bang');
    });

    it('jams the doorway with a squeeze gap after the bang', () => {
        f6Tick(0.016, -6.5);
        const walls = f6DoorWalls();
        // two jam segments + both locked doors
        expect(walls).toHaveLength(4);
        const jamXs = walls.slice(0, 2).flatMap((w) => [w[0], w[2]]);
        expect(Math.min(...jamXs)).toBeLessThan(-1.4);
        expect(jamXs).toContain(-0.7);
        expect(jamXs).toContain(0.7);
    });
});

describe('a manivela (gaveta → abridor → colchão)', () => {
    beforeEach(() => f6Tick(0.016, -6.5));

    it('refuses the mattress without the letter knife', () => {
        const a = f6Interact('cama');
        expect(a.kind).toBe('text');
        expect(f6.camaCut).toBe(false);
        expect(f6.inv.manivela).toBe(false);
    });

    it('drawer gives the abridor, abridor cuts, cut gives the crank', () => {
        f6Interact('gaveta');
        expect(f6.inv.abridor).toBe(true);
        f6Interact('cama');                       // the cut
        expect(f6.camaCut).toBe(true);
        expect(f6.inv.manivela).toBe(false);      // still in the tear
        f6Interact('cama');                       // the take
        expect(f6.inv.manivela).toBe(true);
        const evs = f6DrainEvents();
        expect(evs).toContain('cut');
        expect(evs).toContain('pickup:manivela');
    });
});

describe('a chave (vapor → espelho → cabide → ralo)', () => {
    beforeEach(() => {
        f6Tick(0.016, -6.5);
        f6TryCode(F6_CODE);
    });

    it('needs the full ritual in order', () => {
        // mirror first: clean
        f6Interact('espelho');
        expect(f6.mirrorRead).toBe(false);
        // run the hot tap, wait out the steam
        f6Interact('pia');
        expect(f6.tapOn).toBe(true);
        tick(6.2);
        expect(f6.fogDone).toBe(true);
        // read the message
        f6Interact('espelho');
        expect(f6.mirrorRead).toBe(true);
        // no cabide yet → can't fish
        f6Interact('pia');
        expect(f6.inv.chave).toBe(false);
        // wardrobe: open, then take the hanger
        f6Interact('guardaroupa');
        f6Interact('guardaroupa');
        expect(f6.inv.cabide).toBe(true);
        // fish
        f6Interact('pia');
        expect(f6.inv.chave).toBe(true);
        expect(f6.inv.cabide).toBe(false);
    });

    it('the key opens the kitchen and is consumed', () => {
        f6Interact('pia'); tick(6.2); f6Interact('espelho');
        f6Interact('guardaroupa'); f6Interact('guardaroupa'); f6Interact('pia');
        f6Interact('portacozinha');
        expect(f6.kitchenOpen).toBe(true);
        expect(f6.inv.chave).toBe(false);
    });
});

describe('o fusível (tampa → fita)', () => {
    it('two-stage: slide the lid, then take', () => {
        f6Tick(0.016, -6.5);
        f6TryCode(F6_CODE);
        f6Interact('privada');
        expect(f6.lidOff).toBe(true);
        expect(f6.inv.fusivel).toBe(false);
        f6Interact('privada');
        expect(f6.inv.fusivel).toBe(true);
    });
});

describe('o relé (gelo → fósforos → fogo → panela)', () => {
    beforeEach(() => {
        f6Tick(0.016, -6.5);
        f6TryCode(F6_CODE);
        f6Interact('pia'); tick(6.2); f6Interact('espelho');
        f6Interact('guardaroupa'); f6Interact('guardaroupa'); f6Interact('pia');
        f6Interact('portacozinha');
    });

    it('the stove is dead without the matches from the pantry', () => {
        f6Interact('geladeira'); f6Interact('geladeira');
        expect(f6.inv.gelo).toBe(true);
        f6Interact('fogao');
        expect(f6.stoveLit).toBe(false);
        expect(f6.melting).toBe(false);
    });

    it('matches → flame → melt → relay', () => {
        f6Interact('geladeira'); f6Interact('geladeira');
        f6Interact('despensa');                   // the truth wall
        expect(f6.despensaOpen).toBe(true);
        f6Interact('fosforos');
        expect(f6.inv.fosforos).toBe(true);
        f6Interact('fogao');                      // light it
        expect(f6.stoveLit).toBe(true);
        f6Interact('fogao');                      // ice in
        expect(f6.melting).toBe(true);
        expect(f6.inv.gelo).toBe(false);
        tick(9.5);
        expect(f6.melting).toBe(false);
        expect(f6.panRele).toBe(true);
        f6Interact('fogao');                      // take it
        expect(f6.inv.rele).toBe(true);
    });
});

describe('o cab morto (sockets + crank)', () => {
    const solveAll = () => {
        f6Tick(0.016, -6.5);
        f6Interact('gaveta'); f6Interact('cama'); f6Interact('cama');
        f6TryCode(F6_CODE);
        f6Interact('privada'); f6Interact('privada');
        f6Interact('pia'); tick(6.2); f6Interact('espelho');
        f6Interact('guardaroupa'); f6Interact('guardaroupa'); f6Interact('pia');
        f6Interact('portacozinha');
        f6Interact('geladeira'); f6Interact('geladeira');
        f6Interact('despensa'); f6Interact('fosforos');
        f6Interact('fogao'); f6Interact('fogao'); tick(9.5); f6Interact('fogao');
    };

    it('each part has its own socket; the winch needs everything', () => {
        solveAll();
        f6DrainEvents();
        // empty socket complains
        expect(f6.installed.fusivel).toBe(false);
        f6Interact('soq_fusivel');
        expect(f6.installed.fusivel).toBe(true);
        expect(f6.inv.fusivel).toBe(false);
        f6Interact('soq_rele');
        expect(f6.installed.rele).toBe(true);
        // crank goes on the shaft; with all three seated it's crankable
        const a = f6Interact('eixo');
        expect(f6.installed.manivela).toBe(true);
        expect(a.kind).toBe('crank');
        const evs = f6DrainEvents();
        expect(evs).toEqual(expect.arrayContaining(['install:fusivel', 'install:rele', 'install:manivela']));
    });

    it('cranking repairs, blacks out, summons the guest', () => {
        solveAll();
        f6Interact('soq_fusivel'); f6Interact('soq_rele'); f6Interact('eixo');
        let done = false;
        for (let i = 0; i < 60 && !done; i++) done = f6Crank(0.1);
        expect(done).toBe(true);
        expect(f6.phase).toBe('blackout');
        tick(1.8, 0);
        expect(f6.phase).toBe('guest');
        f6AdvanceGuest(); f6AdvanceGuest(); f6AdvanceGuest();
        expect(f6.phase).toBe('guestIdle');
        expect(f6Objective()).toContain('porta');
        // the guest blocks the doorway for good
        expect(f6DoorWalls().some((w) => w[0] === -1.45 && w[2] === 1.45)).toBe(true);
    });

    it('the botoeira gives the missing 4', () => {
        f6Tick(0.016, -6.5);
        expect(f6Hotspots().some((h) => h.id === 'botoeira')).toBe(true);
        const a = f6Interact('botoeira');
        expect(a.kind).toBe('text');
        if (a.kind === 'text') expect(a.text).toContain('« 4 »');
    });

    it('cab hotspots only exist while exploring', () => {
        f6Tick(0.016, -6.5);
        expect(f6Hotspots().some((h) => h.id === 'eixo')).toBe(true);
        expect(f6Hotspots().find((h) => h.id === 'eixo')?.zMax).toBeLessThan(-10);
    });
});
