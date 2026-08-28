/**
 * ── A SALA DA VELOCIDADE: SÓ O MOTOR, E MAIS NADA ────────────────────────
 *
 * Existe por um erro meu. Eu pendurei as chaves `?motor=relaxed` e `?espec=1`
 * na sala do `?pipeline`, e o dono do jogo abriu e me mostrou o estrago: para
 * medir o MOTOR ele teria de baixar tradutor, embedding, juiz e revisor —
 * ~2,8 GB de peças que não têm nada a ver com a pergunta. Pior: o rascunhador
 * de lá é o granite, e o draft da especulativa está alinhado ao vocabulário do
 * SmolLM3. São vocabulários diferentes; o par seria recusado na checagem.
 *
 * Aqui só entra o que a pergunta exige:
 *
 *     SmolLM3-3B ..... o modelo que o kernel de q4_K acelera
 *     draft 200M ..... e só quando a especulativa está ligada
 *
 * E a resposta é um número, não uma sensação: tokens por segundo de prefill e
 * de geração, medidos separados, porque é a razão entre eles que decide se a
 * especulativa tem chance neste aparelho.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatBytes } from './npc/floor10Download';
import { liberarRolagem } from './npc/floor10PaginaRolavel';
import {
    prepararTradutor, desabreviar, traduzirPerguntaParaIngles, traduzirParaPtBr,
    FLOOR10_TRADUTOR_BYTES,
} from './npc/floor10Tradutor';

const CDN = (globalThis as { __wllamaCdn?: string }).__wllamaCdn
    ?? 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1/esm';
const WLLAMA_ESM = `${CDN}/index.js`;
const WASM = `${CDN}/wasm/wllama.wasm`;
const MOTOR_LOCAL = !!(globalThis as { __wllamaCdn?: string }).__wllamaCdn;

const MODELOS = {
    q4km: {
        rotulo: 'SmolLM3-3B Q4_K_M',
        url: 'https://huggingface.co/ggml-org/SmolLM3-3B-GGUF/resolve/main/SmolLM3-Q4_K_M.gguf',
        bytes: 1_915_305_312,
        nota: 'a quantização que o kernel de q4_K acelera',
    },
    q40: {
        rotulo: 'SmolLM3-3B Q4_0',
        url: 'https://huggingface.co/bartowski/HuggingFaceTB_SmolLM3-3B-GGUF/resolve/main/HuggingFaceTB_SmolLM3-3B-Q4_0.gguf',
        bytes: 1_811_455_808,
        nota: 'aritmética mais simples; o kernel de q4_K NÃO age aqui',
    },
    /**
     * ── O 7B QUE SÓ CABE PARTIDO ────────────────────────────────────────
     *
     * `granite-4.0-h-tiny`: 7B no total, ~1B ativo por token, e híbrido de
     * Mamba — 40 camadas, quase todas `mamba`, com atenção a cada dez. É por
     * isso que ele lê o prompt mais rápido que um denso de 3B apesar de ser
     * maior.
     *
     * A URL aponta para o PRIMEIRO SHARD, e não é detalhe: 2,59 GB estouram o
     * limite de 2 GiB de um `Blob` no navegador, que é a parede que o
     * `JA-TENTADO` registrava como "não há modelo maior de tipo nenhum". Ela
     * não era de RAM nem de arquitetura — era de arquivo, e o wllama já sabia
     * carregar `gguf-split`: dando o primeiro pedaço, ele busca o resto.
     *
     * Medido nesta bancada, no navegador:
     *
     *     granite 7B-A1B Q2_K ... prefill 11,05 tok/s · geração 5,38 tok/s
     *     SmolLM3-3B Q4_K_M ..... prefill  7,26 tok/s · geração 4,71 tok/s
     *
     * O que NINGUÉM sabe ainda são os ~2,6 GB residentes no aparelho, 35%
     * acima do que ele já provou aguentar. Por isso ele está aqui: para o
     * aparelho responder.
     */
    granite7b: {
        rotulo: 'granite-4.0-h-tiny 7B-A1B Q2_K',
        url: 'https://huggingface.co/Felipe0282829273/granite4-h-tiny-q2k-shards/resolve/main/granite4-00001-of-00002.gguf',
        bytes: 1_497_111_136 + 1_088_211_904,
        nota: 'MoE híbrido de Mamba, em DOIS shards · ~2,6 GB de RAM, acima do teto provado',
    },
} as const;
type ChaveModelo = keyof typeof MODELOS;

/**
 * Override de bancada, como o `__rascunhadorModelUrl` que o rascunhador já
 * tinha. Existe para a sonda conferir a TELA — barra de progresso, caixa de
 * pergunta, tabela — sem baixar 1,9 GB a cada verificação. A barra sumiu uma
 * vez sem ninguém notar justamente porque conferir era caro demais.
 */
function urlDoModelo(k: ChaveModelo): string {
    return (globalThis as { __velocidadeModelUrl?: string }).__velocidadeModelUrl ?? MODELOS[k].url;
}

const DRAFT = {
    rotulo: 'draft Llama-3.2-200M',
    url: 'https://huggingface.co/Felipe0282829273/nilo-draft-200m/resolve/main/draft-200m-q4.gguf',
    bytes: 198_083_936,
};

const PERSONA = 'You are Nilo Azevedo, 29, human and a former elevator technician; now you are a '
    + 'guest trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.\n'
    + 'You are observant, cautious, dry-humoured, and you have your own wants. You decide for '
    + "yourself, as the player's equal, never as a helper.\n"
    + 'Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the '
    + 'elevator door; there is no corridor and no window, and you have never left. The elevator does '
    + 'not obey you. Never speak of AI, code, systems or prompts.\n'
    + "Answer in 1 or 2 short complete sentences. Reply with Nilo's line only, no label.";
