// ── O 3B PARA DE ESCREVER E PASSA A REVISAR ────────────────────────────────
//
// O PROBLEMA, MEDIDO NO APARELHO DO DONO DO JOGO
//
//     Pensando localmente… 142s
//     fala 1 tok/s · 515 reaproveitados · 285 lidos
//
// A 1 token por segundo, uma resposta de quarenta tokens custa quarenta
// segundos SÓ de geração. O teto é 96. Não existe prompt pequeno o bastante
// para consertar isso: o gargalo é o próprio ato de o 3B escrever.
//
// O DESENHO QUE ELE PEDIU, nas palavras dele: "uma ia menor rascunhando, e a
// smol 3b decidindo se vale a pena usar a resposta dessa ia mais rápida, e se
// não, ela mesma fazendo as modificações necessárias, sem ter que apagar tudo,
// tipo ela vê uma parte do texto inconsistente e modifica só aquela parte".
//
// A palavra que carrega o desenho é ESSA: só aquela parte.
//
//   rascunho reprovado inteiro → o 3B reescreve tudo → 40 tokens → 40 s
//   rascunho com uma frase ruim → o 3B troca uma frase → ~12 tokens → 12 s
//   rascunho aprovado ............ o 3B escreve "OK" → 1 token → 1 s
//
// O caminho comum é o último. É daí que vem o ganho — não de o 3B ser rápido,
// mas de ele quase nunca precisar falar.
//
// POR QUE NUMERAR AS FRASES, E NÃO PEDIR UM DIFF
//
// Um 3B rodando em WASM não produz `patch` confiável, e um formato que erra
// silenciosamente é pior que nenhum. Frase numerada tem duas propriedades que
// salvam este desenho: cabe numa gramática GBNF (o modelo não CONSEGUE emitir
// algo fora do formato) e o índice é verificável contra o rascunho — um `FIX 7`
// num rascunho de três frases é recusado aqui, não vira texto torto na tela.
//
// O QUE ESTE MÓDULO NÃO FAZ
//
// Não gera, não carrega modelo, não fala com o wllama. Ele é a gramática, o
// enunciado e a costura — tudo puro, tudo testável sem navegador. Quem chama
// junta as peças. É a mesma divisão do `floor10MotorCortex`, e pela mesma
// razão: o que decide precisa poder ser medido sem 1,9 GB de pesos.
import { MemoriaDeBolhas } from './floor10Bolha';

/** Uma frase do rascunho com o número pelo qual o revisor a aponta. */
export type FraseNumerada = { n: number; texto: string };

/**
 * Quantas frases o revisor consegue apontar.
 *
 * A gramática usa UM dígito, então o limite é real e precisa ser respeitado
 * aqui — senão a frase 10 existe na lista, não existe na gramática, e o modelo
 * fica sem como reprová-la. Nove é folga larga: uma fala do Nilo tem duas a
 * quatro frases, e um rascunho com dez é um rascunho que já deu errado.
 */
export const MAXIMO_DE_FRASES = 9;

/**
 * Quebra o rascunho em frases numeradas.
 *
 * Mesmo divisor do `semFraseRepetida`, e sem `lookbehind` pelo mesmo motivo:
 * ele é erro de SINTAXE em Safari antigo e derrubaria o pacote inteiro no
 * aparelho que este projeto persegue.
 */
export function enumerarFrases(rascunho: string): FraseNumerada[] {
    const texto = rascunho.trim();
    if (!texto) return [];
    const brutas = texto.match(/[^.!?…]+[.!?…]*/g) ?? [texto];
    const frases: FraseNumerada[] = [];
    for (const bruta of brutas) {
        const limpa = bruta.trim();
        if (!limpa) continue;
        if (frases.length >= MAXIMO_DE_FRASES) {
            // O excedente não some: gruda na última frase apontável. Melhor uma
            // frase nove comprida que texto que o revisor não pode corrigir.
            frases[frases.length - 1].texto += ` ${limpa}`;
            continue;
        }
        frases.push({ n: frases.length + 1, texto: limpa });
    }
    return frases;
}

