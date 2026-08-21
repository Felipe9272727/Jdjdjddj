// ── O PIPELINE INGLÊS-PRIMEIRO — a arquitetura que o dono do jogo desenhou ──
//
//     MoE rascunha em INGLÊS → juiz de TOM → revisor remenda a frase errada
//     → Bergamot traduz → passe pt-BR → tela
//
// Medido de ponta a ponta em `bancada-navegador/VELOCIDADE.md`:
//
//     A) SmolLM3 escrevendo direto ....... 13,0 s / 8,1 s
//     B) pipeline (juiz não marcou) ......  3,9 s / 3,4 s     0,30× e 0,42×
//     B) pipeline (3 de 3 marcados) ...... 15,4 s             1,01×
//
// Ou seja: 2,4× a 3,3× mais rápido quando o rascunho passa, e empate no pior
// caso absoluto. O ponto de equilíbrio é o juiz aprovar 17% dos rascunhos.
//
// ── POR QUE INGLÊS, e não é preferência ───────────────────────────────────
//
// Três medições independentes apontaram para o mesmo lugar:
//
//   1. o rascunhador MoE erra menos em inglês (em português ele quebrou o
//      cânone em 2 de 3 falas; em inglês, nenhuma);
//   2. o JUIZ só enxerga em inglês — o mesmo par de frases dá 0,94 de
//      contradição em inglês e 0,29 em português;
//   3. o REVISOR fica livre: o LFM2.5 foi barrado como rascunhador por não
//      declarar português no card, e em inglês essa objeção não existe.
//
// O preço é um tradutor, e ele só ficou barato com o Bergamot (83 ms contra
// 2.200 ms do m2m100). Antes disso o desenho perdia por 66% de custo.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ ────────────────────────────────────────────
//
// Não carrega modelo. Recebe as quatro peças por parâmetro, e isso não é
// elegância: é o que permite testar a ORQUESTRAÇÃO — a ordem, o que acontece
// quando cada peça falha, quando o juiz marca tudo, quando não marca nada —
// sem baixar 1 GB. As peças reais são ligadas em `wllamaEngine`.

import { abrasileirar } from './floor10Tradutor';
import { quebrasDeCanone, type QuebraDeCanone } from './floor10CanoneDoNilo';

/** As quatro peças. Qualquer uma devolvendo vazio/nulo aborta o pipeline. */
export type PecasDoPipeline = {
    /** Escreve o primeiro jato, em inglês. */
    rascunhar: (perguntaEmIngles: string) => Promise<string | null>;
    /** Aponta as frases fora do personagem — e DIZ o que viu em cada uma. */
    julgar: (frases: readonly string[]) => Promise<readonly Marcacao[]>;
    /** Reescreve UMA frase, em inglês — e DIZ o que aconteceu (ver `RespostaDoRevisor`). */
    remendar: (
        perguntaEmIngles: string, frase: string, porque: string,
    ) => Promise<RespostaDoRevisor>;
    /** Traduz o texto final para pt-BR. */
    traduzir: (textoEmIngles: string) => Promise<string | null>;
};

/**
 * ── O DIÁRIO DE BORDO ────────────────────────────────────────────────────
 *
 * Pedido do dono do jogo, depois de ver a sala mostrar só a tradução da
 * pergunta: *"não consigo ver o rascunho, não consigo ver pra onde o juiz
 * apontou erro, e nem o lsfm corrigindo"*. Ele está certo — a sala existe para
 * mostrar as etapas, e mostrava duas de cinco.
 *
 * O pipeline devolvia só CONTADORES (`marcadas`, `remendadas`). Contador
 * responde "vale a pena?" e não responde "o que ele escreveu?" — e é a segunda
 * pergunta que diz se o rascunhador presta.
 *
 * Isto NÃO é telemetria: é o conteúdo, frase a frase, com o veredito do juiz e
 * o antes/depois de cada remendo.
 */