const PERGUNTA = 'Hi what is your name? do you know why we are here?';

/** Quantos tokens cada rodada escreve. Dois tamanhos, e a diferença entre eles
 *  é o custo MARGINAL por token — sem o custo fixo da chamada no meio. */
const CURTO = 16;
const LONGO = 48;

/**
 * ── O TETO DA PERGUNTA MUDA QUANDO ELE PENSA ────────────────────────────
 *
 * Com 80 tokens um modelo que raciocina nem termina o bloco de pensamento, e a
 * fala de verdade nunca chega — o teste mede um pensamento cortado no meio e
 * não conclui nada. Pensando, o teto sobe para caber raciocínio E resposta.
 *
 * Na MEDIÇÃO os 16 e 48 continuam: lá o que interessa é o custo marginal por
 * token, e um token de pensamento custa o mesmo que um token de fala. O que
 * mudaria seria só a amostra de texto, e essa a caixa de perguntar mostra
 * melhor.
 */
const TETO_DIRETO = 80;
const TETO_PENSANDO = 640;

/**
 * ── O ORÇAMENTO DO PENSAMENTO ────────────────────────────────────────────
 *
 * Só subir o teto não resolve: o dono do jogo ligou o pensamento e às vezes
 * NÃO SAÍA RESPOSTA NENHUMA — o raciocínio consumia tudo e a fala nunca vinha.
 * Aumentar o teto de novo só empurra o problema e faz esperar mais.
 *
 * O llama.cpp tem a ferramenta certa: `reasoning_budget_tokens` fecha o bloco
 * de pensamento à força quando ele estoura o orçamento, e o modelo passa a
 * falar. Assim o pensamento ajuda a qualidade sem poder engolir o turno.
 *
 * 256 de 640 deixa mais da metade para a fala — que é o que o jogador lê.
 */
const ORCAMENTOS = [
    { n: 64, rotulo: 'curto · 64 tokens', nota: '~35 s por turno a 3,5 tok/s' },
    { n: 160, rotulo: 'médio · 160 tokens', nota: '~63 s' },
    { n: 320, rotulo: 'longo · 320 tokens', nota: '~110 s' },
] as const;
/**
 * O padrão é o CURTO, e não o generoso.
 *
 * A primeira versão usava 256 fixos e o dono do jogo desistiu de esperar. A
 * conta explica: o aparelho dele faz ~3,5 tok/s, então 256 de raciocínio mais
 * ~60 de fala são ~90 s de turno. Com 64 o turno cai para ~35 s, que é a faixa
 * em que dá para conversar.
 *
 * Fica escolhível porque o ponto certo depende do aparelho, e quem tem o
 * aparelho é quem sabe.
 */
const ORCAMENTO_PADRAO = 64;

/**
 * Separa o raciocínio da fala.
 *
 * O `<think>` sai da resposta por dois motivos: quem lê quer a fala do Nilo, e
 * mandar um bloco de raciocínio inteiro para o Bergamot traduzir é lento e não
 * serve para nada. Mas ele não é jogado fora — aparece à parte, porque o
 * TAMANHO dele é a resposta para "quanto o pensamento custa".
 */
function separarPensamento(txt: string): { pensou: string; fala: string } {
    const m = txt.match(/<think>([\s\S]*?)<\/think>/);
    if (m) return { pensou: m[1].trim(), fala: txt.replace(m[0], '').trim() };
    // Pensamento cortado pelo teto: abriu o bloco e não fechou.
    const abriu = txt.indexOf('<think>');
    if (abriu >= 0) return { pensou: txt.slice(abriu + 7).trim(), fala: '' };
    return { pensou: '', fala: txt.trim() };
}

const CAIXA: React.CSSProperties = {
    border: '1px solid #333', borderRadius: 8, padding: 12, marginBottom: 12, background: '#141414',
};

type Medida = {
    carga: number; geracaoMs: number; prefillMs: number; fala: string;
};

type InstanciaWllama = {
    loadModelFromUrl(u: string, p: Record<string, unknown>): Promise<void>;
    createChatCompletion(p: Record<string, unknown>): Promise<unknown>;
    exit?(): Promise<void>;
};
type CtorWllama = new (p: Record<string, string>, o?: Record<string, unknown>) => InstanciaWllama;

/**
 * ── OS RASCUNHOS DA ESPECULATIVA, AO VIVO ───────────────────────────────
 *
 * O dono do jogo quis VER os rascunhos antes de o alvo entregar a fala. O que
 * o llama.cpp emite não é o texto dos rascunhos — ele não loga os tokens
 * rascunhados — e sim quantos de cada rodada sobreviveram à conferência:
 *
 *     slot | accepted 3/4 draft tokens
 *     slot | draft acceptance = 0.60000 (12 accepted / 20 generated)
 *
 * Que é o sinal que decide a especulativa. Uma sequência como `4/4 · 0/4 · 3/4`
 * conta a história inteira: onde o rascunhador acertou a frase e onde o alvo
 * jogou tudo fora.
 *
 * Vem por `suppressNativeLog: false` mais um logger que filtra — a sala não vai
 * despejar o log inteiro do llama.cpp na tela.
 */
