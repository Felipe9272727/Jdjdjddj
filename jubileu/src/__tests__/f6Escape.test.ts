/**
 * f6Escape.test.ts — walks the whole Suíte 612 puzzle chain end-to-end and
 * pokes the locks/gates from the wrong side first (the way real players do).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    f6, f6Reset, f6Interact, f6TryCode, f6Tick, f6Crank, f6DoorWalls,
    f6Hotspots, f6DrainEvents, f6AdvanceGuest, f6Objective, f6BoardElevator,
    F6_CODE, F6_GUEST_LINES2,
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

describe('ato 2 → free → leave (o que vem depois)', () => {
    const solveToGuestIdle = () => {
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
        f6Interact('soq_fusivel'); f6Interact('soq_rele'); f6Interact('eixo');
        for (let i = 0; i < 60; i++) f6Crank(0.1);
        tick(1.8, 0);
        f6AdvanceGuest(); f6AdvanceGuest(); f6AdvanceGuest();
        expect(f6.phase).toBe('guestIdle');
    };
    const toFree = () => {
        solveToGuestIdle();
        f6DrainEvents();
        f6Interact('hospede');
        for (let i = 0; i < F6_GUEST_LINES2.length; i++) f6AdvanceGuest();
    };

    it('interacting with the guest in guestIdle starts ato 2 (guest2)', () => {
        solveToGuestIdle();
        f6DrainEvents();
        const a = f6Interact('hospede');
        expect(a.kind).toBe('none');            // the overlay shows the dialogue box
        expect(f6.phase).toBe('guest2');
        expect(f6.guestLine).toBe(0);
        expect(f6DrainEvents()).not.toContain('guestAside');
    });

    it('7 falas de ato 2, depois free + guestAside', () => {
        solveToGuestIdle();
        f6DrainEvents();
        f6Interact('hospede');
        expect(F6_GUEST_LINES2).toHaveLength(7);
        for (let i = 0; i < F6_GUEST_LINES2.length - 1; i++) {
            f6AdvanceGuest();
            if (i < F6_GUEST_LINES2.length - 2) expect(f6.phase).toBe('guest2');
        }
        expect(f6.guestLine).toBe(F6_GUEST_LINES2.length - 1);
        expect(f6.phase).toBe('guest2');
        f6AdvanceGuest();                         // last tap → he steps aside
        expect(f6.phase).toBe('free');
        expect(f6DrainEvents()).toContain('guestAside');
    });

    it("in 'free' the doorway opens and the guest hotspot moves aside", () => {
        toFree();
        // DOOR_ELEVATOR_BLOCK gone — the elevator gap is passable
        expect(f6DoorWalls().some((w) => w[0] === -1.45 && w[2] === 1.45)).toBe(false);
        const guest = f6Hotspots().find((h) => h.id === 'hospede');
        expect(guest?.x).toBe(-2.35);
        expect(guest?.z).toBe(-8.75);
        // botoeira with the new label, cab-side only
        const bot = f6Hotspots().find((h) => h.id === 'botoeira');
        expect(bot?.label).toBe('Apertar T — térreo');
        expect(bot?.zMax).toBe(-10.1);
        // guest card in 'free'
        const a = f6Interact('hospede');
        expect(a.kind).toBe('text');
        if (a.kind === 'text') expect(a.text).toContain('a conta não fecha');
        expect(f6Objective()).toBe('O elevador está esperando.');
    });

    it('bath/kitchen doors still respect their locks in free', () => {
        toFree();
        // bath+kitchen were opened by the solve — nothing blocks
        expect(f6DoorWalls()).toHaveLength(0);
    });

    it('botoeira in free returns the leave action; boarding seals the doorway', () => {
        toFree();
        const a = f6Interact('botoeira');
        expect(a.kind).toBe('leave');
        f6BoardElevator();
        expect(f6.phase).toBe('leave');
        expect(f6DrainEvents()).toContain('boarding');
        // the whole doorway blocks — the player stays inside the cab
        expect(f6DoorWalls()).toEqual([[-1.45, -9.9, 1.45, -9.9]]);
        expect(f6Hotspots()).toHaveLength(0);
        expect(f6Objective()).toBe(null);
    });

    it('f6BoardElevator is a no-op outside free', () => {
        f6Tick(0.016, -6.5);
        f6DrainEvents();
        f6BoardElevator();
        expect(f6.phase).toBe('explore');
        expect(f6DrainEvents()).not.toContain('boarding');
    });

    it('botoeira during explore still reads the missing 4 (no leave)', () => {
        f6Tick(0.016, -6.5);
        const a = f6Interact('botoeira');
        expect(a.kind).toBe('text');
        if (a.kind === 'text') expect(a.text).toContain('« 4 »');
    });
});
