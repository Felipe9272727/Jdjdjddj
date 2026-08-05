// ── A CAIXA-PRETA DO ANDAR 10 ─────────────────────────────────────────────
//
// POR QUE ISTO EXISTE, sem rodeio: quem tem o aparelho é o Felipe, e quem lê o
// código sou eu. Toda vez que algo quebra, a informação chega assim: "o celular
// trava", "não volta a pensar", "demora 10 anos". São descrições honestas e
// corretas — e mesmo assim eu passei horas desta sessão LENDO CÓDIGO E CHUTANDO,
// até construir um wllama falso e achar dois defeitos em minutos. A diferença
// não foi esperteza: foi enxergar.
//
// Esta é a segunda metade desse conserto. O jogo passa a anotar o que de fato
// aconteceu no aparelho de quem joga — quem carregou, quem interrompeu quem,
// quantos tokens saíram, quanto tempo cada coisa levou, quanto espaço havia — e
// entrega tudo num texto que cabe numa mensagem. Um toque no botão do ?bancada,
// e o palpite vira medição.
//
// REGRAS QUE ESTE ARQUIVO SEGUE:
// - Custo perto de zero: só grava em EVENTOS (poucos por minuto), nunca por
//   quadro, e o buffer é circular com teto fixo. Não pode ser mais um peso no
//   celular que ele existe para investigar.
// - Nada de dados pessoais: só estado da máquina e do NPC. O que o jogador
//   escreve NUNCA entra aqui.
// - Sobrevive à falha: se o registro quebrar, o jogo não pode nem piscar.

/** Teto do buffer circular. ~200 eventos cobrem vários minutos de Andar 10. */
import { resumoDosEngasgos } from './floor10Engasgo';
// Mesmo par de mão dupla do medidor de engasgo acima: ele anota aqui, este lê
// o resumo de lá. O ciclo já existia com o engasgo e funciona porque nenhum dos
// dois lados usa o outro em tempo de MÓDULO — só dentro de funções.
import { resumoDeMemoria } from './floor10Memoriametro';

export const CAIXA_PRETA_TETO = 200;

export type EventoCaixaPreta = {
    /** ms desde o carregamento da página. */
    t: number;
    /** Rótulo curto e estável, do tipo que dá para procurar depois. */
    tipo: string;
    /** Números e strings curtas. Nada de objeto grande aqui dentro. */
    dados?: Record<string, string | number | boolean | null>;
};

const eventos: EventoCaixaPreta[] = [];
const nascimento = Date.now();

function agora(): number {
    return Date.now() - nascimento;
}

/**
 * Anota um evento. Nunca lança: um erro no diagnóstico não pode derrubar o que
 * ele diagnostica.
 */
export function anotar(
    tipo: string,
    dados?: Record<string, string | number | boolean | null | undefined>,
): void {
    try {
        const limpo: Record<string, string | number | boolean | null> = {};
        if (dados) {
            for (const [chave, valor] of Object.entries(dados)) {
                if (valor === undefined) continue;
                limpo[chave] = typeof valor === 'number' && Number.isFinite(valor)
                    ? Math.round(valor * 100) / 100
                    : valor as string | number | boolean | null;
            }
        }
        eventos.push({ t: agora(), tipo, dados: Object.keys(limpo).length ? limpo : undefined });
        if (eventos.length > CAIXA_PRETA_TETO) eventos.splice(0, eventos.length - CAIXA_PRETA_TETO);
    } catch { /* diagnóstico nunca atrapalha */ }
}

export function eventosDaCaixaPreta(): readonly EventoCaixaPreta[] {
    return eventos;
}

export function limparCaixaPreta(): void {
    eventos.length = 0;
}