/**
 * ── O QUE O REVISOR DEVOLVE, E POR QUE NÃO É MAIS `string | null` ─────────
 *
 * Isto nasceu de uma pergunta feita diante da tela: *"ele simplesmente decide
 * não mudar — será um bug, ou uma escolha?"*. A tela NÃO TINHA COMO RESPONDER,
 * porque quatro desfechos com preços e culpados diferentes chegavam aqui como
 * o mesmo `null`:
 *
 *     não estava de pé ....... custou 0 s; nada foi tentado
 *     o prazo cortou ......... custou o preço INTEIRO, e o trabalho foi jogado fora
 *     rodou e ficou mudo ..... custou o preço inteiro; a culpa é do modelo
 *     devolveu a MESMA frase . custou o preço inteiro, e foi uma ESCOLHA dele
 *
 * Era bug: na tela dele apareceram 45,6 s e 30,6 s com o teto do revisor em
 * 25 s. Uma guarda recusando custa 0,0 s — quem gasta meio minuto trabalhou.
 * O `abort` do wllama levanta `WllamaAbortError` e não devolve o parcial, então
 * o `catch { return ''; }` daqui apagava uma frase pronta.
 *
 * Um tipo por desfecho não é preciosismo: é o que impede o próximo relato de
 * ser "não sei se ele errou ou escolheu".
 */
/**
 * ── O QUE O JUIZ VIU, E NÃO SÓ ONDE ──────────────────────────────────────
 *
 * O juiz sempre soube o motivo e sempre o jogou fora. A trava sabe qual regex
 * casou; o juiz de tom sabe de qual âncora ruim a frase chegou perto — é o
 * argmax da conta que ele já fazia. Os dois iam para o lixo a um passo de quem
 * precisava deles.
 *
 * MEDIDO na bancada com o LFM2.5 de produção (`revisor-candidatos.mjs`), régua
 * conferindo o cânone inteiro:
 *
 *     enunciado de hoje ("esta frase está errada") .... 2/6 · 50,2 s
 *     dizendo TAMBÉM o que está errado ................ 4/6 · 53,0 s
 *
 * Dobrar o conserto por três segundos, sem baixar um byte novo. Foi o melhor
 * retorno de toda a busca por revisor — e a busca por um MODELO melhor não
 * achou nenhum: o Qwen2.5-1.5B custa 4× menos e devolve a frase errada letra
 * por letra em 4 de 6, inclusive quando o motivo é entregue de bandeja.
 *
 * `porque` pode ser `''`, e isso é uma resposta: quer dizer "marquei, e não sei
 * dizer por quê". O revisor então recebe o enunciado antigo.
 *
 * E o motivo ERRADO custa pouco, o que também foi medido em vez de suposto:
 * entregando de propósito o motivo de outro defeito, o placar é 2/6 e 0/3
 * estragou — empata com ir às cegas. Diante de um diagnóstico que não bate, o
 * revisor fica conservador em vez de consertar o que não está quebrado.
 */
export type Marcacao = {
    /** Índice 1-based da frase. */
    n: number;
    /** Fragmento em inglês, ou `''`. Entra no enunciado do remendo. */
    porque: string;
};

export type RespostaDoRevisor =
    /** Saiu UMA frase inteira. `cortado` diz se o prazo estourou antes de ele parar sozinho. */
    | { tipo: 'frase'; texto: string; cortado: boolean }
    /** O prazo estourou sem fechar uma frase. `parcial` é o que já tinha saído. */
    | { tipo: 'cortado'; parcial: string }
    /** O motor não estava de pé. Não gastou um milissegundo de modelo. */
    | { tipo: 'sem-revisor' }
    /** Rodou até o fim e não escreveu nada aproveitável. */
    | { tipo: 'vazio' }
    /** Tropeçou. `erro` é o texto cru, sem interpretação. */
    | { tipo: 'erro'; erro: string };

/** O mesmo, já confrontado com a frase original: `trocou` e `manteve` só existem aqui. */
export type DesfechoDoRemendo =
    | { tipo: 'trocou'; depois: string }
    | { tipo: 'manteve' }
    /**
     * O revisor escreveu algo que QUEBRA O CÂNONE, e a frase original ficou.
     *
     * Relato depois de testar no celular: *"em um dos casos, o revisor PIOROU
     * a resposta"*. Ele devolveu `The player asks, "I've been on the ground
     * floor…"` — inventou uma fala do JOGADOR — e aquilo chegou à tela. O
     * remendo era aceito sem conferência: a etapa que existe para consertar
     * podia estragar, e estragava calada.
     */
    | { tipo: 'recusado'; depois: string; quebras: readonly QuebraDeCanone[] }
    | { tipo: 'cortado'; parcial: string }
    | { tipo: 'sem-revisor' }
    | { tipo: 'vazio' }
    | { tipo: 'erro'; erro: string };

