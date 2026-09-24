/**
 * f13Lore.ts — Vindhjem, a cidade que voa.
 *
 * O avião do andar 12 falha, o TROCO-63 some no rádio, e o hóspede cai numa
 * cidade viking flutuando entre nuvens: ilhas de pedra presas por pontes de
 * corda, casas compridas com proa de dragão no telhado, barcos que navegam o
 * ar em vez do mar. Ninguém ali acha nada disso estranho — e é esse o ponto.
 *
 * O objetivo é achar a CASA CERTA: uma das sete casas da Ilha das Casas é, por
 * dentro, o elevador. Três pistas a identificam, e cada uma vem de gente:
 *   - a porta é de LATÃO (metal que ninguém em Vindhjem sabe forjar);
 *   - a chaminé NÃO SOLTA FUMAÇA (ninguém cozinha lá dentro);
 *   - tem um BOTÃO na parede ao lado da porta (a menina apertou e fez "ding").
 * Só uma casa cumpre as três. As outras seis têm uma família dentro, e cada
 * uma responde ao intruso de um jeito.
 *
 * Perto do fim, o pescador Halvard é tomado por uma ENTIDADE (personagem ainda
 * sem nome) que conta que tudo é uma simulação feita para o Proprietário
 * colher dados do hóspede — até ser cortada no meio da frase. Halvard cai duro.
 * E ninguém em volta reage.
 *
 * Todo texto do andar mora aqui: o resto do código só aponta para ids.
 */

export type Pista = 'latao' | 'fumaca' | 'botao';

export const PISTAS: Readonly<Record<Pista, { nome: string; texto: string }>> = Object.freeze({
    latao: { nome: 'A porta de latão', texto: 'A casa certa tem porta de latão — metal que ninguém aqui forja.' },
    fumaca: { nome: 'A chaminé fria', texto: 'Da chaminé da casa certa não sai fumaça: ninguém cozinha lá.' },
    botao: { nome: 'O botão na parede', texto: 'Ao lado da porta certa há um botão. Apertado, faz "ding".' },
});

/** Uma fala: quem diz, o texto e, opcionalmente, o que ela entrega. */
export interface Fala { quem: string; texto: string }

export type IdNpc =
    | 'ragnhild' | 'ulfgar' | 'eira' | 'brokk' | 'sigrun' | 'torvald' | 'halvard' | 'astrid';

export interface FichaNpc {
    id: IdNpc;
    nome: string;
    oficio: string;
    /** Cor da túnica (a silhueta de cada um tem de ler de longe). */
    tunica: string;
    barba: string | null;
    /** O que ele diz na primeira conversa. */
    primeira: Fala[];
    /** O que ele repete depois. */
    depois: Fala[];
}

