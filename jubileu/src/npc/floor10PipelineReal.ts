// ── AS PEÇAS DE VERDADE, ligadas ao orquestrador ──────────────────────────
//
// `floor10Pipeline` recebe as quatro peças por parâmetro para ser testável sem
// baixar 1 GB. Aqui elas viram os modelos reais. Este arquivo é a única costura
// entre a orquestração (testada) e o encanamento (medido na bancada).
//
// A ORDEM, e cada passo tem um número atrás:
//
//     granite a400m rascunha em inglês ...... 3,2 s   (3,5× a leitura do 3B)
//     juiz de tom marca o que soa errado .... 0,5 s   (5/6 nas cegas)
//     LFM2.5 remenda SÓ a frase marcada .... 30,6 s   (2/3 de acerto)
//     Bergamot traduz + passe pt-BR ........ 0,13 s   (26× o m2m100)
//
//     juiz não marcou ...  3,9 s   contra 13,0 s do SmolLM3 direto   0,30×
//
// O 11,6 s que já esteve escrito nesta linha do remendo era de uma medição com
// outro formato de chamada, e sustentou um teto de 25 s que cortava TODAS as
// chamadas antes do fim — o revisor devolvia vazio sempre. Refeito com o
// LFM2.5-1.2B de produção (`bancada-navegador/revisor-pensa.mjs`): 30,6 s.
//
// Isso muda a conta do desenho e o número fica aqui à vista: o remendo é a
// etapa CARA, e é por isso que o juiz existe — quando ele não marca nada, o
// pipeline inteiro custa 3,9 s. Cada frase marcada soma ~30 s.

import {
    falarPeloPipeline, pipelineLigado,
    type PassoDoPipeline, type PecasDoPipeline, type SaidaDoPipeline,
} from './floor10Pipeline';
import {
    rascunharEmIngles, rascunhadorJaCarregado, descarregarRascunhador, subirRascunhador,
    remendarComRascunhador,
} from './floor10Rascunhador';
import { frasesForaDoTom } from './floor10VetorDeTom';
import { traduzirParaPtBr } from './floor10Tradutor';
import {
    remendarFraseEmIngles, vontadeDePeAgora, precarregarRevisor, unloadSmallBrain,
} from './floor10SmallBrain';
import { remendarPorOnnx } from './floor10RevisorOnnx';
import { revisorAtual } from './floor10Revisores';
import { comPrazo, esperar, PRAZO_CARGA_MS, RESPIRO_APOS_DESCARGA_MS } from './floor10Carga';
import { anotar } from './floor10CaixaPreta';
import { lembrarPorSignificado } from './floor10Memoria';
import { memoriaDoRascunho } from './floor10MemoriaDoRascunho';
import { npcSet } from './npcStore';

/**
 * ── AS TRAVAS DE SUPERFÍCIE, QUE O JUIZ DE TOM NÃO COBRE ──────────────────
 *
 * Medido: o juiz de tom pega 5 de 6 defeitos cegos, e o que escapa é o eco do
 * prompt ("Nilo's line only, no label") — que não é questão de tom, é lixo de
 * formato. `limparFrase` no orquestrador já tira esse; estas aqui são para os
 * padrões que ALGUÉM JÁ VIU e que merecem revisor, não regex.
 *
 * A regra honesta, medida: regex generaliza ZERO. Contra seis defeitos que a
 * lista nunca viu, ela acertou nenhum. Ela vale como CATRACA — o que passou uma
 * vez não passa de novo — e não como juiz.
 */
type Trava = {
    /** Nome curto, para a caixa-preta. */
    qual: string;
    re: RegExp;
    /**
     * O que dizer ao REVISOR, em inglês, no molde `It is wrong because <isto>`.
     *
     * Aqui o texto é AFIRMATIVO, ao contrário do motivo do juiz de tom, que
     * diz "soa como". A diferença não é estilo: um regex que casou é um fato
     * verificável — a frase contém aquele padrão —, enquanto a âncora mais
     * próxima é um palpite informado. Prometer certeza onde há palpite é o
     * jeito de mandar o revisor consertar o que não está quebrado.
     */
    porque: string;
};

