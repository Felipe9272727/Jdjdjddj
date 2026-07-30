// ── O GERENTE DE GPU ───────────────────────────────────────────────────────
// Uma IA pequena que aprende, NO APARELHO, quanto da GPU vale a pena usar.
//
// POR QUE ELA EXISTE
// O Felipe tentou WebGPU antes do WASM e travava o celular dele. A causa não
// era o que eu supunha (memória): é que o jogo é Three.js e desenha na MESMA
// GPU. O trabalho da LLM entope a fila de submissão e o render não fecha o
// quadro no prazo — está medido em "Characterizing Mobile SoC for Accelerating
// Heterogeneous LLM Inference" (arXiv 2501.14794), que também mostra a saída:
// mandar só uma PARTE pequena das camadas para a GPU mantém o FPS intacto e o
// custo em velocidade fica em 0,5–2,2%. A configuração antiga era 12 de 36
// camadas — um terço do modelo brigando com o render. Isso não é "uma parte
// pequena", é um sócio.
//
// A REGRA INEGOCIÁVEL, palavras do dono do jogo: "o único requisito é não
// diminuir a velocidade atual". Aqui isso não é boa intenção, é estrutura:
// nenhum degrau é mantido sem ter batido a linha de base medida na CPU.
//
// O QUE ELA NÃO PODE FAZER
// `n_gpu_layers` é parâmetro de CARGA. Não dá para mexer no meio de uma fala:
// mudar de degrau exige recarregar o modelo, que no celular custa dezenas de
// segundos. Então este gerente não é um termostato que gira a cada token — ele
// acumula evidência ao longo das falas e decide o degrau da PRÓXIMA carga.
//
// POR QUE FPS E NÃO TEMPERATURA
// O sensor de calor da web é a Compute Pressure API, e ela não existe no
// Chrome do Android. Mas o sintoma que assusta o jogador não é o calor — é o
// jogo engasgar. Isso o `requestAnimationFrame` mede com precisão. O termômetro
// certo aqui é o próprio jogo.

/** Onde o degrau escolhido fica guardado entre sessões, por aparelho. */
export const FLOOR10_GPU_KEY = 'floor10-gpu';

/**
 * A GPU já começa com uma parte ligada — decisão do dono do jogo ("deixa pelo
 * menos uma pequena parte de webgpu ligada inicialmente, e o resto deixa pra
 * ia que gerência"). Três de 36 camadas é ~8% do modelo: dentro da faixa que o
 * paper mostra não atrapalhar o render, e longe do terço que travava antes.
 */
export const FLOOR10_GPU_START_LAYERS = 3;

/** Teto absoluto. Acima disto entra na faixa que já travou o aparelho dele. */
export const FLOOR10_GPU_MAX_LAYERS = 10;

/** De quantas em quantas camadas ele experimenta subir. */
export const FLOOR10_GPU_STEP = 2;

/** Abaixo disto o jogo está engasgando de forma perceptível: veto imediato. */
export const FLOOR10_GPU_FPS_FLOOR = 24;

/** E nem perto do piso ele pode custar caro: 92% do FPS sem GPU é o mínimo. */
export const FLOOR10_GPU_FPS_KEEP = 0.92;

/**
 * Quantas falas medir num degrau antes de acreditar nele. Uma amostra só é
 * ruído: a primeira geração paga aquecimento e o FPS oscila com o que está
 * acontecendo na sala.
 */
export const FLOOR10_GPU_MIN_SAMPLES = 3;

export type GpuVerdict =
    /** Sem adaptador no aparelho, ou desligado à mão. */
    | 'indisponivel'
    /** Ainda juntando amostras neste degrau. */
    | 'medindo'
    /** Este degrau bateu a CPU e o FPS aguentou; vai tentar subir. */
    | 'subindo'
    /** Achou o melhor degrau e parou nele. */
    | 'estavel'
    /** A GPU piorou alguma coisa; voltou para a CPU e ficou. */
    | 'recuado';