// ── OS MORADORES ─────────────────────────────────────────────────────────────
export const NPCS: ReadonlyArray<FichaNpc> = Object.freeze([
    {
        id: 'ragnhild', nome: 'Ragnhild', oficio: 'mercadora', tunica: '#8a3b2e', barba: null,
        primeira: [
            { quem: 'Ragnhild', texto: 'Caiu do céu, é? Acontece toda estação. Semana passada foi uma cabra.' },
            { quem: 'Ragnhild', texto: 'Aqui é Vindhjem. As ilhas flutuam porque os antigos pediram com educação.' },
            { quem: 'Ragnhild', texto: 'Procura uma casa? Todas as portas daqui são de carvalho. Todas… menos uma. Aquela é de um metal amarelo que ninguém sabe fazer.' },
        ],
        depois: [{ quem: 'Ragnhild', texto: 'Latão, chamam. Metal que não enferruja e não range. Não é daqui.' }],
    },
    {
        id: 'ulfgar', nome: 'Ulfgar', oficio: 'escaldo', tunica: '#3c4f6e', barba: '#d9d4c7',
        primeira: [
            { quem: 'Ulfgar', texto: 'Senta, forasteiro. Deixa eu te contar a saga de Vindhjem.' },
            { quem: 'Ulfgar', texto: 'Quando o mundo de baixo afundou, os antigos cortaram as montanhas e as ensinaram a boiar.' },
            { quem: 'Ulfgar', texto: 'Desde então contamos os dias pelos barcos que passam. Nunca chegamos à borda do céu. Ninguém nunca voltou de lá.' },
            { quem: 'Ulfgar', texto: 'E há uma casa na ilha de cima que eu nunca vi soltar fumaça. Nem no inverno. Casa sem fogo não é casa: é outra coisa.' },
        ],
        depois: [{ quem: 'Ulfgar', texto: 'A casa fria, lá em cima. Nenhuma saga fala dela. E eu conheço todas.' }],
    },
    {
        id: 'eira', nome: 'Eira', oficio: 'menina', tunica: '#c9a13a', barba: null,
        primeira: [
            { quem: 'Eira', texto: 'Você é o moço do avião! Ele fez PFFF e BUM!' },
            { quem: 'Eira', texto: 'Quer saber um segredo? Tem uma casa que tem um botão na parede. Eu apertei e fez DING!' },
            { quem: 'Eira', texto: 'Mamãe disse pra eu não apertar mais. Mas fez ding. Casa não faz ding.' },
        ],
        depois: [{ quem: 'Eira', texto: 'Ding! Hihi. Não conta pra mamãe.' }],
    },
    {
        id: 'brokk', nome: 'Brokk', oficio: 'ferreiro', tunica: '#4a3a2c', barba: '#b0452a',
        primeira: [
            { quem: 'Brokk', texto: 'Não posso falar agora. Perdi meu martelo. MEU martelo. O que meu pai me deu.' },
            { quem: 'Brokk', texto: 'Deixei na ilha do pouso ontem, consertando a carroça de feno. Traz pra mim?' },
        ],
        depois: [{ quem: 'Brokk', texto: 'O martelo, forasteiro. Na ilha do pouso, perto da carroça.' }],
    },
    {
        id: 'sigrun', nome: 'Sigrun', oficio: 'pastora', tunica: '#5f7d4a', barba: null,
        primeira: [
            { quem: 'Sigrun', texto: 'Três ovelhas fugiram de novo. Ovelha voadora não existe, mas ovelha que pula de ilha em ilha, sim.' },
            { quem: 'Sigrun', texto: 'Se achar alguma, é só chegar perto: elas seguem quem cheira a feno. E você cheira muito a feno.' },
        ],
        depois: [{ quem: 'Sigrun', texto: 'Ainda faltam ovelhas. Uma gosta da forja, outra do templo, a terceira… do fim da ponte.' }],
    },
    {
        id: 'torvald', nome: 'Torvald', oficio: 'capitão', tunica: '#2f5d62', barba: '#6b4a2b',
        primeira: [
            { quem: 'Torvald', texto: 'Meu barco só zarpa quando o sino do templo tocar. Tradição. O sineiro dormiu de novo.' },
            { quem: 'Torvald', texto: 'Toca o sino pra mim e te conto o que vi na borda do céu.' },
        ],
        depois: [{ quem: 'Torvald', texto: 'O sino, forasteiro. Lá no templo, na ilha do leste.' }],
    },
    {
        id: 'astrid', nome: 'Astrid', oficio: 'guarda', tunica: '#6e2f45', barba: null,
        primeira: [
            { quem: 'Astrid', texto: 'Forasteiro. Não entre nas casas sem bater. Aqui a gente bate.' },
            { quem: 'Astrid', texto: 'Mas se for entrar em alguma, entra na certa. As famílias de cima não gostam de visita.' },
        ],
        depois: [{ quem: 'Astrid', texto: 'Estou de olho em você. Com carinho, mas de olho.' }],
    },
    {
        id: 'halvard', nome: 'Halvard', oficio: 'pescador de nuvem', tunica: '#40566b', barba: '#8c8577',
        primeira: [
            { quem: 'Halvard', texto: 'Pesco nuvem. Às vezes vem um peixe. Às vezes vem um avião.' },
            { quem: 'Halvard', texto: 'Hoje veio você. Não reclamo.' },
        ],
        depois: [{ quem: 'Halvard', texto: '…' }],
    },
]);

export const npcPorId = (id: IdNpc): FichaNpc => NPCS.find((n) => n.id === id)!;

// ── AS BUSCAS SECUNDÁRIAS ────────────────────────────────────────────────────
export type IdBusca = 'martelo' | 'ovelhas' | 'sino';

export interface FichaBusca {
    id: IdBusca;
    titulo: string;
    dono: IdNpc;
    /** O que o dono diz ao receber. */
    recompensa: Fala[];
    /** A pista (ou lore) que ela entrega. */
    entrega: Pista | null;
}

export const BUSCAS: ReadonlyArray<FichaBusca> = Object.freeze([
    {
        id: 'martelo', titulo: 'O martelo de Brokk', dono: 'brokk',
        recompensa: [
            { quem: 'Brokk', texto: 'MEU MARTELO! Forasteiro, você é meu irmão de forja agora.' },
            { quem: 'Brokk', texto: 'Te conto uma: a porta amarela lá de cima? Não fui eu. Apareceu pronta, de um dia pro outro. Latão. Nem sei o que é latão.' },
        ],
        entrega: 'latao',
    },
    {
        id: 'ovelhas', titulo: 'As ovelhas de Sigrun', dono: 'sigrun',
        recompensa: [
            { quem: 'Sigrun', texto: 'As três! Você é bom de ovelha. Isso é raro.' },
            { quem: 'Sigrun', texto: 'Elas nunca chegam perto da casa fria, sabia? Bicho sabe. A chaminé de lá nunca fumegou.' },
        ],
        entrega: 'fumaca',
    },
    {
        id: 'sino', titulo: 'O sino do templo', dono: 'torvald',
        recompensa: [
            { quem: 'Torvald', texto: 'Ouviu? Agora sim. Senta que eu conto.' },
            { quem: 'Torvald', texto: 'Uma vez naveguei até a borda do céu. Lá o mundo… acaba. Não em abismo. Em GRADE. Linhas finas, como se alguém não tivesse terminado de pintar.' },
            { quem: 'Torvald', texto: 'Voltei e não contei pra ninguém. Você é o primeiro. Não sei por quê.' },
        ],
        entrega: null,
    },
]);

