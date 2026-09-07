/**
 * cartoonAudio.test.ts — a vitrola do Andar 3, no grafo.
 *
 * `f3Trilha.test.ts` prova a CURVA; isto prova que ela chega no áudio. Com um
 * contexto de mentira que só anota o que foi criado e ligado, dá para saber se o
 * disco de fato desacelera, se o filtro fecha, e — o que mais importa — se nada
 * disso acontece quando não há música tocando.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { preloadCartoonAudio, startCartoonMusic, stopCartoonMusic, ajustarTrilha } from './cartoonAudio';
import { trilhaDoAndar } from './f3Trilha';

// ── Um contexto de mentira que anota rampas ──────────────────────────────────
interface Rampa { valor: number; ate: number }
function param(inicial = 0) {
    const p = {
        value: inicial,
        rampas: [] as Rampa[],
        setValueAtTime(v: number) { p.value = v; return p; },
        linearRampToValueAtTime(v: number, t: number) { p.rampas.push({ valor: v, ate: t }); p.value = v; return p; },
        exponentialRampToValueAtTime(v: number, t: number) { p.rampas.push({ valor: v, ate: t }); p.value = v; return p; },
        cancelScheduledValues() { return p; },
    };
    return p;
}
const criados: Record<string, unknown>[] = [];
function no(tipo: string, extra: Record<string, unknown> = {}) {
    const n: Record<string, unknown> = {
        // Todo AudioNode de verdade conhece o próprio contexto, e `ajustarTrilha`
        // lê a hora por ali (`musicGain.context.currentTime`). Sem isto o falso
        // não é falso o bastante para provar coisa nenhuma.
        get context() { return ctx; },
        tipo, type: '', buffer: null, loop: false,
        frequency: param(20000), Q: param(), gain: param(1), detune: param(),
        playbackRate: param(1),
        connect(alvo: unknown) { return alvo; },
        disconnect() {}, start() {}, stop() {},
        ...extra,
    };
    criados.push(n);
    return n;
}
const ctx = {
    currentTime: 100,
    sampleRate: 48000,
    destination: { destino: true },
    createBufferSource: () => no('fonte'),
    createGain: () => no('gain'),
    createBiquadFilter: () => no('filtro'),
    createOscillator: () => no('osc'),
    decodeAudioData: async () => ({ duration: 179.46 }),
} as unknown as AudioContext;

const doTipo = (t: string) => criados.filter(n => n.tipo === t);
const ultimoParam = (t: string, campo: string) => {
    const ns = doTipo(t);
    return ns.length ? (ns[ns.length - 1][campo] as ReturnType<typeof param>) : null;
};

beforeAll(async () => {
    // O carregador real busca por `fetch`; aqui ele recebe bytes de mentira e o
    // `decodeAudioData` acima devolve um buffer com a duração do ragtime.
    globalThis.fetch = (async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) })) as never;
    await preloadCartoonAudio(ctx);
});

describe('sem música tocando, mexer na trilha não faz nada', () => {
    it('ajustarTrilha antes de começar é silencioso e não estoura', () => {
        criados.length = 0;
        expect(() => ajustarTrilha(trilhaDoAndar(3))).not.toThrow();
        expect(criados).toHaveLength(0);
    });
});

describe('a vitrola nasce inteira', () => {
    it('a trilha entra com filtro aberto e choro em zero', () => {
        criados.length = 0;
        startCartoonMusic(ctx, { destination: undefined });
        expect(doTipo('fonte')).toHaveLength(1);
        expect(doTipo('filtro')).toHaveLength(1);
        expect(doTipo('osc')).toHaveLength(1);           // o choro, parado
        const f = doTipo('filtro')[0] as { frequency: ReturnType<typeof param>; type: string };
        expect(f.type).toBe('lowpass');
        expect(f.frequency.value).toBeGreaterThanOrEqual(18000);   // transparente
        // A profundidade do choro nasce em 0: quem não roubou nada não ouve wow.
        const chorosG = doTipo('gain').map(n => n.gain as ReturnType<typeof param>);
        expect(chorosG.some(g => g.value === 0)).toBe(true);
        const fonte = doTipo('fonte')[0] as { loop: boolean; playbackRate: ReturnType<typeof param> };
        expect(fonte.loop).toBe(true);
        expect(fonte.playbackRate.value).toBe(1);
    });
});

describe('e vai morrendo com o dono', () => {
    it('cada pincel perdido desacelera o disco e fecha o brilho', () => {
        const fonte = doTipo('fonte')[0] as { playbackRate: ReturnType<typeof param> };
        const filtro = doTipo('filtro')[0] as { frequency: ReturnType<typeof param> };
        let rotAnterior = fonte.playbackRate.value;
        let brilhoAnterior = filtro.frequency.value;
        for (const roubados of [1, 2, 3]) {
            ajustarTrilha(trilhaDoAndar(roubados));
            expect(fonte.playbackRate.value).toBeLessThan(rotAnterior);
            expect(filtro.frequency.value).toBeLessThan(brilhoAnterior);
            rotAnterior = fonte.playbackRate.value;
            brilhoAnterior = filtro.frequency.value;
        }
        expect(fonte.playbackRate.value).toBe(trilhaDoAndar(3).rotacao);
    });
    it('tudo entra por RAMPA, nunca de um quadro pro outro', () => {
        const fonte = doTipo('fonte')[0] as { playbackRate: ReturnType<typeof param> };
        expect(fonte.playbackRate.rampas.length).toBeGreaterThan(0);
        for (const r of fonte.playbackRate.rampas) {
            expect(r.ate).toBeGreaterThan(ctx.currentTime);   // o deslize é futuro
        }
    });
    it('o deslize obedece o tempo pedido', () => {
        const fonte = doTipo('fonte')[0] as { playbackRate: ReturnType<typeof param> };
        fonte.playbackRate.rampas.length = 0;
        ajustarTrilha(trilhaDoAndar(2), 2.5);
        expect(fonte.playbackRate.rampas[0].ate).toBeCloseTo(ctx.currentTime + 2.5, 5);
    });
});

describe('parar a música solta a vitrola inteira', () => {
    it('depois de parar, ajustar não mexe em nada', () => {
        stopCartoonMusic(0.1);
        const antes = criados.length;
        ajustarTrilha(trilhaDoAndar(1));
        expect(criados.length).toBe(antes);
    });
    it('e a próxima entrada no andar começa com o disco novo', () => {
        criados.length = 0;
        startCartoonMusic(ctx, {});
        const fonte = doTipo('fonte')[0] as { playbackRate: ReturnType<typeof param> };
        const filtro = doTipo('filtro')[0] as { frequency: ReturnType<typeof param> };
        expect(fonte.playbackRate.value).toBe(1);
        expect(filtro.frequency.value).toBeGreaterThanOrEqual(18000);
        stopCartoonMusic(0.1);
    });
});