const RE_RODADA = /accepted\s+(\d+)\s*\/\s*(\d+)\s+draft tokens/;
const RE_TAXA = /draft acceptance = ([0-9.]+).*?\((\d+) accepted \/\s*(\d+) generated\)/;

/**
 * Prazo para o tradutor, porque `.catch` não pega TRAVAMENTO — só rejeição.
 *
 * Descoberto rodando: numa rede sem acesso ao CDN do Bergamot, a caixa de
 * pergunta ficava em "…" para sempre, sem erro e sem resposta. Uma caixa que
 * não responde nunca é pior que uma que responde em inglês.
 */
function comPrazoCurto<T>(p: Promise<T>, ms: number): Promise<T | null> {
    return Promise.race([
        p.catch(() => null),
        new Promise<null>((r) => setTimeout(() => r(null), ms)),
    ]);
}

const PRAZO_TRADUTOR_MS = 20_000;

/**
 * ── A DIREÇÃO, E POR QUE ELA VAI NA MENSAGEM DO USUÁRIO ─────────────────
 *
 * No jogo, o embedding recupera UM fato do cânone que a pergunta pediu, e o
 * `turnoDoRascunho` o entrega junto da pergunta. A sala não baixa o embedding
 * (334 MB para medir um motor não faz sentido), então quem escreve a direção
 * é quem está testando.
 *
 * Existe porque o dono do jogo notou perda de qualidade aqui e apontou a causa
 * certa: sem direção o modelo preenche o vazio inventando — nesta sala ele já
 * disse "you broke the elevator" e "a peculiar room", nenhum dos dois no
 * cânone.
 *
 * Vai na mensagem do USUÁRIO e nunca no sistema, igualzinho ao jogo: a persona
 * é o prefixo estável que o `cache_prompt` reaproveita, e mexer nela a cada
 * pergunta jogaria o cache fora — que é justamente o que faz esta sala ser
 * rápida.
 */
function turnoComDirecao(texto: string, direcao: string): string {
    const d = direcao.trim();
    return d ? `What you know that matters here: ${d}\n\n${texto}` : texto;
}

/**
 * ── O SmolLM3 PENSA POR PADRÃO, E ISSO CUSTA O TURNO INTEIRO ────────────
 *
 * O template de conversa dele traz, literalmente:
 *
 *     {%- if enable_thinking is not defined -%}
 *       {%- set enable_thinking = true -%}
 *
 * Ou seja: quem não disser nada recebe `/think`, e o modelo escreve um bloco
 * de raciocínio inteiro antes da fala. São centenas de tokens que ninguém lê,
 * e token é a unidade de tempo aqui.
 *
 * É a explicação para o SmolLM3 ser "extremamente lento" nas primeiras versões
 * do jogo, antes do pipeline: ninguém passava o parâmetro. O jogo de hoje já
 * passa (`floor10Rascunhador.ts`), e esta sala passou a poder medir os dois
 * lados — porque a diferença é grande demais para ficar escondida.
 *
 * O português custa ~17% mais tokens que o inglês neste tokenizador (medido).
 * Real, mas 17% não explica um turno de 140 s. O pensamento explica.
 */
async function rodada(w: InstanciaWllama, texto: string, n: number, cache: boolean,
    temp = 0, direcao = '', pensa = false, orc = ORCAMENTO_PADRAO,
): Promise<{ ms: number; txt: string }> {
    const t = performance.now();
    const res = await w.createChatCompletion({
        messages: [{ role: 'system', content: PERSONA },
            { role: 'user', content: turnoComDirecao(texto, direcao) }],
        chat_template_kwargs: { enable_thinking: pensa },
        // Sem orçamento, o raciocínio come o teto inteiro e a fala não sai.
        // E `reasoning_format: 'none'` é o que faz o `<think>` CHEGAR aqui em
        // vez de o servidor engolir o bloco: sem isso dá para medir o custo do
        // pensamento, mas não dá para LER o pensamento.
        ...(pensa ? { reasoning_budget_tokens: orc, reasoning_format: 'none' } : {}),
        n_predict: n, temp, cache_prompt: cache, ignore_eos: temp === 0,
    }) as { choices?: { message?: { content?: string } }[] };
    return { ms: performance.now() - t, txt: res?.choices?.[0]?.message?.content ?? '' };
}

/**
 * ── POR QUE NÃO TEM MAIS `fetch` AQUI ────────────────────────────────────
 *
 * A primeira versão desta sala baixava com `fetch` para um Blob em memória. O
 * dono do jogo trocou de opção uma vez e viu 1,92 GB descendo DE NOVO — em
 * dados móveis. Blob em memória não é cache: morre com a aba e não sobrevive
 * a um recarregamento.
 *
 * `loadModelFromUrl` passa pelo `modelManager`, que guarda em OPFS e devolve o
 * arquivo pronto na segunda vez. É o mesmo caminho que o resto do jogo usa —
 * eu é que tinha inventado um atalho pior, e o atalho custava a franquia dele.
 *
 * O draft segue o mesmo caminho pelo `modelManager`, e só depois vira Blob:
 * o remendo da especulativa precisa dos bytes, mas não precisa baixá-los de
 * novo toda vez.
 */
type Gerente = {
    getModelOrDownload(fonte: { url: string }, p: Record<string, unknown>): Promise<{
        open(): Promise<Blob[]>;
    }>;
};

