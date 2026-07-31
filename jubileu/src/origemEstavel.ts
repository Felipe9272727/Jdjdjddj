// ── POR QUE OS CÉREBROS BAIXAM DE NOVO A CADA COMMIT ──────────────────────
//
// Diagnóstico do dono do jogo, e ele está certo: "no vercel, sempre que tem um
// novo commit, o Chrome dá como se fosse outro site, e eu tenho que baixar dnv".
//
// Não é bug do cache, nem falta de espaço (a cota do aparelho dele são 12 GB, e
// os quatro cérebros somam ~4,2 GB — cabem folgados). É a REGRA DE ORIGEM do
// navegador. Todo armazenamento — OPFS onde o wllama guarda os .gguf, Cache
// Storage, IndexedDB, localStorage — é indexado por origem:
//
//     https://jdjdjddj-five.vercel.app            ← alias de produção, FIXO
//     https://jdjdjddj-a1b2c3d4e-escopo.vercel.app ← URL DO DEPLOY, muda a cada commit
//
// Para o Chrome essas duas são sites diferentes, tão diferentes quanto google e
// bing. Abrir a segunda não "perde" o cache: ele continua lá, guardado na
// primeira, inalcançável. E o cofre novo começa vazio — 4,2 GB de novo.
//
// Este módulo não conserta cache nenhum. Ele descobre que a página foi aberta
// numa origem descartável e oferece a única saída que existe: ir para a origem
// fixa, onde os pesos já estão.
//
// QUANDO O BUILD É O MESMO, NEM PERGUNTA. Se o endereço fixo já serve este
// mesmo commit, ir para lá não custa nada e economiza 4,2 GB — o salto é
// automático. Quando os commits diferem, quem decide é quem está testando: pode
// ser exatamente o build novo que ele quer ver. Aí a tela mostra os dois lados e
// espera.

/** O alias de produção do projeto. Sobrescrevível para testar outro deploy. */
export const ORIGEM_ESTAVEL = (globalThis as { __origemEstavel?: string }).__origemEstavel
    ?? 'jdjdjddj-five.vercel.app';

/** Carimbo gravado no HTML pelo inline-build.mjs. */
export type BuildStamp = {
    /**
     * A IDENTIDADE: hash do conteúdo do index.html. É por ele que se compara —
     * o commit não serve, porque o build é gerado antes de existir o commit que
     * o publica, e rebuildar o mesmo código geraria um id novo à toa.
     */
    build: string;
    /** SHA curto do commit em que o build foi gerado. Informativo. */
    commit: string;
    /** Branch de onde saiu o build. */
    ref: string;
    /** ISO da geração. */
    built: string;
};

/** Deploys anteriores ao hash de conteúdo só tinham `commit`; ainda valem. */
export function identidadeDoBuild(stamp: BuildStamp | null): string | null {
    if (!stamp) return null;
    return stamp.build || stamp.commit || null;
}

export type Origem =
    /** Endereço fixo, domínio próprio, localhost, file:// — nada a fazer. */
    | { tipo: 'estavel' }
    /** URL de deploy/preview do Vercel: cofre novo a cada commit. */
    | { tipo: 'descartavel'; host: string; destino: string };

/**
 * Só as URLs `*.vercel.app` que não são o alias fixo entram na regra. Um
 * domínio próprio, localhost ou file:// não têm esse problema e não podem ser
 * arrastados para lugar nenhum.
 *
 * O alias de branch (`projeto-git-branch-escopo.vercel.app`) TAMBÉM cai aqui, e
 * de propósito: ele é estável entre commits da mesma branch, mas continua sendo
 * uma origem diferente da de produção — testar duas branches já custa dois
 * downloads completos. Um cofre só é o objetivo.
 */
