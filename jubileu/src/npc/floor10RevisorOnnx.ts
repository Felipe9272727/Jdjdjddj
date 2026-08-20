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
import { DownloadMeter, DOWNLOAD_ZERO, downloadLine } from './floor10Download';
import { floor10Fila, FILA_VONTADE } from './floor10Fila';
import { npcSet } from './npcStore';
import { primeiraFraseFechada, type RespostaDoRevisor } from './floor10Pipeline';
import {
    PERSONA_DO_REVISOR, REMENDO_MAX_TOKENS, enunciadoDoRemendo,
} from './floor10SmallBrain';

/** O build oficial da Liquid, mesmos pesos do gguf que já é o titular. */
export const REVISOR_ONNX_REPO = 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX';

/** Quanto desce — para a barra de download não mentir. */
export const REVISOR_ONNX_BYTES = 760_279_040;

const TRANSFORMERS_V = '3.8.1';
/** A que o juiz já usa, e a mais nova. A ordem é a das tentativas. */
const VERSOES_A_TENTAR = [TRANSFORMERS_V, '4.2.0'] as const;
const urlDaVersao = (v: string) =>
    `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${v}/dist/transformers.min.js`;

/**
 * ── DUAS TENTATIVAS, E O MOTIVO É QUE O ERRO NÃO DIZ NADA ────────────────
 *
 * A primeira carga no aparelho do dono do jogo baixou os 764 MB inteiros e
 * morreu com isto, cru, na tela:
 *
 *     o revisor por ONNX não subiu: 223748832
 *
 * Um NÚMERO. É assim que o ONNX Runtime em wasm entrega exceção — um ponteiro
 * do emscripten, sem mensagem, sem pilha. Não dá para agir sobre ele.
 *
 * O que dá para agir é sobre a hipótese mais provável: o build ONNX do LFM2.5 é
 * de janeiro de 2026 e a 3.8.1 é anterior a ele. `lfm2` existe nessa versão —
 * conferido — mas LFM2.5 não é LFM2, e um grafo exportado com opset mais novo
 * falha exatamente assim: sem mensagem.
 *
 * Então, se a primeira falhar, tenta a 4.2.0. Custa 1,3 MB de biblioteca, e não
 * um segundo download do modelo: os 764 MB já estão no cache do navegador.
 *
 * Se o dono do jogo fixar a versão na URL (`?onnx=`), a escolha é dele e não há
 * segunda tentativa — ele está medindo alguma coisa, e eu trocar o runtime por
 * baixo estragaria a medição.
 */
const FIXADA = (globalThis as { __onnxModuleUrl?: string }).__onnxModuleUrl;

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
    progresso?: (loaded: number, total: number) => void,
): Promise<Gerador | null> {
    geradorPromise ??= (async () => {
        const somador = new SomaDeArquivos();
        const plano = await planejarRevisorOnnx();
        if (!plano.pode) {
            anotar('revisor-onnx:sem-gpu', { motivo: plano.motivo });
            return null;
        }
        const t0 = Date.now();
        anotar('revisor-onnx:carregando', {
            device: plano.device, dtype: plano.dtype, motivo: plano.motivo,
        });
        const urls = FIXADA ? [FIXADA] : VERSOES_A_TENTAR.map(urlDaVersao);
        for (let i = 0; i < urls.length; i += 1) {
        try {
            const mod = await import(/* @vite-ignore */ urls[i]) as {
                pipeline: (tarefa: string, repo: string, opcoes: Record<string, unknown>) => Promise<Gerador>;
            };
            const gerador = await mod.pipeline('text-generation', REVISOR_ONNX_REPO, {
                dtype: plano.dtype,
                device: plano.device,
                progress_callback: (p: EventoDeArquivo) => {
                    const soma = somador.push(p);
                    // O denominador nunca encolhe abaixo do prometido: a
                    // biblioteca só conhece o tamanho dos arquivos que já
                    // começou, e sem este piso a barra mostraria "100% de
                    // config.json" nos primeiros segundos.
                    progresso?.(soma.loaded, Math.max(soma.total, REVISOR_ONNX_BYTES));
                },
            });
            anotar('revisor-onnx:pronto', {
                ms: Date.now() - t0, device: plano.device, lib: urls[i],
            });
            return gerador;
        } catch (e) {
            // ── O TEXTO CRU, E NÃO UM RESUMO MEU ─────────────────────────
            //
            // A tela dele mostrou "não reconheci este erro — o texto cru vale
            // mais que um palpite meu" e logo abaixo... nenhum texto cru, só a
            // minha frase genérica. O motivo real morria aqui, no `anotar`, e a
            // caixa-preta não é o que o jogador está olhando.
            ultimoErro = descreverFalha(e, urls[i]);
            anotar('revisor-onnx:falhou', { device: plano.device, motivo: ultimoErro, lib: urls[i] });
            // A última tentativa é a que decide. As anteriores viram registro.
            if (i === urls.length - 1) { geradorPromise = null; return null; }
        }
        }
        geradorPromise = null;
        return null;
    })();
    return geradorPromise;
}

