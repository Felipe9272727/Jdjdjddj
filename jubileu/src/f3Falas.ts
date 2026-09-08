/**
 * f3Falas.ts — A VOZ DO DIABRETE ENQUANTO SE JOGA.
 *
 * ── O BURACO QUE ISTO TAPA ───────────────────────────────────────────────────
 *
 * O andar já tem o gancho de história, e é bom: o Diabrete abre dizendo que a
 * escadaria é DELE, que cada plataforma é ele que rabisca no traço, e que sem os
 * três pincéis ele não desenha nada. Depois disso ele fica MUDO. Sobe-se o andar
 * inteiro, levam-se espinhos na cara, roubam-se os pincéis dele um a um — e o
 * cara que prometeu desenhar o seu fracasso não diz uma palavra até despencar.
 *
 * A história do Andar 3 não é a cutscene: é o desmonte de um sujeito. Ele começa
 * dono do lugar e termina pendurado num abismo implorando. Esse arco tem de
 * acontecer ENQUANTO SE JOGA, senão é só uma barra de progresso com três pincéis.
 *
 * Então ele narra a própria derrota. Cada coisa que acontece no andar tem
 * resposta dele, e o TOM muda conforme os pincéis somem: dono do lugar → irritado
 * → nervoso → desesperado. Quem conta a história é a mecânica; as falas só dizem
 * em voz alta o que ela já está fazendo.
 *
 * ── POR QUE MÓDULO PURO ──────────────────────────────────────────────────────
 *
 * Para dar para testar o que importa: que todo evento tem fala, que ele nunca
 * repete a mesma duas vezes seguidas (nada mata um personagem mais rápido), que
 * a escalada dos pincéis está na ordem certa, e que a fala expira. Nada aqui
 * sorteia: o rodízio é um cursor, então a mesma partida dá a mesma sequência.
 */

export type EventoDoDiabrete =
    | 'desenhou'    // ele acabou de rabiscar um obstáculo novo
    | 'espetou'     // o jogador comeu os espinhos
    | 'roubou'      // sumiu um pincel (o tom depende de quantos sobraram)
    | 'caiu'        // o jogador foi para o vazio
    | 'provoca';    // provocação de ócio, no meio da escalada

export interface Fala {
    texto: string;
    /** Quanto tempo ela fica no ar, em segundos. */
    dura: number;
}

// ── AS FALAS ─────────────────────────────────────────────────────────────────
// Registro de vilão de curta de 1930, o mesmo do `diabreteScript`: exclamação,
// CAIXA ALTA no acento da piada, e o apelido na cara do jogador.

const DESENHOU: Fala[] = [
    { texto: 'Toma! Rabisquei uns espinhos pra ti, de graça!', dura: 3.0 },
    { texto: 'Olha o TRAÇO! Espinho fresquinho, saindo do forno!', dura: 3.0 },
    { texto: 'Cuidado com a tinta, tá molhadinha! HAHAHA!', dura: 3.0 },
    { texto: 'Mais um degrau, mais uma gracinha minha!', dura: 2.8 },
    { texto: 'Eu desenho mais rápido do que tu pula, perna-curta!', dura: 3.2 },
];

const ESPETOU: Fala[] = [
    { texto: 'AI! Doeu? Doeu, né? Que PENA!', dura: 2.6 },
    { texto: 'Ó o desenho funcionando! Que artista, eu!', dura: 2.8 },
    { texto: 'Isso é pra aprender a olhar onde pisa!', dura: 2.8 },
    { texto: 'Espinho meu não erra, gracinha!', dura: 2.6 },
];

const CAIU: Fala[] = [
    { texto: 'HAHAHA! Voa, passarinho! Volta quando aprender!', dura: 3.2 },
    { texto: 'Escreve aí: um a zero pro DIABRETE!', dura: 3.0 },
    { texto: 'O chão é longe, né? Eu que desenhei ele assim!', dura: 3.2 },
];