export type PassoDoPipeline =
    | { passo: 'rascunho'; textoEmIngles: string; ms: number }
    | { passo: 'frases'; frases: readonly string[] }
    | { passo: 'juiz'; marcadas: readonly Marcacao[]; ms: number }
    | { passo: 'limpeza'; n: number; antes: string; depois: string }
    | { passo: 'remendo'; n: number; antes: string; desfecho: DesfechoDoRemendo; ms: number }
    | { passo: 'traducao'; antesEmIngles: string; depoisEmPtBr: string; ms: number };

export type SaidaDoPipeline = {
    /** A fala pronta, em pt-BR. */
    fala: string;
    /** Quantas frases o juiz marcou — o número que decide se o desenho paga. */
    marcadas: number;
    /** Quantas o revisor de fato trocou. */
    remendadas: number;
    /** Consertos de string, que saem de graça. */
    limpezas: number;
};

/**
 * ── OS CONSERTOS DE STRING, QUE NUNCA DEVEM IR AO REVISOR ─────────────────
 *
 * Isto existe por causa de uma medição embaraçosa: numa execução o juiz marcou
 * `"Nilo: "` e eu mandei a frase ao revisor — SESSENTA SEGUNDOS para tirar um
 * prefixo, e ele nem conseguiu (devolveu o rótulo de volta com "(Correção a uma
 * frase)" colado). Aquele caso sozinho respondeu por 60 dos 87 segundos do
 * pipeline inteiro.
 *
 * Defeito de FORMA é conserto de string: microssegundos e nunca falha. Só
 * defeito de CONTEÚDO merece um modelo.
 */