const TRAVAS: readonly Trava[] = Object.freeze([
    {
        qual: 'identidade trocada',
        re: /\byou'?re (?:the )?nilo\b|\byou are (?:the )?nilo\b|,\s*nilo\s*[,.]/i,
        porque: 'it calls the player "Nilo". Nilo is the speaker, not the player, '
            + 'and must never address them by that name.',
    },
    {
        qual: 'modo assistente',
        re: /\bi'?m here to (?:assist|help)|how (?:can|may) i help|(?:i'?d|i would) advise\b/i,
        porque: 'it offers help or advice. Nilo is the player\'s equal, never a helper, '
            + 'and never tells them what to do.',
    },
    {
        qual: 'fala de IA',
        re: /\bi'?m an ai\b|\bartificial intelligence\b|\blanguage model\b/i,
        porque: 'it says he is an AI. Nilo is a human being and must never mention AI, '
            + 'models, programs or simulations.',
    },
    {
        qual: 'quebra o personagem',
        re: /\bas nilo,? i'?d say\b/i,
        porque: 'it talks about being Nilo from the outside. Nilo does not narrate himself, '
            + 'he just speaks.',
    },
]);

function travaQuePegou(frase: string): Trava | null {
    return TRAVAS.find((t) => t.re.test(frase)) ?? null;
}

/** O pipeline pode rodar agora? Nunca baixa nada na hora da fala. */
export function pipelineDisponivel(): boolean {
    return pipelineLigado() && rascunhadorJaCarregado();
}