const PROVOCA: Fala[] = [
    { texto: 'Tá cansando, perna-curta?', dura: 2.6 },
    { texto: 'Eu já tô LÁ EM CIMA, ó!', dura: 2.4 },
    { texto: 'Devagar assim tu não pega nem o meu cheiro!', dura: 3.0 },
    { texto: 'Quer que eu desenhe uma escadinha de mão pra ti?', dura: 3.2 },
    { texto: 'Isso, sobe. Quanto mais alto, mais bonito o tombo!', dura: 3.2 },
];

// ── A ESCALADA DO ROUBO ──────────────────────────────────────────────────────
// Esta é a história inteira em três falas. Ele não perde um item: ele perde a
// FERRAMENTA, e com ela o direito de mandar no lugar. Por isso a fala do último
// pincel não está aqui — ela é a cutscene da queda, que é onde ele finalmente
// pede socorro para quem ele passou o andar todo humilhando.
const ROUBOU: Fala[] = [
    { texto: 'EI! EI! Aquele é MEU! Larga o meu pincel, ladrão!', dura: 3.4 },
    { texto: 'P-para com isso! Com um só eu mal faço um RISCO!', dura: 3.4 },
    { texto: 'N-não… esse não… sem ele eu não sou NADA aqui…', dura: 3.6 },
];

// ── E DEPOIS QUE O ANDAR COMEÇA A FALTAR ─────────────────────────────────────
//
// A partir da volta em que o Andar 3 se desfaz junto com o dono (`f3Desenho`:
// as setas desbotam com um pincel roubado, somem com dois, e o tabuado rareia),
// as falas dele ficaram DESATUALIZADAS. Ele continuava se gabando do traço
// enquanto o traço sumia do chão atrás dele — a mecânica dizia uma coisa e a
// boca dizia outra, e é a boca que o jogador escuta.
//
// Então ele passa a comentar o estrago. Não é um evento novo: são os MESMOS
// eventos, com outro repertório depois que a primeira ferramenta some. É assim
// que um personagem muda de tom sem precisar de mais uma cutscene.
const DESENHOU_ESTRAGADO: Fala[] = [
    { texto: 'Com dois pincéis ainda dá pra estragar o teu dia, ó!', dura: 3.2 },
    { texto: 'Tá torto? Tá torto porque tu MEXEU nas minhas coisas!', dura: 3.4 },
    { texto: 'Esse aqui saiu meio borrado… culpa TUA, ladrão!', dura: 3.2 },
];

const PROVOCA_ESTRAGADO: Fala[] = [
    { texto: 'Olha o que tu fez com a minha escadaria!', dura: 3.0 },
    { texto: 'Olha as setas! Sem tinta, tremendo… culpa TUA!', dura: 3.4 },
    { texto: 'Tá vendo o tabuado sumindo? Eu não tenho MÃO pra tudo!', dura: 3.6 },
    { texto: 'Devolve, vai! Eu prometo que só espeto um pouquinho!', dura: 3.4 },
];

const BANCO: Record<EventoDoDiabrete, Fala[]> = {
    desenhou: DESENHOU, espetou: ESPETOU, caiu: CAIU, provoca: PROVOCA, roubou: ROUBOU,
};

/** O repertório depois que o andar começa a faltar. */
const BANCO_ESTRAGADO: Partial<Record<EventoDoDiabrete, Fala[]>> = {
    desenhou: DESENHOU_ESTRAGADO,
    provoca: PROVOCA_ESTRAGADO,
};

/** Quantos pincéis já foram roubados quando a fala de roubo é escolhida. */
export interface Contexto { roubados?: number }

// Cursor por evento: rodízio, não sorteio. A mesma partida conta a mesma
// história, e nunca sai a mesma fala duas vezes seguidas.
const cursor: Record<EventoDoDiabrete, number> = {
    desenhou: 0, espetou: 0, caiu: 0, provoca: 0, roubou: 0,
};

