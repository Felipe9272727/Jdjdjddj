// ── O MEDIDOR DE ENGASGO, PARA RODAR NO APARELHO DE QUEM JOGA ──────────────
//
// POR QUE ELE EXISTE
// O dono do jogo relata: "sempre na hora de eu enviar a mensagem, o jogo ficava
// travado por um tempo e depois de 10 segundos mais ou menos voltava". Eu
// tentei reproduzir isso num celular emulado NOVE vezes e não consegui: quatro
// envios por execução, zero bloqueios longos. O único bloqueio que aparece aqui
// é da abertura do jogo, e um experimento de controle provou que ele acontece
// igual SEM carregar cérebro nenhum.
//
// Ou seja: o sintoma dele depende de alguma coisa que esta emulação não tem —
// memória real, térmica, o Chrome do Android, a rede. Insistir em adivinhar
// daqui já me custou duas conclusões erradas em um dia.
//
// Então em vez de continuar chutando, este módulo vai junto com o jogo e mede
// LÁ. O navegador sabe a resposta; basta que alguém pergunte no lugar certo.
//
// O QUE ELE MEDE, e por que é isto e não FPS
// Intervalo entre dois `requestAnimationFrame`. Um jogo saudável entrega um
// quadro a cada ~16ms. Quando o intervalo estoura, há duas assinaturas
// diferentes, e elas pedem consertos opostos:
//
//   um buraco ÚNICO e enorme ....... thread principal BLOQUEADA por trabalho
//                                    síncrono. Conserto: tirar esse trabalho
//                                    da thread principal.
//   muitos buracos MÉDIOS .......... núcleos disputados. Conserto: orçamento
//                                    de threads (hoje 4 de 8, medido).
//
// FPS médio não distingue as duas: 30 quadros por segundo com um buraco de 6s
// e 30 quadros por segundo constantes dão a mesma média e são problemas
// completamente diferentes.
//
// CUSTO: um `requestAnimationFrame` que já existiria de qualquer forma (o jogo
// desenha em rAF) e uma subtração por quadro. Não aloca por quadro: só guarda
// os buracos, que são raros por definição.
import { anotar } from './floor10CaixaPreta';

/** Abaixo disto é variação normal de quadro; não vale registrar. */
export const ENGASGO_MIN_MS = 250;

/** A partir daqui é "o jogo travou" e não "o jogo engasgou". */
export const ENGASGO_GRAVE_MS = 3_000;

/** Teto de registros: um jogo com problema crônico não pode encher a memória. */
export const ENGASGO_MAX = 60;

export type Engasgo = {
    /** Duração do buraco entre dois quadros. */
    ms: number;
    /** Instante em que terminou, na régua do `performance.now()`. */
    em: number;
    /** O que o NPC estava fazendo — é o que liga o buraco a uma causa. */
    fase: string;
};

const engasgos: Engasgo[] = [];
let ligado = false;
let ultimo = 0;
let idDoQuadro: number | null = null;

/** Só para os testes e para a bancada. */
export function engasgosRegistrados(): readonly Engasgo[] {
    return engasgos;
}

export function limparEngasgos(): void {
    engasgos.length = 0;
}

/**
 * Decide se um intervalo entre quadros merece registro.
 *
 * Pura de propósito: é a regra que separa ruído de sintoma, e ela precisa ser
 * testável sem navegador. O teto de 1s para cima existe porque o navegador
 * PAUSA o rAF quando a aba vai para segundo plano — e essa pausa não é engasgo
 * do jogo, é o sistema fazendo o certo. Registrá-la encheria o relatório de
 * falsos positivos justamente em quem alterna entre apps.
 */
export function ehEngasgo(dt: number, tetoDeAba = 30_000): boolean {
    return dt >= ENGASGO_MIN_MS && dt < tetoDeAba;
}

/**
 * Começa a vigiar. Chamar várias vezes é seguro.
 *
 * `faseAtual` entra por parâmetro para este módulo não importar o npcStore —
 * quem sabe a fase é quem chama, e assim o medidor serve para qualquer tela.
 */
export function vigiarEngasgos(faseAtual: () => string): void {
    if (ligado) return;
    if (typeof globalThis.requestAnimationFrame !== 'function') return;
    ligado = true;
    ultimo = 0;
    const tique = (t: number) => {
        if (ultimo > 0) {
            const dt = t - ultimo;
            if (ehEngasgo(dt) && engasgos.length < ENGASGO_MAX) {
                const fase = faseAtual();
                engasgos.push({ ms: Math.round(dt), em: Math.round(t), fase });
                // Os graves vão para a caixa-preta, que é o que o jogador
                // copia e manda. Os leves ficam só na lista, para a bancada.
                if (dt >= ENGASGO_GRAVE_MS) {
                    anotar('engasgo:grave', { ms: Math.round(dt), fase });
                }
            }
        }
        ultimo = t;
        idDoQuadro = globalThis.requestAnimationFrame(tique);
    };
    idDoQuadro = globalThis.requestAnimationFrame(tique);
}

export function pararDeVigiar(): void {
    if (idDoQuadro !== null) globalThis.cancelAnimationFrame?.(idDoQuadro);
    idDoQuadro = null;
    ligado = false;
}

/**
 * O resumo que vai no relatório copiável. Uma linha por causa provável, não
 * uma lista crua — quem lê precisa da conclusão, não dos dados brutos.
 */
export function resumoDosEngasgos(): string {
    if (engasgos.length === 0) return 'engasgos: nenhum acima de 250ms';
    const graves = engasgos.filter((e) => e.ms >= ENGASGO_GRAVE_MS);
    const pior = engasgos.reduce((a, b) => (b.ms > a.ms ? b : a));
    const porFase = new Map<string, number>();
    for (const e of graves) porFase.set(e.fase, (porFase.get(e.fase) ?? 0) + 1);
    const detalhe = [...porFase.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([fase, n]) => `${fase}×${n}`)
        .join(', ');
    return [
        `engasgos: ${engasgos.length} acima de 250ms`,
        `pior ${pior.ms}ms na fase "${pior.fase}"`,
        graves.length
            ? `travadas (>3s): ${graves.length} — ${detalhe}`
            : 'nenhuma travada acima de 3s',
    ].join(' · ');
}
