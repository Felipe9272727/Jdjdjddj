// ── A SALA DO PIPELINE (`?pipeline`) ──────────────────────────────────────
//
// POR QUE ELA EXISTE: o dono do jogo digitou `?pipeline`, esperou uma aba
// separada como as outras (`?rascunho`, `?campo`, `?mente`, `?bancada`) e não
// veio nada. Ele estava certo — toda peça experimental deste projeto ganhou
// uma sala, e o pipeline era a única com quatro modelos e nenhuma.
//
// Sem ela, "testar o pipeline" era abrir o jogo e sentir se a resposta veio
// mais rápido. Isso não distingue as três coisas que podem estar acontecendo:
// o pipeline rodou e ganhou, o pipeline rodou e o juiz marcou tudo (aí ele
// perde), ou o pipeline nem ligou e o 3B respondeu como sempre. As três se
// parecem na tela do jogo.
//
// Aqui cada etapa aparece com o tempo dela:
//
//     desabreviar → Bergamot pt→en → granite a400m → juiz de tom
//                 → LFM2.5 (só nas frases marcadas) → Bergamot en→pt
//
// ── DUAS URLs, E A DIFERENÇA IMPORTA ─────────────────────────────────────
//
//     ?pipeline        abre ESTA sala
//     ?pipeline=jogo   liga o pipeline dentro do jogo de verdade
//
// A sala chama `falarPeloPipelineReal`, que é EXATAMENTE o que o jogo chama —
// não uma reimplementação. Uma bancada que roda outro código mede outro
// programa, e este projeto já pagou por isso.
//
// ── NADA BAIXA SOZINHO ───────────────────────────────────────────────────
//
// São 983 MB somando as três peças. Abrir uma aba não pode custar isso, então
// cada uma tem botão e diz o próprio peso.
import { useCallback, useEffect, useState } from 'react';
import {
    FLOOR10_RASCUNHADOR_MODEL, baixarRascunhador, subirRascunhador,
    rascunhadorJaCarregado, descarregarRascunhador, ultimoErroDoRascunhador,
} from './npc/floor10Rascunhador';
import { FLOOR10_TOM_MODEL, prepararJuizDeTom, ultimoErroDoJuiz } from './npc/floor10VetorDeTom';
import {
    FLOOR10_TRADUTOR_BYTES, prepararTradutor, desabreviar,
    traduzirPerguntaParaIngles, ultimoErroDoTradutor,
} from './npc/floor10Tradutor';
import { diagnosticar } from './npc/floor10Diagnostico';
import { SMALL_BRAIN_MODEL, precarregarVontade, vontadeJaCarregada } from './npc/floor10SmallBrain';
import { falarPeloPipelineReal, pipelineDisponivel } from './npc/floor10PipelineReal';
import { enumerarEmIngles } from './npc/floor10Pipeline';
import { formatBytes, type DownloadSample } from './npc/floor10Download';
import { npc, npcSubscribe } from './npc/npcStore';

/**
 * As perguntas de teste, em PORTUGUÊS e do jeito que o dono do jogo escreve.
 *
 * As três primeiras são as mesmas de `fala-modelo.mjs`, para dar comparação
 * direta com os números da bancada. As três últimas são abreviadas de
 * propósito: é nelas que o `desabreviar` aparece, e sem ele o Bergamot
 * entregava "pq vc n get out of that fucking?" ao rascunhador.
 */
const PERGUNTAS = [
    'Oi qual é o seu nome? Vc sabe porque estamos aqui?',
    'Esse hotel vai acabar algum dia?',
    'Se eu chamar o elevador, ele vem?',
    'vc ta preso aqui faz quanto tempo mano',
    'pq vc n sai desse andar?',
    'ta com medo desse lugar?',
];

