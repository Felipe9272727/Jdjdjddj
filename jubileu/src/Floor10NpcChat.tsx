import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNpc, npc, npcSet } from './npc/npcStore';
// Motor do NPC: wllama híbrido, com parte do Smol na WebGPU e fallback CPU.
import { FLOOR10_MODEL, initLLM, sendToNpc } from './npc/wllamaEngine';
import { NPC_NAME } from './npc/floor10Canon';
import { deliberationThought } from './npc/floor10Deliberation';
import { SMALL_BRAIN_MODEL } from './npc/floor10SmallBrain';
import { FLOOR10_REFLEXO_MODEL, precarregarReflexo } from './npc/floor10Reflexo';
import {
    FLOOR10_MOTOR_MODEL,
    FLOOR10_MOTOR_SIZE_LABEL,
} from './npc/floor10MotorBrain';
import {
    DOWNLOAD_STALL_SEC,
    downloadLine,
    type DownloadSample,
} from './npc/floor10Download';
import { formatGB } from './npc/floor10ModelStorage';
import { useOptionalSettings } from './Settings';
import { SPEECH_BRAIN_BYTES } from './npc/floor10Brains';
import {
    definirFilaDoAndar10, filaLinha, floor10Fila,
    FILA_MOTOR, FILA_VONTADE, FILA_MEMORIA,
} from './npc/floor10Fila';
import { iniciarPrecarga, passosDoAndar10, precargaEtapa } from './npc/floor10Precarga';
import { precarregarVontade } from './npc/floor10SmallBrain';
import { precarregarMotor } from './npc/floor10MotorBrain';
import {
    FLOOR10_MEMORIA_MODEL,
    FLOOR10_MEMORIA_SIZE_LABEL,
    precarregarMemoria,
} from './npc/floor10Memoria';

// A fila nasce sabendo os quatro tamanhos. Fica aqui porque este é o arquivo que
// já importa os três catálogos — e assim `floor10Fila` não precisa importar
// motor nenhum, o que fecharia um ciclo.
definirFilaDoAndar10({
    fala: SPEECH_BRAIN_BYTES,
    vontade: SMALL_BRAIN_MODEL.bytes,
    motor: FLOOR10_MOTOR_MODEL.bytes,
    memoria: FLOOR10_MEMORIA_MODEL.bytes,
    reflexo: FLOOR10_REFLEXO_MODEL.bytes,
});

// ── UI DE CONVERSA COM O NPC (overlay DOM) ─────────────────────────────────
// Vive FORA do Canvas. Reage ao npcStore: mostra a dica quando o player chega
// perto, abre o painel de chat (tecla E ou toque), pré-aquece o cérebro de fala
// enquanto o jogador digita e transmite a resposta.
// Mobile-first (o Felipe joga no celular): input embaixo, alvos grandes.
//
// REGRA DE OURO: erro NUNCA fica invisível. Antes, falhas na geração só
// escreviam st.error na fase 'ready' — e a UI só mostrava erro na fase
// 'error' → silêncio total (o "tudo quieto" do bug). Agora a faixa de erro
// aparece em QUALQUER fase enquanto houver mensagem.

/** Cores por cérebro: dá para saber QUAL barra está andando sem ler o rótulo. */
const TOM_VONTADE = { barra: 'linear-gradient(90deg,#c58a22,#f5c96b)', texto: '#f5c96b' };
const TOM_MOTOR = { barra: 'linear-gradient(90deg,#2f8f6b,#7fe0b0)', texto: '#7fe0b0' };
const TOM_MEMORIA = { barra: 'linear-gradient(90deg,#6b3fa0,#c39bf0)', texto: '#c39bf0' };
const TOM_FALHOU = { barra: 'linear-gradient(90deg,#8a2f2f,#c2554a)', texto: '#ff9c9c' };
const TOM_FILA = { barra: 'linear-gradient(90deg,#3a6df0,#7fe0b0)', texto: '#cfd6e4' };
const TOM_FALA = { barra: 'linear-gradient(90deg,#3a6df0,#7aa2ff)', texto: '#a8bcf0' };