export type GpuSample = {
    /** Camadas na GPU durante esta fala. */
    layers: number;
    /** Tokens por segundo MEDIDOS pelo motor. */
    tps: number;
    /** FPS do jogo durante a geração; null quando não havia render medindo. */
    fps: number | null;
};

type Degrau = { layers: number; tps: number; fps: number | null; n: number };

export type GpuState = {
    /** Degrau em uso na carga atual. */
    layers: number;
    /** Degrau que a PRÓXIMA carga deve usar. */
    nextLayers: number;
    verdict: GpuVerdict;
    /** Velocidade da CPU pura, a régua do "não pode ficar mais lento". */
    baselineTps: number | null;
    baselineFps: number | null;
    rungs: Degrau[];
    /** Explicação em uma linha, para a tela e para o log. */
    reason: string;
};

const media = (anterior: number, novo: number, n: number) =>
    (anterior * n + novo) / (n + 1);

function guardar(state: GpuState): void {
    try {
        globalThis.localStorage?.setItem(FLOOR10_GPU_KEY, JSON.stringify({
            nextLayers: state.nextLayers,
            verdict: state.verdict,
            baselineTps: state.baselineTps,
            baselineFps: state.baselineFps,
            rungs: state.rungs,
        }));
    } catch { /* sem localStorage: o gerente recomeça a cada sessão */ }
}

function ler(): Partial<GpuState> | null {
    try {
        const cru = globalThis.localStorage?.getItem(FLOOR10_GPU_KEY);
        return cru ? JSON.parse(cru) as Partial<GpuState> : null;
    } catch { return null; }
}

/**
 * O gerente. Recebe uma amostra por fala e devolve o degrau da próxima carga.
 *
 * Ele é deliberadamente teimoso para BAIXO e tímido para CIMA: subir exige
 * evidência repetida, descer acontece na primeira suspeita. É assimétrico de
 * propósito — o custo de um degrau lento é esperar; o custo de um degrau que
 * trava o aparelho é o jogador fechar o jogo.
 */
export class Floor10GpuGovernor {
    private state: GpuState;

    constructor(inicial?: Partial<GpuState>) {
        const salvo = inicial ?? ler() ?? {};
        const next = typeof salvo.nextLayers === 'number'
            ? salvo.nextLayers
            : FLOOR10_GPU_START_LAYERS;
        this.state = {
            layers: next,
            nextLayers: next,
            verdict: salvo.verdict ?? 'medindo',
            baselineTps: salvo.baselineTps ?? null,
            baselineFps: salvo.baselineFps ?? null,
            rungs: salvo.rungs ?? [],
            reason: 'primeira medição',
        };
    }

    snapshot(): GpuState { return { ...this.state, rungs: [...this.state.rungs] }; }

    /** Camadas que a carga que está começando AGORA deve usar. */
    layersForLoad(): number {
        this.state.layers = this.state.nextLayers;
        return this.state.layers;
    }

    /** O aparelho não tem WebGPU: encerra o assunto sem drama. */
    markUnavailable(motivo = 'sem adaptador WebGPU'): GpuState {
        this.state.verdict = 'indisponivel';
        this.state.nextLayers = 0;
        this.state.reason = motivo;
        guardar(this.state);
        return this.snapshot();
    }

    /**
     * A carga com GPU falhou. Isto não é sinal para tentar de novo mais tarde:
     * é sinal para parar. Um erro de carga no celular do jogador significa
     * esperar o download inteiro outra vez.
     */
    markLoadFailed(motivo: string): GpuState {
        this.state.verdict = 'recuado';
        this.state.nextLayers = 0;
        this.state.reason = `a carga com GPU falhou (${motivo.slice(0, 80)}); voltando para a CPU`;
        guardar(this.state);
        return this.snapshot();
    }