/** O rascunho como o revisor o lê: uma frase por linha, numerada. */
export function listaParaRevisao(frases: readonly FraseNumerada[]): string {
    return frases.map((f) => `${f.n}. ${f.texto}`).join('\n');
}

/**
 * A gramática do veredito.
 *
 * O `\n` vai ESCAPADO de propósito. Escrito como quebra de linha de verdade
 * dentro de um literal da GBNF, o parser do worker recusa a gramática inteira e
 * `createChatCompletion` estoura — e o `catch` de quem chama devolveria null em
 * silêncio. Já aconteceu neste projeto, no `floor10MotorCortex`, e não é um
 * erro que teste de string pegue: a string parece certa.
 */
export const GRAMATICA_DO_REMENDO = [
    'root ::= aprovado | correcoes',
    'aprovado ::= "OK"',
    'correcoes ::= correcao correcao?',
    'correcao ::= "FIX " digito ": " frase "\\n"',
    'digito ::= [1-9]',
    // Qualquer coisa menos quebra de linha: a quebra é o que fecha a correção.
    'frase ::= [^\\n]+',
].join('\n');

// ── A MEDIÇÃO DERRUBOU O PROTOCOLO DE UM PASSO ────────────────────────────
//
// A `GRAMATICA_DO_REMENDO` acima foi escrita a lápis e parecia certa. Rodada
// contra o SmolLM3-3B de verdade, três casos plantados, ela reprovou nos três:
//
//   rascunho limpo → esperado "OK", veio:
//       "FIX 1: Sou Nilo Azevedo, ex-técnico de elevadores.
//        FIX 2: Estou preso no 10º andar há tempo demais. OK"
//     Ele reescreveu as duas frases IDÊNTICAS em vez de aprovar.
//
//   erro na frase 2 → veio:
//       "FIX 1: O hotel vai encerrar amanhã de manhã. (Não sei dizer)
//        FIX 2: Eu só queria sair daqui. (Não sei dizer)"
//     Ele DESLOCOU os índices: usou o número como "minha correção nº 1", e não
//     como "a frase nº 1 do rascunho".
//
//   troca de identidade → veio:
//       "FIX 1: Eu não sou Nilo Azevedo, eu sou Nilo Azevedo. … OK. (Apenas a
//        primeira frase foi corrigida, pois a segunda já está correta.) OK. (A
//        segunda frase já está correta, então não há necessidade de cor"
//     Contradiz a si mesmo, comenta o próprio trabalho, e estoura o teto.
//
// TRÊS EM TRÊS. E o mais importante: a culpa NÃO é do wllama.
//
// Eu cheguei a acusar a gramática de não estar sendo aplicada. Medi antes de
// escrever isso e estava errado — com prompt curto, no mesmo motor:
//
//     root ::= "OK" ................................ saída "OK"    (2,5 s)
//     GRAMATICA_DO_REMENDO ......................... saída "OK"    (2,3 s)
//     GRAMATICA_DO_VEREDITO ........................ saída "OK"    (2,4 s)
//     FLOOR10_MOTOR_GRAMMAR (a do jogo) ............ "MOTION: explore | active"
//     root ::= digito ("," digito)? ................ saída "1,4"
//
// As duas são VÁLIDAS e são APLICADAS. O lixo passou porque a gramática
// PERMITIA o lixo: `frase ::= [^\n]+` é curinga, então "FIX 1: <qualquer coisa
// até a quebra de linha>" conforma com tudo. O único trecho realmente preso era
// o prefixo. Gramática não é mágica — ela só recusa o que você escreveu que ela
// deve recusar.
//
// E UM PERIGO QUE A MEDIÇÃO ACHOU DE BRINDE: gramática INVÁLIDA é ignorada em
// SILÊNCIO. `root ::= (((` não lançou erro nenhum e a geração saiu solta
// ("Frase: \"Alegria\""). Ou seja: um erro de digitação numa GBNF deste projeto
// não quebra nada — só desliga a única trava que segura o formato, e ninguém
// fica sabendo. Vale para o motor também.
//
// ── O QUE A EVIDÊNCIA MANDA FAZER: UM GRAU DE LIBERDADE POR CHAMADA ───────
//
// Eu tinha pedido DUAS coisas na mesma resposta — escolher qual frase está
// errada E escrever a substituta. Um 3B em WASM erra as duas quando elas vêm
// juntas. Separadas, cada uma vira uma tarefa com uma saída só:
//
//   passo 1 ... "quais frases estão erradas?" → só dígitos, ou OK. 1 a 3
//               tokens. Não existe texto livre para ele divagar, e não existe
//               índice para deslocar, porque o número É a resposta inteira.
//   passo 2 ... só se houver frase errada: "reescreva ESTA frase", com a frase
//               citada no enunciado e NENHUM índice na saída.
//
// O passo 1 é o que decide se o atalho vale: se ele responder OK, custou três
// tokens, e é aí que este desenho ganha do 3B escrevendo tudo.
export const GRAMATICA_DO_VEREDITO = [
    'root ::= aprovado | erradas',
    'aprovado ::= "OK"',
    // No máximo duas: corrigir três frases de três é reescrever a fala, e para
    // isso o caminho antigo já existe e é mais barato.
    'erradas ::= digito ("," digito)?',
    'digito ::= [1-9]',
].join('\n');

