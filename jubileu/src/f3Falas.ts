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

const BANCO: Record<EventoDoDiabrete, Fala[]> = {
    desenhou: DESENHOU, espetou: ESPETOU, caiu: CAIU, provoca: PROVOCA, roubou: ROUBOU,
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
    const lista = BANCO[evento];
    const f = lista[cursor[evento] % lista.length];
    cursor[evento] += 1;
    return f;
}

// ── O QUE ESTÁ NO AR AGORA ───────────────────────────────────────────────────

export const f3Fala = {
    texto: '',
    ate: 0,        // performance.now() em que ela sai do ar
    serie: 0,      // sobe a cada fala nova (o HUD compara isto, não a string)
};

let _avisar: (() => void) | null = null;
/** O HUD se inscreve aqui para saber que tem fala nova sem varrer por quadro. */
export function aoFalar(cb: (() => void) | null): void { _avisar = cb; }

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
    f3Fala.serie += 1;
    _avisar?.();
    return f;
}

/** A fala que está no ar, ou string vazia. */
export function falaViva(t = agora()): string {
    return t < f3Fala.ate ? f3Fala.texto : '';
}

export function limparFalas(): void {
    f3Fala.texto = ''; f3Fala.ate = 0; f3Fala.serie = 0;
    for (const k of Object.keys(cursor) as EventoDoDiabrete[]) cursor[k] = 0;
}

// DEV-ONLY: a bancada precisa poder fazê-lo falar sem jogar o andar inteiro.
// Sem isto a única forma de fotografar o balão de grito seria dirigir o parkour
// pelo teclado num navegador a 2 fps, que é como não fotografar.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
    (window as unknown as { __f3Dizer?: typeof dizer }).__f3Dizer = dizer;
}