export function classificarOrigem(
    href: string,
    estavel: string = ORIGEM_ESTAVEL,
): Origem {
    let url: URL;
    try {
        url = new URL(href);
    } catch {
        return { tipo: 'estavel' };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { tipo: 'estavel' };
    if (url.hostname === estavel) return { tipo: 'estavel' };
    if (!url.hostname.endsWith('.vercel.app')) return { tipo: 'estavel' };

    const destino = new URL(url.toString());
    destino.protocol = 'https:';
    destino.hostname = estavel;
    destino.port = '';
    return { tipo: 'descartavel', host: url.hostname, destino: destino.toString() };
}

/** Lê o carimbo do build desta página. */
export function buildLocal(): BuildStamp | null {
    const stamp = (globalThis as { __TNE_BUILD__?: BuildStamp }).__TNE_BUILD__;
    if (!stamp) return null;
    return identidadeDoBuild(stamp) ? stamp : null;
}

/**
 * Pergunta ao endereço fixo qual build ele está servindo.
 *
 * O version.json tem ~100 bytes e é servido com `Access-Control-Allow-Origin: *`
 * (vercel.json) justamente para esta pergunta poder ser feita de uma origem
 * para a outra. `cache: 'no-store'`: a resposta de 5 minutos atrás não serve
 * para decidir se um deploy novo já subiu.
 */
export async function buildDoEnderecoFixo(
    estavel: string = ORIGEM_ESTAVEL,
    fetchImpl: typeof fetch = fetch,
): Promise<BuildStamp | null> {
    try {
        const res = await fetchImpl(`https://${estavel}/version.json`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json() as Partial<BuildStamp>;
        const stamp: BuildStamp = {
            build: typeof data.build === 'string' ? data.build : '',
            commit: typeof data.commit === 'string' ? data.commit : '',
            ref: data.ref ?? '',
            built: data.built ?? '',
        };
        return identidadeDoBuild(stamp) ? stamp : null;
    } catch {
        // Sem CORS, sem rede, deploy antigo sem version.json — a resposta é
        // "não sei", e não saber nunca pode virar um salto automático.
        return null;
    }
}

export type Veredito =
    /** Já está no lugar certo. */
    | { acao: 'nada' }
    /** Mesmo commit dos dois lados: pular é grátis e economiza os 4,2 GB. */
    | { acao: 'saltar'; destino: string; motivo: string }
    /** Builds diferentes (ou desconhecido): quem testa decide. */
    | { acao: 'perguntar'; destino: string; host: string; aqui: BuildStamp | null; la: BuildStamp | null };

/**
 * A decisão, isolada de rede e de DOM para poder ser testada de verdade.
 */
export function decidir(
    origem: Origem,
    aqui: BuildStamp | null,
    la: BuildStamp | null,
): Veredito {
    if (origem.tipo === 'estavel') return { acao: 'nada' };
    const idAqui = identidadeDoBuild(aqui);
    const idLa = identidadeDoBuild(la);
    if (idAqui && idLa && idAqui === idLa) {
        return {
            acao: 'saltar',
            destino: origem.destino,
            motivo: `mesmo build (${idAqui}) no endereço fixo`,
        };
    }
    return { acao: 'perguntar', destino: origem.destino, host: origem.host, aqui, la };
}

/** Enquanto durar a aba, "ficar aqui" é respeitado sem reperguntar. */
const CHAVE_FICAR = 'tne:ficar-nesta-origem';

export function ficarNestaOrigem(): void {
    try { sessionStorage.setItem(CHAVE_FICAR, '1'); } catch { /* modo privado */ }
}

export function jaEscolheuFicar(): boolean {
    try { return sessionStorage.getItem(CHAVE_FICAR) === '1'; } catch { return false; }
}

/**
 * Roda no boot. Devolve o veredito para a UI desenhar o aviso; o salto
 * automático (mesmo commit) acontece aqui mesmo, antes de qualquer download.
 */
export async function avaliarOrigem(
    href: string = globalThis.location?.href ?? '',
    estavel: string = ORIGEM_ESTAVEL,
): Promise<Veredito> {
    const origem = classificarOrigem(href, estavel);
    if (origem.tipo === 'estavel') return { acao: 'nada' };
    // `?deploy=1` é a saída de emergência: força ficar na URL do deploy.
    try {
        if (new URL(href).searchParams.has('deploy')) return { acao: 'nada' };
    } catch { /* href inválido já foi tratado acima */ }
    if (jaEscolheuFicar()) return { acao: 'nada' };

    const veredito = decidir(origem, buildLocal(), await buildDoEnderecoFixo(estavel));
    if (veredito.acao === 'saltar') {
        globalThis.location?.replace(veredito.destino);
    }
    return veredito;
}
