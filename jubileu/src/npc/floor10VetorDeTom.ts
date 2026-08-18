// ── O VETORIZADOR DO JUIZ DE TOM ──────────────────────────────────────────
//
// Carrega o embedder e transforma frases em vetores. A REGRA de julgamento não
// mora aqui — mora em `floor10JuizDeTom`, sem dependência de modelo, para que
// ela seja testável sem baixar 110 MB. Aqui é só o encanamento.
//
// ── POR QUE `all-mpnet-base-v2` E NÃO O embeddinggemma QUE JÁ ESTÁ NO JOGO ──
//
// Medido nos mesmos defeitos cegos:
//
//     tom · all-MiniLM-L6-v2 ....  4/6 · 1 falso pos. ·   3 ms ·  23 MB
//     tom · all-mpnet-base-v2 ...  5/6 · 1 falso pos. ·  10 ms · 110 MB   ←
//     tom · embeddinggemma-300m .  3/6 · 0 falso pos. · 250 ms · ~180 MB
//
// O embeddinggemma é o que a memória usa e seria de graça — mas ele é treinado
// para RECUPERAÇÃO (achar o fato parecido), e aqui a pergunta é de ESTILO. O
// mpnet é treinado em similaridade de sentença e ganha por dois casos e por
// 25× de velocidade. O MiniLM é a alternativa se 110 MB pesar demais: perde um
// caso e custa 3 ms.

import { FLOOR10_ANCORAS_BOAS, FLOOR10_ANCORAS_RUINS, julgarTom, type VeredictoDeTom } from './floor10JuizDeTom';
import { comPrazo, PRAZO_RUNTIME_MS, PRAZO_REDE_MS } from './floor10Carga';

const TRANSFORMERS_V = '3.8.1';
const CDN = (globalThis as { __onnxCdn?: string }).__onnxCdn
    ?? `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_V}`;
const TRANSFORMERS_ESM = (globalThis as { __onnxModuleUrl?: string }).__onnxModuleUrl
    ?? `${CDN}/dist/transformers.min.js`;

export const FLOOR10_TOM_MODEL = Object.freeze({
    id: 'mpnet-tom',
    label: 'Juiz de tom (all-mpnet-base-v2)',
    repo: (globalThis as { __tomRepo?: string }).__tomRepo ?? 'Xenova/all-mpnet-base-v2',
    dtype: 'q8',
    bytes: 110_100_000,
});

/**
 * UMA thread, e pelo mesmo motivo do reflexo (`51f38ece`): sem configurar
 * `env.backends`, o onnxruntime-web abre `navigator.hardwareConcurrency`
 * threads — oito num celular de oito núcleos, por cima das quatro do llama.cpp,
 * num runtime que o coordenador dos cérebros nem enxerga.
 */
const TOM_THREADS = 1;

type Extractor = (t: string, o: Record<string, unknown>) => Promise<{ data: ArrayLike<number> }>;
type TransformersModule = {
    pipeline: (t: string, m: string, o?: Record<string, unknown>) => Promise<Extractor>;
    env?: Record<string, unknown>;
};

let modulePromise: Promise<TransformersModule> | null = null;
let extratorPromise: Promise<Extractor | null> | null = null;
let ancorasPromise: Promise<{ boas: number[][]; ruins: number[][] } | null> | null = null;