export const PECAS_REAIS: PecasDoPipeline = {
    rascunhar: async (pergunta) => {
        npcSet({ etapa: 'rascunhando…' });
        return rascunharEmIngles(pergunta);
    },

    julgar: async (frases) => {
        npcSet({ etapa: 'conferindo o rascunho…' });
        // As travas primeiro: custam microssegundos e o juiz de tom custa 10 ms
        // por frase. Não é a economia que importa — é que uma frase já pega
        // pela catraca não precisa de segunda opinião.
        // `Map` e não `Set`: cada marcação carrega o motivo junto, e a trava
        // (que tem certeza) ganha da âncora de tom (que tem palpite) quando as
        // duas apontam a mesma frase.
        const marcadas = new Map<number, string>();
        const restantes: { n: number; texto: string }[] = [];
        for (const [i, f] of frases.entries()) {
            const t = travaQuePegou(f);
            if (t) {
                marcadas.set(i + 1, t.porque);
                anotar('pipeline:trava', { qual: t.qual });
            } else restantes.push({ n: i + 1, texto: f });
        }
        if (restantes.length > 0) {
            const fora = await frasesForaDoTom(restantes.map((r) => r.texto));
            for (const m of fora) {
                const alvo = restantes[m.n - 1];
                if (alvo && !marcadas.has(alvo.n)) marcadas.set(alvo.n, m.porque);
            }
        }
        return [...marcadas].sort((a, b) => a[0] - b[0]).map(([n, porque]) => ({ n, porque }));
    },

    remendar: async (pergunta, frase, porque) => {
        // O revisor é o LFM2.5 — o MESMO arquivo da vontade, e por isso de
        // graça em disco. Medido no 1.2B de produção: 2/3 de acerto em 30,6 s
        // por frase, contra 1/3 em 18,4 s do SmolLM3.
        //
        // ── A TROCA, E POR QUE ELA PRECISOU EXISTIR ──────────────────────
        //
        // Eu tinha criado um impasse, em dois passos que pareciam certos
        // sozinhos:
        //
        //   1. a fila passou a SÓ BAIXAR o revisor (para não subir dois
        //      llama.cpp e desligar o aparelho);
        //   2. a guarda passou a exigir o runtime DE PÉ (para não subir
        //      1,25 GB no meio da fala e travar).
        //
        // Juntas: ninguém sobe o revisor, a guarda recusa sempre, e a tela
        // mostrava "não remendou — o revisor não estava de pé" em 0.0s, em
        // todas as frases marcadas. Consertar "trava" virando "nunca roda" não
        // é consertar.
        //
        // A saída é a que o dono do jogo descreveu: *"tem que ser mais
        // inteligente, descarregar, e recarregar, quando for a hora certa de
        // usar"*. E existe uma hora certa — **o rascunhador JÁ ESCREVEU**. Ele
        // não é preciso outra vez neste turno, então o lugar dele na RAM está
        // sobrando exatamente quando o revisor precisa de um.
        // ── E QUANDO O REVISOR NÃO É UM llama.cpp ────────────────────────
        //
        // `?revisor=lfm-onnx` põe o MESMO LFM2.5 no runtime do ONNX, e aí a
        // troca acima não deve acontecer: ela existe porque dois llama.cpp de
        // 1 GB no mesmo celular desligaram o aparelho do dono do jogo, e o
        // ONNX não é um llama.cpp. Descarregar o rascunhador aqui seria pagar
        // ~18 s de recarga por turno para resolver uma disputa que não existe.
        //
        // Este é o ganho que o experimento mede, e ele vale mesmo se a GPU não
        // ajudar em nada: some a recarga, não só a leitura.
        // ── O RASCUNHADOR REMENDA, E NADA SOBE ───────────────────────────
        //
        // Nem troca de RAM, nem carga: ele acabou de escrever a frase e ainda
        // está de pé, com a persona quente no cache. É o caminho mais curto que
        // existe entre a marca do juiz e a fala corrigida.
        if (revisorAtual().runtime === 'rascunhador') {
            npcSet({ etapa: 'corrigindo uma frase…' });
            return comPrazo(
                remendarComRascunhador(pergunta, frase, porque), PRAZO_CARGA_MS, 'o revisor',
            ).catch((e) => ({ tipo: 'erro' as const, erro: String(e?.message ?? e).slice(0, 180) }));
        }
        if (revisorAtual().runtime === 'onnx') {
            npcSet({ etapa: 'corrigindo uma frase (ONNX)…' });
            return comPrazo(
                remendarPorOnnx(pergunta, frase, porque), PRAZO_CARGA_MS, 'o revisor de ONNX',
            ).catch((e) => ({ tipo: 'erro' as const, erro: String(e?.message ?? e).slice(0, 180) }));
        }
        if (!vontadeDePeAgora()) {
            const trocou = await trocarRascunhadorPeloRevisor();
            if (!trocou) return { tipo: 'sem-revisor' };
        }
        npcSet({ etapa: 'corrigindo uma frase…' });
        // Prazo mesmo assim: um remendo que não volta não pode custar a fala.
        // Este é o prazo de FORA (o motor pendurado); o de dentro, que corta a
        // geração e guarda o parcial, é o `REMENDO_TIMEOUT_MS`.
        return comPrazo(
            remendarFraseEmIngles(pergunta, frase, porque), PRAZO_CARGA_MS, 'o revisor',
        ).catch((e) => ({ tipo: 'erro' as const, erro: String(e?.message ?? e).slice(0, 180) }));
    },

    traduzir: async (texto) => {
        npcSet({ etapa: 'traduzindo…' });
        return traduzirParaPtBr(texto);
    },
};

/**
 * ── UM DE CADA VEZ, SEMPRE ───────────────────────────────────────────────
 *
 * `true` quando a troca aconteceu neste turno — e então o rascunhador precisa
 * voltar depois que a fala estiver na tela.
 */
let trocamosNesteTurno = false;

/**
 * Tira o rascunhador da RAM e põe o revisor.
 *
 * A ordem importa e não é negociável: **descarregar primeiro**. Subir o revisor
 * com o rascunhador ainda de pé é exatamente o estado que desligou o celular do
 * dono do jogo — dois llama.cpp com seus pools de thread num aparelho de mão.
 *
 * O respiro entre os dois não é zelo: o sistema demora a devolver a memória, e
 * subir 1,25 GB no instante seguinte à liberação é pedir para o pico somar.
 */