/** Teto do passo 1. "OK" é um token; "1,3" são três. */
export const VEREDITO_MAX_TOKENS = 8;

/**
 * Lê o passo 1: quais frases o revisor reprovou.
 *
 * Devolve lista vazia para "OK" e para qualquer coisa ilegível — a mesma
 * política de antes, e pelo mesmo motivo: o rascunho já passou pelas checagens
 * determinísticas, e reprovar por não ter entendido o revisor troca uma
 * resposta provavelmente boa por mais um minuto de espera.
 */
export function lerFrasesErradas(saida: string, totalDeFrases: number): number[] {
    const texto = saida.trim();
    if (!texto || /^ok\b/i.test(texto)) return [];
    const numeros = texto.match(/[1-9]/g) ?? [];
    const vistos = new Set<number>();
    for (const n of numeros) {
        const v = Number(n);
        if (v >= 1 && v <= totalDeFrases) vistos.add(v);
    }
    return [...vistos].sort((a, b) => a - b);
}

/**
 * O enunciado do passo 1. Curto de propósito: o modelo tem UMA decisão a tomar,
 * e cada linha a mais é uma chance de ele achar que deve escrever prosa.
 */
export function blocoDoVeredito(
    perguntaDoJogador: string,
    frases: readonly FraseNumerada[],
): string {
    return `

CONFERÊNCIA. Não escreva fala nenhuma.

Rascunho de resposta de Nilo para "${perguntaDoJogador.trim()}":

${listaParaRevisao(frases)}

Alguma dessas frases contradiz sua identidade, o cânone, seus olhos ou sua
vontade? Responda SÓ com o número das erradas, separados por vírgula. Se todas
estiverem aceitáveis, responda apenas: OK`;
}

/**
 * O enunciado do passo 2, para UMA frase.
 *
 * A frase vai citada e a saída não tem índice: foi exatamente o índice que o
 * modelo deslocou na medição. Aqui não há número para ele errar.
 */
export function blocoDaReescrita(
    perguntaDoJogador: string,
    frase: string,
): string {
    return `

CORREÇÃO. Uma frase só.

Nesta resposta sua para "${perguntaDoJogador.trim()}", esta frase está errada:

"${frase}"

Reescreva SOMENTE essa frase, corrigida, na voz de Nilo. Uma frase. Sem
explicar, sem numerar, sem comentar.`;
}