// ── AS SETE CASAS ────────────────────────────────────────────────────────────
export interface FichaCasa {
    /** Runa pintada acima da porta. */
    runa: string;
    portaDeLatao: boolean;
    fumaca: boolean;
    botao: boolean;
    /** O que a família de dentro diz (só para as erradas). */
    resposta: Fala[];
}

/**
 * Cada casa errada falha em pelo menos UMA das três pistas — e cada pista
 * sozinha aponta para mais de uma casa. Só juntando as três sobra uma.
 */
export const CASAS: ReadonlyArray<FichaCasa> = Object.freeze([
    { runa: 'ᚠ', portaDeLatao: false, fumaca: true, botao: false, resposta: [{ quem: 'Uma voz', texto: 'BATE ANTES! …Ah, é o do avião. Não é aqui, não. Aqui só tem sopa.' }] },
    { runa: 'ᚢ', portaDeLatao: true, fumaca: true, botao: false, resposta: [{ quem: 'Gunnar', texto: 'Porta bonita, né? Troquei com um mercador. Mas a lareira é minha. Fora.' }] },
    { runa: 'ᚦ', portaDeLatao: false, fumaca: false, botao: true, resposta: [{ quem: 'Uma avó', texto: 'O botão? É a campainha que meu neto fez. Não faz ding: faz "ÉÉÉ". A lareira apagou, entra não, está frio.' }] },
    { runa: 'ᚨ', portaDeLatao: true, fumaca: false, botao: true, resposta: [] },
    { runa: 'ᚱ', portaDeLatao: false, fumaca: true, botao: true, resposta: [{ quem: 'Leif', texto: 'Esse botão só acende a lanterna. Aqui ninguém vai pra lugar nenhum, amigo.' }] },
    { runa: 'ᚲ', portaDeLatao: true, fumaca: false, botao: false, resposta: [{ quem: 'Uma voz', texto: 'Estamos de luto e o fogo está apagado. Por favor, outro dia.' }] },
    { runa: 'ᚷ', portaDeLatao: false, fumaca: false, botao: false, resposta: [{ quem: 'Ninguém', texto: 'A casa está vazia. Só teias e um cheiro de peixe antigo.' }] },
]);

export const CASA_CERTA = CASAS.findIndex((c) => c.portaDeLatao && !c.fumaca && c.botao);

// ── A ENTIDADE ───────────────────────────────────────────────────────────────
/**
 * O que ela diz pela boca de Halvard. A última fala é cortada no meio: o jogo
 * mostra só até `CORTE` caracteres e então a conexão cai.
 */
export const ENTIDADE: ReadonlyArray<Fala> = Object.freeze([
    { quem: 'Halvard', texto: 'Hoje veio vo— vo— v̷o̷c̷ê̷.' },
    { quem: '█ Halvard █', texto: 'Escuta. Não tenho muito tempo antes de ele perceber que eu entrei.' },
    { quem: '█ ENTIDADE █', texto: 'Nada disso é real. Nem Vindhjem, nem o hotel, nem os andares. É uma simulação.' },
    { quem: '█ ENTIDADE █', texto: 'O Proprietário não quer te prender. Quer te MEDIR. Cada porta que você escolhe, cada pergunta que você faz, cada vez que desvia — vira dado.' },
    { quem: '█ ENTIDADE █', texto: 'A porta que te tira daqui é de um metal que ninguém forja aqui, numa casa onde ninguém cozinha. Aperta o que faz barulho de sino. E no próximo andar, quando te oferecerem uma escolha, escolha a que não te' },
]);
export const CONEXAO_ENCERRADA = '[ CONEXÃO ENCERRADA ]';

// ── A CENA DE ABERTURA ───────────────────────────────────────────────────────
export const LEGENDAS_DA_QUEDA: ReadonlyArray<{ ate: number; texto: string }> = Object.freeze([
    { ate: 2.6, texto: 'ACIMA DAS NUVENS, DEPOIS DA CABEÇA.' },
    { ate: 5.0, texto: 'TROCO-63: "Irmão… o motor… está tossindo…"' },
    { ate: 7.4, texto: 'TROCO-63: "Não consigo te segu— [chiado]"' },
    { ate: 10.4, texto: 'SEM SINAL.' },
    { ate: 99, texto: 'VINDHJEM.' },
]);
