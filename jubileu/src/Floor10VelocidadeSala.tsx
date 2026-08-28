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
} as const;
type ChaveModelo = keyof typeof MODELOS;

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

const CAIXA: React.CSSProperties = {
    border: '1px solid #333', borderRadius: 8, padding: 12, marginBottom: 12, background: '#141414',
};

type Medida = {
    carga: number; geracaoMs: number; prefillMs: number; fala: string;
};

async function baixarComBarra(url: string, bytes: number,
    aoAndar: (feitos: number, total: number) => void): Promise<Blob> {
    const r = await fetch(url);
    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
    const total = Number(r.headers.get('content-length')) || bytes;
    const leitor = r.body.getReader();
    const partes: BlobPart[] = [];
    let feitos = 0;
    for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        partes.push(value as BlobPart);
        feitos += value.length;
        aoAndar(feitos, total);
    }
    return new Blob(partes);
}

export default function Floor10VelocidadeSala() {
    const [modelo, setModelo] = useState<ChaveModelo>('q4km');
    const [espec, setEspec] = useState(false);
    const [fase, setFase] = useState('parado');
    const [feitos, setFeitos] = useState(0);
    const [total, setTotal] = useState(0);
    const [medida, setMedida] = useState<Medida | null>(null);
    const [erro, setErro] = useState('');
    const rodando = useRef(false);

    useEffect(() => liberarRolagem(), []);

    const medir = useCallback(async () => {
        if (rodando.current) return;
        rodando.current = true;
        setErro(''); setMedida(null);
        try {
            const M = MODELOS[modelo];
            setFase(`baixando ${M.rotulo}`);
            const blobModelo = await baixarComBarra(M.url, M.bytes, (f, t) => { setFeitos(f); setTotal(t); });

            let blobDraft: Blob | null = null;
            if (espec) {
                if (!MOTOR_LOCAL) throw new Error('a especulativa exige ?motor=relaxed');
                setFase(`baixando ${DRAFT.rotulo}`);
                blobDraft = await baixarComBarra(DRAFT.url, DRAFT.bytes, (f, t) => { setFeitos(f); setTotal(t); });
            }

            setFase('subindo o modelo');
            const mod = await import(/* @vite-ignore */ WLLAMA_ESM) as {
                Wllama: new (p: Record<string, string>, o?: Record<string, unknown>) => {
                    loadModel(b: Blob[], p: Record<string, unknown>): Promise<void>;
                    createChatCompletion(p: Record<string, unknown>): Promise<unknown>;
                    exit?(): Promise<void>;
                };
            };
            const w = new mod.Wllama({ default: WASM }, { suppressNativeLog: true });
            const t0 = performance.now();
            await w.loadModel([blobModelo], {
                n_ctx: 2048, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
                jinja: true, reasoning: false, warmup: false,
                ...(blobDraft ? {
                    spec_draft_blob: blobDraft, spec_draft_n_max: 4,
                    spec_draft_n_min: 1, spec_draft_p_min: 0.6,
                    spec_draft_ngl: 0, spec_draft_threads: 2,
                } : {}),
            });
            const carga = performance.now() - t0;

            const msgs = [{ role: 'system', content: PERSONA }, { role: 'user', content: PERGUNTA }];
            const rodada = async (n: number, cache: boolean) => {
                const t = performance.now();
                const res = await w.createChatCompletion({
                    messages: msgs, n_predict: n, temp: 0, cache_prompt: cache, ignore_eos: true,
                }) as { choices?: { message?: { content?: string } }[] };
                return { ms: performance.now() - t, txt: res?.choices?.[0]?.message?.content ?? '' };
            };

            setFase('medindo');
            await rodada(4, true);                       // aquece e enche o cache
            const curto = await rodada(CURTO, true);
            const longo = await rodada(LONGO, true);
            // Cache desligado: paga o prompt inteiro de novo, e a diferença
            // contra o quente é o custo do prefill.
            const frio = await rodada(CURTO, false);

            setMedida({
                carga,
                geracaoMs: (longo.ms - curto.ms) / (LONGO - CURTO),
                prefillMs: (frio.ms - curto.ms) / 230,
                fala: longo.txt.trim(),
            });
            setFase('pronto');
            try { await w.exit?.(); } catch { /* já foi */ }
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
            setFase('falhou');
        } finally {
            rodando.current = false;
        }
    }, [modelo, espec]);

    const bytesPrecisos = MODELOS[modelo].bytes + (espec ? DRAFT.bytes : 0);

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
                                    disabled={fase !== 'parado' && fase !== 'pronto' && fase !== 'falhou'} />
                                {' '}{MODELOS[k].rotulo}{' '}
                                <span style={{ color: '#666' }}>
                                    · {formatBytes(MODELOS[k].bytes)} · {MODELOS[k].nota}
                                </span>
                            </label>
                        ))}
                        <label style={{ display: 'block', marginTop: 10, cursor: MOTOR_LOCAL ? 'pointer' : 'not-allowed' }}>
                            <input type="checkbox" checked={espec} disabled={!MOTOR_LOCAL}
                                onChange={(e) => setEspec(e.target.checked)} />
                            {' '}especulativa com o draft de 200M{' '}
                            <span style={{ color: '#666' }}>· +{formatBytes(DRAFT.bytes)}</span>
                            {!MOTOR_LOCAL && <span style={{ color: '#c88' }}> · exige ?motor=relaxed</span>}
                        </label>
                    </div>
                    <div style={{ color: '#888', marginTop: 10 }}>
                        vai baixar {formatBytes(bytesPrecisos)}
                    </div>
                    <button onClick={medir}
                        disabled={fase !== 'parado' && fase !== 'pronto' && fase !== 'falhou'}
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
                        {total > 0 && fase.startsWith('baixando') && (
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
                                <tr><td style={{ color: '#888' }}>ganho do lote</td>
                                    <td colSpan={2}>{(medida.geracaoMs / medida.prefillMs).toFixed(2)}×</td></tr>
                            </tbody>
                        </table>
                        <div style={{ color: '#888', marginTop: 10, fontSize: 13 }}>
                            O <em>ganho do lote</em> é o que decide a especulativa: ela confere vários
                            tokens numa passada, então só paga se processar em lote for MUITO mais
                            barato que um token de cada vez. Na bancada x86 deu 1,5× — e com 1,5×
                            conferir 6 tokens custa 4, o que nenhuma taxa de aceite cobre.
                        </div>
                        <div style={{ marginTop: 10, color: '#bbb', whiteSpace: 'pre-wrap' }}>
                            “{medida.fala.slice(0, 260)}”
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
