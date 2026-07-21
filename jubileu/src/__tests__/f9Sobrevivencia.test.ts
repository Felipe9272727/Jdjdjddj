/**
 * f9Sobrevivencia.test.ts — M19: "você é só mais um bicho". Prova que a
 * SOBREVIVÊNCIA do player e a IA INDIVIDUAL/APRENDIZADO existem de verdade:
 *  - a FOME do player sobe e o mata (inanição) se ele não comer;
 *  - PASTAR o musgo e CAÇAR o saltito saciam;
 *  - CAÇAR tem preço: as testemunhas APRENDEM a temer o player (playerFear);
 *  - quem escapa de um agarrão fica FERIDO e vira alvo preferido;
 *  - vultos DISPUTAM território;
 *  - a convivência calma HABITUA (o medo aprendido derrete).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { f9eco, f9EcoReset, f9EcoTick, f9EcoDrainEvents, f9RequestPounce, f9EcoTryPounce } from '../f9Eco';
import { f9Reset } from '../f9Floresta';

const HUNT = { huntable: true, safeInOco: false, stillT: 0, noise: 0, carry: false };

/** manda toda espécie não-sujeito pro seu canto (ninguém interfere). */
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

describe('f9Sobrevivencia — M19: a fome do player', () => {
    it('FOME sobe com o tempo quando o player não come (longe de musgo/presa)', () => {
        const f0 = f9eco.fome;
        // canto vazio do viveiro: sem musgo a ≤1.3, sem saltito a ≤0.95
        for (let i = 0; i < 30 * 30; i++) f9EcoTick(1 / 30, 30, 3, 200, HUNT);
        expect(f9eco.fome).toBeGreaterThan(f0);
    });

    it('a fome NÃO sobe fora do explorar (huntable=false: queda/chegada/apagando)', () => {
        const f0 = f9eco.fome;
        for (let i = 0; i < 30 * 30; i++) f9EcoTick(1 / 30, 30, 3, 200, { ...HUNT, huntable: false });
        expect(f9eco.fome).toBe(f0);
    });

    it('PASTAR: parado em cima de um musgo-brilho sacia (fome cai + evento comeuMusgo)', () => {
        const px = 30, pz = 3;
        f9eco.moss[0].x = px; f9eco.moss[0].z = pz; f9eco.moss[0].amount = 1;
        f9eco.fome = 0.6;
        let comeu = false;
        for (let i = 0; i < 3 * 30 && !comeu; i++) {
            f9EcoTick(1 / 30, px, pz, 200, HUNT);
            if (f9EcoDrainEvents().includes('comeuMusgo')) comeu = true;
        }
        expect(comeu).toBe(true);
        expect(f9eco.fome).toBeLessThan(0.6);
        expect(f9eco.moss[0].amount).toBeLessThan(1); // o musgo foi consumido
    });

    it('INANIÇÃO: fome cheia apaga o player (evento inanicao) e reseta pra 0.55', () => {
        f9eco.fome = 0.995;
        let inaniu = false;
        for (let i = 0; i < 10 * 30 && !inaniu; i++) {
            f9EcoTick(1 / 30, 30, 3, 200, HUNT);
            if (f9EcoDrainEvents().includes('inanicao')) inaniu = true;
        }
        expect(inaniu).toBe(true);
        expect(f9eco.fome).toBeCloseTo(0.55, 2); // não fica cravado em 1 (sem loop de morte)
    });
});

describe('f9Sobrevivencia — M19/M20: caçar (o BOTE), e o preço de caçar', () => {
    it('BOTE: presa no cone à frente é abatida (evento cacouPresa + fome cai)', () => {
        const quarry = f9eco.agents.find((a) => a.sp === 'saltito')!;
        pinAllExcept([quarry.id]);
        f9eco.fome = 0.8;
        // M20: o BOTE é a caça ATIVA. player em (0,0) olhando pra -z (θ=0);
        // presa 2 u à frente, no cone. f9RequestPounce() + f9EcoTryPounce().
        quarry.x = 0; quarry.z = -2; quarry.tx = 0; quarry.tz = -2;
        f9RequestPounce();
        const res = f9EcoTryPounce(0, 0, 0);         // θ=0 → frente = (0,-1)
        expect(res).toBe('catch');
        expect(quarry.state).toBe('dead');
        expect(f9eco.fome).toBeLessThan(0.8);
        expect(f9EcoDrainEvents()).toContain('cacouPresa');
    });

    it('BOTE ERRADO: sem presa no cone à frente, o bote é um WHIFF (não pega)', () => {
        const quarry = f9eco.agents.find((a) => a.sp === 'saltito')!;
        pinAllExcept([quarry.id]);
        quarry.x = 0; quarry.z = 3;                   // ATRÁS do player (θ=0 olha -z)
        f9RequestPounce();
        expect(f9EcoTryPounce(0, 0, 0)).toBe('whiff');
        expect(quarry.state).not.toBe('dead');
    });

    it('COOLDOWN: dois botes seguidos — o segundo não sai antes de recarregar', () => {
        const [a, b] = f9eco.agents.filter((x) => x.sp === 'saltito');
        pinAllExcept([a.id, b.id]);
        a.x = 0; a.z = -2; b.x = 0; b.z = -2;
        f9RequestPounce();
        expect(f9EcoTryPounce(0, 0, 0)).toBe('catch'); // pega o 'a'
        f9RequestPounce();
        expect(f9EcoTryPounce(0, 0, 0)).toBeNull();    // cooldown: o pedido é engolido
        for (let i = 0; i < 40; i++) f9EcoTick(1 / 30, 30, 3, 200, HUNT); // recarrega (>0,9 s)
        b.x = 0; b.z = -2; b.state = 'wander';         // 'b' vagou/fugiu nos ticks — recoloca no cone
        f9RequestPounce();
        expect(f9EcoTryPounce(0, 0, 0)).toBe('catch'); // agora o bote recarregado pega o 'b'
    });

    it('TESTEMUNHA: presa que VÊ o bote aprende a temer o player (playerFear sobe)', () => {
        const all = f9eco.agents.filter((a) => a.sp === 'saltito');
        const quarry = all[0], witness = all[1];
        pinAllExcept([quarry.id, witness.id]);
        quarry.x = 0; quarry.z = -2;                  // à frente (θ=0)
        witness.x = 3; witness.z = -2;                // 3 u, linha de visão limpa
        const fearBefore = witness.playerFear;
        f9RequestPounce();
        expect(f9EcoTryPounce(0, 0, 0)).toBe('catch');
        expect(quarry.state).toBe('dead');
        expect(witness.playerFear).toBeGreaterThan(fearBefore);
        expect(witness.dangerMem).not.toBeNull();
    });
});

