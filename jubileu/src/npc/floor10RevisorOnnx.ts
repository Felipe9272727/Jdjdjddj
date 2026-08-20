// ── O REVISOR PELO OUTRO RUNTIME ──────────────────────────────────────────
//
// Pedido do dono do jogo, com o motivo dele junto: *"o do wllama é muito ruim,
// o do onnx deu menos problema"* — sobre WebGPU, depois de o backend do wllama
// quebrar duas vezes no aparelho dele (`(ABORT)` e `loadModel() is not yet
// called`, registrados em `floor10Gpu.ts`). E depois: *"coloca então o lfm em
// onnx e liga web gpu"*.
//
// ── O QUE ISTO GANHA, E NÃO É SÓ A GPU ───────────────────────────────────
//
// O ganho maior é estrutural e vale mesmo se a GPU não ajudar em nada.
//
// Hoje `trocarRascunhadorPeloRevisor` DESCARREGA o granite para caber o revisor,
// porque dois llama.cpp de 1 GB no mesmo celular foi o que desligou o aparelho
// dele. Isso custa uma carga do zero por turno — e é por isso que a coluna que
// importa na bancada é a "1ª FRIA", onde o LFM2.5 gasta 35 s.
//
// O runtime do ONNX é OUTRO processo de memória, com outro alocador. Um revisor
// aqui não disputa o espaço do llama.cpp da mesma forma, e por isso não precisa
// da troca. Se isto se confirmar no aparelho, o que some não são os 35 s de
// leitura: são os ~18 s de recarga que vêm antes deles, todo turno.
//
// ── O QUE MEDIU E O QUE NÃO MEDIU ────────────────────────────────────────
//
// MEDIDO nesta caixa: `lfm2` está na transformers.js 3.8.1, a MESMA versão que
// o juiz já usa — não precisa subir para a 4.2.0, que foi medida aqui como 2,4×
// mais lenta na CPU. E o build oficial `LiquidAI/LFM2.5-1.2B-Instruct-ONNX`
// existe, com os mesmos pesos do gguf que já é o titular.
//
// NÃO MEDIDO: se no aparelho dele isto é mais rápido que o wllama. Esta caixa
// não tem adaptador de GPU (`navigator.gpu` existe e `requestAdapter()` devolve
// nulo), então a pergunta só se responde no celular. O único dado de ONNX na
// GPU que existe aqui é o do JUIZ, e lá a GPU foi 3× MAIS LENTA — trabalho
// pequeno demais, a viagem custou mais que a conta. O revisor é a forma oposta
// (230 tokens de leitura em bloco), mas "é o oposto, então deve ganhar" é
// exatamente o raciocínio que me fez recomendar o Llama.
//
// ── ESTE CAMINHO É SÓ WEBGPU, E ISSO FOI MEDIDO ──────────────────────────
//
// Não é escolha de projeto: é o que os arquivos permitem. O build da Liquid usa
// `GatherBlockQuantized` na tabela de embeddings, e esse operador **não tem
// kernel no wasm**. Conferido arquivo por arquivo, no grafo baixado:
//
//     model_q4f16 ....   760 MB · GatherBlockQuantized · só WebGPU
//     model_q4 .......   850 MB · GatherBlockQuantized · só WebGPU
//     model_quantized . 1.520 MB · GatherBlockQuantized · só WebGPU
//     model_q8 ....... 1.768 MB · limpo — mas a transformers.js 3.8.1 não sabe
//                                 endereçar esse arquivo: `dtype: 'q8'` resolve
//                                 para `model_quantized`, que é o de cima
//     model_fp16 ..... 2.360 MB · limpo, e grande demais para um celular
//
// Medido nesta caixa, as duas metades: com `q4f16` no wasm dá "Failed to find
// kernel for GatherBlockQuantized"; com `q8` a biblioteca vai buscar
// `model_quantized.onnx` e cai no mesmo operador.
//
// Então a regra é simples e honesta: **sem adaptador de GPU, não existe revisor
// de ONNX**. Quem chama continua com o revisor do wllama, que é o titular
// medido. Cair para 2,4 GB de fp16 num celular para "não falhar" seria trocar
// uma falha visível por uma espera invisível.
//
// E a sonda pergunta pelo ADAPTADOR, não por `navigator.gpu`: aqui o objeto
// existe e adaptador não há. A sonda antiga imprimia "WebGPU: true" e me fez
// procurar o defeito no lugar errado por uma rodada inteira.

import { anotar } from './floor10CaixaPreta';
import { primeiraFraseFechada, type RespostaDoRevisor } from './floor10Pipeline';
import {
    PERSONA_DO_REVISOR, REMENDO_MAX_TOKENS, enunciadoDoRemendo,
} from './floor10SmallBrain';

/** O build oficial da Liquid, mesmos pesos do gguf que já é o titular. */
export const REVISOR_ONNX_REPO = 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX';

/** Quanto desce — para a barra de download não mentir. */
export const REVISOR_ONNX_BYTES = 760_279_040;

const TRANSFORMERS_V = '3.8.1';
const MODULO = (globalThis as { __onnxModuleUrl?: string }).__onnxModuleUrl
    ?? `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_V}/dist/transformers.min.js`;

export type PlanoDoRevisorOnnx =
    | { pode: true; device: 'webgpu'; dtype: 'q4f16'; bytes: number; motivo: string }
    | { pode: false; motivo: string };