async function extrator(): Promise<Extractor | null> {
    extratorPromise ??= (async () => {
        try {
            modulePromise ??= import(/* @vite-ignore */ TRANSFORMERS_ESM) as
                unknown as Promise<TransformersModule>;
            // Prazo no runtime também: o `import()` do transformers.js vem do
            // mesmo jsdelivr que já pendurou o tradutor.
            const mod = await comPrazo(
                modulePromise, PRAZO_RUNTIME_MS, 'o CDN do juiz (jsdelivr)',
            );
            try {
                const backends = (mod.env ??= {}).backends ??= {};
                const onnx = (backends as { onnx?: Record<string, unknown> }).onnx ??= {};
                const wasm = (onnx as { wasm?: Record<string, unknown> }).wasm ??= {};
                (wasm as { numThreads?: number; proxy?: boolean }).numThreads = TOM_THREADS;
                // `proxy` tira o ONNX da thread principal. Com `numThreads: 1` o
                // onnxruntime usa a build single-thread, que roda em quem chamou
                // — e quem chama aqui é o caminho da fala. Sem isto o juiz de
                // 10 ms vira 10 ms de jank.
                (wasm as { proxy?: boolean }).proxy = true;
            } catch { /* backends é otimização; se não der, segue */ }
            // ── PRAZO: os 110 MB descem AQUI ────────────────────────
            // `pipeline()` é quem busca os pesos no HuggingFace. Sem prazo,
            // uma rede que pendura deixa a fila parada para sempre — foi o que
            // aconteceu com o tradutor depois que só o rascunhador foi
            // protegido.
            return await comPrazo(
                mod.pipeline('feature-extraction', FLOOR10_TOM_MODEL.repo, {
                    dtype: FLOOR10_TOM_MODEL.dtype,
                }),
                PRAZO_REDE_MS,
                'o download do juiz de tom',
            );
        } catch (erro) {
            // Um juiz que não sobe não pode custar a fala: quem chama trata
            // `null` como "não julguei" e o rascunho passa direto. Mas o MOTIVO
            // fica guardado — ver `ultimoErroDoRascunhador` para por quê: quem
            // está instalando precisa saber se foi rede, cota ou CORS.
            ultimoErro = erro instanceof Error ? erro.message : String(erro);
            extratorPromise = null;
            modulePromise = null;
            return null;
        }
    })();
    return extratorPromise;
}

/** Ver `ultimoErroDoRascunhador`: sem isto o motivo some. */
let ultimoErro = '';

export function ultimoErroDoJuiz(): string { return ultimoErro; }

async function vetor(texto: string): Promise<number[] | null> {
    const e = await extrator();
    if (!e) return null;
    try {
        const r = await e(texto, { pooling: 'mean', normalize: true });
        return Array.from(r.data);
    } catch {
        return null;
    }
}

/**
 * As âncoras viram vetores UMA vez. São 16 frases curtas: ~160 ms no total, e
 * depois cada julgamento custa só o vetor da frase nova.
 */
async function ancoras(): Promise<{ boas: number[][]; ruins: number[][] } | null> {
    ancorasPromise ??= (async () => {
        const boas: number[][] = [];
        const ruins: number[][] = [];
        for (const [lista, destino] of [
            [FLOOR10_ANCORAS_BOAS, boas] as const,
            [FLOOR10_ANCORAS_RUINS, ruins] as const,
        ]) {
            for (const frase of lista) {
                const v = await vetor(frase);
                if (!v) { ancorasPromise = null; return null; }
                destino.push(v);
            }
        }
        return { boas, ruins };
    })();
    return ancorasPromise;
}

/** Sobe o juiz sem julgar nada — para pagar a carga fora do caminho da fala. */
export async function prepararJuizDeTom(): Promise<boolean> {
    return (await ancoras()) !== null;
}

export function esquecerJuizDeTom(): void {
    extratorPromise = null;
    modulePromise = null;
    ancorasPromise = null;
}

/**
 * Julga uma lista de frases (em inglês, antes da tradução).
 *
 * Devolve os índices 1-based das que soam fora do personagem. Lista vazia
 * significa "nada a corrigir" OU "não consegui julgar" — e as duas levam ao
 * mesmo lugar de propósito: o rascunho passa. Marcar por engano custa uma
 * chamada de revisor (~11,6 s); não julgar custa o que já custava antes.
 */
export async function frasesForaDoTom(frases: readonly string[]): Promise<number[]> {
    if (frases.length === 0) return [];
    const anc = await ancoras();
    if (!anc) return [];
    const fora: number[] = [];
    for (const [i, f] of frases.entries()) {
        const v = await vetor(f);
        if (!v) continue;
        const veredicto: VeredictoDeTom = julgarTom(v, anc.boas, anc.ruins);
        if (veredicto.foraDoTom) fora.push(i + 1);
    }
    return fora;
}