/**
 * O ERRO DO ONNX RUNTIME NÃO É UM `Error`, E ISSO PRECISA APARECER.
 *
 * `String(223748832)` na tela é pior que inútil: parece um número de versão, ou
 * um tamanho, ou qualquer coisa. É um ponteiro do emscripten. Dizer o que ele é
 * — e o que costuma ser a causa — vale mais que repetir o número sozinho.
 */
export function descreverFalha(e: unknown, lib: string): string {
    const versao = lib.match(/transformers@([\d.]+)/)?.[1] ?? lib;
    if (typeof e === 'number') {
        return `o ONNX Runtime abortou sem mensagem (código ${e}, lib ${versao})`
            + ' — costuma ser memória ou grafo que a versão não entende';
    }
    const msg = String((e as Error)?.message ?? e).slice(0, 160);
    return `${msg} (lib ${versao})`;
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

const medidor = new DownloadMeter();

/** O que a transformers.js emite a cada pedaço de arquivo. */
export type EventoDeArquivo = {
    status?: string; file?: string; loaded?: number; total?: number; progress?: number;
};

/**
 * ── POR QUE ISTO EXISTE, E O QUE ELE CONSERTA ────────────────────────────
 *
 * A primeira versão lia `p.progress` e tratava como progresso do DOWNLOAD. Não
 * é: é a porcentagem DAQUELE ARQUIVO. O revisor de ONNX baixa vários — config,
 * tokenizer, o grafo, e o blob de 760 MB — então a barra subia, chegava perto
 * do fim e VOLTAVA para zero quando o arquivo seguinte começava.
 *
 * O dono do jogo fotografou exatamente isso: "922 MB de 1,74 GB" virando "162
 * MB de 1,74 GB". E o estrago não foi só visual — o vigia de download mede
 * PROGRESSO, e um número que não anda para a frente é indistinguível de um
 * download travado. Depois de 36 s parado ele desistiu, e a peça falhou.
 *
 * A soma guarda o último `loaded` de CADA arquivo e devolve o total. Monótona
 * por construção: um arquivo só cresce, e arquivo novo só acrescenta.
 */
export class SomaDeArquivos {
    private readonly porArquivo = new Map<string, { loaded: number; total: number }>();

    push(e: EventoDeArquivo): { loaded: number; total: number } {
        const nome = e.file ?? '(sem nome)';
        const loaded = Number(e.loaded ?? 0);
        const total = Number(e.total ?? 0);
        if (Number.isFinite(loaded) && loaded >= 0) {
            const antes = this.porArquivo.get(nome);
            this.porArquivo.set(nome, {
                // `Math.max` porque um evento fora de ordem não pode encolher o
                // que já desceu — que é o defeito inteiro desta classe.
                loaded: Math.max(antes?.loaded ?? 0, loaded),
                total: Math.max(antes?.total ?? 0, Number.isFinite(total) ? total : 0),
            });
        }
        let somaL = 0; let somaT = 0;
        for (const v of this.porArquivo.values()) { somaL += v.loaded; somaT += v.total; }
        return { loaded: somaL, total: somaT };
    }

    reset(): void { this.porArquivo.clear(); }
}

/** O último motivo de o revisor de ONNX não subir — cru, para a tela. */
let ultimoErro = '';
export function ultimoErroDoRevisorOnnx(): string { return ultimoErro; }

/**
 * A PEÇA DA FILA — o que `baixarVontade` chama quando o revisor é de ONNX.
 *
 * ── POR QUE ESTA SOBE, SE A DO GGUF SÓ BAIXA ─────────────────────────────
 *
 * A peça do gguf tem uma regra dura escrita na sala do ?pipeline: *"SÓ BAIXA.
 * NÃO SOBE."*. O motivo está registrado e é sério — subir um segundo llama.cpp
 * de 1,25 GB ao lado do granite DESLIGOU o celular do dono do jogo.
 *
 * Aqui é o contrário, e é justamente o que este experimento existe para medir:
 * o ONNX não é um llama.cpp, tem outro alocador, e a aposta é que ele CABE ao
 * lado do rascunhador. Se couber, o pipeline deixa de descarregar e recarregar
 * 1,25 GB por turno — os ~18 s que somem antes dos 35 s de leitura.
 *
 * Então esta peça sobe de propósito, e é honesto que ela suba na FILA: se o
 * aparelho não aguentar, ele falha aqui, na instalação, com a barra na tela —
 * e não no meio de uma conversa.
 *
 * A segunda razão é técnica: a transformers.js baixa e cria a sessão na mesma
 * chamada (`pipeline()`), e não há API de "só baixar". Fingir que separa, com
 * um `fetch` manual esperando acertar a chave do cache dela, seria adivinhação
 * que eu não consigo verificar nesta caixa — e adivinhação já custou caro aqui.
 */
export async function baixarRevisorOnnx(): Promise<boolean> {
    const plano = await planejarRevisorOnnx();
    if (!plano.pode) {
        // A fila SEGUE. Sem GPU não há revisor de ONNX, e o do wllama continua
        // sendo o caminho — a mesma degradação que a peça do gguf já pratica.
        npcSet({
            deliberationPhase: 'unavailable',
            deliberationLoadText: `revisor por ONNX não sobe: ${plano.motivo}`,
        });
        anotar('revisor-onnx:sem-gpu', { motivo: plano.motivo });
        return false;
    }
    medidor.reset();
    ultimoErro = '';
    npcSet({ deliberationPhase: 'loading', deliberationDownload: DOWNLOAD_ZERO });
    const gerador = await carregarRevisorOnnx((lidos, total) => {
        const amostra = medidor.push(lidos, total);
        // As DUAS barras: a da fila e a da tela da vontade. É o mesmo par de
        // campos que `baixarVontade` alimenta — sem isso a barra dele some, que
        // é exatamente a reclamação que originou `reportaProgresso`.
        floor10Fila.progresso(FILA_VONTADE, amostra);
        npcSet({
            deliberationDownload: amostra,
            deliberationLoadProgress: total ? Math.min(1, lidos / total) : 0,
            deliberationLoadText: `baixando ${REVISOR_ONNX_REPO.split('/')[1]} · ${downloadLine(amostra)}`,
        });
    });
    if (!gerador) {
        npcSet({
            deliberationPhase: 'unavailable',
            deliberationLoadText: ultimoErroDoRevisorOnnx()
                ? `o revisor por ONNX não subiu: ${ultimoErroDoRevisorOnnx()}`
                : 'o revisor por ONNX não subiu — o do wllama segue valendo',
        });
        return false;
    }
    npcSet({
        deliberationPhase: 'off',
        deliberationLoadProgress: 1,
        deliberationLoadText: 'revisor por ONNX no aparelho · em espera',
    });
    return true;
}

/** Para a sala do ?pipeline saber se a peça já está de pé. */
export function revisorOnnxDePe(): boolean {
    return geradorPromise !== null;
}
