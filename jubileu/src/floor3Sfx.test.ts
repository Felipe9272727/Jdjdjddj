/**
 * floor3Sfx.test.ts — o som SAI, e sai só quando deve.
 *
 * `f3Voz.test.ts` prova a partitura; isto prova o tocador. São defeitos
 * diferentes: uma partitura perfeita que ninguém executa é o mesmo silêncio de
 * antes, e um efeito que toca fora do Andar 3 é pior que não tocar.
 *
 * O contexto é falso de propósito. Não é para simular WebAudio: é para CONTAR o
 * que foi criado e ligado, que é a única parte verificável sem ouvido. Se o
 * timbre agrada, quem decide é o Felipe no celular dele.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    configureFloor3Sfx, clearFloor3Sfx, resetFloor3Voice,
    playFloor3Voice, playFloor3Unmake,
} from './floor3Sfx';
import { vozDoDiabrete } from './f3Voz';

// ── Um contexto de mentira que só sabe contar ────────────────────────────────
function param() {
    return { value: 0, setValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; }, linearRampToValueAtTime() { return this; } };
}
function no(tipo: string, reg: Registro) {
    reg.criados.push(tipo);
    const n: Record<string, unknown> = {
        tipo, type: '', frequency: param(), Q: param(), gain: param(), detune: param(), buffer: null,
        connect(alvo: unknown) { reg.ligacoes += 1; return alvo; },
        disconnect() {},
        start(t: number) { reg.starts.push(t); },
        stop(t: number) { reg.stops.push(t); },
    };
    return n;
}
interface Registro { criados: string[]; ligacoes: number; starts: number[]; stops: number[] }

function contextoFalso() {
    const reg: Registro = { criados: [], ligacoes: 0, starts: [], stops: [] };
    const ctx = {
        currentTime: 10,
        sampleRate: 48000,
        destination: { destino: true },
        createOscillator: () => no('osc', reg),
        createGain: () => no('gain', reg),
        createBiquadFilter: () => no('filtro', reg),
        createBufferSource: () => no('fonte', reg),
        createBuffer: (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) }),
    };
    return { ctx, reg, osc: () => reg.criados.filter(c => c === 'osc').length };
}

let f = contextoFalso();
beforeEach(() => {
    f = contextoFalso();
    configureFloor3Sfx(f.ctx as unknown as AudioContext, null);
    resetFloor3Voice();
});

describe('a voz só existe dentro do Andar 3', () => {
    it('sem contexto de áudio, não faz nada e não estoura', () => {
        clearFloor3Sfx();
        expect(() => playFloor3Voice('HÁ! Me alcança, perna-curta!')).not.toThrow();
        expect(f.osc()).toBe(0);
    });
    it('ao sair do andar, cala — mesmo se alguma fala escapar depois', () => {
        playFloor3Voice('Tá cansando, perna-curta?');
        const antes = f.osc();
        expect(antes).toBeGreaterThan(0);
        clearFloor3Sfx();
        playFloor3Voice('Eu já tô LÁ EM CIMA, ó!');
        expect(f.osc()).toBe(antes);
    });
    it('fala vazia ou só espaço não abre a boca', () => {
        playFloor3Voice('');
        playFloor3Voice('   ');
        expect(f.osc()).toBe(0);
    });
});

describe('o tocador executa a partitura inteira', () => {
    it('uma nota da partitura, um oscilador — mais o vibrato de cada uma', () => {
        const frase = 'Olha o TRAÇO! Espinho fresquinho, saindo do forno!';
        const voz = vozDoDiabrete(frase, { roubados: 1 });
        playFloor3Voice(frase, { roubados: 1 });
        // cada blat: 1 oscilador de nota + 1 LFO de fervilhar
        expect(f.osc()).toBe(voz.blats.length * 2);
        // cada nota tem sua surdina e seu envelope
        expect(f.reg.criados.filter(c => c === 'filtro').length).toBe(voz.blats.length);
        expect(f.reg.criados.filter(c => c === 'gain').length).toBe(voz.blats.length * 2); // nota + LFO
    });
    it('a voz do jogador não gasta osciladores com fervilhar', () => {
        const frase = 'Você jogou espinhos em mim. Várias vezes.';
        const voz = vozDoDiabrete(frase, { quem: 'jogador' });
        expect(voz.boilHz).toBe(0);
        playFloor3Voice(frase, { quem: 'jogador' });
        expect(f.osc()).toBe(voz.blats.length);
    });
    it('tudo que começa também para: nada fica tocando para sempre', () => {
        playFloor3Voice('Escreve aí: um a zero pro DIABRETE!');
        expect(f.reg.stops.length).toBe(f.reg.starts.length);
        for (let i = 0; i < f.reg.starts.length; i++) {
            expect(f.reg.stops[i]).toBeGreaterThan(f.reg.starts[i]);
        }
    });
    it('nada é agendado no passado', () => {
        playFloor3Voice('Tá vendo o tabuado sumindo? Eu não tenho MÃO pra tudo!', { roubados: 2 });
        for (const t of f.reg.starts) expect(t).toBeGreaterThanOrEqual(f.ctx.currentTime);
    });
});

describe('duas falas coladas não viram um borrão', () => {
    it('a segunda no mesmo instante é engolida', () => {
        playFloor3Voice('EI! EI! Aquele é MEU!');
        const antes = f.osc();
        playFloor3Voice('P-para com isso!');
        expect(f.osc()).toBe(antes);
    });
    it('passado o intervalo, ele volta a falar', () => {
        playFloor3Voice('EI! EI! Aquele é MEU!');
        const antes = f.osc();
        f.ctx.currentTime += 0.5;
        playFloor3Voice('P-para com isso!');
        expect(f.osc()).toBeGreaterThan(antes);
    });
    it('resetFloor3Voice esquece a última — a bancada precisa disso', () => {
        playFloor3Voice('EI! EI! Aquele é MEU!');
        const antes = f.osc();
        resetFloor3Voice();
        playFloor3Voice('P-para com isso!');
        expect(f.osc()).toBeGreaterThan(antes);
    });
});

describe('o esfregaço do andar se apagando', () => {
    it('toca ruído e tom, e para os dois', () => {
        playFloor3Unmake();
        expect(f.reg.criados.filter(c => c === 'fonte').length).toBe(1);   // o ruído da borracha
        expect(f.osc()).toBe(1);                                           // o tom despencando
        expect(f.reg.stops.length).toBe(2);
    });
    it('fora do andar, não toca', () => {
        clearFloor3Sfx();
        playFloor3Unmake();
        expect(f.reg.criados.length).toBe(0);
    });
});