export default function Floor10VelocidadeSala() {
    /**
     * `?velocidade=granite7b` já abre no modelo escolhido — pedido do dono do
     * jogo, e útil porque a sala é aberta pelo celular, onde mexer em rádio é
     * pior que colar uma URL.
     */
    const [modelo, setModelo] = useState<ChaveModelo>(() => {
        const pedido = new URLSearchParams(globalThis.location?.search ?? '').get('velocidade');
        return pedido && pedido in MODELOS ? pedido as ChaveModelo : 'q4km';
    });
    const [espec, setEspec] = useState(false);
    const [pensa, setPensa] = useState(false);
    const [orcamento, setOrcamento] = useState<number>(ORCAMENTO_PADRAO);
    const [fase, setFase] = useState('parado');
    const [feitos, setFeitos] = useState(0);
    const [total, setTotal] = useState(0);
    const [medida, setMedida] = useState<Medida | null>(null);
    /**
     * As medições desta sessão, na ordem. Existe porque o A/B da especulativa
     * é comparar dois números — e comparar de memória, rolando a tela entre um
     * e outro, foi como eu troquei uma rodada COM pela rodada SEM e tirei a
     * conclusão errada. Aqui os dois ficam lado a lado, cada um com a
     * configuração que o produziu.
     */
    const [historico, setHistorico] = useState<(Medida & {
        rotulo: string; espec: boolean; pensa: boolean;
    })[]>([]);
    const [erro, setErro] = useState('');
    const [pergunta, setPergunta] = useState('');
    const [direcao, setDirecao] = useState('');
    /** `useRef` não redesenha, e a caixa de perguntar depende disto aparecer. */
    const [motorPronto, setMotorPronto] = useState(false);
    const [resposta, setResposta] = useState('');
    /**
     * As respostas desta sessão, cada uma carimbada com a configuração que a
     * produziu. Existe porque o dono do jogo quer VER a especulativa contra a
     * não-especulativa — e trocar entre as duas exige recarregar o modelo, o
     * que apaga a resposta anterior da tela. Sem registro, comparar viraria
     * memória, que foi exatamente como eu já tirei uma conclusão errada aqui.
     */
    /** O `<think>` da última pergunta, mostrado à parte da fala. */
    const [pensamento, setPensamento] = useState('');
    const [rodadas, setRodadas] = useState<{ ok: number; de: number }[]>([]);
    const [taxa, setTaxa] = useState<{ pct: number; ok: number; de: number } | null>(null);
    const [conversa, setConversa] = useState<{
        q: string; a: string; ms: number; espec: boolean; pensa: boolean; orc: number;
    }[]>([]);
    const rodando = useRef(false);
    /**
     * O MESMO estado do `rodando`, mas visível ao render.
     *
     * `useRef` não redesenha, então o botão de perguntar ficava habilitado
     * durante a medição, e clicar nele batia no guarda `rodando.current` e
     * voltava EM SILÊNCIO. Clique que não faz nada e não explica é o pior
     * defeito possível numa bancada — é indistinguível de estar quebrada.
     */
    const [ocupado, setOcupado] = useState(false);
    /** O motor fica de pé depois de medir, para as perguntas livres. */
    const motorRef = useRef<InstanciaWllama | null>(null);

    useEffect(() => liberarRolagem(), []);

    const medir = useCallback(async () => {
        if (rodando.current) return;
        rodando.current = true; setOcupado(true);
        setErro(''); setMedida(null); setResposta('');
        try {
            const M = MODELOS[modelo];
            // ── O MOTOR ANTERIOR SAI PRIMEIRO ────────────────────────────
            //
            // A sala guarda a instância viva para a caixa de perguntas. Sem
            // descarregar, o segundo "medir" subia um SEGUNDO modelo inteiro
            // com o primeiro ainda de pé — ~4 GB disputando a RAM de um
            // celular. Toda segunda medição de uma sessão saía contaminada, e
            // foi assim que um A/B da especulativa virou conclusão errada.
            if (motorRef.current) {
                setFase('descarregando o motor anterior');
                try { await motorRef.current.exit?.(); } catch { /* já foi */ }
                motorRef.current = null;
                setMotorPronto(false);
            }
            const mod = await import(/* @vite-ignore */ WLLAMA_ESM) as { Wllama: CtorWllama };
            // `suppressNativeLog: false` para as linhas da especulativa chegarem;
            // o logger filtra, senão a sala vira despejo do log do llama.cpp.
            const pesca = (...a: unknown[]) => {
                const linha = a.map(String).join(' ');
                const m = linha.match(RE_RODADA);
                if (m) setRodadas((r) => [...r, { ok: +m[1], de: +m[2] }]);
                const t = linha.match(RE_TAXA);
                if (t) setTaxa({ pct: +t[1] * 100, ok: +t[2], de: +t[3] });
            };
            const w = new mod.Wllama({ default: WASM }, {
                suppressNativeLog: false,
                logger: { debug: pesca, log: pesca, warn: pesca, error: pesca },
            });

            let blobDraft: Blob | null = null;
            if (espec) {
                if (!MOTOR_LOCAL) throw new Error('a especulativa exige ?motor=relaxed');
                setFase(`preparando ${DRAFT.rotulo}`);
                const gerente = (w as unknown as { modelManager: Gerente }).modelManager;
                const m = await gerente.getModelOrDownload({ url: DRAFT.url }, {
                    progressCallback: ({ loaded, total }: { loaded?: number; total?: number }) => {
                        setFeitos(loaded ?? 0); setTotal(total ?? DRAFT.bytes);
                    },
                });
                blobDraft = (await m.open())[0] ?? null;
            }

            // O tradutor entra na mesma passada: 51 MB, e sem ele a caixa de
            // perguntas só aceitaria inglês — que não é como o dono do jogo
            // testa. Falhar aqui não derruba a medição: o número de tok/s não
            // depende dele.
            setFase('preparando o tradutor Bergamot');
            await comPrazoCurto(
                prepararTradutor((b, t) => { setFeitos(b); setTotal(t); }), 90_000,
            );

            setFase(`preparando ${M.rotulo}`);
            const t0 = performance.now();
            await w.loadModelFromUrl(urlDoModelo(modelo), {
                n_ctx: 2048, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
                jinja: true, reasoning: false, warmup: false,
                progressCallback: ({ loaded, total }: { loaded?: number; total?: number }) => {
                    setFeitos(loaded ?? 0); setTotal(total ?? M.bytes);
                },
                ...(blobDraft ? {
                    spec_draft_blob: blobDraft, spec_draft_n_max: 4,
                    spec_draft_n_min: 1, spec_draft_p_min: 0.6,
                    spec_draft_ngl: 0, spec_draft_threads: 2,
                } : {}),
            });
            const carga = performance.now() - t0;
            motorRef.current = w;

            setFase('medindo');
            setFeitos(0); setTotal(0);
            setMotorPronto(true);
            await rodada(w, PERGUNTA, 4, true, 0, '', pensa, orcamento);            // aquece e enche o cache
            const curto = await rodada(w, PERGUNTA, CURTO, true, 0, '', pensa, orcamento);
            const longo = await rodada(w, PERGUNTA, LONGO, true, 0, '', pensa, orcamento);
            // Cache do prompt desligado: paga o prompt inteiro de novo, e a
            // diferença contra o quente é o custo do prefill.
            const frio = await rodada(w, PERGUNTA, CURTO, false, 0, '', pensa, orcamento);

            const m: Medida = {
                carga,
                geracaoMs: (longo.ms - curto.ms) / (LONGO - CURTO),
                prefillMs: (frio.ms - curto.ms) / 230,
                fala: separarPensamento(longo.txt).fala || longo.txt.trim(),
            };
            setMedida(m);
            setHistorico((h) => [...h, { ...m, rotulo: M.rotulo, espec, pensa }]);
            setFase('pronto');
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
            setFase('falhou');
        } finally {
            rodando.current = false; setOcupado(false);
        }
    }, [modelo, espec, pensa, orcamento]);

    /**
     * Pergunta livre, no MESMO motor que acabou de ser medido.
     *
     * Pedido do dono do jogo, e ele tem razão: número de tok/s não diz se o
     * Nilo continua o Nilo. Ele testa conversando, e uma sala de velocidade que
     * não deixa perguntar mede metade do que importa.
     *
     * Aqui a temperatura é 0,7 e não 0 — a bancada usa 0 para comparar
     * aritmética, mas conversa boa é a que varia sem inventar fato.
     */
    const perguntar = useCallback(async () => {
        const w = motorRef.current;
        if (!w || !pergunta.trim() || rodando.current) return;
        rodando.current = true; setOcupado(true);
        setResposta('…'); setRodadas([]); setTaxa(null); setPensamento('');
        try {
            // pt-BR → inglês → modelo → inglês → pt-BR, o mesmo caminho do jogo.
            // O `desabreviar` vem antes porque o Bergamot tropeça em "vc" e
            // "pq", e quem escreve as perguntas escreve assim.
            setFase('traduzindo a pergunta');
            const cru = desabreviar(pergunta.trim());
            // Sem `throw` se o tradutor não subir: manda a pergunta como está.
            // O SmolLM3 entende português, e uma resposta em inglês é MUITO
            // melhor que um erro — quem está aqui quer conversar com o Nilo,
            // não auditar o Bergamot. O rótulo diz o que aconteceu.
            const emIngles = await comPrazoCurto(traduzirPerguntaParaIngles(cru), PRAZO_TRADUTOR_MS);
            setFase('o Nilo está pensando');
            const r = await rodada(w, emIngles ?? cru, pensa ? TETO_PENSANDO : TETO_DIRETO,
                true, 0.7, direcao, pensa, orcamento);
            const { pensou, fala } = separarPensamento(r.txt);
            setFase('traduzindo a fala');
            // Só a FALA vai para o tradutor. Mandar um bloco de raciocínio
            // inteiro para o Bergamot é lento e não serve para nada.
            const emPt = emIngles && fala
                ? await comPrazoCurto(traduzirParaPtBr(fala), PRAZO_TRADUTOR_MS) : null;
            setFase('pronto');
            const cortou = pensa && !fala;
            setConversa((c) => [...c, {
                q: pergunta.trim(),
                a: cortou ? '(a fala não saiu)' : (emPt || fala || r.txt.trim()),
                ms: r.ms, espec, pensa, orc: orcamento,
            }]);
            setResposta(
                (cortou
                    ? `⚠ mesmo com orçamento de ${orcamento} tokens de raciocínio, `
                      + 'a fala não saiu. Me avise — o orçamento é ajustável.'
                    : (emPt || fala || r.txt.trim()))
                + `\n\n— ${(r.ms / 1000).toFixed(1)} s`
                + (emPt && fala ? `\n— em inglês: ${fala}` : '')
                + (emIngles ? '' : '\n— sem tradutor: a pergunta foi como você escreveu')
            );
            setPensamento(pensou);
        } catch (e) {
            setResposta(`falhou: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            rodando.current = false; setOcupado(false);
        }
    }, [pergunta, direcao, pensa, orcamento, espec]);

    const bytesPrecisos = MODELOS[modelo].bytes + FLOOR10_TRADUTOR_BYTES
        + (espec ? DRAFT.bytes : 0);

    return (
        <div style={{
            minHeight: '100vh', background: '#0b0b0b', color: '#ddd', padding: 16,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14,
        }}>
            <div style={{ maxWidth: 820, margin: '0 auto' }}>
                <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Sala da velocidade — só o motor</h1>
                <p style={{ color: '#888', margin: '0 0 16px' }}>
                    Mede o RUNTIME, não o pipeline. Baixa o SmolLM3 e mais nada — nem tradutor, nem
                    juiz, nem revisor. Existe porque medir o motor pela sala do{' '}
                    <code style={{ color: '#7fe0b0' }}>?pipeline</code> custava ~2,8 GB de peças que
                    não entram na conta, e porque lá o rascunhador é o granite, cujo vocabulário não
                    casa com o draft da especulativa.
                </p>

                <div style={CAIXA}>
                    <strong>Motor</strong>{' '}
                    <span style={{ color: MOTOR_LOCAL ? '#7fe0b0' : '#888' }}>
                        {MOTOR_LOCAL ? 'local · kernel relaxed de q4_K' : 'wllama 3.5.1 do CDN (padrão)'}
                    </span>
                    <div style={{ color: '#888', marginTop: 6, fontSize: 13 }}>
                        <code style={{ color: '#7fe0b0' }}>?velocidade&motor=relaxed</code> troca o
                        runtime. Sem isso a especulativa nem liga: o wllama do CDN não monta o draft.
                    </div>
                </div>

                <div style={CAIXA}>
                    <strong>O que medir</strong>
                    <div style={{ marginTop: 8 }}>
                        {(Object.keys(MODELOS) as ChaveModelo[]).map((k) => (
                            <label key={k} style={{ display: 'block', marginBottom: 6, cursor: 'pointer' }}>
                                <input type="radio" checked={modelo === k} onChange={() => setModelo(k)}
                                    disabled={ocupado} />
                                {' '}{MODELOS[k].rotulo}{' '}
                                <span style={{ color: '#666' }}>
                                    · {formatBytes(MODELOS[k].bytes)} · {MODELOS[k].nota}
                                </span>
                            </label>
                        ))}
                        <label style={{ display: 'block', marginTop: 10, cursor: 'pointer' }}>
                            <input type="checkbox" checked={pensa} disabled={ocupado}
                                onChange={(e) => setPensa(e.target.checked)} />
                            {' '}deixar ele PENSAR antes de responder{' '}
                            <span style={{ color: '#666' }}>
                                · o template do SmolLM3 liga isto por padrão, e era por isso
                                que ele parecia “extremamente lento” antes do pipeline. Aqui o
                                raciocínio tem ORÇAMENTO: passou dele, o llama.cpp fecha o bloco
                                e ele fala — senão o pensamento engole o turno e não sobra resposta
                            </span>
                        </label>
                        {pensa && (
                            <div style={{ margin: '6px 0 0 24px', color: '#888' }}>
                                orçamento do raciocínio:{' '}
                                {ORCAMENTOS.map((o) => (
                                    <label key={o.n} style={{ marginRight: 12, cursor: 'pointer' }}>
                                        <input type="radio" checked={orcamento === o.n}
                                            disabled={ocupado}
                                            onChange={() => setOrcamento(o.n)} />
                                        {' '}{o.rotulo}{' '}
                                        <span style={{ color: '#666' }}>{o.nota}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                        <label style={{ display: 'block', marginTop: 10, cursor: MOTOR_LOCAL ? 'pointer' : 'not-allowed' }}>
                            <input type="checkbox" checked={espec} disabled={!MOTOR_LOCAL || ocupado}
                                onChange={(e) => setEspec(e.target.checked)} />
                            {' '}especulativa com o draft de 200M{' '}
                            <span style={{ color: '#666' }}>· +{formatBytes(DRAFT.bytes)}</span>
                            {!MOTOR_LOCAL && <span style={{ color: '#c88' }}> · exige ?motor=relaxed</span>}
                        </label>
                    </div>
                    <div style={{ color: '#888', marginTop: 10 }}>
                        vai baixar {formatBytes(bytesPrecisos)}
                    </div>
                    <button onClick={medir} disabled={ocupado}
                        style={{
                            marginTop: 10, padding: '8px 14px', background: '#1d3a2a',
                            color: '#7fe0b0', border: '1px solid #2f6b4a', borderRadius: 6,
                            cursor: 'pointer', font: 'inherit',
                        }}>
                        medir
                    </button>
                </div>

                {fase !== 'parado' && (
                    <div style={CAIXA}>
                        <strong>{fase}</strong>
                        {/* A condição é o PROGRESSO existir, e não o texto da fase
                            começar com "baixando". Eu renomeei as fases para
                            "preparando…" e a barra sumiu sem nenhum erro — o
                            estado casado com uma string é uma armadilha, e caí
                            nela. Enquanto houver bytes andando, a barra aparece. */}
                        {total > 0 && (
                            <>
                                <div style={{ color: '#888', marginTop: 4 }}>
                                    {formatBytes(feitos)} de {formatBytes(total)}
                                </div>
                                <div style={{ height: 6, background: '#222', borderRadius: 3, marginTop: 6 }}>
                                    <div style={{
                                        height: '100%', width: `${(100 * feitos) / total}%`,
                                        background: '#2f6b4a', borderRadius: 3,
                                    }} />
                                </div>
                            </>
                        )}
                        {erro && <div style={{ color: '#e88', marginTop: 6 }}>{erro}</div>}
                    </div>
                )}

                {medida && (
                    <div style={CAIXA}>
                        <strong>O número</strong>
                        <table style={{ marginTop: 8, borderSpacing: '12px 4px' }}>
                            <tbody>
                                <tr><td style={{ color: '#888' }}>carga</td>
                                    <td>{(medida.carga / 1000).toFixed(1)} s</td><td /></tr>
                                <tr><td style={{ color: '#888' }}>geração</td>
                                    <td>{medida.geracaoMs.toFixed(0)} ms/token</td>
                                    <td style={{ color: '#7fe0b0' }}>{(1000 / medida.geracaoMs).toFixed(2)} tok/s</td></tr>
                                <tr><td style={{ color: '#888' }}>prefill</td>
                                    <td>{medida.prefillMs.toFixed(0)} ms/token</td>
                                    <td style={{ color: '#7fe0b0' }}>{(1000 / medida.prefillMs).toFixed(2)} tok/s</td></tr>
                                {/* Com a especulativa LIGADA este número não vale:
                                    o termo de "geração" carrega o custo do draft,
                                    e a razão deixa de medir lote. Eu cheguei a
                                    anunciar uma reabertura da especulativa em
                                    cima dele. Número que só vale às vezes tem de
                                    dizer quando não vale. */}
                                <tr><td style={{ color: '#888' }}>ganho do lote</td>
                                    <td colSpan={2}>
                                        {espec
                                            ? <span style={{ color: '#c88' }}>
                                                não vale com a especulativa ligada
                                              </span>
                                            : `${(medida.geracaoMs / medida.prefillMs).toFixed(2)}×`}
                                    </td></tr>
                            </tbody>
                        </table>
                        <div style={{ color: '#888', marginTop: 10, fontSize: 13 }}>
                            O <em>ganho do lote</em> é o que decide a especulativa: ela confere vários
                            tokens numa passada, então só paga se processar em lote for MUITO mais
                            barato que um token de cada vez. Medido: 1,50× na bancada x86 e 1,88×
                            no aparelho do dono do jogo. Com 1,88×, conferir 5 tokens custa 3,06,
                            e seria preciso aceitar 52% dos rascunhos só para empatar — o aceite
                            medido vai de 33% a 52%. Por isso a especulativa perde nos dois: 44%
                            mais lenta no aparelho, medido no A/B desta mesma sala.
                        </div>
                        <div style={{ marginTop: 10, color: '#bbb', whiteSpace: 'pre-wrap' }}>
                            “{medida.fala.slice(0, 260)}”
                        </div>
                    </div>
                )}

                {(rodadas.length > 0 || taxa) && (
                    <div style={CAIXA}>
                        <strong>Os rascunhos da especulativa</strong>
                        <div style={{ color: '#888', fontSize: 13, margin: '4px 0 8px' }}>
                            Cada quadrinho é uma rodada: o rascunhador chutou alguns tokens à
                            frente e o SmolLM3 conferiu. <span style={{ color: '#7fe0b0' }}>Verde
                            </span> é chute aproveitado, <span style={{ color: '#e88' }}>vermelho
                            </span> é chute jogado fora. O llama.cpp não emite o TEXTO dos
                            rascunhos, só quantos sobreviveram — mas é esse número que decide se
                            ela paga.
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
                            {rodadas.map((r, i) => (
                                <span key={i} title={`rodada ${i + 1}: ${r.ok} de ${r.de}`}
                                    style={{
                                        fontSize: 11, padding: '1px 5px', borderRadius: 3,
                                        background: r.ok === 0 ? '#3a1d1d'
                                            : r.ok === r.de ? '#1d3a2a' : '#3a341d',
                                        color: r.ok === 0 ? '#e88'
                                            : r.ok === r.de ? '#7fe0b0' : '#e8c88a',
                                    }}>
                                    {r.ok}/{r.de}
                                </span>
                            ))}
                        </div>
                        {taxa && (
                            <div>
                                aceite: <strong style={{ color: '#7fe0b0' }}>
                                    {taxa.pct.toFixed(1)}%
                                </strong>{' '}
                                <span style={{ color: '#888' }}>
                                    ({taxa.ok} aproveitados de {taxa.de} rascunhados)
                                </span>
                            </div>
                        )}
                        {!taxa && rodadas.length === 0 && (
                            <div style={{ color: '#888' }}>
                                nenhum rascunho ainda — a especulativa está desligada?
                            </div>
                        )}
                    </div>
                )}

                {conversa.length > 1 && (
                    <div style={CAIXA}>
                        <strong>As respostas desta sessão</strong>
                        <div style={{ color: '#888', fontSize: 13, margin: '4px 0 8px' }}>
                            Cada uma com a configuração que a produziu. Trocar a especulativa
                            exige recarregar o modelo, e isso apaga a resposta anterior da tela —
                            aqui elas ficam, para a comparação ser com os olhos e não de memória.
                        </div>
                        {conversa.map((c, i) => (
                            <div key={i} style={{
                                borderTop: i ? '1px solid #262626' : 'none',
                                paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0,
                            }}>
                                <div style={{ color: '#888', fontSize: 12 }}>
                                    {c.espec ? 'espec ✓' : 'espec —'}{' · '}
                                    {c.pensa ? `pensa ✓ (${c.orc})` : 'pensa —'}{' · '}
                                    {(c.ms / 1000).toFixed(1)} s
                                </div>
                                <div style={{ color: '#777' }}>{c.q}</div>
                                <div style={{ color: '#ccc', whiteSpace: 'pre-wrap' }}>{c.a}</div>
                            </div>
                        ))}
                    </div>
                )}

                {historico.length > 1 && (
                    <div style={CAIXA}>
                        <strong>As medições desta sessão</strong>
                        <div style={{ color: '#888', fontSize: 13, margin: '4px 0 8px' }}>
                            Lado a lado de propósito: o A/B da especulativa é comparar dois
                            números, e comparar de memória foi como eu troquei uma rodada COM
                            pela rodada SEM e anunciei uma conclusão errada.
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ borderSpacing: '10px 4px', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ color: '#888' }}>
                                        <td>#</td><td>modelo</td><td>espec.</td><td>pensa</td>
                                        <td>geração</td><td>prefill</td>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historico.map((h, i) => (
                                        <tr key={i}>
                                            <td style={{ color: '#666' }}>{i + 1}</td>
                                            <td>{h.rotulo.replace('SmolLM3-3B ', '')}</td>
                                            <td style={{ color: h.espec ? '#7fe0b0' : '#666' }}>
                                                {h.espec ? 'LIGADA' : '—'}
                                            </td>
                                            <td style={{ color: h.pensa ? '#e8c88a' : '#666' }}>
                                                {h.pensa ? 'SIM' : '—'}
                                            </td>
                                            <td style={{ color: '#7fe0b0' }}>
                                                {(1000 / h.geracaoMs).toFixed(2)} tok/s
                                            </td>
                                            <td>{(1000 / h.prefillMs).toFixed(2)} tok/s</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {(() => {
                            // A comparação só vale entre rodadas do MESMO modelo que
                            // diferem SÓ na especulativa. Qualquer outro par mistura
                            // duas variáveis, e foi isso que me pegou.
                            const com = [...historico].reverse().find((h) => h.espec);
                            const sem = [...historico].reverse().find((h) => !h.espec);
                            if (!com || !sem || com.rotulo !== sem.rotulo) {
                                return (
                                    <div style={{ color: '#888', marginTop: 8, fontSize: 13 }}>
                                        Para o veredito, meça o MESMO modelo com e sem a
                                        especulativa.
                                    </div>
                                );
                            }
                            const r = sem.geracaoMs / com.geracaoMs;
                            return (
                                <div style={{ marginTop: 8 }}>
                                    especulativa em {sem.rotulo}:{' '}
                                    <strong style={{ color: r > 1 ? '#7fe0b0' : '#e88' }}>
                                        {r > 1 ? `${r.toFixed(2)}× mais rápida`
                                            : `${(1 / r).toFixed(2)}× mais LENTA`}
                                    </strong>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {motorPronto && (
                    <div style={CAIXA}>
                        <strong>Pergunte você</strong>
                        <div style={{ color: '#888', fontSize: 13, margin: '4px 0 8px' }}>
                            Em português, no mesmo motor que acabou de ser medido — pt→en pelo
                            Bergamot, o Nilo responde, e volta traduzido. Aqui a temperatura é 0,7
                            e não 0: a medição usa 0 para comparar aritmética, mas conversa boa é
                            a que varia sem inventar fato.
                            <br /><br />
                            A <strong>direção</strong> é o fato do cânone que o embedding entregaria
                            no jogo. Sem ela o modelo preenche o vazio inventando — aqui ele já
                            disse “you broke the elevator”. Escreva em inglês, que é a língua em
                            que ele pensa. Exemplo: <em>the grate floor is cold and you can see
                            nothing through it</em>.
                        </div>
                        <input value={direcao} onChange={(e) => setDirecao(e.target.value)}
                            placeholder="direção: o fato do cânone que o embedding acharia (opcional)"
                            style={{
                                width: '100%', background: '#0e0e0e', color: '#ddd',
                                border: '1px solid #333', borderRadius: 6, padding: 8,
                                font: 'inherit', marginBottom: 8,
                            }} />
                        <textarea value={pergunta} onChange={(e) => setPergunta(e.target.value)}
                            placeholder="oi, qual é o seu nome? sabe pq a gente tá aqui?"
                            rows={2}
                            style={{
                                width: '100%', background: '#0e0e0e', color: '#ddd',
                                border: '1px solid #333', borderRadius: 6, padding: 8,
                                font: 'inherit', resize: 'vertical',
                            }} />
                        <button onClick={perguntar} disabled={ocupado || !pergunta.trim()}
                            style={{
                                marginTop: 8, padding: '8px 14px', background: '#1d3a2a',
                                color: '#7fe0b0', border: '1px solid #2f6b4a', borderRadius: 6,
                                cursor: 'pointer', font: 'inherit',
                            }}>
                            {ocupado ? 'espere a medição terminar…' : 'perguntar'}
                        </button>
                        {resposta && (
                            <div style={{ marginTop: 10, color: '#bbb', whiteSpace: 'pre-wrap' }}>
                                {resposta}
                            </div>
                        )}
                        {pensamento && (
                            <details open style={{ marginTop: 10 }}>
                                <summary style={{ cursor: 'pointer', color: '#e8c88a' }}>
                                    o que ele pensou antes de falar
                                    {' '}({pensamento.length} caracteres)
                                </summary>
                                <div style={{
                                    marginTop: 6, padding: 8, background: '#0e0e0e',
                                    border: '1px solid #2a2a2a', borderRadius: 6,
                                    color: '#999', whiteSpace: 'pre-wrap', fontSize: 13,
                                }}>
                                    {pensamento}
                                </div>
                            </details>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
