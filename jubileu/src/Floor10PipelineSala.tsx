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
    rascunhadorJaCarregado, descarregarRascunhador,
} from './npc/floor10Rascunhador';
import { FLOOR10_TOM_MODEL, prepararJuizDeTom } from './npc/floor10VetorDeTom';
import {
    FLOOR10_TRADUTOR_BYTES, prepararTradutor, desabreviar,
    traduzirPerguntaParaIngles,
} from './npc/floor10Tradutor';
import { SMALL_BRAIN_MODEL, precarregarVontade, vontadeJaCarregada } from './npc/floor10SmallBrain';
import { falarPeloPipelineReal, pipelineDisponivel } from './npc/floor10PipelineReal';
import { enumerarEmIngles } from './npc/floor10Pipeline';
import { formatBytes } from './npc/floor10Download';
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
    const [ocupado, setOcupado] = useState(false);
    const [aviso, setAviso] = useState('');
    const [etapaViva, setEtapaViva] = useState('');
    // Quem já subiu NESTA sessão da sala. Ver o comentário em `Peca.carregado`:
    // duas das quatro peças não sabem responder isso sozinhas.
    const [subidas, setSubidas] = useState<ReadonlySet<string>>(new Set());
    // Redesenha quando uma peça de pé some (o botão de descarregar), para os
    // botões dizerem a verdade sem recarregar a página.
    const [tique, setTique] = useState(0);

    // A `etapa` do npcStore é onde as peças reais escrevem em que passo estão
    // (`PECAS_REAIS` faz `npcSet({ etapa })`). Ler daqui mostra o pipeline
    // andando ao vivo, e é o MESMO campo que a bolha de espera do jogo lê.
    useEffect(() => npcSubscribe(() => setEtapaViva(npc.etapa)), []);

    const PECAS: Peca[] = [
        {
            id: 'rascunho',
            nome: 'rascunhador · granite 1B-A400M',
            bytes: FLOOR10_RASCUNHADOR_MODEL.bytes,
            detalhe: 'escreve o primeiro jato em inglês · 400M ativos por token',
            carregado: rascunhadorJaCarregado,
            carregar: async () => (await baixarRascunhador()) && (await subirRascunhador()) !== null,
        },
        {
            id: 'tradutor',
            nome: 'tradutor · Bergamot en↔pt',
            bytes: FLOOR10_TRADUTOR_BYTES,
            detalhe: 'os DOIS pares: leva a pergunta e traz a fala',
            carregar: prepararTradutor,
        },
        {
            id: 'juiz',
            nome: 'juiz de tom · all-mpnet-base-v2',
            bytes: FLOOR10_TOM_MODEL.bytes,
            detalhe: 'marca o que soa errado · 5 de 6 nas cegas, 10 ms por frase',
            carregar: prepararJuizDeTom,
        },
        {
            id: 'revisor',
            nome: `revisor · ${SMALL_BRAIN_MODEL.label}`,
            bytes: SMALL_BRAIN_MODEL.bytes,
            detalhe: 'só entra nas frases que o juiz marcou · é o mesmo arquivo da vontade',
            carregado: vontadeJaCarregada,
            carregar: precarregarVontade,
        },
    ];

    const subir = useCallback(async (peca: Peca) => {
        setAviso(`subindo ${peca.nome}…`);
        try {
            // `prepararTradutor` e `prepararJuizDeTom` devolvem `null` em falha
            // em vez de lançar — é a regra deste andar. Por isso o `null` conta
            // como fracasso aqui, senão a sala marcaria de pé quem não subiu.
            const r = await peca.carregar();
            if (r === null || r === false) {
                setAviso(`o ${peca.nome} não subiu — veja o console`);
                return;
            }
            setSubidas((s) => new Set(s).add(peca.id));
            setAviso('');
        } catch (erro) {
            setAviso(`falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
        } finally {
            setTique((t) => t + 1);
        }
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

    const dePe = (p: Peca) => (p.carregado ? p.carregado() : subidas.has(p.id));
    // `pipelineDisponivel()` só cobra o rascunhador — é ele que não pode ser
    // baixado na hora da fala. As outras três sobem sozinhas na primeira
    // chamada, então a sala roda sem elas; só fica mais lenta na primeira vez.
    const pronto = pipelineDisponivel();
    const faltando = PECAS.filter((p) => !dePe(p));

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

            {/* ── AS PEÇAS ─────────────────────────────────────────────── */}
            <div style={CAIXA}>
                <strong>As peças</strong>
                <span style={{ color: '#888' }}>
                    {' '}— nada baixa sozinho; abrir uma aba não pode custar 1 GB
                </span>
                {PECAS.map((p) => (
                    <div key={p.nome} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        marginTop: 8, flexWrap: 'wrap',
                    }}>
                        <button
                            type="button"
                            onClick={() => void subir(p)}
                            disabled={ocupado}
                            style={{
                                background: dePe(p) ? '#1d3a2a' : '#20242e',
                                color: dePe(p) ? '#7fe0b0' : '#cfd6e4',
                                border: '1px solid #333', borderRadius: 6,
                                padding: '6px 10px', cursor: ocupado ? 'default' : 'pointer',
                                minWidth: 92,
                            }}
                        >
                            {dePe(p) ? '✓ de pé' : 'carregar'}
                        </button>
                        <span style={{ flex: '1 1 260px' }}>
                            {p.nome}
                            <br />
                            <span style={{ color: '#777', fontSize: 12 }}>{p.detalhe}</span>
                        </span>
                        <span style={{ color: '#888' }}>{formatBytes(p.bytes)}</span>
                    </div>
                ))}
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