/**
 * UMA linha de download: rótulo, porcentagem, barra, os BYTES e o estado.
 *
 * Existe porque cada cérebro tinha o seu próprio código de tela, e foi assim
 * que o tradutor motor de 386 MB acabou sem barra nenhuma — pior, escrevendo
 * nos campos da vontade, então a tela mostrava o nome do Llama 1B enquanto
 * baixava outro arquivo. Agora os três passam pela mesma régua.
 */
const LinhaDownload: React.FC<{
    rotulo: string;
    pct: number;
    amostra: DownloadSample;
    detalhe: string;
    tom: { barra: string; texto: string };
    flutuante?: boolean;
}> = ({ rotulo, pct, amostra, detalhe, tom, flutuante = false }) => {
    // Travou? A barra muda de cor junto com o texto: dá para perceber sem ler.
    const travado = amostra.stalledSec >= DOWNLOAD_STALL_SEC;
    return (
        <div>
            <div
                style={flutuante
                    ? { ...miniDownloadTitleStyle, color: tom.texto }
                    : { ...modelLoadingTitleStyle, color: tom.texto }}
            >
                <span>{rotulo}</span>
                <strong>{pct}%</strong>
            </div>
            <div style={barOuter}>
                <div style={{
                    height: '100%',
                    transition: 'width 0.2s',
                    width: `${pct}%`,
                    background: travado ? '#c2554a' : tom.barra,
                }}
                />
            </div>
            {/* Os BYTES. Porcentagem sozinha não distingue "acabou de começar"
                de "parado faz três minutos". */}
            <div style={downloadBytesStyle}>{downloadLine(amostra)}</div>
            <div style={flutuante ? miniDownloadTextStyle : modelLoadingDetailStyle}>
                {detalhe}
            </div>
        </div>
    );
};

/**
 * O RACIOCÍNIO DO NILO, COMO ELE SAI.
 *
 * Não é resumo nem paráfrase: é o texto que o cérebro de vontade está
 * escrevendo neste instante, com os números que explicam a demora — quantos
 * núcleos, quantos tokens por segundo, há quantos segundos. Nasceu de uma
 * reclamação exata de quem joga: "está demorando muito pra pensar, e eu nunca
 * sei o processo de pensamento".
 *
 * Some com um toque na opção "Pensamento do Nilo" das configurações.
 */
