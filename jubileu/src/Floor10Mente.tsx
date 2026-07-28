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
import { npc } from './npc/npcStore';
import { perceiveFloor10 } from './npc/floor10Perception';
import { deliberarObservando, SMALL_BRAIN_MODEL, type PensamentoAoVivo } from './npc/floor10SmallBrain';
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

const Mente: React.FC = () => {
    const [nilo, setNilo] = useState<Ponto>({ x: 0, z: 2.2 });
    const [jogador, setJogador] = useState<Ponto>({ x: 0.5, z: -0.5 });
    const [yaw, setYaw] = useState(Math.PI);
    const [drives, setDrives] = useState<Floor10WillDrives>({
        social: 0.6, curiosity: 0.7, restlessness: 0.4, fatigue: 0.2,
    });
    const [semGramatica, setSemGramatica] = useState(true);
    const [maxTokens, setMaxTokens] = useState(160);
    const [vivo, setVivo] = useState('');
    const [pensando, setPensando] = useState(false);
    const [rodadas, setRodadas] = useState<PensamentoAoVivo[]>([]);
    const arrastando = useRef<'nilo' | 'jogador' | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

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
    const prompt = buildDeliberationPrompt(perception, drives, memoria);

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
            <div style={{ color: '#888', marginBottom: 14 }}>
                Arraste o Nilo e o jogador. O prompt muda junto. Mande pensar e
                acompanhe o raciocínio nascer.
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
                <b>O que ele lê</b>
                <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', color: '#9fd3a0' }}>{prompt}</pre>
            </div>

            <div style={box}>
                <label style={{ display: 'block', marginBottom: 6 }}>
                    <input
                        type="checkbox" checked={semGramatica}
                        onChange={(e) => setSemGramatica(e.target.checked)}
                    />{' '}
                    soltar a gramática (mostra o raciocínio cru — é aqui que o loop aparece)
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
                    em jogo ele pensa com gramática, teto de 24 tokens e corte de
                    segurança de {DELIBERATION_TIMEOUT_MS / 1000}s. Aqui o corte é de
                    300s, senão não sobraria raciocínio para observar.
                </div>
            </div>

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

(window as unknown as Record<string, unknown>).__f10mente = {
    npc, deliberarObservando, perceiveFloor10,
};

export default Mente;