const LIMPEZAS: readonly (readonly [RegExp, string])[] = Object.freeze([
    [/^\s*nilo\s*:\s*/i, ''],
    [/^\s*["“](.*)["”]\s*$/s, '$1'],
    // O eco do prompt, INTEIRO. A primeira versão desta linha era
    // `(?:no label|nilo'?s line only)` e comia só o pedaço final: de
    // "I wait. Nilo's line only, no label." sobrava "I wait. Nilo's line only,"
    // — pior que não ter limpado, porque o texto fica truncado no meio.
    // As duas partes aparecem juntas ou sozinhas, então a alternância tem de
    // tratar a forma composta primeiro.
    [/\s*\(?\s*nilo'?s line only\s*[,;]?\s*(?:no label)?\s*\)?\s*[.]?\s*$/i, ''],
    [/\s*\(?\s*no label\s*\)?\s*[.]?\s*$/i, ''],
]);

export function limparFrase(frase: string): { texto: string; mudou: boolean } {
    let t = frase;
    let mudou = false;
    for (const [re, por] of LIMPEZAS) {
        if (re.test(t)) { t = t.replace(re, por).trim(); mudou = true; }
    }
    return { texto: t.trim(), mudou };
}

/**
 * A PRIMEIRA frase FECHADA de um texto que ainda está chegando — ou `null`.
 *
 * Serve a duas coisas que parecem uma só e não são:
 *   • PARAR DE LER assim que a frase pedida terminou. O enunciado do remendo diz
 *     "One sentence", e o modelo costuma escrever a segunda mesmo assim.
 *   • SALVAR o que deu tempo quando o prazo estoura no meio da segunda frase.
 *
 * O piso de 12 caracteres existe por causa de "Mr.", "St." e "No." — um ponto
 * cedo demais devolveria uma frase que não é frase. Ele não descarta o texto:
 * a busca continua no próximo ponto.
 */
/**
 * ── O ENUNCIADO QUE MOSTRA, EM VEZ DE SÓ MANDAR ──────────────────────────
 *
 * A maior alavanca medida nesta caçada, e nenhuma delas foi trocar de modelo:
 *
 *     LFM2.5 1.2B ..... 7/12 → 12/12
 *     granite a400m ... 2/12 →  6/12, e 7 ECOS foram a zero
 *
 * Modelo pequeno que ecoa a frase errada não é burro: ele não sabe que FORMA
 * tem a resposta, então devolve a forma que recebeu. Dois pares errado→certo
 * resolvem isso, e custam ~90 tokens.
 *
 * ── OS EXEMPLOS NÃO PODEM SER OS DEFEITOS REAIS ──────────────────────────
 *
 * Os dois abaixo usam defeitos que o juiz também marca — "saiu do andar" e
 * "narra em terceira pessoa" — mas com frases que não são as do jogo. Se um
 * exemplo mostrasse a correção exata de um caso comum, o revisor aprenderia a
 * resposta em vez do procedimento; medido na bancada, o Llama 3.2 devolveu a
 * linha do Exemplo 2 letra por letra em 8 de 12 casos.
 */
const EXEMPLOS_DO_REMENDO = `Example 1:
Wrong line: "I went downstairs to check the lobby, but it was empty."
It is wrong because he has never left the 10th floor.
Corrected line: "I have not been anywhere else. This floor is all there is."

Example 2:
Wrong line: "Nilo sighs and looks at the elevator door."
It is wrong because it narrates him from outside instead of letting him speak.
Corrected line: "I keep looking at that door. It keeps not opening."`;

/**
 * ── COPIOU O EXEMPLO EM VEZ DE CONSERTAR ─────────────────────────────────
 *
 * Relato do aparelho, com o rascunhador remendando: ele devolveu
 *
 *     "I have not been anywhere else."
 *
 * que é a linha corrigida do Exemplo 1 acima, letra por letra. Não quebra
 * cânone nenhum — é uma fala perfeitamente boa do Nilo — e mesmo assim não é
 * conserto: é o modelo repetindo o que viu, e a frase marcada continua errada.
 *
 * Eu já tinha construído esta conferência na BANCADA e não a tinha trazido para
 * o jogo. É o mesmo defeito de origem que já apareceu aqui três vezes: uma
 * verdade que existe num lugar e falta no outro.
 *
 * A comparação é por conjunto de palavras, não por igualdade: o modelo copia
 * com pontuação diferente, e "I have not been anywhere else, I think" continua
 * sendo cópia.
 */
const RESPOSTAS_DOS_EXEMPLOS = Object.freeze([
    'I have not been anywhere else. This floor is all there is.',
    'I keep looking at that door. It keeps not opening.',
]);

function palavras(t: string): Set<string> {
    return new Set((t.toLowerCase().match(/[a-z']+/g) ?? []));
}

/**
 * ── O RACIOCÍNIO NÃO É A FALA ────────────────────────────────────────────
 *
 * Modelos com modo de pensamento devolvem `<think>…</think>` e só depois a
 * frase. O remendo nunca tratou disso porque nenhum revisor pensava — e a
 * bancada, que também não tratava, deu 0/12 ao Huihui-MoE com as doze saídas
 * começando em "<think> Okay, let's see." Eu estava reprovando o modelo pelo
 * que ele PENSOU.
 *
 * Aberto e nunca fechado é o caso que importa aqui: o teto de tokens cortou no
 * meio do pensamento, e não existe resposta. Devolver o pensamento pela metade
 * seria pôr "Okay, let's see. The user wants me to" na boca do Nilo — então
 * este caso vira vazio, e quem chama trata como remendo que não veio.
 */
export function semRaciocinio(texto: string): string {
    const fim = texto.lastIndexOf('</think>');
    if (fim >= 0) return texto.slice(fim + '</think>'.length).trim();
    return texto.includes('<think>') ? '' : texto;
}

export function copiouOExemplo(texto: string): boolean {
    const a = palavras(texto);
    if (a.size === 0) return false;
    return RESPOSTAS_DOS_EXEMPLOS.some((exemplo) => {
        const b = palavras(exemplo);
        let comuns = 0;
        for (const w of a) if (b.has(w)) comuns += 1;
        // ── CÓPIA PARCIAL TAMBÉM É CÓPIA ─────────────────────────────────
        //
        // A primeira versão dividia pelo MAIOR dos dois conjuntos, e um teste
        // a derrubou na hora: o aparelho devolveu "I have not been anywhere
        // else." — metade do Exemplo 1, sem a segunda frase. São 6 palavras de
        // 11, ou seja 0,55, e passava.
        //
        // O que importa é CONTENÇÃO: se quase tudo que ele escreveu veio de um
        // exemplo, é cópia, mesmo que ele tenha parado no meio. O piso de 4
        // palavras evita que uma resposta curtíssima case por acaso.
        if (comuns < 4) return false;
        return comuns / a.size >= 0.9 || comuns / b.size >= 0.9;
    })
        // E o andaime do próprio enunciado, que o Llama devolveu inteiro na
        // bancada: `Wrong line: "…"`, `Corrected line:`, `The player asked:`.
        || /\bwrong line:|\bcorrected line:|\bthe player asked:/i.test(texto);
}

export function enunciadoComExemplos(
    perguntaEmIngles: string, frase: string, porque: string,
): string {
    return `\n\nCORRECTION. One sentence only.\n\n${EXEMPLOS_DO_REMENDO}`
        + `\n\nNow do the same.\n\nThe player asked: "${perguntaEmIngles.trim()}"`
        + `\nWrong line: "${frase}"\nIt is wrong because ${porque}\nCorrected line:`;
}

/**
 * Onde a geração deve PARAR, e não é zelo.
 *
 * Medido: com exemplos, o modelo continua o PADRÃO em vez de parar depois da
 * frase — devolve "Now, let's continue", ou escreve o próximo exercício
 * inteiro com `Wrong line:` e tudo.
 */
export const PARADAS_DO_REMENDO = Object.freeze([
    '\nWrong line:', '\nExample', '\nIt is wrong because', '\n\n',
]);

export function primeiraFraseFechada(texto: string): string | null {
    const re = /[.!?…]["”]?(?=\s|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto)) !== null) {
        const f = texto.slice(0, m.index + m[0].length).trim();
        if (f.length >= 12) return f;
    }
    return null;
}

/**
 * Confronta a resposta do revisor com a frase original.
 *
 * É aqui — e só aqui — que "trocou" e "manteve" nascem, e é por isso que esta
 * função é pura: a diferença entre bug e escolha passou a ser verificável num
 * teste de mesa, sem modelo, sem celular e sem captura de tela.
 */
export function aplicarRemendo(antes: string, r: RespostaDoRevisor): DesfechoDoRemendo {
    if (r.tipo !== 'frase') return r;
    const { texto } = limparFrase(r.texto);
    if (texto.length <= 2) return { tipo: 'vazio' };
    if (texto === antes) return { tipo: 'manteve' };
    // ── A CONFERÊNCIA QUE NÃO EXISTIA ────────────────────────────────────
    //
    // O remendo entrava sem ninguém olhar. Uma frase torta que o juiz marcou é
    // ruim; uma frase que inventa cenário ou fala pelo jogador é MUITO pior, e
    // chega ao jogador como cânone. Na dúvida, fica a original.
    //
    // Vale para QUALQUER revisor: isto não é conserto de um modelo, é a etapa
    // deixando de confiar cegamente em quem quer que esteja no posto.
    // Copiar a resposta de um exemplo é uma forma de fingir que a conferência
    // de cânone não pega: a frase é boa, só não é conserto. Entra como quebra
    // para o desfecho ser o mesmo — a original fica de pé.
    if (copiouOExemplo(texto)) {
        return {
            tipo: 'recusado', depois: texto,
            quebras: [{ regra: 'copiou a resposta do exemplo', trecho: texto.slice(0, 60) }],
        };
    }
    const quebras = quebrasDeCanone(texto);
    if (quebras.length > 0) return { tipo: 'recusado', depois: texto, quebras };
    return { tipo: 'trocou', depois: texto };
}

/** Quebra em frases, do mesmo jeito que o resto do andar. */
export function enumerarEmIngles(texto: string): string[] {
    return (texto.match(/[^.!?…]+[.!?…]*/g) ?? [])
        .map((f) => f.trim())
        .filter((f) => f.length > 2)
        .slice(0, 4);
}

/**
 * Roda o pipeline. Devolve `null` em qualquer tropeço — e essa é a regra que
 * este andar inteiro segue: uma otimização que falha não pode custar a fala do
 * jogador. Quem chama cai no caminho normal (o 3B escrevendo em português).
 */
export async function falarPeloPipeline(
    perguntaEmIngles: string,
    pecas: PecasDoPipeline,
    /**
     * Recebe cada etapa assim que ela acontece. Opcional: o JOGO não passa nada
     * (ele só quer a fala), e a sala passa para desenhar o caminho inteiro.
     * Nunca pode alterar o resultado — é observação, não participação.
     */
    aoPassar?: (passo: PassoDoPipeline) => void,
): Promise<SaidaDoPipeline | null> {
    const t0 = Date.now();
    const bruto = await pecas.rascunhar(perguntaEmIngles);
    if (!bruto || !bruto.trim()) return null;
    aoPassar?.({ passo: 'rascunho', textoEmIngles: bruto, ms: Date.now() - t0 });

    const cruas = enumerarEmIngles(bruto);
    if (cruas.length === 0) return null;

    const limpas = cruas.map(limparFrase);
    const limpezas = limpas.filter((l) => l.mudou).length;
    // As limpezas saem de graça e ninguém as via — mas elas mudam a frase que o
    // juiz recebe, então esconder é esconder metade da explicação.
    for (const [i, l] of limpas.entries()) {
        if (l.mudou) aoPassar?.({ passo: 'limpeza', n: i + 1, antes: cruas[i], depois: l.texto });
    }
    const frases = limpas.map((l) => l.texto).filter((f) => f.length > 2);
    if (frases.length === 0) return null;
    aoPassar?.({ passo: 'frases', frases });

    // O JUIZ vem antes da tradução de propósito: é em inglês que ele enxerga.
    // Se ele falhar, devolve lista vazia e o rascunho passa — não julgar custa
    // o que já custava; marcar por engano custa ~11,6 s de revisor.
    const t1 = Date.now();
    const marcadas = await pecas.julgar(frases);
    aoPassar?.({ passo: 'juiz', marcadas, ms: Date.now() - t1 });

    const finais = [...frases];
    let remendadas = 0;
    for (const { n, porque } of marcadas) {
        const i = n - 1;
        if (i < 0 || i >= finais.length) continue;
        const t2 = Date.now();
        const antes = finais[i];
        const desfecho = aplicarRemendo(
            antes, await pecas.remendar(perguntaEmIngles, antes, porque),
        );
        // Só `trocou` mexe no texto. `manteve` é uma escolha do revisor — foi o
        // que o SmolLM3 fez em 2 de 3 ("(No correction needed)") — e contá-la
        // como troca inflaria o placar; os outros quatro desfechos são falhas
        // com donos diferentes, e a frase original segue em todos eles.
        if (desfecho.tipo === 'trocou') { finais[i] = desfecho.depois; remendadas += 1; }
        aoPassar?.({ passo: 'remendo', n, antes, desfecho, ms: Date.now() - t2 });
    }

    const t3 = Date.now();
    const juntas = finais.join(' ');
    const pt = await pecas.traduzir(juntas);
    if (!pt || !pt.trim()) return null;
    const fala = abrasileirar(pt);
    aoPassar?.({
        passo: 'traducao', antesEmIngles: juntas, depoisEmPtBr: fala, ms: Date.now() - t3,
    });

    return {
        fala,
        marcadas: marcadas.length,
        remendadas,
        limpezas,
    };
}

/**
 * O pipeline está ligado?
 *
 * Fica atrás de `?pipeline` e DESLIGADO por padrão, pelo mesmo motivo que a
 * GPU: ele acrescenta ~950 MB de download (rascunhador + juiz + tradutor) e
 * três modos de falha novos, e nada disso foi medido no aparelho de quem joga.
 * Cinco técnicas já ganharam nesta bancada e perderam lá.
 */
export function pipelineLigado(busca = globalThis.location?.search ?? ''): boolean {
    return /[?&]pipeline\b/i.test(busca);
}
