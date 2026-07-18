/**
 * f9Eco.test.ts — o ecossistema do Viveiro se comporta como um ecossistema:
 * fome leva ao musgo, o vulto caça, o medo espalha, o ciclo manda todo mundo
 * pra toca, a onda apaga os retardatários e o renascer repõe as populações.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { f9eco, f9EcoDrainEvents, f9EcoReset, f9EcoTick, F9_SPECIES } from '../f9Eco';
import {
    f9, f9Reset, f9Tick, f9LembrancaDone, f9PredadorPegou, f9ReplantioDone,
    F9_OCOS, F9_RELICS, F9_RELIC_ALL, F9_TREES,
} from '../f9Floresta';

// player parado longe de tudo (canto do viveiro) pra não assustar ninguém
const PX = 30, PZ = 2;

function sim(seconds: number, step = 1 / 30, px = PX, pz = PZ): void {
    const n = Math.round(seconds / step);
    for (let i = 0; i < n; i++) f9EcoTick(step, px, pz, 200); // lodR alto = full sim em teste
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

    it('CAÇA: um vulto faminto abate presa em minutos de sim', () => {
        for (const a of f9eco.agents) {
            if (a.sp === 'vulto') a.hunger = 0.95;
            if (a.sp === 'saltito') { a.brave = 1; }   // presas distraídas
        }
        const prey0 = f9eco.agents.filter((a) => a.sp === 'saltito' || a.sp === 'cervo').length;
        sim(90);
        const preyAlive = f9eco.agents.filter((a) => (a.sp === 'saltito' || a.sp === 'cervo') && a.state !== 'dead').length;
        expect(preyAlive).toBeLessThan(prey0);
    });

    it('um Vulto faminto caça o player com os mesmos estados e emite captura', () => {
        const vulto = f9eco.agents.find((a) => a.sp === 'vulto')!;
        vulto.x = 0; vulto.z = -12; vulto.hunger = .92;
        f9EcoTick(1 / 30, .2, -12, 200);
        expect(vulto.state).toBe('eat');
        expect(f9EcoDrainEvents()).toContain('playerCaught');
    });

    it('MEDO: saltito perto do player foge (estado flee)', () => {
        const ag = f9eco.agents.find((a) => a.sp === 'saltito')!;
        ag.brave = 0;
        // player em cima dele
        sim(1.2, 1 / 30, ag.x + 1.2, ag.z + 1.2);
        expect(['flee', 'toDen']).toContain(ag.state);
    });

    it('CICLO: no aviso todos correm pra toca; a onda apaga retardatários; o renascer repõe', () => {
        // pula pro fim do ciclo
        f9eco.cycleT = f9eco.cycleLen * 0.985;
        sim(6);
        expect(f9eco.phase === 'onda' || f9eco.phase === 'aviso').toBe(true);
        // captura o momento exato do renascer: o musgo volta cheio (antes dos
        // bichos famintos comerem de novo). Depois só a repopulação importa.
        let mossFullOnRebirth = false;
        for (let i = 0; i < 22 * 30; i++) {
            const wasRenascer = f9eco.phase === 'renascer';
            f9EcoTick(1 / 30, PX, PZ, 200);
            if (wasRenascer && f9eco.phase === 'calmo') mossFullOnRebirth = f9eco.moss.every((m) => m.amount > 0.9);
        }
        expect(f9eco.phase).toBe('calmo');
        expect(mossFullOnRebirth).toBe(true);
        const bySp = (sp: string) => f9eco.agents.filter((a) => a.sp === sp && a.state !== 'dead').length;
        expect(bySp('saltito')).toBe(3 * F9_SPECIES.saltito.perDen);
        expect(bySp('cervo')).toBe(2 * F9_SPECIES.cervo.perDen);
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
        const [ox, oz] = F9_OCOS[0];
        f9Tick(1 / 30, ox, oz + 1.2);
        expect(f9.phase).toBe('explorar');
    });

    it('coletar uma relíquia abre sua lembrança e marca o bit correto', () => {
        f9.phase = 'explorar';
        const relic = F9_RELICS[1];
        f9Tick(1 / 30, relic.x, relic.z);
        expect(f9.phase).toBe('lembranca');
        expect(f9.lembranca).toBe(1);
        expect(f9.reliquias).toBe(1 << 1);
        f9LembrancaDone();
        expect(f9.phase).toBe('explorar');
    });

    it('a RAIZ recusa o player até as três relíquias acordarem o nó', () => {
        f9.phase = 'explorar';
        f9Tick(1 / 30, 6, -47);
        expect(f9.phase).toBe('explorar');
        expect(f9.pertoRaiz).toBe(true);
        f9.reliquias = F9_RELIC_ALL;
        f9Tick(1 / 30, 6, -47);
        expect(f9.phase).toBe('raiz');
    });

    it('captura do Vulto replanta no oco mais próximo e dá imunidade curta', () => {
        f9.phase = 'explorar';
        const [ox, oz, r] = F9_OCOS[2];
        f9PredadorPegou(ox + 3, oz);
        expect(f9.phase).toBe('apagando');
        expect(f9.replantCause).toBe('vulto');
        expect(f9ReplantioDone()).toEqual([ox, oz + r * .62]);
        expect(f9.phase).toBe('explorar');
        expect(f9.abrigo).toBe(2);
        expect(f9.replantGrace).toBeGreaterThan(1);
    });

    it('a madeira-mãe do oco impede a captura pelo Vulto', () => {
        f9.phase = 'explorar';
        const [ox, oz] = F9_OCOS[0];
        f9Tick(1 / 30, ox, oz);
        f9PredadorPegou(ox, oz);
        expect(f9.phase).toBe('explorar');
        expect(f9.apagos).toBe(0);
    });

    it('as 76 árvores sólidas têm posições determinísticas e únicas', () => {
        expect(F9_TREES).toHaveLength(76);
        const positions = new Set(F9_TREES.map(({ x, z }) => `${x.toFixed(6)}:${z.toFixed(6)}`));
        expect(positions.size).toBe(F9_TREES.length);
    });
});