describe('f9Sobrevivencia — M19: aprendizado individual e território', () => {
    it('FERIDO: quem escapa de um agarrão fica wounded>0 e marca dangerMem', () => {
        const v = f9eco.agents.find((a) => a.sp === 'vulto')!;
        const s = f9eco.agents.find((a) => a.sp === 'saltito')!;
        const den = f9eco.dens[v.den];
        v.x = den.x + 3; v.z = den.z; v.tx = v.x; v.tz = v.z; v.hunger = 0.95; v.err = 1;
        s.x = v.x + 1; s.z = v.z; s.tx = s.x; s.tz = s.z;
        s.brave = 1; s.err = 0.2;                    // corajoso: escapa do arrasto
        pinAllExcept([v.id, s.id]);
        let escapou = false;
        for (let i = 0; i < 20 * 30 && !escapou; i++) {
            f9EcoTick(1 / 30, 30, 3, 200);
            if (f9EcoDrainEvents().includes('escapou')) escapou = true;
        }
        expect(escapou).toBe(true);
        expect(s.wounded).toBeGreaterThan(0);        // manca depois do sufoco
        expect(s.dangerMem).not.toBeNull();          // lembra ONDE quase morreu
    });

    it('CAÇA AO FERIDO: o vulto prefere a presa mancando (mesmo um pouco mais longe)', () => {
        const v = f9eco.agents.find((a) => a.sp === 'vulto')!;
        const prey = f9eco.agents.filter((a) => a.sp === 'saltito');
        const hurt = prey[0], healthy = prey[1];
        v.x = 0; v.z = -2; v.tx = 0; v.tz = -2; v.hunger = 0.95;
        hurt.x = 6; hurt.z = -2; hurt.wounded = 30;  // ferida a 6 u
        healthy.x = 5; healthy.z = -3;               // sã a ~5.1 u (mais perto)
        pinAllExcept([v.id, hurt.id, healthy.id]);
        f9EcoTick(1 / 30, 30, 3, 200);
        expect(v.targetId).toBe(hurt.id);            // o cheiro de sangue vence a distância
    });

    it('TERRITÓRIO: dois vultos perto demais disputam (evento territorio; o menos dominante foge)', () => {
        const v = f9eco.agents.filter((a) => a.sp === 'vulto');
        const [a, b] = v;
        a.x = 0; a.z = -44; a.tx = 0; a.tz = -44; a.state = 'wander'; a.hunger = 0.1;
        a.brave = 0.9; a.agress = 0.9; a.terrCd = 0;   // dominante
        b.x = 3; b.z = -44; b.tx = 3; b.tz = -44; b.state = 'wander'; b.hunger = 0.1;
        b.brave = 0.1; b.agress = 0.1; b.terrCd = 0;   // submisso
        pinAllExcept([a.id, b.id]);
        let disputa = false;
        for (let i = 0; i < 3 * 30 && !disputa; i++) {
            f9EcoTick(1 / 30, 0, -44, 200, { ...HUNT, huntable: false });
            if (f9EcoDrainEvents().includes('territorio')) disputa = true;
        }
        expect(disputa).toBe(true);
        expect(b.state).toBe('flee');                 // o submisso cede o pedaço
    });

    it('HABITUAÇÃO: convivência calma derrete o medo aprendido (playerFear cai)', () => {
        const s = f9eco.agents.find((a) => a.sp === 'saltito')!;
        s.brave = 0.9; s.hunger = 0.2; s.playerFear = 0.9; s.fear = 0;
        pinAllExcept([s.id]);
        const px = s.x + 5, pz = s.z;                 // longe o bastante pra não assustar
        const fear0 = s.playerFear;
        for (let i = 0; i < 15 * 30; i++) {
            s.x = px - 5; s.z = pz; s.tx = s.x; s.tz = s.z; // fica pertinho, sem fugir
            f9EcoTick(1 / 30, px, pz, 200, { huntable: false, safeInOco: false, stillT: 10, noise: 0, carry: false });
        }
        expect(s.playerFear).toBeLessThan(fear0);
    });
});