function segundos(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`;
}

/** Uma linha por evento, no formato mais legível possível numa mensagem. */
export function formatarEvento(evento: EventoCaixaPreta): string {
    const cabeca = `[${segundos(evento.t).padStart(7)}] ${evento.tipo}`;
    if (!evento.dados) return cabeca;
    const corpo = Object.entries(evento.dados)
        .map(([chave, valor]) => `${chave}=${valor}`)
        .join(' ');
    return `${cabeca} · ${corpo}`;
}

export type ContextoCaixaPreta = {
    build?: string;
    aparelho?: string;
    nucleos?: number;
    isolado?: boolean;
    persistido?: boolean;
    cotaGB?: number | null;
    usoGB?: number | null;
};

/**
 * O texto que o dono do jogo copia e me manda.
 *
 * A ordem importa: primeiro O QUE É (build e aparelho), porque sem isso os
 * eventos não significam nada — já perdi tempo nesta sessão analisando um
 * comportamento de um build que não era o que estava no ar.
 */
export function relatorioCaixaPreta(contexto: ContextoCaixaPreta = {}): string {
    const cabecalho = [
        '=== ANDAR 10 · CAIXA-PRETA ===',
        `build: ${contexto.build ?? '?'}`,
        `aparelho: ${contexto.aparelho ?? '?'}`,
        `núcleos: ${contexto.nucleos ?? '?'} · isolado: ${contexto.isolado ?? '?'}`,
        `armazenamento: ${contexto.usoGB ?? '?'} GB usados de ${contexto.cotaGB ?? '?'} GB`
        + ` · persistido: ${contexto.persistido ?? '?'}`,
        `eventos: ${eventos.length}${eventos.length >= CAIXA_PRETA_TETO ? ' (buffer cheio, só o fim)' : ''}`,
        // ── O ENGASGO ENTRA NO CABEÇALHO, NÃO NO MEIO DOS EVENTOS ─────────
        // "o jogo trava uns 10s ao enviar" é a queixa que nove execuções em
        // celular emulado NÃO reproduziram. O relatório copiável é o único
        // caminho até esse dado — e ele precisa estar na primeira tela de quem
        // lê, não enterrado numa lista de cinquenta eventos.
        resumoDosEngasgos(),
        // ── E A MEMÓRIA, QUE É O QUE DERRUBA A ABA ────────────────────────
        // "meu celular até desligou sozinho" é assinatura de memória, não de
        // calor — calor degrada devagar, o OOM killer mata sem aviso. Tudo o
        // que eu sabia de RAM até aqui veio de um celular EMULADO numa caixa
        // x86; esta linha é o primeiro número vindo do aparelho de quem joga.
        resumoDeMemoria(),
        '',
    ];
    if (eventos.length === 0) {
        cabecalho.push('(nada registrado — o Andar 10 não chegou a rodar nesta sessão)');
        return cabecalho.join('\n');
    }
    return cabecalho.concat(eventos.map(formatarEvento)).join('\n');
}

/**
 * Junta o contexto do aparelho e devolve o relatório pronto. Assíncrono só por
 * causa do `storage.estimate()`, que é a informação que mais me faltou.
 */
export async function coletarRelatorio(): Promise<string> {
    const nav = globalThis.navigator as (Navigator & {
        storage?: { estimate?: () => Promise<{ quota?: number; usage?: number }>; persisted?: () => Promise<boolean> };
    }) | undefined;
    let cotaGB: number | null = null;
    let usoGB: number | null = null;
    let persistido: boolean | undefined;
    try {
        const est = await nav?.storage?.estimate?.();
        if (typeof est?.quota === 'number') cotaGB = Math.round(est.quota / 1e8) / 10;
        if (typeof est?.usage === 'number') usoGB = Math.round(est.usage / 1e8) / 10;
        persistido = await nav?.storage?.persisted?.();
    } catch { /* navegador sem StorageManager */ }

    const build = (globalThis as { __TNE_BUILD__?: { build?: string } }).__TNE_BUILD__?.build;
    return relatorioCaixaPreta({
        build,
        // userAgent identifica o MODELO do aparelho, que é o que explica
        // big.LITTLE, RAM e térmica. Não identifica a pessoa.
        aparelho: nav?.userAgent?.slice(0, 120),
        nucleos: nav?.hardwareConcurrency,
        isolado: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : undefined,
        persistido,
        cotaGB,
        usoGB,
    });
}

// Atalho de console para quem estiver no desktop. No celular quem serve é o
// botão do ?bancada — DevTools no telefone não é uma opção real.
try {
    (globalThis as { __caixaPreta?: () => Promise<string> }).__caixaPreta = coletarRelatorio;
} catch { /* ambiente sem globalThis gravável */ }