    /** Uma fala terminou. Aqui é onde ele aprende. */
    observe(sample: GpuSample): GpuState {
        if (this.state.verdict === 'indisponivel' || this.state.verdict === 'recuado') {
            return this.snapshot();
        }
        if (!Number.isFinite(sample.tps) || sample.tps <= 0) return this.snapshot();

        const anterior = this.state.rungs.find((r) => r.layers === sample.layers);
        if (anterior) {
            anterior.tps = media(anterior.tps, sample.tps, anterior.n);
            if (sample.fps !== null) {
                anterior.fps = anterior.fps === null
                    ? sample.fps
                    : media(anterior.fps, sample.fps, anterior.n);
            }
            anterior.n += 1;
        } else {
            this.state.rungs.push({
                layers: sample.layers, tps: sample.tps, fps: sample.fps, n: 1,
            });
        }
        if (sample.layers === 0) {
            const base = this.state.rungs.find((r) => r.layers === 0)!;
            this.state.baselineTps = base.tps;
            this.state.baselineFps = base.fps;
        }

        // ── VETO DE FPS ───────────────────────────────────────────────────
        // Antes de qualquer conta de velocidade. Um jogo engasgando não é
        // compensado por token nenhum.
        if (sample.layers > 0 && sample.fps !== null) {
            if (sample.fps < FLOOR10_GPU_FPS_FLOOR) {
                return this.recuar(
                    `o jogo caiu para ${sample.fps.toFixed(0)} FPS com ${sample.layers} `
                    + `camadas na GPU (piso ${FLOOR10_GPU_FPS_FLOOR})`,
                );
            }
            const base = this.state.baselineFps;
            if (base !== null && sample.fps < base * FLOOR10_GPU_FPS_KEEP) {
                return this.recuar(
                    `o FPS caiu de ${base.toFixed(0)} para ${sample.fps.toFixed(0)} `
                    + `com ${sample.layers} camadas`,
                );
            }
        }

        const degrau = this.state.rungs.find((r) => r.layers === sample.layers)!;
        if (degrau.n < FLOOR10_GPU_MIN_SAMPLES) {
            this.state.verdict = 'medindo';
            this.state.reason =
                `medindo ${sample.layers} camadas (${degrau.n}/${FLOOR10_GPU_MIN_SAMPLES} falas)`;
            guardar(this.state);
            return this.snapshot();
        }

        // Sem linha de base ainda: a próxima carga mede a CPU pura. É a única
        // vez em que ele desliga a GPU sem ser por castigo — precisa da régua.
        if (this.state.baselineTps === null) {
            this.state.nextLayers = 0;
            this.state.verdict = 'medindo';
            this.state.reason = 'medindo a CPU pura para ter com o que comparar';
            guardar(this.state);
            return this.snapshot();
        }

        // ── A REGRA DO DONO: nunca mais lento que a CPU ───────────────────
        if (sample.layers > 0 && degrau.tps < this.state.baselineTps) {
            return this.recuar(
                `${sample.layers} camadas dão ${degrau.tps.toFixed(2)} tok/s, `
                + `menos que os ${this.state.baselineTps.toFixed(2)} da CPU`,
            );
        }

        // Este degrau prestou. Vale subir mais um?
        const melhor = this.state.rungs
            .filter((r) => r.n >= FLOOR10_GPU_MIN_SAMPLES)
            .reduce((a, b) => (b.tps > a.tps ? b : a));
        const proximo = melhor.layers + FLOOR10_GPU_STEP;
        if (proximo <= FLOOR10_GPU_MAX_LAYERS
            && !this.state.rungs.some((r) => r.layers === proximo)) {
            this.state.nextLayers = proximo;
            this.state.verdict = 'subindo';
            this.state.reason =
                `${melhor.layers} camadas deram ${melhor.tps.toFixed(2)} tok/s; `
                + `vai experimentar ${proximo} na próxima carga`;
        } else {
            this.state.nextLayers = melhor.layers;
            this.state.verdict = 'estavel';
            this.state.reason =
                `assentou em ${melhor.layers} camadas · ${melhor.tps.toFixed(2)} tok/s`
                + (this.state.baselineTps
                    ? ` (CPU pura: ${this.state.baselineTps.toFixed(2)})`
                    : '');
        }
        guardar(this.state);
        return this.snapshot();
    }