/**
 * O adaptador existe MESMO? — e não "o objeto `navigator.gpu` existe".
 *
 * Exportada porque a fila de download precisa do plano ANTES de baixar, e
 * porque um teste de mesa consegue trocar `navigator.gpu` por um duplo.
 */
export async function planejarRevisorOnnx(): Promise<PlanoDoRevisorOnnx> {
    const gpu = (globalThis as { navigator?: { gpu?: { requestAdapter(): Promise<unknown> } } })
        .navigator?.gpu;
    if (!gpu) return { pode: false, motivo: 'sem navigator.gpu' };
    try {
        const adaptador = await gpu.requestAdapter();
        if (!adaptador) return { pode: false, motivo: 'navigator.gpu existe, mas sem adaptador' };
    } catch (e) {
        return { pode: false, motivo: `requestAdapter falhou: ${String((e as Error)?.message ?? e).slice(0, 60)}` };
    }
    return {
        pode: true, device: 'webgpu', dtype: 'q4f16',
        bytes: REVISOR_ONNX_BYTES, motivo: 'adaptador ok',
    };
}

type Gerador = (
    entrada: Array<{ role: string; content: string }>,
    opcoes: Record<string, unknown>,
) => Promise<unknown>;

let geradorPromise: Promise<Gerador | null> | null = null;

/**
 * Sobe o revisor do ONNX uma vez por sessão.
 *
 * SEM QUEDA SILENCIOSA PARA A CPU: se o plano disse WebGPU e a carga falhar, o
 * arquivo q4f16 já baixado NÃO roda no wasm (falta o kernel), então cair para a
 * CPU aqui significaria baixar 1,7 GB no meio de uma fala. Falha é falha, o
 * revisor do wllama continua sendo o caminho, e a caixa-preta registra por quê.
 */
export function carregarRevisorOnnx(
    progresso?: (fracao: number) => void,
): Promise<Gerador | null> {
    geradorPromise ??= (async () => {
        const plano = await planejarRevisorOnnx();
        if (!plano.pode) {
            anotar('revisor-onnx:sem-gpu', { motivo: plano.motivo });
            return null;
        }
        const t0 = Date.now();
        anotar('revisor-onnx:carregando', {
            device: plano.device, dtype: plano.dtype, motivo: plano.motivo,
        });
        try {
            const mod = await import(/* @vite-ignore */ MODULO) as {
                pipeline: (tarefa: string, repo: string, opcoes: Record<string, unknown>) => Promise<Gerador>;
            };
            const gerador = await mod.pipeline('text-generation', REVISOR_ONNX_REPO, {
                dtype: plano.dtype,
                device: plano.device,
                progress_callback: (p: { progress?: number }) => {
                    if (typeof p?.progress === 'number') progresso?.(p.progress / 100);
                },
            });
            anotar('revisor-onnx:pronto', { ms: Date.now() - t0, device: plano.device });
            return gerador;
        } catch (e) {
            anotar('revisor-onnx:falhou', {
                device: plano.device,
                motivo: String((e as Error)?.message ?? e).slice(0, 120),
            });
            geradorPromise = null;
            return null;
        }
    })();
    return geradorPromise;
}

/** Devolve o que o pipeline devolve, para o desfecho ser o mesmo dos dois lados. */
export async function remendarPorOnnx(
    perguntaEmIngles: string, frase: string, porque = '',
): Promise<RespostaDoRevisor> {
    const gerador = await carregarRevisorOnnx();
    if (!gerador) return { tipo: 'sem-revisor' };
    const t0 = Date.now();
    try {
        const bruto = await gerador([
            { role: 'system', content: PERSONA_DO_REVISOR },
            { role: 'user', content: enunciadoDoRemendo(perguntaEmIngles, frase, porque) },
        ], { max_new_tokens: REMENDO_MAX_TOKENS, do_sample: false, return_full_text: false });
        const texto = textoDaSaida(bruto);
        anotar('revisor-onnx:remendou', { ms: Date.now() - t0, chars: texto.length });
        if (!texto) return { tipo: 'vazio' };
        // O MESMO corte do revisor do wllama: `primeiraFraseFechada` é quem
        // decide o que vira fala. Duas portas com regras diferentes para a
        // mesma frase seria como o placar da bancada mentiu antes.
        const fechada = primeiraFraseFechada(texto);
        if (fechada) return { tipo: 'frase', texto: fechada, cortado: false };
        if (texto.length > 2) return { tipo: 'frase', texto, cortado: false };
        return { tipo: 'vazio' };
    } catch (e) {
        return { tipo: 'erro', erro: String((e as Error)?.message ?? e).slice(0, 180) };
    }
}

/**
 * A saída do `text-generation` muda de forma conforme a entrada e a versão:
 * string quando o prompt é texto, lista de mensagens quando é chat. Ler só um
 * dos dois formatos é como o remendo voltava vazio sem ninguém saber por quê.
 */
export function textoDaSaida(bruto: unknown): string {
    const primeiro = Array.isArray(bruto) ? bruto[0] : bruto;
    const gerado = (primeiro as { generated_text?: unknown })?.generated_text;
    if (typeof gerado === 'string') return gerado.trim();
    if (Array.isArray(gerado)) {
        const ultima = gerado.at(-1) as { content?: unknown } | undefined;
        if (typeof ultima?.content === 'string') return ultima.content.trim();
    }
    return '';
}

export function resetRevisorOnnxParaTestes(): void {
    geradorPromise = null;
}
