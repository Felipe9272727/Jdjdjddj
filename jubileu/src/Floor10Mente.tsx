/**
 * A SALA DA MENTE — o Andar 10 visto de cima, para observar o cérebro pequeno.
 *
 * A bancada (?bancada) mede o cérebro de FALA. Esta página observa o de
 * DELIBERAÇÃO, que é invisível em jogo por construção: a saída dele é presa por
 * gramática e nunca aparece na tela. Justamente por isso ninguém consegue ver
 * se ele entrou em cadeia de pensamento circular — a suspeita do dono do jogo.
 *
 * Aqui o mapa é 2D de propósito: o que importa é COMO o estado do mundo vira
 * decisão. Arraste o jogador, veja o prompt mudar, mande pensar e acompanhe o
 * texto cru nascendo token a token.
 *
 * Abre em:  /?mente
 */
import React, { useEffect, useRef, useState } from 'react';
import { eventosDaCaixaPreta } from './npc/floor10CaixaPreta';
import { npc, useNpc } from './npc/npcStore';
import { DOWNLOAD_STALL_SEC, downloadLine } from './npc/floor10Download';
import {
    circadianBaseline, describeMood, readClock, stepDrives,
} from './npc/floor10Drives';
import { perceiveFloor10 } from './npc/floor10Perception';
import {
    deliberarObservando, deliberateFloor10, precarregarVontade, unloadSmallBrain,
    setSmallBrain, smallBrainThreads,
    SMALL_BRAIN_CATALOG, SMALL_BRAIN_MODEL,
    type PensamentoAoVivo, type SmallBrainId,
} from './npc/floor10SmallBrain';
import {
    FLOOR10_MOTOR_MODEL,
    FLOOR10_MOTOR_SIZE_LABEL,
    precarregarMotor,
    unloadFloor10MotorBrain,
} from './npc/floor10MotorBrain';
import { desligarQuemNaoEDaVez } from './npc/floor10Roteamento';
import {
    cpuThreadCount, initLLM, sendToNpc, unloadConversationBrain,
    prepareFloor10SystemPrompt,
} from './npc/wllamaEngine';
import {
    FLOOR10_CANON, buildFloor10SystemPrompt, retrieveFloor10Canon,
} from './npc/floor10Canon';
import * as memoria from './npc/floor10Memoria';
import {
    buildDeliberationPrompt, deliberationRetryDelay, looksLikeLoop,
    DELIBERATION_TIMEOUT_MS,
} from './npc/floor10Deliberation';
import type { Floor10WillDrives } from './npc/floor10Will';

// A sala do Andar 10 é quadrada; estes limites batem com os do jogo.
const SALA = 5.5;
const LADO = 320;
/** metros → pixels do mapa. */
const px = (m: number) => ((m + SALA) / (SALA * 2)) * LADO;

type Ponto = { x: number; z: number };

const isolado = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;