const PensamentoCru: React.FC<{
    texto: string;
    pensando: boolean;
    tps: number;
    threads: number;
    segundos: number;
}> = ({ texto, pensando, tps, threads, segundos }) => (
    <div style={pensamentoCruStyle} aria-live="polite">
        <div style={pensamentoCabecaStyle}>
            <span>{pensando ? '🧠 vontade · pensando' : '🧠 vontade · pensou'}</span>
            <span style={{ opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}>
                {threads > 0 ? `CPU×${threads}` : ''}
                {tps > 0 ? ` · ${tps.toFixed(1)} tok/s` : ''}
                {segundos > 0 ? ` · ${segundos.toFixed(0)}s` : ''}
            </span>
        </div>
        <div style={pensamentoTextoStyle}>
            {/* column-reverse: o texto novo empurra o antigo para cima
                sozinho, sem precisar mexer no scroll a cada token. */}
            <span>
                {texto}
                {pensando && <span style={{ opacity: 0.5 }}>▌</span>}
            </span>
        </div>
    </div>
);

const Floor10NpcChat: React.FC = () => {
    const st = useNpc();
    const { showNiloThoughts } = useOptionalSettings();
    const [input, setInput] = useState('');
    const [thinkingSeconds, setThinkingSeconds] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    const open = useCallback(() => {
        if (npc.open) return;
        npcSet({ open: true });
        // DISPARA A FILA INTEIRA, não só a fala.
        //
        // Antes aqui só havia `initLLM()`. Os outros dois cérebros esperavam
        // alguém precisar deles — e por isso a barra da fila parava em "1 de 4"
        // e ficava lá. Agora os quatro descem em sequência, e a conversa libera
        // assim que o primeiro chega, sem esperar os 3,9 GB.
        void iniciarPrecarga(passosDoAndar10({
            fala: () => initLLM(),
            vontade: () => precarregarVontade(),
            motor: () => precarregarMotor(),
            memoria: () => precarregarMemoria(),
            // O quinto e último: o reflexo em ONNX. Desce depois de tudo de que
            // a conversa depende — se falhar, a única coisa que se perde é o
            // preenchimento do primeiro segundo.
            reflexo: () => precarregarReflexo(),
        }));
    }, []);
    const close = useCallback(() => { npcSet({ open: false }); }, []);

    // tecla E abre (quando perto), Esc fecha
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && npc.open) { e.preventDefault(); close(); }
            else if ((e.key === 'e' || e.key === 'E') && npc.near && !npc.open) {
                const tag = (document.activeElement?.tagName ?? '').toLowerCase();
                if (tag === 'input' || tag === 'textarea') return;
                e.preventDefault(); open();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, close]);

    // auto-scroll pro fim quando chega texto
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [st.history.length, st.streaming, st.phase, st.error]);

    // O prefill de um LLM local é a parte mais lenta. Mostrar tempo corrido
    // distingue "a CPU está trabalhando" de um Worker realmente morto; o
    // watchdog do motor continua sendo o limite de segurança.
    useEffect(() => {
        if (st.phase !== 'thinking') {
            setThinkingSeconds(0);
            return;
        }
        const startedAt = Date.now();
        setThinkingSeconds(0);
        const timer = window.setInterval(
            () => setThinkingSeconds(Math.floor((Date.now() - startedAt) / 1000)),
            1000,
        );
        return () => window.clearInterval(timer);
    }, [st.phase]);

    // Fala iniciada pela própria vontade desaparece da tela, mas permanece no
    // histórico: quando o jogador responder, o Smol sabe o que Nilo acabou de
    // dizer e a conversa não recomeça do zero.
    useEffect(() => {
        if (!st.autonomousSpeech) return;
        const speechId = st.autonomousSpeechId;
        const timer = window.setTimeout(() => {
            if (npc.autonomousSpeechId === speechId) npcSet({ autonomousSpeech: '' });
        }, 7000);
        return () => window.clearTimeout(timer);
    }, [st.autonomousSpeech, st.autonomousSpeechId]);

    const send = () => {
        const t = input.trim();
        // Durante o pré-aquecimento o jogador já pode escrever; Enter só envia
        // quando o runtime estiver pronto, sem apagar o texto digitado.
        if (!t || st.phase === 'thinking' || st.phase === 'loading') return;
        setInput('');
        void sendToNpc(t);
    };

    // dica flutuante quando perto e fechado
    if (!st.open) {
        const miniLoading = st.deliberationPhase === 'loading';
        const miniPct = Math.round(st.deliberationLoadProgress * 100);
        // O TERCEIRO cérebro. Ele baixa DEPOIS da vontade, dentro da mesma
        // deliberação — então as duas barras podem aparecer na mesma sessão,
        // uma seguida da outra, e cada uma precisa dizer de qual arquivo é.
        const motorLoading = st.motorPhase === 'loading';
        const motorPct = Math.round(st.motorLoadProgress * 100);
        const memoriaLoading = st.memoriaPhase === 'loading';
        const baixandoCerebro = miniLoading || motorLoading || memoriaLoading;
        const filaFlut = floor10Fila.estado();
        const speechAudible = st.autonomousSpeech !== ''
            && (st.perception.player?.distance ?? Infinity) <= 9;
        // Pensamento do 2º cérebro: bolha no mundo, não linha no painel — dá
        // para ver que ele tem vida própria SEM abrir a conversa. Some quando
        // ele fala de verdade: a fala manda mais que o pensamento.
        const thought = deliberationThought(st.deliberationPhase, st.deliberationGoal);
        const thoughtVisible = !baixandoCerebro && thought !== '' && !speechAudible
            && (st.perception.player?.distance ?? Infinity) <= 9;
        // O pensamento cru NÃO depende de estar perto: ele pensa o tempo todo, e
        // a pergunta que isto responde ("ele está vivo ou travado?") é a mesma
        // do outro lado da sala.
        const pensamentoVisivel = showNiloThoughts && !baixandoCerebro
            && st.deliberationLive !== ''
            && (st.deliberationPhase === 'thinking'
                || st.deliberationPhase === 'decided'
                // Durante a reabertura o texto na tela é o pensamento PAUSADO,
                // que vai ser continuado. Escondê-lo aqui fazia o raciocínio
                // sumir e reaparecer, parecendo que tinha sido perdido.
                || st.deliberationPhase === 'reopening');
        if (!st.near && !speechAudible && !thoughtVisible && !baixandoCerebro
            && !pensamentoVisivel) return null;
        return (
            <>
                {baixandoCerebro && (
                    <div style={miniDownloadFloatingStyle} aria-live="polite">
                        <LinhaDownload
                            flutuante
                            rotulo={`⬇ ${filaLinha(filaFlut)}`}
                            pct={Math.round(filaFlut.fracao * 100)}
                            amostra={{
                                ...filaFlut.amostra,
                                bytes: filaFlut.bytesBaixados,
                                totalBytes: filaFlut.bytesTotais,
                            }}
                            detalhe={filaFlut.atual?.id === FILA_MOTOR
                                ? st.motorLoadText
                                : filaFlut.atual?.id === FILA_MEMORIA
                                    ? st.memoriaLoadText
                                    : st.deliberationLoadText}
                            tom={TOM_FILA}
                        />
                    </div>
                )}
                {pensamentoVisivel && (
                    <PensamentoCru
                        texto={st.deliberationLive}
                        pensando={st.deliberationPhase === 'thinking'}
                        tps={st.deliberationTps}
                        threads={st.deliberationThreads}
                        segundos={st.deliberationSeconds}
                    />
                )}
                {thoughtVisible && (
                    <div style={thoughtBubbleStyle}>
                        <span style={{ opacity: 0.75 }}>💭</span>
                        <span style={{ fontStyle: 'italic' }}>{thought}</span>
                    </div>
                )}
                {speechAudible && (
                    <div style={autonomousSpeechStyle}>
                        <strong style={{ color: '#f5c96b' }}>{NPC_NAME}</strong>
                        <span>{st.autonomousSpeech}</span>
                    </div>
                )}
                {st.near && (
                    <button onClick={open} style={hintStyle}>
                        💬 {st.autonomousSpeech ? 'Responder' : 'Conversar'} <span style={{ opacity: 0.7 }}>(E)</span>
                    </button>
                )}
            </>
        );
    }

    const loading = st.phase === 'loading';
    const pct = Math.round(st.loadProgress * 100);
    // O espaço do site é o que decide se o download PODE acontecer. Fica na
    // tela durante a carga porque, quando não cabe, este número é a resposta
    // inteira — e ele não aparecia em lugar nenhum.
    const livre = st.storage.quota === null
        ? null
        : Math.max(0, st.storage.quota - st.storage.usage);
    const espacoFalta = livre !== null && st.storage.needBytes > 0
        && livre < st.storage.needBytes;
    const espacoLinha = livre === null
        ? ''
        : `espaço do site: ${formatGB(livre)} livre`
          + (st.storage.needBytes > 0 ? ` · precisa de ${formatGB(st.storage.needBytes)}` : '')
          + (espacoFalta ? ' — não cabe' : '');
    // ── CADA BARRA OBEDECE AO SEU PRÓPRIO MODELO ──────────────────────────
    //
    // Estas três condições eram `loading && ...`, ou seja: as barras da vontade
    // e do motor só apareciam ENQUANTO O MODELO DE FALA BAIXAVA — que é
    // exatamente quando esses dois ainda não baixaram nada. Eles só começam
    // depois que a fala termina, e aí `phase` já é 'ready', o bloco inteiro
    // sumia da tela e os dois desciam em silêncio absoluto.
    //
    // Eu testei no ?mente e numa bancada onde empurrei os três estados à mão.
    // Nos dois lugares funcionava, porque nos dois eu tinha ligado tudo junto.
    // No jogo de verdade eles NUNCA baixam junto — e era só ali que dava para
    // ver o defeito.
    const miniPct = Math.round(st.deliberationLoadProgress * 100);
    const showMiniHandoff = st.deliberationPhase === 'loading'
        || (loading && st.deliberationLoadText !== '');
    const motorPct = Math.round(st.motorLoadProgress * 100);
    const showMotor = st.motorPhase === 'loading'
        || (loading && st.motorLoadText !== '');
    const memoriaPct = Math.round(st.memoriaLoadProgress * 100);
    const showMemoria = st.memoriaPhase === 'loading'
        || (loading && st.memoriaLoadText !== '');
    // O painel mostra o bloco se QUALQUER um dos quatro estiver baixando.
    const algumBaixando = loading || showMiniHandoff || showMotor || showMemoria;
    // E quando ele está PENSANDO (não baixando), também precisa aparecer: sem
    // isto, de dentro do painel não dá para saber se o cérebro de vontade está
    // trabalhando, travado ou desligado.
    const vontadeTrabalhando = st.deliberationPhase === 'thinking'
        || st.deliberationPhase === 'reopening'
        || st.motorPhase === 'translating';
    // A fila é lida do singleton; `st.version` já força o re-render a cada
    // npcSet, e todo progresso passa por um npcSet.
    const fila = floor10Fila.estado();
    // O detalhe segue QUEM A FILA DIZ que está baixando. Antes ele checava as
    // fases numa ordem fixa e podia mostrar o texto de um modelo com o rótulo
    // de outro — apareceu na bancada, com os dois estados ligados juntos.
    const detalheDaFila = fila.atual?.id === FILA_MOTOR
        ? st.motorLoadText
        : fila.atual?.id === FILA_VONTADE
            ? st.deliberationLoadText
            : fila.atual?.id === FILA_MEMORIA
                ? st.memoriaLoadText
                : st.loadText;

    return (
        <div style={panelStyle}>
            <div style={headerStyle}>
                <span>{NPC_NAME} · Hóspede do 10º{st.modelLabel ? ` · ${st.modelLabel}` : ''} · 👁🧭</span>
                <button onClick={close} style={xStyle} aria-label="Fechar">✕</button>
            </div>

            {algumBaixando && (
                <div style={modelLoadingStackStyle}>
                    {/* UMA BARRA SÓ, e ela mede a fila INTEIRA.
                        Três barras separadas pareciam certas enquanto eu
                        escrevia. Jogando, não: os cérebros não baixam juntos —
                        um começa quando o outro acaba — e o que o jogador via
                        era uma barra sumindo e outra nascendo do zero, sem
                        nunca dizer quanto faltava no TOTAL, que é a única coisa
                        que ele quer saber. O detalhe por modelo continua no
                        ?mente e na bancada. */}
                    <div style={modelLoadingCardStyle}>
                        <LinhaDownload
                            rotulo={`⬇ Cérebros do Nilo · ${filaLinha(fila)}`}
                            pct={Math.round(fila.fracao * 100)}
                            amostra={{
                                ...fila.amostra,
                                bytes: fila.bytesBaixados,
                                totalBytes: fila.bytesTotais,
                            }}
                            detalhe={detalheDaFila}
                            tom={fila.falhados.length > 0 ? TOM_FALHOU : TOM_FILA}
                        />
                    </div>
                    {/* A FALHA APARECE. Antes ela era engolida por um `catch`
                        vazio e o modelo era marcado como baixado — a barra
                        pulava adiante como se estivesse tudo bem, e quem joga
                        teve de deduzir olhando. */}
                    {fila.falhados.map((f) => (
                        <div key={f.id} style={filaFalhaStyle}>
                            <span>⚠</span>
                            <span>{f.motivo}</span>
                        </div>
                    ))}
                    {espacoLinha && (
                        <div style={{
                            ...modelLoadingDetailStyle,
                            padding: '0 2px',
                            color: espacoFalta ? '#ff9c9c' : '#8a8a96',
                        }}
                        >
                            {espacoLinha}
                        </div>
                    )}
                </div>
            )}

            {vontadeTrabalhando && (
                <div style={pensandoStyle} aria-live="polite">
                    <span>🧭</span>
                    <span>
                        {st.deliberationPhase === 'thinking'
                            ? `${NPC_NAME} está pensando por conta própria…`
                            : st.deliberationPhase === 'reopening'
                                // Reabrir o runtime leva alguns segundos e ANTES
                                // disso não aparecia nada: de fora, "voltando" e
                                // "morreu" eram a mesma tela.
                                ? `${NPC_NAME} está voltando a pensar…`
                                : 'traduzindo o pensamento em movimento…'}
                    </span>
                </div>
            )}

            {st.phase === 'error' && (
                <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 13, color: '#ff9a9a', marginBottom: 10 }}>{st.error}</div>
                    <button
                        onClick={() => void initLLM().catch(() => undefined)}
                        style={retryStyle}
                    >
                        Tentar de novo
                    </button>
                </div>
            )}

            {(st.phase === 'cold'
                || st.phase === 'loading'
                || st.phase === 'ready'
                || st.phase === 'thinking') && (
                <>
                    <div ref={scrollRef} style={logStyle}>
                        {st.history.length === 0 && (
                            <div style={{ opacity: 0.5, fontSize: 13, textAlign: 'center', marginTop: 20 }}>
                                Vontade atual: {st.autonomy.label}. Conversa usa o {FLOOR10_MODEL.label}; olhos, vontade e deliberação seguem por conta própria.
                            </div>
                        )}
                        {st.history.map((m, i) => (
                            <div key={i} style={{ ...bubbleRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                <div style={m.role === 'user' ? userBubble : npcBubble}>{m.content}</div>
                            </div>
                        ))}
                        {/* O REFLEXO. Aparece só enquanto o 3B ainda não
                            escreveu nada, e sai de cena quando ele começa. É
                            marcado como reação — não pode ser confundido com a
                            resposta, senão viraria o modelo pequeno falando pelo
                            Nilo, que é o oposto do que este andar defende. */}
                        {st.reflexo !== '' && st.streaming === '' && (
                            <div style={{ ...bubbleRow, justifyContent: 'flex-start' }}>
                                <div style={reflexoBubble} aria-live="polite">
                                    {st.reflexo}
                                </div>
                            </div>
                        )}
                        {st.phase === 'thinking' && (
                            <div style={{ ...bubbleRow, justifyContent: 'flex-start' }}>
                                <div style={npcBubble} aria-live="polite">
                                    {st.streaming || `Pensando localmente… ${thinkingSeconds}s`}
                                </div>
                            </div>
                        )}
                    </div>
                    {/* faixa de erro SEMPRE visível (fase ready/thinking também) —
                        nunca mais "tudo quieto" */}
                    {st.error !== '' && (
                        <div style={errBannerStyle}>
                            <span style={{ flex: 1 }}>{st.error}</span>
                            <button onClick={() => npcSet({ error: '' })} style={errXStyle} aria-label="Dispensar">✕</button>
                        </div>
                    )}
                    <div style={inputRow}>
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
                            placeholder={loading
                                ? 'Digite enquanto o cérebro de fala aquece…'
                                : 'Fale com ele…'}
                            style={inputStyle}
                            autoFocus
                        />
                        <button
                            onClick={send}
                            disabled={st.phase === 'thinking' || loading}
                            style={sendStyle}
                        >
                            ➤
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

// ── estilos inline (o projeto não usa CSS-modules aqui) ──
const hintStyle: React.CSSProperties = {
    position: 'fixed', bottom: 'max(88px, 14vh)', left: '50%', transform: 'translateX(-50%)',
    zIndex: 60, padding: '10px 18px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(20,22,28,0.82)', color: '#fff', fontSize: 15, fontWeight: 600,
    backdropFilter: 'blur(6px)', cursor: 'pointer', fontFamily: 'system-ui, sans-serif',
};
// Pensamento, não fala: borda tracejada, sem nome, mais apagada. Fica acima da
// bolha de fala para as duas nunca se sobreporem.
const thoughtBubbleStyle: React.CSSProperties = {
    position: 'fixed', bottom: 'max(196px, 29vh)', left: '50%', transform: 'translateX(-50%)',
    zIndex: 60, maxWidth: 'min(420px, 84vw)', display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 14px', borderRadius: 999, border: '1px dashed rgba(180,200,255,0.34)',
    background: 'rgba(14,16,22,0.72)', color: '#cdd6ea', fontSize: 13, lineHeight: 1.35,
    backdropFilter: 'blur(6px)', pointerEvents: 'none', fontFamily: 'system-ui, sans-serif',
};
// ── O PENSAMENTO CRU, NA TELA ──────────────────────────────────────────────
// Fica em cima, à esquerda, no lugar da barra de download (elas nunca aparecem
// juntas: enquanto baixa não há pensamento). Não intercepta toque nenhum — o
// jogo continua jogável com ele aberto.
/** A bolha do reflexo: a mesma do Nilo, mas apagada — reação, não resposta. */
const reflexoBubble: React.CSSProperties = {
    maxWidth: '78%',
    padding: '7px 11px',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.04)',
    border: '1px dashed rgba(255,255,255,0.14)',
    color: '#9a9aa6',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 1.35,
};

const pensamentoCruStyle: React.CSSProperties = {
    position: 'fixed', zIndex: 60, left: 'max(12px, 2.5vw)', top: 'max(82px, 13vh)',
    width: 'min(340px, 76vw)', maxHeight: 'min(38vh, 300px)', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: '10px 12px', borderRadius: 12,
    border: '1px solid rgba(180,200,255,0.28)', background: 'rgba(12,14,20,0.88)',
    color: '#cdd6ea', boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
    backdropFilter: 'blur(8px)', pointerEvents: 'none',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};
const pensamentoCabecaStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    color: '#9fb4e6', fontSize: 10.5, fontWeight: 650, letterSpacing: 0.3,
    fontFamily: 'system-ui, sans-serif',
};
const pensamentoTextoStyle: React.CSSProperties = {
    fontSize: 11.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowY: 'auto',
    // A leitura é da PONTA: o que interessa é o que ele está escrevendo agora.
    display: 'flex', flexDirection: 'column-reverse',
};
const autonomousSpeechStyle: React.CSSProperties = {
    position: 'fixed', bottom: 'max(142px, 21vh)', left: '50%', transform: 'translateX(-50%)',
    zIndex: 60, width: 'min(560px, 88vw)', display: 'flex', flexDirection: 'column', gap: 5,
    padding: '12px 16px', borderRadius: 15, border: '1px solid rgba(245,201,107,0.32)',
    background: 'rgba(16,18,24,0.9)', color: '#f3f3f3', fontSize: 14, lineHeight: 1.4,
    boxShadow: '0 10px 32px rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
    pointerEvents: 'none', fontFamily: 'system-ui, sans-serif',
};
const panelStyle: React.CSSProperties = {
    position: 'fixed', zIndex: 61, right: 'max(12px, 3vw)', bottom: 'max(12px, 3vh)',
    width: 'min(420px, 94vw)', height: 'min(560px, 76vh)', display: 'flex', flexDirection: 'column',
    borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.16)',
    background: 'rgba(16,18,24,0.94)', color: '#f2f2f2', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(10px)', fontFamily: 'system-ui, sans-serif',
};
const headerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 600,
    letterSpacing: 0.2, background: 'rgba(255,255,255,0.03)',
};
const xStyle: React.CSSProperties = { background: 'none', border: 'none', color: '#bbb', fontSize: 16, cursor: 'pointer', padding: 4 };
const logStyle: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 8 };
const bubbleRow: React.CSSProperties = { display: 'flex', width: '100%' };
const baseBubble: React.CSSProperties = { maxWidth: '82%', padding: '9px 12px', borderRadius: 14, fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
const userBubble: React.CSSProperties = { ...baseBubble, background: '#3a6df0', color: '#fff', borderBottomRightRadius: 4 };
const npcBubble: React.CSSProperties = { ...baseBubble, background: 'rgba(255,255,255,0.09)', color: '#f0f0f0', borderBottomLeftRadius: 4 };
const inputRow: React.CSSProperties = { display: 'flex', gap: 8, padding: 10, borderTop: '1px solid rgba(255,255,255,0.1)' };
const inputStyle: React.CSSProperties = {
    flex: 1, padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.16)',
    background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 15, outline: 'none',
};
const sendStyle: React.CSSProperties = {
    padding: '0 16px', borderRadius: 12, border: 'none', background: '#3a6df0', color: '#fff',
    fontSize: 16, cursor: 'pointer', minWidth: 48,
};
const retryStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 10, border: 'none', background: '#3a6df0', color: '#fff', fontSize: 14, cursor: 'pointer' };
const barOuter: React.CSSProperties = { height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' };
/** Separa as barras dos dois cérebros dentro do MESMO cartão flutuante. */
/** O cérebro que não desceu, com o motivo — nunca em silêncio. */
const filaFalhaStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'flex-start', gap: 7, padding: '6px 2px 0',
    color: '#ff9c9c', fontSize: 11.5, lineHeight: 1.4,
};
/** "Ele está pensando" — visível DE DENTRO do painel, que era o ponto cego. */
const pensandoStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px',
    borderTop: '1px solid rgba(245,201,107,0.22)',
    background: 'rgba(245,201,107,0.07)', color: '#f5c96b',
    fontSize: 12, fontStyle: 'italic',
};
const divisorStyle: React.CSSProperties = {
    height: 1, margin: '9px 0 8px', background: 'rgba(255,255,255,0.12)',
};
const modelLoadingStackStyle: React.CSSProperties = {
    padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
};
const modelLoadingCardStyle: React.CSSProperties = {
    padding: '10px 11px', borderRadius: 11, background: 'rgba(255,255,255,0.045)',
    border: '1px solid rgba(255,255,255,0.08)',
};
const modelLoadingTitleStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8,
    fontSize: 12.5, color: '#f1f1f1',
};
const modelLoadingDetailStyle: React.CSSProperties = {
    fontSize: 11, opacity: 0.65, marginTop: 6,
};
const miniDownloadFloatingStyle: React.CSSProperties = {
    position: 'fixed', zIndex: 60, left: 'max(12px, 2.5vw)', top: 'max(82px, 13vh)',
    width: 'min(310px, 72vw)', padding: '10px 12px', borderRadius: 12,
    border: '1px solid rgba(245,201,107,0.32)', background: 'rgba(16,18,24,0.9)',
    color: '#f2f2f2', boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
    backdropFilter: 'blur(8px)', pointerEvents: 'none', fontFamily: 'system-ui, sans-serif',
};
const miniDownloadTitleStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginBottom: 7, color: '#f5c96b', fontSize: 11.5, fontWeight: 650,
};
const miniDownloadTextStyle: React.CSSProperties = {
    marginTop: 6, fontSize: 10.5, opacity: 0.68, whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis',
};
/**
 * Os bytes ficam MAIS legíveis que o texto de estado, de propósito: é a linha
 * que responde "está baixando ou travou?", e era ela que faltava na tela.
 */
const downloadBytesStyle: React.CSSProperties = {
    marginTop: 6, fontSize: 12, fontWeight: 600, color: '#cfd6e4',
    fontVariantNumeric: 'tabular-nums',
};
const errBannerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px',
    borderTop: '1px solid rgba(255,120,120,0.35)', background: 'rgba(120,30,30,0.35)',
    color: '#ffb4b4', fontSize: 12.5, lineHeight: 1.4,
};
const errXStyle: React.CSSProperties = { background: 'none', border: 'none', color: '#ffb4b4', fontSize: 13, cursor: 'pointer', padding: 0 };

export default Floor10NpcChat;