    private recuar(motivo: string): GpuState {
        // Recuar é definitivo NESTA sessão e fica guardado: se a GPU atrapalhou
        // uma vez neste aparelho, não custa nada ficar na CPU, que funciona.
        this.state.verdict = 'recuado';
        this.state.nextLayers = 0;
        this.state.reason = `${motivo} — voltando para a CPU`;
        guardar(this.state);
        return this.snapshot();
    }

    /** Botão do dono do jogo: apaga o aprendizado e recomeça. */
    reset(): GpuState {
        this.state = {
            layers: FLOOR10_GPU_START_LAYERS,
            nextLayers: FLOOR10_GPU_START_LAYERS,
            verdict: 'medindo',
            baselineTps: null,
            baselineFps: null,
            rungs: [],
            reason: 'reiniciado à mão',
        };
        guardar(this.state);
        return this.snapshot();
    }

    /** Botão do dono do jogo: fixa um degrau e para de experimentar. */
    force(layers: number): GpuState {
        const n = Math.max(0, Math.min(FLOOR10_GPU_MAX_LAYERS, Math.floor(layers)));
        this.state.nextLayers = n;
        this.state.verdict = n === 0 ? 'recuado' : 'estavel';
        this.state.reason = `fixado à mão em ${n} camadas`;
        guardar(this.state);
        return this.snapshot();
    }
}

/**
 * O CONTADOR DE QUADROS.
 *
 * Mede o FPS pela mediana dos intervalos entre quadros, não pela média: um
 * único engasgo de 400 ms afunda a média e mente sobre o resto. A mediana
 * responde "como estava a maior parte do tempo", que é o que o jogador sente.
 */
export class FpsSampler {
    private intervals: number[] = [];
    private last = 0;
    private rafId: number | null = null;

    start(): void {
        if (this.rafId !== null) return;
        this.intervals = [];
        this.last = 0;
        const tick = (t: number) => {
            if (this.last > 0) {
                const dt = t - this.last;
                // Descarta o intervalo gigante de quando a aba volta do fundo:
                // não é engasgo do jogo, é o navegador tendo pausado tudo.
                if (dt > 0 && dt < 1000) this.intervals.push(dt);
            }
            this.last = t;
            this.rafId = globalThis.requestAnimationFrame?.(tick) ?? null;
        };
        this.rafId = globalThis.requestAnimationFrame?.(tick) ?? null;
    }

    /** Encerra a medição e devolve o FPS mediano, ou null se não deu para medir. */
    stop(): number | null {
        if (this.rafId !== null) globalThis.cancelAnimationFrame?.(this.rafId);
        this.rafId = null;
        if (this.intervals.length < 8) return null;
        const ordenado = [...this.intervals].sort((a, b) => a - b);
        const mediana = ordenado[Math.floor(ordenado.length / 2)];
        return mediana > 0 ? 1000 / mediana : null;
    }
}

/** O aparelho concede um adaptador? É o que decide se o assunto existe. */
export async function probeWebGpuAdapter(): Promise<{ ok: boolean; motivo: string }> {
    const gpu = (globalThis.navigator as { gpu?: { requestAdapter: () => Promise<unknown> } })?.gpu;
    if (!gpu) return { ok: false, motivo: 'este navegador não expõe navigator.gpu' };
    try {
        const adapter = await gpu.requestAdapter();
        return adapter
            ? { ok: true, motivo: '' }
            : { ok: false, motivo: 'o navegador não concedeu adaptador WebGPU' };
    } catch (e) {
        return { ok: false, motivo: String(e).slice(0, 120) };
    }
}

/** Instância viva, uma por sessão. */
export const floor10Gpu = new Floor10GpuGovernor();