describe('f9Sobrevivencia — M21: a inteligência SENTIDA (a rede dirige a reação ao player)', () => {
    // força a rede do bicho pra uma cautela conhecida (features fixas em ~+1,
    // leitura da cautela = `c`): hid≈tanh(3)=.995, out[0]=tanh(~5·.995·c).
    const forceBrain = (ag: (typeof f9eco.agents)[number], c: number) => {
        ag.brain.w1.fill(0); ag.brain.b1.fill(3); ag.brain.w2.fill(0);
        for (let j = 0; j < 5; j++) ag.brain.w2[j] = c;
    };
    const noisyPlayer = { huntable: false, safeInOco: false, stillT: 0, noise: 0.7, carry: false };

    it('FREEZE: o naïve (ainda não te teme) CONGELA e te observa a média distância', () => {
        const s = f9eco.agents.find((a) => a.sp === 'saltito')!;
        forceBrain(s, 0);                              // cautela ~0 (não-arisco)
        s.brave = 0.3; s.curio = 0.4; s.hunger = 0.2; s.fear = 0; s.bond = 0;
        s.playerFear = 0.3;                            // NAÏVE: ainda não aprendeu a te temer
        s.state = 'wander'; s.x = 0; s.z = -4.5; s.tx = 0; s.tz = -4.5;
        pinAllExcept([s.id]);
        let froze = false;
        for (let i = 0; i < 20 && !froze; i++) {
            if ((s.state as string) === 'wander') { s.x = 0; s.z = -4.5; }  // segura até reagir
            f9EcoTick(1 / 30, 0, -8, 200, noisyPlayer);  // player a 3.5 u, barulhento (te percebe)
            if ((s.state as string) === 'freeze') froze = true;
        }
        expect(froze).toBe(true);
    });

    it('BOLTA NA HORA: quem JÁ te teme (playerFear alto) dispara só de te ver, não congela', () => {
        const s = f9eco.agents.find((a) => a.sp === 'saltito')!;
        forceBrain(s, 0);
        s.brave = 0.3; s.curio = 0.4; s.hunger = 0.2; s.fear = 0; s.bond = 0;
        s.playerFear = 0.9;                            // JÁ APRENDEU a te temer
        s.state = 'wander'; s.x = 0; s.z = -4.5; s.tx = 0; s.tz = -4.5;
        pinAllExcept([s.id]);
        let fled = false, froze = false;
        for (let i = 0; i < 20; i++) {
            if ((s.state as string) === 'wander') { s.x = 0; s.z = -4.5; }
            f9EcoTick(1 / 30, 0, -8, 200, noisyPlayer);
            if ((s.state as string) === 'freeze') froze = true;
            if ((s.state as string) === 'flee') { fled = true; break; }
        }
        expect(fled).toBe(true);
        expect(froze).toBe(false);                     // o aprendizado troca observar por fugir
    });

    it('DISTÂNCIA DE FUGA INDIVIDUAL: o arisco (rede) percebe o player de MUITO mais longe que o ousado', () => {
        const [bold, wary] = f9eco.agents.filter((a) => a.sp === 'saltito');
        // mesmas condições, só a REDE difere: um ousado (cautela −1), um arisco (+1)
        for (const s of [bold, wary]) { s.brave = 0.4; s.curio = 0.3; s.hunger = 0.2; s.fear = 0; s.bond = 0; s.playerFear = 0.4; }
        forceBrain(bold, -1); forceBrain(wary, 1);
        // mede a que distância cada um DETECTA (entra em freeze/flee) o player que se aproxima
        const flightDist = (s: (typeof f9eco.agents)[number]) => {
            f9EcoReset(); f9Reset();
            const a = f9eco.agents.find((x) => x.sp === 'saltito')!;
            Object.assign(a, { brave: 0.4, curio: 0.3, hunger: 0.2, fear: 0, bond: 0, playerFear: 0.4 });
            forceBrain(a, s === bold ? -1 : 1);
            pinAllExcept([a.id]);
            a.x = 0; a.z = 0; a.tx = 0; a.tz = 0; a.state = 'wander';
            for (let d = 12; d > 0.5; d -= 0.25) {
                a.x = 0; a.z = 0;
                f9EcoTick(1 / 30, 0, -d, 200, { ...noisyPlayer });
                if ((a.state as string) === 'freeze' || (a.state as string) === 'flee') return d;
            }
            return 0;
        };
        const dBold = flightDist(bold), dWary = flightDist(wary);
        expect(dWary).toBeGreaterThan(dBold + 1);       // o arisco reage bem antes
    });
});