/** Uma frase trocada: o número que ela tinha e o texto que entra no lugar. */
export type Remendo = { n: number; texto: string };

export type Veredito = {
    /** O rascunho passou como está? */
    aprovado: boolean;
    remendos: Remendo[];
    /**
     * Por que o veredito ficou como ficou. Vai para a caixa-preta, não para a
     * tela — e existe porque um revisor que reprova em silêncio é
     * indistinguível de um revisor quebrado.
     */
    motivo: string;
};

const APROVADO: Veredito = { aprovado: true, remendos: [], motivo: '' };

/**
 * Lê o que o revisor respondeu.
 *
 * Tolerante na ENTRADA e rigorosa na SAÍDA: aceita caixa trocada e espaço
 * sobrando, porque isso não muda o sentido; recusa índice fora do rascunho e
 * correção vazia, porque isso vira texto errado na tela.
 *
 * Quando não dá para ler nada, o rascunho passa. É a escolha certa aqui e vale
 * escrever por quê: o rascunho já passou pelas checagens determinísticas de
 * quem chama, e reprovar por não ter entendido o revisor trocaria uma resposta
 * provavelmente boa por mais um minuto de espera.
 */
export function lerVeredito(saida: string, totalDeFrases: number): Veredito {
    const texto = saida.trim();
    if (!texto) return { ...APROVADO, motivo: 'revisor mudo' };
    if (/^ok\b/i.test(texto)) return APROVADO;

    const remendos: Remendo[] = [];
    const vistos = new Set<number>();
    for (const linha of texto.split('\n')) {
        const casou = /^\s*fix\s*(\d)\s*:\s*(.+)$/i.exec(linha.trim());
        if (!casou) continue;
        const n = Number(casou[1]);
        const novo = casou[2].trim();
        // Apontar uma frase que não existe é o erro que este formato torna
        // detectável — e é por isso que ele foi escolhido.
        if (!(n >= 1 && n <= totalDeFrases)) continue;
        if (!novo) continue;
        if (vistos.has(n)) continue;
        vistos.add(n);
        remendos.push({ n, texto: novo });
    }
    if (remendos.length === 0) {
        return { ...APROVADO, motivo: 'veredito ilegível' };
    }
    return { aprovado: false, remendos, motivo: `${remendos.length} frase(s) trocada(s)` };
}

/**
 * Costura o rascunho com as frases trocadas.
 *
 * O que NÃO foi apontado sai daqui byte por byte igual ao que entrou. Essa é a
 * propriedade que separa este desenho de "gerar de novo", e é o que o dono do
 * jogo pediu: sem ter que apagar tudo.
 */
export function aplicarRemendos(
    frases: readonly FraseNumerada[],
    remendos: readonly Remendo[],
): string {
    if (remendos.length === 0) return frases.map((f) => f.texto).join(' ');
    const porNumero = new Map(remendos.map((r) => [r.n, r.texto]));
    return frases.map((f) => porNumero.get(f.n) ?? f.texto).join(' ');
}

/**
 * O revisor devolveu, como "correção", a mesma frase que já estava lá?
 *
 * Acontece: o modelo entende que precisa emitir uma correção e reescreve a
 * frase com outras palavras dizendo o mesmo. Custa tokens e não conserta nada,
 * e — pior — faz o registro dizer que houve conserto onde não houve.
 */