type Peca = {
    /** Chave curta, usada para lembrar quem já subiu nesta sessão da sala. */
    id: string;
    nome: string;
    bytes: number;
    detalhe: string;
    /**
     * Se a peça sabe responder "já estou de pé", ela responde. O tradutor e o
     * juiz NÃO sabem — eles memoizam a promessa lá dentro e nunca expuseram um
     * predicado —, então a sala lembra por eles. Sem isto o botão diria
     * "carregar" para sempre, que é a tela mentindo sobre o próprio estado.
     */
    carregado?: () => boolean;
    carregar: () => Promise<unknown>;
    /**
     * O motivo da última falha, guardado pela própria peça.
     *
     * Existe porque os carregadores deste andar NÃO lançam: eles devolvem
     * `false`/`null` e mandam o motivo para a caixa-preta, para que um erro
     * nunca emudeça o NPC no jogo. Certo lá, inútil aqui — "falhou em instalar
     * o rascunhador" sem motivo não diz se foi rede, cota, CORS ou navegador
     * sem OPFS, e são quatro consertos diferentes.
     */
    motivo?: () => string;
};

type EstadoDaPeca = {
    estado: 'espera' | 'baixando' | 'pronto' | 'falhou';
    motivo?: string;
};

type Corrida = {
    pergunta: string;
    semAbreviacao: string;
    emIngles: string;
    frases: string[];
    fala: string;
    marcadas: number;
    remendadas: number;
    limpezas: number;
    ms: number;
    msTraducao: number;
    erro: string;
};

const VAZIO: Corrida = {
    pergunta: '', semAbreviacao: '', emIngles: '', frases: [], fala: '',
    marcadas: 0, remendadas: 0, limpezas: 0, ms: 0, msTraducao: 0, erro: '',
};

const CAIXA = {
    background: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 8,
};

