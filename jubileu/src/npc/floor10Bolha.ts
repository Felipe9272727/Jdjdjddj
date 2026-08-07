// ── A BOLHA DEIXA DE SER UM DISCO RISCADO ─────────────────────────────────
//
// O pedido do dono do jogo:
//
//   "queria que as frases pré prontas do 'approach player' o lfm conseguisse
//    modificar pra ele fazer as perguntas pro player, e soar menos artificial"
//
// O QUE EXISTIA: oito frases, uma por meta, escritas por mim, para sempre.
// `approach-player` era SEMPRE "acho que vou chegar mais perto." — e como a
// vontade escolhe `approach-player` na maioria das rodadas, o jogador via a
// mesma frase dezenas de vezes por partida. Nenhum modelo de linguagem estava
// envolvido na única coisa que o jogador realmente lê.
//
// O QUE ESTE ARQUIVO FAZ: o micro (SmolLM2-135M, o mesmo do reflexo, que já
// está residente FORA da conversa e responde em menos de um segundo) escreve a
// linha a partir do pensamento que a vontade acabou de ter. As frases prontas
// continuam aqui, agora com variantes, como CHÃO — nunca como teto.
//
// ── A REGRA QUE MANDA EM TUDO AQUI ────────────────────────────────────────
//
// Isto escreve na tela do jogador. Um resumo ruim do compressor ninguém vê; uma
// bolha ruim é a cara do personagem. Então a validação é deliberadamente
// severa e o padrão é RECUSAR: qualquer coisa em inglês, com rótulo técnico,
// com aspas soltas, longa demais ou parecida com o que ele acabou de dizer é
// jogada fora e a frase pronta entra no lugar. Perder uma geração boa por
// excesso de zelo custa uma frase repetida. Deixar passar uma ruim custa a
// ilusão do personagem, que é o produto.
import type { DeliberationGoal } from './floor10Deliberation';

/** Quantas linhas ele lembra de ter dito. Passa disso, pode repetir sem soar disco riscado. */
export const BOLHAS_LEMBRADAS = 8;

/** Teto de letras da bolha. Acima disso ela cobre a tela num celular. */
export const BOLHA_MAX_LETRAS = 72;

/**
 * O micro é pequeno e a bolha é curta: 32 tokens sobram. O teto de tempo é o
 * que mais importa — isto roda no meio do passeio dele, e uma bolha que chega
 * cinco segundos depois da decisão descreve uma decisão que já passou.
 */
export const BOLHA_TIMEOUT_MS = 2_500;

// ── AS FRASES PRONTAS VIRAM VÁRIAS ────────────────────────────────────────
//
// Mesmo sem modelo nenhum carregado, o disco riscado já melhora: cada meta tem
// de três a quatro leituras diferentes, e algumas são PERGUNTAS ao jogador —
// que é metade do que ele pediu. A memória (abaixo) evita que o sorteio caia
// duas vezes seguidas na mesma.
export const FRASES_DA_META: Record<DeliberationGoal, readonly string[]> = {
    'inspect-elevator': [
        'preciso olhar aquela porta outra vez…',
        'aquela porta abriu pra você?',
        'tem alguma coisa errada com o elevador.',
        'você já tentou chamar ele?',
    ],
    wander: [
        'não consigo ficar parado aqui.',
        'já andou por esse lado?',
        'esse corredor não termina.',
    ],
    idle: [
        'vou ficar quieto um pouco e escutar a sala.',
        'você ouviu isso também?',
        'fica quieto um segundo.',
    ],
    'observe-player': [
        'quero entender você antes de falar.',
        'faz quanto tempo que você está aqui?',
        'você não parece assustado. por quê?',
    ],
    'approach-player': [
        'acho que vou chegar mais perto.',
        'posso chegar perto?',
        'deixa eu ver você direito.',
        'você não vai fugir, vai?',
    ],
    'make-space': [
        'preciso de um pouco de espaço.',
        'me dá um minuto.',
        'não chega tão perto agora.',
        'dá pra você esperar ali?',
    ],
    'seek-player': [
        'para onde foi você?',
        'você ainda está aí?',
        'não some assim.',
    ],
    'talk-player': [
        'tem algo que eu queria te dizer.',
        'posso te perguntar uma coisa?',
        'você acredita em mim?',
    ],
};

