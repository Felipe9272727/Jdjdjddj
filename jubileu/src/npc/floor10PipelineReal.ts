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
//     LFM2.5 remenda SÓ a frase marcada .... 11,6 s   (3/3 de acerto)
//     Bergamot traduz + passe pt-BR ........ 0,13 s   (26× o m2m100)
//
//     juiz não marcou ...  3,9 s   contra 13,0 s do SmolLM3 direto   0,30×
//     juiz marcou 3/3 ... 15,4 s   contra 13,4 s                     1,01×

import {
    falarPeloPipeline, pipelineLigado,
    type PassoDoPipeline, type PecasDoPipeline, type SaidaDoPipeline,
} from './floor10Pipeline';
import { rascunharEmIngles, rascunhadorJaCarregado } from './floor10Rascunhador';
import { frasesForaDoTom } from './floor10VetorDeTom';
import { traduzirParaPtBr } from './floor10Tradutor';
import { remendarFraseEmIngles, vontadeDePeAgora } from './floor10SmallBrain';
import { comPrazo, PRAZO_CARGA_MS } from './floor10Carga';
import { anotar } from './floor10CaixaPreta';
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
const TRAVAS: readonly (readonly [string, RegExp])[] = Object.freeze([
    ['identidade trocada', /\byou'?re (?:the )?nilo\b|\byou are (?:the )?nilo\b|,\s*nilo\s*[,.]/i],
    ['modo assistente', /\bi'?m here to (?:assist|help)|how (?:can|may) i help|(?:i'?d|i would) advise\b/i],
    ['fala de IA', /\bi'?m an ai\b|\bartificial intelligence\b|\blanguage model\b/i],
    ['quebra o personagem', /\bas nilo,? i'?d say\b/i],
]);

function travaQuePegou(frase: string): string | null {
    return TRAVAS.find(([, re]) => re.test(frase))?.[0] ?? null;
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
        const marcadas = new Set<number>();
        const restantes: { n: number; texto: string }[] = [];
        for (const [i, f] of frases.entries()) {
            const t = travaQuePegou(f);
            if (t) { marcadas.add(i + 1); anotar('pipeline:trava', { qual: t }); } else restantes.push({ n: i + 1, texto: f });
        }
        if (restantes.length > 0) {
            const fora = await frasesForaDoTom(restantes.map((r) => r.texto));
            for (const idx of fora) {
                const alvo = restantes[idx - 1];
                if (alvo) marcadas.add(alvo.n);
            }
        }
        return [...marcadas].sort((a, b) => a - b);
    },

    remendar: async (pergunta, frase) => {
        // O revisor é o LFM2.5 — o MESMO arquivo da vontade, e por isso de
        // graça. Ele foi barrado como rascunhador por não declarar português no
        // card; em inglês essa objeção não existe, e medido ele faz 3/3 de
        // acerto em 11,6 s contra 1/3 em 18,4 s do SmolLM3.
        // ── E A GUARDA PRECISOU MUDAR DE PERGUNTA ────────────────────────
        //
        // Era `vontadeJaCarregada()`, que responde `true` quando os PESOS estão
        // no aparelho — mesmo sem runtime nenhum de pé. O pipeline passava por
        // ela e o `remendarFraseEmIngles` ia subir 1,25 GB no meio da fala, com
        // o rascunhador já residente. A tela do dono do jogo ficou em
        // "corrigindo uma frase…" para sempre.
        //
        // A pergunta certa é "dá para usar AGORA, sem pagar uma carga?".
        if (!vontadeDePeAgora()) return null;
        npcSet({ etapa: 'corrigindo uma frase…' });
        // Prazo mesmo assim: o revisor é a única peça do pipeline que ainda
        // podia pendurar, e um remendo que não volta não pode custar a fala.
        return comPrazo(
            remendarFraseEmIngles(pergunta, frase), PRAZO_CARGA_MS, 'o revisor',
        ).catch(() => null);
    },

    traduzir: async (texto) => {
        npcSet({ etapa: 'traduzindo…' });
        return traduzirParaPtBr(texto);
    },
};

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
): Promise<SaidaDoPipeline | null> {
    if (!pipelineDisponivel()) return null;
    const comecou = Date.now();
    try {
        const saida = await falarPeloPipeline(perguntaEmIngles, PECAS_REAIS, aoPassar);
        anotar('pipeline:fim', {
            ms: Date.now() - comecou,
            ok: saida ? 1 : 0,
            marcadas: saida?.marcadas ?? 0,
            remendadas: saida?.remendadas ?? 0,
            limpezas: saida?.limpezas ?? 0,
        });
        return saida;
    } catch (erro) {
        anotar('pipeline:erro', {
            motivo: (erro instanceof Error ? erro.message : String(erro)).slice(0, 80),
        });
        return null;
    }
}