export default function Floor10PipelineSala() {
    const [pergunta, setPergunta] = useState(PERGUNTAS[0]);
    const [corrida, setCorrida] = useState<Corrida>(VAZIO);
    // ── DOIS ESTADOS, E NÃO UM ───────────────────────────────────────────
    // Eles eram o mesmo `ocupado`, e o resultado apareceu na foto de tela do
    // dono do jogo: a fila baixando e o botão de RODAR dizendo "rodando…". Um
    // botão que mente sobre o que está acontecendo é pior que um botão inerte.
    const [baixando, setBaixando] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [aviso, setAviso] = useState('');
    const [etapaViva, setEtapaViva] = useState('');
    // Quem já subiu NESTA sessão da sala. Ver o comentário em `Peca.carregado`:
    // duas das quatro peças não sabem responder isso sozinhas.
    const [subidas, setSubidas] = useState<ReadonlySet<string>>(new Set());
    // Redesenha quando uma peça de pé some (o botão de descarregar), para os
    // botões dizerem a verdade sem recarregar a página.
    const [tique, setTique] = useState(0);
    const [estados, setEstados] = useState<Record<string, EstadoDaPeca>>({});
    // A amostra viva da fila: o rascunhador reporta progresso em
    // `floor10Fila.progresso(FILA_RASCUNHO, …)` durante o download, e é daí que
    // sai a porcentagem da barra. As outras três peças não têm callback de
    // progresso (o Bergamot e o transformers.js baixam por dentro), então elas
    // andam em degrau — e a barra diz isso em vez de fingir precisão.
    const [amostra, setAmostra] = useState<DownloadSample | null>(null);
    const [linha, setLinha] = useState('');

    // A `etapa` do npcStore é onde as peças reais escrevem em que passo estão
    // (`PECAS_REAIS` faz `npcSet({ etapa })`). Ler daqui mostra o pipeline
    // andando ao vivo, e é o MESMO campo que a bolha de espera do jogo lê.
    useEffect(() => npcSubscribe(() => {
        setEtapaViva(npc.etapa);
        // `loadDownload` é onde o rascunhador publica a amostra do download —
        // e ele NÃO publicava ali até agora, o que deixava a barra em 0 MB
        // enquanto os bytes andavam. `linha` é o texto vivo ("12 MB de 822 MB ·
        // 1,3 MB/s"), que é o que responde "está andando ou travou?".
        setAmostra(npc.loadDownload ?? null);
        setLinha(npc.loadText ?? '');
    }), []);

    const PECAS: Peca[] = [
        {
            id: 'rascunho',
            nome: 'rascunhador · granite 1B-A400M',
            bytes: FLOOR10_RASCUNHADOR_MODEL.bytes,
            detalhe: 'escreve o primeiro jato em inglês · 400M ativos por token',
            carregado: rascunhadorJaCarregado,
            carregar: async () => (await baixarRascunhador()) && (await subirRascunhador()) !== null,
            motivo: ultimoErroDoRascunhador,
        },
        {
            id: 'tradutor',
            nome: 'tradutor · Bergamot en↔pt',
            bytes: FLOOR10_TRADUTOR_BYTES,
            detalhe: 'os DOIS pares: leva a pergunta e traz a fala',
            carregar: prepararTradutor,
            motivo: ultimoErroDoTradutor,
        },
        {
            id: 'juiz',
            nome: 'juiz de tom · all-mpnet-base-v2',
            bytes: FLOOR10_TOM_MODEL.bytes,
            detalhe: 'marca o que soa errado · 5 de 6 nas cegas, 10 ms por frase',
            carregar: prepararJuizDeTom,
            motivo: ultimoErroDoJuiz,
        },
        {
            id: 'revisor',
            nome: `revisor · ${SMALL_BRAIN_MODEL.label}`,
            bytes: SMALL_BRAIN_MODEL.bytes,
            detalhe: 'só entra nas frases que o juiz marcou · é o mesmo arquivo da vontade',
            carregado: vontadeJaCarregada,
            carregar: precarregarVontade,
            // A vontade já escreve o próprio motivo na tela do jogo há muito
            // tempo; aqui é só reaproveitar o mesmo campo.
            motivo: () => npc.deliberationLoadText,
        },
    ];

    /**
     * Está de pé? Duas das quatro peças não sabem responder isso sozinhas — ver
     * o comentário em `Peca.carregado` —, então a sala lembra por elas.
     */
    const dePe = (p: Peca) => (p.carregado ? p.carregado() : subidas.has(p.id));

    /**
     * ── A FILA: BAIXA TODAS, UMA DE CADA VEZ, E NÃO PARA NA PRIMEIRA FALHA ──
     *
     * Pedido do dono do jogo depois de o rascunhador falhar: uma barra só,
     * baixando tudo em fila, e o ERRO à vista quando uma falha.
     *
     * Três decisões, e cada uma tem um motivo:
     *
     * 1. UMA DE CADA VEZ. Quatro downloads paralelos dividem a mesma banda e a
     *    mesma CPU do celular, e o wllama ainda lê cada arquivo de volta do
     *    cache para dentro do WASM ao terminar. É a mesma regra da fila do jogo.
     *
     * 2. A FILA SEGUE depois de uma falha. Parar tudo porque o rascunhador não
     *    desceu esconderia que o tradutor e o juiz desceriam bem — e é a
     *    diferença entre "meu aparelho não aguenta" e "aquele arquivo não veio".
     *
     * 3. O MOTIVO VEM DA PEÇA, não do `catch` daqui. Os carregadores devolvem
     *    `false`/`null` em falha (regra do andar: erro não pode emudecer o NPC),
     *    então o `catch` local pegaria quase nada. Cada peça agora guarda o
     *    próprio `ultimoErro`, e é ele que aparece.
     */
    // Sem `useCallback`: ele depende de `PECAS` e `dePe`, que nascem de novo a
    // cada render. Memoizar exigiria uma lista de dependências que mente, e o
    // que se ganharia é zero — isto só roda no clique.
    const baixarTudo = async () => {
        setBaixando(true);
        setAviso('');
        setEstados(Object.fromEntries(PECAS.map((p) => [p.id, { estado: 'espera' as const }])));
        for (const peca of PECAS) {
            if (dePe(peca)) {
                setEstados((e) => ({ ...e, [peca.id]: { estado: 'pronto' } }));
                continue;
            }
            setEstados((e) => ({ ...e, [peca.id]: { estado: 'baixando' } }));
            let ok = false;
            let motivo = '';
            try {
                const r = await peca.carregar();
                ok = r !== false && r !== null && r !== undefined;
            } catch (erro) {
                motivo = erro instanceof Error ? erro.message : String(erro);
            }
            if (!ok && !motivo) motivo = peca.motivo?.() ?? '';
            if (ok) {
                setSubidas((s) => new Set(s).add(peca.id));
                setEstados((e) => ({ ...e, [peca.id]: { estado: 'pronto' } }));
            } else {
                setEstados((e) => ({
                    ...e,
                    [peca.id]: { estado: 'falhou', motivo: motivo || 'não subiu, e não disse por quê' },
                }));
            }
            setTique((t) => t + 1);
        }
        setBaixando(false);
    };

    /** Uma peça só, para tentar de novo sem refazer a fila inteira. */
    const subir = useCallback(async (peca: Peca) => {
        setEstados((e) => ({ ...e, [peca.id]: { estado: 'baixando' } }));
        let ok = false;
        let motivo = '';
        try {
            const r = await peca.carregar();
            ok = r !== false && r !== null && r !== undefined;
        } catch (erro) {
            motivo = erro instanceof Error ? erro.message : String(erro);
        }
        if (!ok && !motivo) motivo = peca.motivo?.() ?? '';
        setEstados((e) => ({
            ...e,
            [peca.id]: ok
                ? { estado: 'pronto' }
                : { estado: 'falhou', motivo: motivo || 'não subiu, e não disse por quê' },
        }));
        if (ok) setSubidas((s) => new Set(s).add(peca.id));
        setTique((t) => t + 1);
    }, []);

    const rodar = useCallback(async () => {
        setOcupado(true);
        setCorrida({ ...VAZIO, pergunta });
        try {
            // As duas primeiras etapas ficam à vista porque são as que ninguém
            // vê no jogo — e foram as duas que quebraram na medição.
            const semAbreviacao = desabreviar(pergunta);
            setCorrida((c) => ({ ...c, semAbreviacao }));

            const t0 = performance.now();
            const emIngles = await traduzirPerguntaParaIngles(pergunta);
            const msTraducao = Math.round(performance.now() - t0);
            if (!emIngles) {
                setCorrida((c) => ({ ...c, msTraducao, erro: 'o tradutor não devolveu a pergunta em inglês' }));
                return;
            }
            setCorrida((c) => ({ ...c, emIngles, msTraducao }));

            // ── DAQUI PARA BAIXO É O CÓDIGO DO JOGO, SEM CÓPIA ──────────
            const t1 = performance.now();
            const saida = await falarPeloPipelineReal(emIngles);
            const ms = Math.round(performance.now() - t1);
            if (!saida) {
                setCorrida((c) => ({
                    ...c,
                    ms,
                    erro: pipelineDisponivel()
                        ? 'o pipeline desistiu — veja a caixa-preta (`?bancada`) para o motivo'
                        : 'o pipeline não está disponível: falta subir o rascunhador',
                }));
                return;
            }
            setCorrida((c) => ({
                ...c,
                ms,
                fala: saida.fala,
                marcadas: saida.marcadas,
                remendadas: saida.remendadas,
                limpezas: saida.limpezas,
            }));
        } catch (erro) {
            setCorrida((c) => ({ ...c, erro: erro instanceof Error ? erro.message : String(erro) }));
        } finally {
            setOcupado(false);
        }
    }, [pergunta]);

    // `pipelineDisponivel()` só cobra o rascunhador — é ele que não pode ser
    // baixado na hora da fala. As outras três sobem sozinhas na primeira
    // chamada, então a sala roda sem elas; só fica mais lenta na primeira vez.
    const pronto = pipelineDisponivel();
    const faltando = PECAS.filter((p) => !dePe(p));
    const algumaFalhou = PECAS.some((p) => estados[p.id]?.estado === 'falhou');

    // ── A BARRA CONTA BYTES, NÃO PEÇAS ───────────────────────────────────
    //
    // Com 822 MB de um lado e 51 MB do outro, contar peças faria a barra pular
    // de 25% em 25% e mentir sobre quanto falta. Peça pronta conta INTEIRA;
    // a que está baixando conta o que já desceu, quando ela sabe dizer — só o
    // rascunhador sabe, e é justamente ele que domina o total.
    const bytesTotais = PECAS.reduce((s, p) => s + p.bytes, 0);
    const bytesFeitos = PECAS.reduce((s, p) => {
        if (dePe(p)) return s + p.bytes;
        if (estados[p.id]?.estado === 'baixando') return s + Math.min(amostra?.bytes ?? 0, p.bytes);
        return s;
    }, 0);
    const fracao = bytesTotais > 0 ? Math.max(0, Math.min(1, bytesFeitos / bytesTotais)) : 0;

    return (
        <div style={{
            font: '14px/1.5 ui-monospace, monospace',
            color: '#ddd',
            background: '#0b0b0b',
            minHeight: '100vh',
            padding: 16,
            maxWidth: 820,
            margin: '0 auto',
        }}>
            <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Sala do pipeline inglês-primeiro</h1>
            <p style={{ color: '#888', margin: '0 0 16px' }}>
                O jogador pergunta em português; o rascunhador, o juiz e o revisor trabalham em
                inglês. Esta sala mostra cada etapa com o tempo dela — no jogo você só vê a espera
                e depois a fala, e aí não dá para saber se o atalho valeu.
                <br />
                <code style={{ color: '#7fe0b0' }}>?pipeline</code> abre esta sala ·{' '}
                <code style={{ color: '#7fe0b0' }}>?pipeline=jogo</code> liga no jogo de verdade.
            </p>

            {/* ── A FILA, COM UMA BARRA SÓ ─────────────────────────────── */}
            <div style={CAIXA}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <strong>A instalação</strong>
                    <span style={{ color: '#888', flex: 1 }}>
                        {formatBytes(bytesFeitos)} de {formatBytes(bytesTotais)}
                        {' · '}{PECAS.filter((p) => dePe(p)).length} de {PECAS.length} peças
                    </span>
                </div>

                {/* A BARRA ÚNICA. Ela conta BYTES, não peças: com 822 MB de um
                    lado e 51 MB do outro, contar peças faria a barra pular de
                    25% em 25% e mentir sobre quanto falta. */}
                <div style={{
                    height: 10, background: '#1c1c1c', borderRadius: 5,
                    overflow: 'hidden', margin: '8px 0 4px',
                }}>
                    <div style={{
                        height: '100%',
                        width: `${Math.round(fracao * 100)}%`,
                        background: algumaFalhou
                            ? 'linear-gradient(90deg,#8a2f2f,#c2554a)'
                            : 'linear-gradient(90deg,#3a6df0,#7fe0b0)',
                        transition: 'width .3s',
                    }} />
                </div>

                <button
                    type="button"
                    onClick={() => void baixarTudo()}
                    disabled={baixando || ocupado}
                    style={{
                        marginTop: 6, marginBottom: 4,
                        background: baixando ? '#232323' : '#2a3550',
                        color: baixando ? '#666' : '#cfd6e4',
                        border: '1px solid #333', borderRadius: 6,
                        padding: '8px 14px', cursor: baixando ? 'default' : 'pointer',
                    }}
                >
                    {baixando
                        ? 'baixando…'
                        : (algumaFalhou ? 'tentar de novo o que faltou' : 'baixar tudo em fila')}
                </button>

                {/* ── O SINAL DE VIDA ──────────────────────────────────────
                    O relato foi "fica nisso eternamente". Sem velocidade nem
                    "parado há Ns" na tela, travado e lento são idênticos — e a
                    diferença decide se é para esperar ou desistir. */}
                {baixando && (
                    <div style={{
                        marginBottom: 6, fontSize: 12,
                        color: (amostra?.stalledSec ?? 0) >= 10 ? '#f5c96b' : '#7aa2ff',
                    }}>
                        {(amostra?.stalledSec ?? 0) >= 10
                            ? `parado há ${Math.round(amostra?.stalledSec ?? 0)}s — se passar do prazo, ele desiste e diz por quê`
                            : (linha || 'conversando com o CDN…')}
                    </div>
                )}
                <div style={{ color: '#777', fontSize: 12, marginBottom: 4 }}>
                    Uma de cada vez: quatro downloads paralelos dividem a mesma banda e a mesma CPU
                    do celular. A fila SEGUE depois de uma falha — parar tudo esconderia que as
                    outras desceriam bem.
                </div>

                {PECAS.map((p) => {
                    const st: EstadoDaPeca = dePe(p)
                        ? { estado: 'pronto' }
                        : (estados[p.id] ?? { estado: 'espera' });
                    const cor = {
                        espera: '#666', baixando: '#7aa2ff', pronto: '#7fe0b0', falhou: '#ff9c9c',
                    }[st.estado];
                    const marca = {
                        espera: '·', baixando: '↓', pronto: '✓', falhou: '✗',
                    }[st.estado];
                    const d = st.motivo ? diagnosticar(st.motivo) : null;
                    return (
                        <div key={p.id} style={{
                            marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e1e1e',
                        }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                <span style={{ color: cor, width: 14 }}>{marca}</span>
                                <span style={{ flex: '1 1 240px' }}>
                                    {p.nome}
                                    <br />
                                    <span style={{ color: '#777', fontSize: 12 }}>{p.detalhe}</span>
                                </span>
                                <span style={{ color: '#888' }}>{formatBytes(p.bytes)}</span>
                                {st.estado === 'falhou' && (
                                    <button
                                        type="button"
                                        onClick={() => void subir(p)}
                                        disabled={baixando || ocupado}
                                        style={{
                                            background: '#20242e', color: '#cfd6e4',
                                            border: '1px solid #333', borderRadius: 6,
                                            padding: '4px 10px',
                                            cursor: ocupado ? 'default' : 'pointer',
                                        }}
                                    >
                                        de novo
                                    </button>
                                )}
                            </div>

                            {/* ── O ERRO, À VISTA ───────────────────────────── */}
                            {st.estado === 'falhou' && (
                                <div style={{
                                    marginTop: 6, padding: '8px 10px', borderRadius: 6,
                                    background: '#241616', border: '1px solid #4a2a2a',
                                }}>
                                    {d ? (
                                        <>
                                            <div style={{ color: '#ff9c9c' }}>{d.resumo}</div>
                                            <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#c9a0a0' }}>
                                                {d.saidas.map((s) => <li key={s}>{s}</li>)}
                                            </ul>
                                        </>
                                    ) : (
                                        <div style={{ color: '#ff9c9c' }}>
                                            não reconheci este erro — o texto cru vale mais que um
                                            palpite meu
                                        </div>
                                    )}
                                    {/* O texto CRU sempre aparece, mesmo com diagnóstico: o
                                        diagnóstico é hipótese, e a mensagem é o fato. */}
                                    <div style={{
                                        marginTop: 6, color: '#8a7a7a', fontSize: 12,
                                        wordBreak: 'break-word',
                                    }}>
                                        {st.motivo}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                <div style={{ marginTop: 10, color: pronto ? '#7fe0b0' : '#f5c96b' }}>
                    {pronto
                        ? 'o pipeline pode rodar'
                        : 'falta o rascunhador — sem ele de pé o pipeline nem tenta'}
                </div>
                {pronto && faltando.length > 0 && (
                    <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
                        {faltando.map((p) => p.nome.split(' · ')[0]).join(', ')} sobem sozinhos na
                        primeira chamada — a primeira corrida fica mais lenta, e os tempos abaixo
                        incluem o download.
                    </div>
                )}
                {/* O `tique` existe para o React redesenhar os botões quando uma
                    peça termina de subir. Sem ele os "✓ de pé" só apareceriam
                    na próxima interação. */}
                <span hidden>{tique}</span>
            </div>

            {/* ── A PERGUNTA ───────────────────────────────────────────── */}
            <div style={CAIXA}>
                <strong>A pergunta, em português</strong>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {PERGUNTAS.map((q, i) => (
                        <button
                            key={q}
                            type="button"
                            onClick={() => setPergunta(q)}
                            style={{
                                background: pergunta === q ? '#2a3550' : '#181818',
                                color: '#cfd6e4', border: '1px solid #333',
                                borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                            }}
                        >
                            {i + 1}
                        </button>
                    ))}
                </div>
                <textarea
                    value={pergunta}
                    onChange={(e) => setPergunta(e.target.value)}
                    rows={2}
                    style={{
                        width: '100%', marginTop: 8, background: '#0b0b0b', color: '#ddd',
                        border: '1px solid #333', borderRadius: 6, padding: 8,
                        font: 'inherit', boxSizing: 'border-box',
                    }}
                />
                <button
                    type="button"
                    onClick={() => void rodar()}
                    disabled={ocupado || !pronto}
                    style={{
                        marginTop: 8, background: pronto ? '#2f6b4f' : '#232323',
                        color: pronto ? '#eaffee' : '#666',
                        border: '1px solid #333', borderRadius: 6,
                        padding: '8px 14px', cursor: ocupado || !pronto ? 'default' : 'pointer',
                    }}
                >
                    {ocupado ? (etapaViva || 'rodando…') : 'rodar o pipeline'}
                </button>
                {aviso && <div style={{ color: '#f5c96b', marginTop: 8 }}>{aviso}</div>}
            </div>

            {/* ── AS ETAPAS ────────────────────────────────────────────── */}
            {corrida.pergunta && (
                <div style={CAIXA}>
                    <strong>As etapas</strong>
                    <Etapa
                        n="1"
                        titulo="desabreviar"
                        nota="microssegundos · sem isto o Bergamot copia `vc`, `pq` e `n` crus para o inglês"
                        texto={corrida.semAbreviacao}
                        mudou={corrida.semAbreviacao !== corrida.pergunta}
                    />
                    <Etapa
                        n="2"
                        titulo={`Bergamot pt → en · ${corrida.msTraducao} ms`}
                        nota="daqui para baixo tudo é em inglês, inclusive o juiz"
                        texto={corrida.emIngles}
                    />
                    {corrida.fala && (
                        <>
                            <Etapa
                                n="3-5"
                                titulo={`rascunho → juiz → revisor → Bergamot en → pt · ${corrida.ms} ms`}
                                nota={`${corrida.marcadas} frase(s) marcada(s) pelo juiz · `
                                    + `${corrida.remendadas} remendada(s) · ${corrida.limpezas} limpeza(s)`}
                                texto=""
                            />
                            <div style={{
                                marginTop: 8, padding: 12, borderRadius: 6,
                                background: '#12261c', border: '1px solid #24503a',
                            }}>
                                <div style={{ color: '#7fe0b0', fontSize: 12, marginBottom: 4 }}>
                                    a fala que chegaria ao jogador
                                </div>
                                <div style={{ fontSize: 15 }}>{corrida.fala}</div>
                            </div>
                            <div style={{ marginTop: 10, color: '#888' }}>
                                total <strong style={{ color: '#ddd' }}>
                                    {((corrida.ms + corrida.msTraducao) / 1000).toFixed(1)}s
                                </strong>
                                {' '}· o SmolLM3 escrevendo a mesma fala sozinho custou{' '}
                                <strong style={{ color: '#ddd' }}>13,4s</strong> na bancada
                                {corrida.marcadas === 0
                                    ? ' — o juiz não marcou nada, que é onde o pipeline ganha'
                                    : ' — com frase marcada o revisor entra e o ganho encolhe'}
                            </div>
                            <div style={{ marginTop: 6, color: '#666', fontSize: 12 }}>
                                {enumerarEmIngles(corrida.fala).length} frase(s) na saída
                            </div>
                        </>
                    )}
                    {corrida.erro && (
                        <div style={{ color: '#ff9c9c', marginTop: 10 }}>{corrida.erro}</div>
                    )}
                </div>
            )}

            <div style={{ ...CAIXA, color: '#777', fontSize: 12 }}>
                <strong style={{ color: '#999' }}>O que esta sala NÃO testa</strong>
                <br />
                Memória e histórico. O rascunhador recebe a persona e a pergunta, e nada mais — é
                o teto de 1024 de contexto que compra os 3,2 s. No jogo isso significa que o Nilo
                responde bem a pergunta solta e pior a &quot;e aquilo que você disse antes?&quot;.
                Essa metade só dá para sentir com <code>?pipeline=jogo</code>.
                <br /><br />
                <button
                    type="button"
                    onClick={() => void descarregarRascunhador().then(() => {
                        setSubidas((s) => { const n = new Set(s); n.delete('rascunho'); return n; });
                        setTique((t) => t + 1);
                    })}
                    style={{
                        background: '#2a1d1d', color: '#ff9c9c', border: '1px solid #4a2a2a',
                        borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                    }}
                >
                    descarregar o rascunhador
                </button>
                <span> — devolve ~98% da RAM em menos de 5 s (medido)</span>
            </div>
        </div>
    );
}

function Etapa({ n, titulo, nota, texto, mudou }: {
    n: string; titulo: string; nota: string; texto: string; mudou?: boolean;
}) {
    return (
        <div style={{ marginTop: 10, paddingLeft: 10, borderLeft: '2px solid #2a2a2a' }}>
            <div style={{ color: '#a8bcf0' }}>
                {n}. {titulo}
                {mudou === false && <span style={{ color: '#666' }}> (não mudou nada)</span>}
            </div>
            <div style={{ color: '#666', fontSize: 12 }}>{nota}</div>
            {texto && <div style={{ marginTop: 4 }}>{texto}</div>}
        </div>
    );
}