/** Como a bolha soaria sem nenhum modelo: a primeira variante, a de sempre. */
export function fraseBase(meta: string): string {
    const lista = FRASES_DA_META[meta as DeliberationGoal];
    return lista?.[0] ?? 'decidi o que fazer.';
}

// ── A MEMÓRIA DO QUE ELE JÁ DISSE ─────────────────────────────────────────
//
// Vale para os dois caminhos: ela escolhe a variante pronta que ele ainda não
// usou E é o que impede o modelo de reescrever a mesma frase com outras
// palavras. Sem isto, "posso chegar perto?" e "posso me aproximar?" contariam
// como frases diferentes — para o jogador, são a mesma.
export class MemoriaDeBolhas {
    private ditas: string[] = [];

    /** Normaliza para comparar: sem acento, sem pontuação, sem caixa. */
    static chave(linha: string): string {
        return linha
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9 ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Parecida demais? Duas frases repetem quando compartilham a maior parte
     * das palavras com peso — as curtas ("de", "a", "eu") não contam, senão
     * qualquer par de frases em português passaria por igual.
     */
    static parecidas(a: string, b: string): boolean {
        const ca = MemoriaDeBolhas.chave(a);
        const cb = MemoriaDeBolhas.chave(b);
        if (!ca || !cb) return false;
        if (ca === cb) return true;
        const pesadas = (c: string) => new Set(c.split(' ').filter((p) => p.length > 3));
        const pa = pesadas(ca);
        const pb = pesadas(cb);
        if (pa.size === 0 || pb.size === 0) return false;
        let comuns = 0;
        for (const p of pa) if (pb.has(p)) comuns += 1;
        return comuns / Math.min(pa.size, pb.size) >= 0.7;
    }

    jaDisse(linha: string): boolean {
        return this.ditas.some((d) => MemoriaDeBolhas.parecidas(d, linha));
    }

    guardar(linha: string): void {
        if (!linha) return;
        this.ditas.push(linha);
        if (this.ditas.length > BOLHAS_LEMBRADAS) this.ditas.shift();
    }

    /** As últimas, da mais recente para a mais antiga. Vai no prompt. */
    recentes(quantas = 4): readonly string[] {
        return this.ditas.slice(-quantas).reverse();
    }

    limpar(): void { this.ditas = []; }
}

/** A variante pronta que ele ainda não usou; se todas já saíram, a menos recente. */
export function escolherFrase(meta: string, memoria: MemoriaDeBolhas): string {
    const lista = FRASES_DA_META[meta as DeliberationGoal];
    if (!lista || lista.length === 0) return 'decidi o que fazer.';
    const inedita = lista.find((f) => !memoria.jaDisse(f));
    // Todas já saíram: devolve a primeira mesmo assim. Repetir depois de quatro
    // variantes é muito melhor que a frase única de antes, e inventar aqui uma
    // quinta variante em tempo de execução seria concatenar texto — que é
    // exatamente a artificialidade que ele reclamou.
    return inedita ?? lista[0] ?? 'decidi o que fazer.';
}

// ── O PROMPT ──────────────────────────────────────────────────────────────
//
// Em português, porque a bolha é em português e pedir tradução a um modelo de
// 135M é pedir para ele errar. O pensamento da vontade entra em inglês do
// jeito que veio — traduzir antes seria outra chamada de modelo, e o micro lê
// inglês bem o suficiente para se inspirar nele.
export function promptDaBolha(
    meta: string,
    pensamento: string,
    recentes: readonly string[],
): string {
    const exemplos = FRASES_DA_META[meta as DeliberationGoal] ?? [];
    const linhas = [
        'Você é Nilo, um homem preso sozinho no 10º andar de um hotel.',
        'Alguém apareceu aqui. Escreva UMA frase curta que o Nilo diz em voz alta agora.',
        '',
        'REGRAS:',
        '- Em português do Brasil.',
        '- No máximo 10 palavras.',
        '- Fale com a pessoa, não sobre ela. Pode ser uma pergunta.',
        '- Sem aspas, sem asterisco, sem explicar. Só a frase.',
        '',
        `O QUE ELE ACABOU DE PENSAR: ${pensamento.slice(0, 200)}`,
        `NO ESPÍRITO DE: ${exemplos.slice(0, 2).join(' / ')}`,
    ];
    if (recentes.length > 0) {
        linhas.push(`JÁ DISSE HÁ POUCO (não repita): ${recentes.join(' / ')}`);
    }
    linhas.push('', 'A FRASE:');
    return linhas.join('\n');
}

// ── A PENEIRA ─────────────────────────────────────────────────────────────

/** Marcas de inglês que não existem em português. Uma delas basta para recusar. */
const INGLES = /\b(the|and|toward|towards|player|wall|door|i'm|i am|my|his|her|because|silence|steps?|forward|room)\b/i;

/** Rótulo técnico vazando do encanamento para a tela. */
const ROTULO = /(MOTION:|GOAL:|CHOICE:|ACT:|\[\[WILL:|approach-player|inspect-elevator|observe-player|make-space|seek-player|talk-player|<think>|\[End thinking\])/i;

/**
 * Devolve a frase pronta para a tela, ou '' quando não presta.
 *
 * Recusar é o padrão: quem chama já tem uma frase boa no bolso.
 */
export function limparBolha(bruto: string): string {
    if (typeof bruto !== 'string') return '';
    // Primeira linha não vazia: o micro às vezes começa com uma linha em branco
    // ou emenda uma segunda frase que não cabe na bolha.
    const primeira = bruto.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
    let linha = primeira
        // "Nilo: ..." e "Frase: ..." são eco do formato do prompt, não fala.
        .replace(/^(nilo|frase|resposta|a frase)\s*:\s*/i, '')
        .replace(/^[-–—*>\s]+/, '')
        .replace(/^["'«»“”]+|["'«»“”]+$/g, '')
        .replace(/\*/g, '')
        .trim();
    if (!linha) return '';
    if (ROTULO.test(linha)) return '';
    if (INGLES.test(linha)) return '';
    // Duas letras não são uma fala; e uma frase que passa muito do teto foi o
    // modelo ignorando o pedido, não uma fala longa — cortar no meio inventa
    // uma frase que ele não escreveu.
    if (linha.length < 4) return '';
    if (linha.length > BOLHA_MAX_LETRAS + 28) return '';
    if (linha.length > BOLHA_MAX_LETRAS) {
        const corte = linha.slice(0, BOLHA_MAX_LETRAS);
        const fim = Math.max(
            corte.lastIndexOf('.'), corte.lastIndexOf('?'),
            corte.lastIndexOf('!'), corte.lastIndexOf('…'),
        );
        if (fim < 8) return '';
        linha = corte.slice(0, fim + 1);
    }
    // Um parágrafo de instrução devolvido de volta não é fala.
    if (/\b(regras?|em português|no máximo|sem aspas)\b/i.test(linha)) return '';
    return linha;
}

/**
 * A BOLHA. Tenta o modelo, e cai na frase pronta em qualquer tropeço — modelo
 * ausente, tempo estourado, texto recusado pela peneira, ou frase que ele
 * acabou de dizer.
 *
 * `completar` entra por parâmetro para o teste poder medir a peneira sem
 * carregar 135 milhões de pesos.
 */
export async function gerarBolha(args: {
    meta: string;
    pensamento: string;
    memoria: MemoriaDeBolhas;
    completar: (prompt: string, tetoMs: number) => Promise<string>;
}): Promise<{ linha: string; doModelo: boolean }> {
    const reserva = escolherFrase(args.meta, args.memoria);
    const pensamento = (args.pensamento ?? '').trim();
    // Sem pensamento não há o que reescrever: a bolha seria uma invenção do
    // micro sobre nada, e aí a frase pronta é literalmente melhor.
    if (!pensamento) {
        args.memoria.guardar(reserva);
        return { linha: reserva, doModelo: false };
    }
    let bruto = '';
    try {
        bruto = await args.completar(
            promptDaBolha(args.meta, pensamento, args.memoria.recentes()),
            BOLHA_TIMEOUT_MS,
        );
    } catch {
        bruto = '';
    }
    const limpa = limparBolha(bruto);
    if (!limpa || args.memoria.jaDisse(limpa)) {
        args.memoria.guardar(reserva);
        return { linha: reserva, doModelo: false };
    }
    args.memoria.guardar(limpa);
    return { linha: limpa, doModelo: true };
}