async function trocarRascunhadorPeloRevisor(): Promise<boolean> {
    try {
        npcSet({ etapa: 'trocando o rascunhador pelo revisor…' });
        await descarregarRascunhador();
        await esperar(RESPIRO_APOS_DESCARGA_MS);
        // `precarregarRevisor` e não `precarregarVontade`: com `?revisor=llama`
        // os dois papéis apontam para arquivos diferentes, e é este que sobe o
        // do REMENDO. No padrão as duas fazem a mesma coisa.
        const ok = await comPrazo(precarregarRevisor(), PRAZO_CARGA_MS, 'a carga do revisor');
        trocamosNesteTurno = ok;
        anotar('pipeline:troca', { ok: ok ? 1 : 0 });
        return ok;
    } catch (erro) {
        anotar('pipeline:troca-falhou', {
            motivo: (erro instanceof Error ? erro.message : String(erro)).slice(0, 80),
        });
        return false;
    }
}

/**
 * Devolve o rascunhador ao lugar dele — DEPOIS que a fala já está na tela.
 *
 * Sem `await` de quem chama, de propósito: a próxima pergunta é que precisa do
 * rascunhador, não esta resposta. Fazer o jogador esperar ~18 s de recarga para
 * ler uma fala que já está pronta seria devolver pela porta dos fundos o tempo
 * que o pipeline economizou.
 */
async function devolverORascunhador(): Promise<void> {
    if (!trocamosNesteTurno) return;
    trocamosNesteTurno = false;
    try {
        await unloadSmallBrain();
        await esperar(RESPIRO_APOS_DESCARGA_MS);
        const e = await subirRascunhador();
        anotar('pipeline:destroca', { ok: e ? 1 : 0 });
    } catch (erro) {
        anotar('pipeline:destroca-falhou', {
            motivo: (erro instanceof Error ? erro.message : String(erro)).slice(0, 80),
        });
    }
}

/**
 * Roda o pipeline com as peças reais.
 *
 * `null` significa "não deu" — e quem chama cai no caminho normal. Nunca lança:
 * um NPC que emudece porque a otimização falhou é pior que um NPC lento.
 */
export async function falarPeloPipelineReal(
    perguntaEmIngles: string,
    /** Só a sala passa isto; o jogo não quer ver as etapas, quer a fala. */
    aoPassar?: (passo: PassoDoPipeline) => void,
    /**
     * A pergunta como o JOGADOR escreveu. A memória por significado foi medida
     * com as perguntas em português (11/12); buscar com a tradução seria medir
     * outra coisa. Quando não vier, a inglesa serve — a busca lexical do cânone
     * tem palavras-chave nos três idiomas.
     */
    perguntaOriginal = perguntaEmIngles,
): Promise<SaidaDoPipeline | null> {
    if (!pipelineDisponivel()) return null;
    const comecou = Date.now();
    try {
        // ── A MEMÓRIA, ANTES DO RASCUNHO ──────────────────────────────────
        //
        // Custa ~200 ms quando o modelo de 333 MB está de pé e devolve null na
        // hora quando não está — e nesse caso a busca por palavra assume, como
        // no caminho do 3B. O que NÃO existia era isto aqui: até agora o
        // rascunhador recebia persona + pergunta e nada mais, e é dessa
        // ausência que saíam as invenções.
        const lembrado = await lembrarPorSignificado(perguntaOriginal);
        const memoria = memoriaDoRascunho(perguntaEmIngles, lembrado);
        anotar('pipeline:memoria', {
            achou: memoria ? 1 : 0,
            porSignificado: lembrado ? 1 : 0,
            chars: memoria.length,
        });
        const saida = await falarPeloPipeline(perguntaEmIngles, PECAS_REAIS, aoPassar, memoria);
        anotar('pipeline:fim', {
            ms: Date.now() - comecou,
            ok: saida ? 1 : 0,
            marcadas: saida?.marcadas ?? 0,
            remendadas: saida?.remendadas ?? 0,
            limpezas: saida?.limpezas ?? 0,
        });
        // A fala está pronta; agora, e só agora, o rascunhador volta. Sem
        // `await`: quem precisa dele é a PRÓXIMA pergunta.
        void devolverORascunhador();
        return saida;
    } catch (erro) {
        void devolverORascunhador();
        anotar('pipeline:erro', {
            motivo: (erro instanceof Error ? erro.message : String(erro)).slice(0, 80),
        });
        return null;
    }
}