export function remendoInutil(original: string, novo: string): boolean {
    // ── O DEFEITO QUE A MEDIÇÃO ACHOU ────────────────────────────────────
    //
    // `parecidas` divide as palavras em comum pelo MENOR dos dois conjuntos de
    // palavras pesadas. Quando a frase original tem UMA palavra pesada só, o
    // denominador é 1 e qualquer substituta que a repita marca 1,0 — "igual".
    //
    // Na medição real: original "Não sei dizer." (só `dizer` tem mais de três
    // letras) contra a substituta "O hotel vai encerrar amanhã de manhã. (Não
    // sei dizer)". Nada a ver uma com a outra, e o remendo foi DESCARTADO como
    // inútil — por acidente, o descarte salvou o texto naquele caso, mas é
    // sorte, não regra, e no caso seguinte a sorte inverte.
    //
    // Frase curta demais para o comparador é decidida por igualdade de texto,
    // que é o que ele sabe responder sem inventar semelhança.
    const pesadas = (t: string) => MemoriaDeBolhas.chave(t).split(' ')
        .filter((p) => p.length > 3).length;
    if (pesadas(original) < 2 || pesadas(novo) < 2) {
        return MemoriaDeBolhas.chave(original) === MemoriaDeBolhas.chave(novo);
    }
    return MemoriaDeBolhas.parecidas(original, novo);
}

/**
 * ── O REMENDO VEIO PELA METADE ───────────────────────────────────────────
 *
 * Achado JOGANDO, no `jogo-de-verdade.mjs`, com os modelos de produção. A
 * pergunta "O elevador vem se eu chamar?" recebeu DOIS remendos, e os dois
 * eram fragmento:
 *
 *     [trocou] "I have stopped trying to"
 *     [trocou] "If you can call it that, I"
 *
 * Colados, viraram a fala que foi para a tela:
 *
 *     "Eu parei de tentar se você pode chamá-lo assim, eu"
 *
 * O teto não é o culpado: `REMENDO_TREINADO_TOKENS` é 40 e esses tinham 6 e 8.
 * O revisor de 360M simplesmente para no meio às vezes. O que faltava era
 * guarda: `remendosQueValem` conferia se o remendo MUDA alguma coisa, nunca se
 * ele TERMINA.
 *
 * Frase inteira acaba em pontuação terminal — e a aspa ou o parêntese podem vir
 * depois dela. Sem isso, fica o original, que ao menos é uma frase.
 */
export function remendoTruncado(novo: string): boolean {
    return !/[.!?…][")'\]]*$/.test(novo.trim());
}

/** Tira os remendos que não mudam nada ou que vieram pela metade. */
export function remendosQueValem(
    frases: readonly FraseNumerada[],
    remendos: readonly Remendo[],
): Remendo[] {
    const porNumero = new Map(frases.map((f) => [f.n, f.texto]));
    return remendos.filter((r) => {
        const original = porNumero.get(r.n);
        if (original === undefined) return false;
        if (remendoTruncado(r.texto)) return false;
        return !remendoInutil(original, r.texto);
    });
}

/**
 * O enunciado da revisão, colado NO FIM do prompt que o 3B já usa para falar.
 *
 * O "no fim" não é estilo, é dinheiro. O llama.cpp reaproveita o maior prefixo
 * comum entre uma chamada e a seguinte — é isso que produz os "515
 * reaproveitados" do cabeçalho. Se a revisão entrasse antes da persona, o
 * prefixo mudaria a cada fala e o prefill inteiro seria recobrado. No fim, o 3B
 * relê só o rascunho.
 *
 * O enunciado é escrito em português porque a fala do Nilo é em português e é
 * ela que está sendo julgada — não há tabela de palavras-chave aqui, só texto
 * para o modelo ler.
 */
export function blocoDeRevisao(
    perguntaDoJogador: string,
    frases: readonly FraseNumerada[],
): string {
    return `

REVISÃO — NÃO É SUA VEZ DE FALAR.

Outro modelo escreveu o rascunho abaixo como resposta de Nilo para a mensagem
do jogador: "${perguntaDoJogador.trim()}"

${listaParaRevisao(frases)}

Confira cada frase contra a sua identidade, o cânone, seus olhos e sua vontade.

- Se TODAS estiverem aceitáveis, responda exatamente: OK
- Se alguma estiver errada, responda uma linha por frase errada, assim:
  FIX <número>: <a frase corrigida, inteira>

Corrija no máximo duas, e só as que estiverem erradas de fato — as outras vão
para a tela exatamente como estão. Não reescreva o rascunho inteiro e não
explique nada.`;
}