export function escolherFala(evento: EventoDoDiabrete, ctx: Contexto = {}): Fala {
    // O roubo NÃO roda em círculo: ele escala. A fala é a do pincel que acabou
    // de sumir, então ela depende da contagem e não do cursor.
    if (evento === 'roubou') {
        const i = Math.max(1, Math.min(ROUBOU.length, ctx.roubados ?? 1)) - 1;
        return ROUBOU[i];
    }
    // Com ferramenta faltando, ele fala do estrago — quando há repertório para
    // isso. O cursor é o MESMO, então trocar de repertório no meio da escalada
    // não faz ele repetir a fala que acabou de dizer.
    const estragado = (ctx.roubados ?? 0) >= 1;
    const lista = (estragado && BANCO_ESTRAGADO[evento]) || BANCO[evento];
    const f = lista[cursor[evento] % lista.length];
    cursor[evento] += 1;
    return f;
}

// ── O QUE ESTÁ NO AR AGORA ───────────────────────────────────────────────────

export const f3Fala = {
    texto: '',
    ate: 0,        // performance.now() em que ela sai do ar
    dura: 0,       // segundos que ela fica no ar — a BOCA precisa disto, não o HUD
    serie: 0,      // sobe a cada fala nova (o HUD compara isto, não a string)
};

/**
 * O que o assinante recebe quando ele abre a boca. O HUD só quer saber QUE
 * falou; a VOZ (`f3Voz`/`floor3Sfx`) precisa saber o TEXTO e em que altura do
 * arco ele está, porque o timbre dele envelhece a cada pincel perdido.
 *
 * Isto anda por parâmetro, e não por import, DE PROPÓSITO: este módulo é puro e
 * roda em teste sem navegador. Quem tem WebAudio é quem assina.
 *
 * E só carrega o que alguém lê. Chegou a levar o `evento` junto, que ninguém
 * consumia — é a mesma classe de defeito que `f3Coerencia` varre no andar: campo
 * escrito, tipado, e morto.
 */
export interface FalaViva extends Fala {
    roubados: number;
}

let _avisar: ((f: FalaViva) => void) | null = null;
/** O HUD se inscreve aqui para saber que tem fala nova sem varrer por quadro. */
export function aoFalar(cb: ((f: FalaViva) => void) | null): void { _avisar = cb; }

const agora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * O Diabrete diz alguma coisa.
 *
 * Uma fala nova SEMPRE atropela a anterior: num andar em que ele desenha, espeta
 * e é roubado, esperar a vez faria a reação chegar depois do que ela comenta —
 * e reação atrasada não é personagem, é legenda.
 */
export function dizer(evento: EventoDoDiabrete, ctx: Contexto = {}): Fala {
    const f = escolherFala(evento, ctx);
    f3Fala.texto = f.texto;
    f3Fala.ate = agora() + f.dura * 1000;
    f3Fala.dura = f.dura;
    f3Fala.serie += 1;
    _avisar?.({ ...f, roubados: Math.max(0, Math.floor(ctx.roubados ?? 0) || 0) });
    return f;
}

/** A fala que está no ar, ou string vazia. */
export function falaViva(t = agora()): string {
    return t < f3Fala.ate ? f3Fala.texto : '';
}

export function limparFalas(): void {
    f3Fala.texto = ''; f3Fala.ate = 0; f3Fala.dura = 0; f3Fala.serie = 0;
    for (const k of Object.keys(cursor) as EventoDoDiabrete[]) cursor[k] = 0;
}

// DEV-ONLY: a bancada precisa poder fazê-lo falar sem jogar o andar inteiro.
// Sem isto a única forma de fotografar o balão de grito seria dirigir o parkour
// pelo teclado num navegador a 2 fps, que é como não fotografar.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
    (window as unknown as { __f3Dizer?: typeof dizer }).__f3Dizer = dizer;
}