const Mente: React.FC = () => {
    const [nilo, setNilo] = useState<Ponto>({ x: 0, z: 2.2 });
    const [jogador, setJogador] = useState<Ponto>({ x: 0.5, z: -0.5 });
    const [yaw, setYaw] = useState(Math.PI);
    const [drives, setDrives] = useState<Floor10WillDrives>({
        social: 0.6, curiosity: 0.7, restlessness: 0.4, fatigue: 0.2,
    });
    // A HORA. O relógio interno muda a linha de base dos desejos, então dá
    // para arrastar o dia inteiro aqui e ver a vontade dele mudar junto —
    // era impossível conferir isso esperando o relógio de verdade virar.
    const [hora, setHora] = useState(() => readClock().hour);
    const [semGramatica, setSemGramatica] = useState(true);
    const [maxTokens, setMaxTokens] = useState(160);
    const [vivo, setVivo] = useState('');
    const [pensando, setPensando] = useState(false);
    const [rodadas, setRodadas] = useState<PensamentoAoVivo[]>([]);
    const [cerebro, setCerebro] = useState<SmallBrainId>(SMALL_BRAIN_MODEL.id);
    const estado = useNpc();
    const baixando = estado.deliberationPhase === 'loading';
    const travado = estado.deliberationDownload.stalledSec >= DOWNLOAD_STALL_SEC;
    // O TERCEIRO cérebro tem barra própria aqui também: ele baixa depois da
    // vontade, na mesma rodada de "pensar agora", e são 386 MB — grandes demais
    // para descerem sem aparecer na tela.
    const baixandoMotor = estado.motorPhase === 'loading';
    const motorTravado = estado.motorDownload.stalledSec >= DOWNLOAD_STALL_SEC;
    const arrastando = useRef<'nilo' | 'jogador' | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    // Trocar de modelo zera a comparação: as rodadas anteriores são de OUTRO
    // cérebro e misturá-las na mesma lista seria mentira.
    const trocarCerebro = async (id: SmallBrainId) => {
        await setSmallBrain(id);
        setCerebro(id);
        setRodadas([]);
        setVivo('');
    };

    const perception = perceiveFloor10({
        npcPosition: { x: nilo.x, y: 0, z: nilo.z },
        npcYaw: yaw,
        playerPosition: { x: jogador.x, y: 0, z: jogador.z },
    });
    const memoria = {
        inspectedElevatorCount: 3,
        sleeps: 44,
        playerSilentSeconds: 30,
        lastGoals: ['idle'] as never,
        agreedAction: null,
        agreedReason: null,
    };
    const relogio = { ...readClock(), hour: hora,
        phase: readClock(new Date(2026, 0, 1, Math.floor(hora))).phase };
    const humor = describeMood(drives, relogio);
    const baseDoDia = circadianBaseline(hora);
    const prompt = buildDeliberationPrompt(perception, drives, { ...memoria, mood: humor });

    // Arrastar os dois pontos direto no mapa: é o jeito mais rápido de gerar
    // situações diferentes e ver a decisão mudar.
    useEffect(() => {
        const mover = (e: PointerEvent) => {
            if (!arrastando.current || !svgRef.current) return;
            const r = svgRef.current.getBoundingClientRect();
            const mx = ((e.clientX - r.left) / r.width) * (SALA * 2) - SALA;
            const mz = ((e.clientY - r.top) / r.height) * (SALA * 2) - SALA;
            const limitar = (v: number) => Math.max(-SALA + 0.3, Math.min(SALA - 0.3, v));
            const p = { x: limitar(mx), z: limitar(mz) };
            if (arrastando.current === 'nilo') setNilo(p); else setJogador(p);
        };
        const soltar = () => { arrastando.current = null; };
        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
        return () => {
            window.removeEventListener('pointermove', mover);
            window.removeEventListener('pointerup', soltar);
        };
    }, []);

    const pensar = async () => {
        setPensando(true);
        setVivo('');
        const r = await deliberarObservando(
            { perception, drives, memory: memoria, now: Date.now() / 1000 },
            { useGrammar: !semGramatica, maxTokens, onToken: setVivo, timeoutMs: 300_000 },
        );
        setRodadas((l) => [r, ...l].slice(0, 8));
        setPensando(false);
    };

    const box: React.CSSProperties = {
        background: '#141419', border: '1px solid #2a2a33', borderRadius: 8,
        padding: 12, marginBottom: 12,
    };
    const btn: React.CSSProperties = {
        background: '#2d6cdf', color: '#fff', border: 0, borderRadius: 6,
        padding: '10px 16px', fontSize: 15, cursor: 'pointer', marginRight: 8,
    };
    const falhas = rodadas.filter((r) => !r.decided).length;

    return (
        <div style={{
            font: '13px/1.5 ui-monospace, Menlo, Consolas, monospace',
            color: '#d8d8e0', padding: 16, maxWidth: 760, margin: '0 auto',
        }}>
            <h1 style={{ fontSize: 18, margin: '4px 0 4px' }}>
                Andar 10 — a sala da mente ({SMALL_BRAIN_MODEL.label})
            </h1>
            <div style={{ color: '#888', marginBottom: 6 }}>
                Arraste o Nilo e o jogador. O prompt muda junto. Mande pensar e
                acompanhe o raciocínio nascer.
            </div>
            {/* Sem COOP/COEP não há SharedArrayBuffer e o wllama cai para UMA
                thread. Hospedagens sem esses cabeçalhos (GitHub Pages, por
                exemplo) mudam o resultado inteiro, e isso é invisível a olho nu:
                fica aqui em cima, antes de qualquer medição. */}
            <div style={{
                marginBottom: 14,
                color: isolado ? '#9fd3a0' : '#ff9c9c',
            }}>
                {isolado
                    ? `isolado ✓ · ${cpuThreadCount()} threads`
                    : `SEM isolamento (COOP/COEP) → 1 thread. Esta hospedagem não manda `
                      + 'os cabeçalhos; use o preview da Vercel para medir.'}
            </div>

            <div style={box}>
                <svg
                    ref={svgRef}
                    viewBox={`0 0 ${LADO} ${LADO}`}
                    style={{ width: '100%', maxWidth: LADO, display: 'block', margin: '0 auto', touchAction: 'none' }}
                >
                    <rect x={0} y={0} width={LADO} height={LADO} fill="#0e0e12" stroke="#3a3a46" />
                    {/* piso em grade, como no jogo */}
                    {Array.from({ length: 11 }, (_, i) => (
                        <g key={i} stroke="#1e1e26">
                            <line x1={(i * LADO) / 10} y1={0} x2={(i * LADO) / 10} y2={LADO} />
                            <line x1={0} y1={(i * LADO) / 10} x2={LADO} y2={(i * LADO) / 10} />
                        </g>
                    ))}
                    {/* porta do elevador (parede do fundo) */}
                    <rect x={px(-1.2)} y={2} width={px(1.2) - px(-1.2)} height={10} fill="#7a6a2f" />
                    <text x={px(0)} y={26} fill="#b9a95f" fontSize={11} textAnchor="middle">elevador</text>

                    {/* campo de visão do Nilo — mostra POR QUE ele vê ou não o jogador */}
                    <path
                        d={`M ${px(nilo.x)} ${px(nilo.z)}
                            L ${px(nilo.x + Math.sin(yaw - 0.6) * 6)} ${px(nilo.z + Math.cos(yaw - 0.6) * 6)}
                            A 6 6 0 0 1 ${px(nilo.x + Math.sin(yaw + 0.6) * 6)} ${px(nilo.z + Math.cos(yaw + 0.6) * 6)} Z`}
                        fill="#3a6df0" opacity={0.13}
                    />
                    <circle
                        cx={px(nilo.x)} cy={px(nilo.z)} r={9} fill="#3a6df0"
                        onPointerDown={() => { arrastando.current = 'nilo'; }}
                        style={{ cursor: 'grab' }}
                    />
                    <text x={px(nilo.x) + 13} y={px(nilo.z) + 4} fill="#8fb8ff" fontSize={11}>Nilo</text>
                    <circle
                        cx={px(jogador.x)} cy={px(jogador.z)} r={8} fill="#c8e6c9"
                        onPointerDown={() => { arrastando.current = 'jogador'; }}
                        style={{ cursor: 'grab' }}
                    />
                    <text x={px(jogador.x) + 12} y={px(jogador.z) + 4} fill="#c8e6c9" fontSize={11}>você</text>
                </svg>
                <div style={{ marginTop: 8 }}>
                    olhar do Nilo
                    <input
                        type="range" min={0} max={6.28} step={0.05} value={yaw}
                        onChange={(e) => setYaw(Number(e.target.value))}
                        style={{ width: '100%' }}
                    />
                </div>
                <div style={{ color: '#9fd3a0' }}>
                    vê o jogador: <b>{perception.player?.visible ? 'sim' : 'não'}</b>
                    {' · '}distância {perception.player?.distance.toFixed(1)}m
                    {' · '}{perception.player?.direction}
                </div>
            </div>

            <div style={box}>
                <b>Desejos</b>
                {(Object.keys(drives) as (keyof Floor10WillDrives)[]).map((k) => (
                    <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ width: 92 }}>{k}</span>
                        <input
                            type="range" min={0} max={1} step={0.05} value={drives[k]}
                            onChange={(e) => setDrives({ ...drives, [k]: Number(e.target.value) })}
                            style={{ flex: 1 }}
                        />
                        <b style={{ color: '#ffd479', width: 34 }}>{drives[k].toFixed(2)}</b>
                    </div>
                ))}
            </div>

            <div style={box}>
                <b>A hora que ele está vivendo</b>
                <div style={{ margin: '6px 0' }}>
                    <b style={{ color: '#ffd479' }}>
                        {String(Math.floor(hora)).padStart(2, '0')}h
                        {String(Math.round((hora % 1) * 60)).padStart(2, '0')}
                    </b>
                    {' · '}{relogio.phase}
                    <input
                        type="range" min={0} max={23.75} step={0.25} value={hora}
                        onChange={(e) => setHora(Number(e.target.value))}
                        style={{ width: '100%' }}
                    />
                </div>
                <div style={{ color: '#8a8a96' }}>
                    para onde os desejos puxam nesta hora:{' '}
                    social {baseDoDia.social.toFixed(2)} · curiosidade{' '}
                    {baseDoDia.curiosity.toFixed(2)} · inquietação{' '}
                    {baseDoDia.restlessness.toFixed(2)} · cansaço{' '}
                    {baseDoDia.fatigue.toFixed(2)}
                </div>
                <button
                    type="button"
                    style={{ ...btn, marginTop: 8, background: '#3a3a46' }}
                    onClick={() => {
                        // Meia hora de relógio interno de uma vez, para ver
                        // aonde os desejos VÃO PARAR nesta hora.
                        let d = drives;
                        for (let t = 0; t < 1800; t += 0.5) {
                            d = stepDrives(d, {
                                hour: hora,
                                playerVisible: !!perception.player?.visible,
                                elevatorVisible: perception.elevator.visible,
                                moving: false,
                                goal: 'idle',
                                driftSeconds: t,
                            }, 0.5);
                        }
                        setDrives(d);
                    }}
                >
                    correr 30 min
                </button>
            </div>

            <div style={box}>
                <b>O que ele lê</b>
                <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', color: '#9fd3a0' }}>{prompt}</pre>
            </div>

            <div style={box}>
                {/* Trocar o cérebro aqui, e não na minha palavra: os três foram
                    medidos no mesmo prompt, mas quem joga é o dono do jogo. */}
                <div style={{ marginBottom: 10 }}>
                    <b>Cérebro pequeno</b>
                    <div style={{ marginTop: 6 }}>
                        {SMALL_BRAIN_CATALOG.map((m) => (
                            <label key={m.id} style={{ display: 'block', marginBottom: 4 }}>
                                <input
                                    type="radio"
                                    name="cerebro"
                                    checked={cerebro === m.id}
                                    disabled={pensando}
                                    onChange={() => void trocarCerebro(m.id)}
                                />{' '}
                                <b style={{ color: cerebro === m.id ? '#ffd479' : '#d8d8e0' }}>
                                    {m.label}
                                </b>
                                <span style={{ color: '#777' }}>
                                    {' '}· {(m.bytes / 1e9).toFixed(2)} GB · {m.nota}
                                </span>
                            </label>
                        ))}
                    </div>
                    <div style={{ color: '#777' }}>
                        trocar descarrega o modelo atual e baixa o novo na primeira
                        vez que ele pensar.
                    </div>
                </div>
                <label style={{ display: 'block', marginBottom: 6 }}>
                    <input
                        type="checkbox" checked={semGramatica}
                        onChange={(e) => setSemGramatica(e.target.checked)}
                    />{' '}
                    deixar ele pensar (igual ao jogo). Desmarcar prende numa linha só.
                </label>
                <div style={{ marginBottom: 8 }}>
                    teto de tokens: <b style={{ color: '#ffd479' }}>{maxTokens}</b>
                    <input
                        type="range" min={24} max={512} step={8} value={maxTokens}
                        onChange={(e) => setMaxTokens(Number(e.target.value))}
                        style={{ width: '100%' }}
                    />
                </div>
                <button type="button" style={btn} disabled={pensando} onClick={() => void pensar()}>
                    {pensando ? 'pensando…' : 'pensar agora'}
                </button>
                <button
                    type="button"
                    style={{ ...btn, background: '#444' }}
                    onClick={() => { setRodadas([]); setVivo(''); }}
                >
                    limpar
                </button>
                <div style={{ color: '#777', marginTop: 6 }}>
                    em jogo ele pensa livre, com teto de 320 tokens e corte de
                    segurança de {DELIBERATION_TIMEOUT_MS / 1000}s. O teto de tokens é
                    o que torna o loop eterno impossível.
                </div>
            </div>

            {/* O DOWNLOAD, com bytes. Sem isto a sala da mente também só dizia
                "carregando" e não dava para saber se o arquivo estava vindo. */}
            {baixando ? (
                <div style={box}>
                    <b>Baixando o cérebro pequeno</b>
                    <div style={{
                        height: 10, borderRadius: 5, background: '#22222a',
                        overflow: 'hidden', margin: '8px 0 6px',
                    }}
                    >
                        <div style={{
                            height: '100%',
                            width: `${Math.round(estado.deliberationLoadProgress * 100)}%`,
                            background: travado ? '#c2554a' : '#7fc7ff',
                            transition: 'width .3s',
                        }}
                        />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#e6e6ee' }}>
                        {downloadLine(estado.deliberationDownload)}
                    </div>
                    <div style={{ color: '#888', marginTop: 4 }}>
                        {estado.deliberationLoadText}
                    </div>
                </div>
            ) : null}

            {/* O TRADUTOR MOTOR, na mesma régua. Ele escrevia nos campos da
                vontade: enquanto os 386 MB dele desciam, esta caixa dizia
                "Baixando o cérebro pequeno" com o progresso de outro arquivo. */}
            {baixandoMotor ? (
                <div style={box}>
                    <b>Baixando o tradutor motor · {FLOOR10_MOTOR_SIZE_LABEL}</b>
                    <div style={{
                        height: 10, borderRadius: 5, background: '#22222a',
                        overflow: 'hidden', margin: '8px 0 6px',
                    }}
                    >
                        <div style={{
                            height: '100%',
                            width: `${Math.round(estado.motorLoadProgress * 100)}%`,
                            background: motorTravado ? '#c2554a' : '#7fe0b0',
                            transition: 'width .3s',
                        }}
                        />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#e6e6ee' }}>
                        {downloadLine(estado.motorDownload)}
                    </div>
                    <div style={{ color: '#888', marginTop: 4 }}>
                        {estado.motorLoadText || FLOOR10_MOTOR_MODEL.label}
                    </div>
                </div>
            ) : null}

            {(pensando || vivo) ? (
                <div style={{ ...box, borderColor: looksLikeLoop(vivo) ? '#8a2a2a' : '#2a2a33' }}>
                    <b>Pensando agora</b>
                    {looksLikeLoop(vivo) ? (
                        <div style={{ color: '#ff9c9c' }}>↻ girando no lugar — seria descartado</div>
                    ) : null}
                    <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', color: '#a9c9ff' }}>
                        {vivo || '…'}
                    </pre>
                </div>
            ) : null}

            <div style={box}>
                <b>Rodadas</b>
                {rodadas.length === 0 ? <div style={{ color: '#777' }}>nenhuma ainda</div> : null}
                {rodadas.length > 0 ? (
                    <div style={{ color: '#888', marginBottom: 6 }}>
                        sem decisão: {falhas}/{rodadas.length}
                        {falhas > 0 ? ` · em jogo a próxima esperaria ${deliberationRetryDelay(falhas)}s` : ''}
                    </div>
                ) : null}
                {rodadas.map((r, i) => (
                    <div
                        key={i}
                        style={{
                            borderTop: '1px solid #24242c', paddingTop: 6, marginTop: 6,
                            color: r.loop ? '#ff9c9c' : '#d8d8e0',
                        }}
                    >
                        <div>
                            <b style={{ color: r.decided ? '#9fd3a0' : '#ffb36b' }}>
                                {r.decided ? r.decided.goal : 'sem decisão'}
                            </b>
                            {' · '}{(r.ms / 1000).toFixed(1)}s · {r.tokens} tokens
                            {r.loop ? ' · ↻ LOOP' : ''}
                            {r.erro ? ` · ${r.erro}` : ''}
                            {r.resgate ? (
                                <span style={{ color: '#7fc7ff' }}>
                                    {' · '}assinou na 2ª passada: {r.resgate.trim()}
                                </span>
                            ) : null}
                        </div>
                        <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', color: '#8a8a96' }}>
                            {r.raw.slice(0, 400) || '(vazio)'}
                        </pre>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── A PORTA DAS SONDAS ────────────────────────────────────────────────────
// Tudo o que uma sonda precisa sai DAQUI, e não de um `import()` dela própria.
// A razão é concreta: um `import('/src/npc/npcStore.ts')` feito de dentro do
// `page.evaluate` pode cair num SEGUNDO exemplar do módulo (o dev server serve
// o do app com `?t=`), e aí a sonda mede um estado que não é o do jogo — foi
// exatamente assim que uma medição "reprovou" uma integração que funcionava.
(window as unknown as Record<string, unknown>).__f10mente = {
    npc, deliberarObservando, perceiveFloor10,
    // O caminho do JOGO (não o observado): é ele que a sonda do pensamento
    // ao vivo precisa medir.
    deliberateFloor10, precarregarVontade, smallBrainThreads,
    initLLM, sendToNpc, unloadConversationBrain, prepareFloor10SystemPrompt,
    buildFloor10SystemPrompt, retrieveFloor10Canon, FLOOR10_CANON,
    memoria,
    // ── O QUE O A/B DO ROTEAMENTO PRECISA ─────────────────────────────────
    // Sem estes quatro, a única forma de conferir o conserto era a ARITMÉTICA
    // (1,49 + 2×soma), e projeção já me obrigou a desdizer conclusão aqui. Com
    // eles a sonda monta os dois cenários de verdade — a fala subindo POR CIMA
    // da vontade e do motor (como era) e a fala subindo depois de o roteamento
    // desligá-los (como é agora) — e lê o RSS real dos dois.
    unloadSmallBrain, precarregarMotor, unloadFloor10MotorBrain,
    desligarQuemNaoEDaVez,
    // ── A CAIXA-PRETA, PARA A SONDA PODER LER O QUE ACONTECEU ─────────────
    // Eu tentei conferir se a meta veio do MOTOR fazendo `grep` no console —
    // e `anotar` não escreve no console, escreve aqui. O grep achou zero e eu
    // quase li isso como "o caminho novo não roda", quando na verdade eu tinha
    // olhado no lugar errado. Sem esta porta, a única prova do desenho novo
    // seria teste unitário.
    eventosDaCaixaPreta,
};

export default Mente;
