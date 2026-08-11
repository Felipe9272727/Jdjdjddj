// ── ?campo — A RÉPLICA SIMPLES DO ANDAR 10, PARA TESTAR VONTADE + MOTOR ────
//
// Pedido do dono do jogo:
//
//   "queria que tu fizesse um novo /? Que seja uma réplica simples do floor 10,
//    e nessa replica a gente vai testar a vontade + motor, além de que, eu
//    queria que vc fizesse o utility aí mais inteligente, principalmente porque
//    ele só fica rondando de um lado pro outro"
//
// POR QUE UMA RÉPLICA, E POR QUE 2D
// O andar de verdade é Three.js com física, cânone, prisão e conversa. Para
// julgar se o Nilo se move como alguém que QUER alguma coisa, tudo isso é
// ruído: o que precisa ficar visível é o triângulo pensamento → meta → plano
// motor → posição. Visto de cima, num quadrado, isso se lê num relance; dentro
// do jogo em primeira pessoa, não.
//
// O QUE AQUI É DE VERDADE, e não simulado:
//   - `perceiveFloor10` — a MESMA função que o jogo usa, alimentada pelas
//     posições desta tela;
//   - `deliberateFloor10` — a rodada real, com o modelo real;
//   - `translateFloor10MotorThought` dentro dela — o tradutor real.
// Só o corpo e a sala são desenhados aqui. Se o comportamento for burro nesta
// tela, ele é burro no jogo — e o contrário também vale, que é o ponto.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { perceiveFloor10, type Floor10Perception } from './npc/floor10Perception';
import { deliberateFloor10, precarregarVontade, vontadeJaCarregada } from './npc/floor10SmallBrain';
import { precarregarMotor } from './npc/floor10MotorBrain';
import { memoriaJaCarregada, precarregarMemoria } from './npc/floor10Memoria';
import { classificarPensamento, type VeredictoDoVetor } from './npc/floor10MotorVetor';
import { useNpc } from './npc/npcStore';
import type { Floor10MotorPlan } from './npc/floor10MotorCortex';
import type { DeliberationGoal } from './npc/floor10Deliberation';
import { passoDoPlano, planoDaMeta, type CorpoDoNilo } from './npc/floor10Passo';
import {
    MemoriaDeConsequencia, type Consequencia, type MundoObservado,
} from './npc/floor10Consequencia';

/** Metade do lado da sala, igual ao `FLOOR_BOUNDS` da percepção. */
const LIMITE = 22;
const ELEVADOR = { x: 0, y: 0, z: -10 };

type Registro = {
    meta: DeliberationGoal;
    plano: Floor10MotorPlan | null;
    ms: number;
    pensamento: string;
    /** O que o classificador por vetor achou. `null` = ele não estava no ar. */
    vetor?: VeredictoDoVetor | null;
    /** Preenchido DEPOIS, quando a janela de conferência fecha. */
    resultado?: Consequencia;
};

/** Mundo → tela: a sala inteira cabe no menor lado, com margem. */
function paraTela(v: { x: number; z: number }, lado: number) {
    const escala = (lado - 24) / (LIMITE * 2);
    return {
        x: lado / 2 + v.x * escala,
        y: lado / 2 + v.z * escala,
    };
}

const Floor10Campo: React.FC = () => {
    const st = useNpc();
    const telaRef = useRef<HTMLCanvasElement>(null);
    const corpo = useRef<CorpoDoNilo>({ x: 4, z: 4, yaw: 0 });
    const jogador = useRef({ x: -6, z: 6 });
    const plano = useRef<Floor10MotorPlan | null>(null);
    const planoAte = useRef(0);
    const [historico, setHistorico] = useState<Registro[]>([]);
    // ── A MEMÓRIA DE CONSEQUÊNCIA ─────────────────────────────────────────
    // Aqui ela é fácil de julgar à mão: arraste-se para PERTO do Nilo depois de
    // ele se aproximar e o resultado vira "atendido"; fique parado e vira
    // "ignorado". É o experimento que ele descreveu, com o dedo.
    const memoria = useRef(new MemoriaDeConsequencia());
    const [rodando, setRodando] = useState(false);
    const [erro, setErro] = useState('');
    // ── A VONTADE NÃO VEM DE GRAÇA NESTA ROTA ─────────────────────────────
    // No jogo quem manda baixar é a fila, que começa no botão de conversar.
    // Aqui não há conversa — e sem isto `deliberateFloor10` desiste em SILÊNCIO
    // (`vontadeJaCarregada()` falso = cede a vez), o que na tela seria um botão
    // que não faz nada e nenhuma explicação.
    const [carregando, setCarregando] = useState(false);
    const [temModelo, setTemModelo] = useState(() => vontadeJaCarregada());
    // O classificador por vetor está no ar? Sem ele o `?campo` mede o motor
    // ANTIGO e eu não perceberia — foi exatamente assim que o roteamento
    // virou código morto uma vez nesta base.
    const [temVetor, setTemVetor] = useState(() => memoriaJaCarregada());
    const [vetor, setVetor] = useState<VeredictoDoVetor | null>(null);
    const carregar = useCallback(async () => {
        setCarregando(true);
        setErro('');
        try {
            const ok = await precarregarVontade();
            setTemModelo(ok);
            if (!ok) setErro('a vontade não carregou — veja a linha de estado abaixo');
            // ── O MOTOR SOBE JUNTO, E ANTES DA PRIMEIRA RODADA ────────────
            //
            // O tradutor tem 640 MB e sobe sob demanda: na primeira
            // deliberação ele ainda está carregando e devolve `null`. Medido
            // três vezes: `rodada 1: motor null`.
            //
            // Eu tinha "resolvido" isso fazendo o corpo andar sem ele — e o
            // dono do jogo cobrou, com razão: o motor existe JUSTAMENTE para
            // traduzir pensamento em movimento, e contorná-lo é esvaziar a
            // peça em vez de consertar o problema. A causa é o atraso; então
            // se conserta o atraso.
            //
            // Aqui dá para subir junto sem custo de memória relevante: esta
            // tela não tem a fala de 1,9 GB de pé. No jogo a conta é outra, e
            // por isso lá a decisão continua sendo do roteamento.
            else {
                // ── E O EMBEDDINGGEMMA SOBE JUNTO ─────────────────────────
                //
                // Sem ele o motor NOVO não existe: `classificarPensamento`
                // devolve null e tudo cai no caminho antigo, o da gramática
                // que colapsa. No jogo o roteamento desliga este modelo fora
                // do chat — é a peça que ainda falta decidir, e ela mexe no
                // pico de memória medido. Aqui, que é a tela de teste, ele
                // sobe à força para o comportamento novo ser VISÍVEL antes de
                // eu encostar no roteamento.
                await Promise.all([
                    precarregarMotor().catch(() => false),
                    precarregarMemoria().catch(() => false),
                ]);
                setTemVetor(memoriaJaCarregada());
            }
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setCarregando(false);
        }
    }, []);

    /** O mundo como a memória de consequência precisa vê-lo. */
    const observar = useCallback((): MundoObservado => ({
        distanciaDoJogador: Math.hypot(
            jogador.current.x - corpo.current.x,
            jogador.current.z - corpo.current.z,
        ),
        distanciaDoElevador: Math.hypot(
            ELEVADOR.x - corpo.current.x,
            ELEVADOR.z - corpo.current.z,
        ),
        // Nesta rota não há painel de conversa: o único sinal disponível é o
        // jogador se APROXIMAR. Menos sinais que no jogo, e de propósito — o
        // caso difícil é justamente "nada aconteceu".
        conversaAberta: false,
        mensagensDoJogador: 0,
    }), []);

    const percepcao = useCallback((): Floor10Perception => perceiveFloor10({
        npcPosition: { x: corpo.current.x, y: 0, z: corpo.current.z },
        npcYaw: corpo.current.yaw,
        playerPosition: { x: jogador.current.x, y: 0, z: jogador.current.z },
    }), []);

    // ── O CORPO ANDA A 60 QUADROS, A CABEÇA PENSA A CADA RODADA ───────────
    // Separados de propósito: no jogo é assim, e juntá-los aqui esconderia
    // justamente o defeito que ele descreveu — um plano bom que o corpo executa
    // mal parece um plano ruim.
    useEffect(() => {
        let vivo = true;
        let anterior = performance.now();
        const quadro = (agora: number) => {
            if (!vivo) return;
            const dt = Math.min(0.05, (agora - anterior) / 1000);
            anterior = agora;
            // ── O PLANO VALE ATÉ CHEGAR OU ATÉ VIR OUTRO ─────────────────
            //
            // Antes ele expirava em `duration` segundos (3 a 12). Só que uma
            // rodada de deliberação leva ~60 s no celular: o Nilo andaria seis
            // segundos por minuto e ficaria parado os outros cinquenta e
            // quatro. Tecnicamente "andando"; na prática, uma estátua que
            // treme de vez em quando.
            //
            // O movimento já se limita sozinho, e é por isso que o relógio não
            // era necessário: `approach` para a 1,6 m, `withdraw` para a 4,5 m,
            // `explore` para ao chegar. Ele anda até CHEGAR e depois espera —
            // que é o que uma pessoa faz, e é legível de fora.
            //
            // A exceção é `orbit`: circular não tem fim natural. Só ele ainda
            // respeita a duração, senão o Nilo daria voltas para sempre.
            const p = plano.current;
            const expirou = p?.verb === 'orbit' && agora / 1000 >= planoAte.current;
            const alvoAtivo = expirou ? null : p;
            passoDoPlano(corpo.current, alvoAtivo, {
                jogador: jogador.current,
                elevador: ELEVADOR,
                limite: LIMITE,
                dt,
            });
            desenhar();
            requestAnimationFrame(quadro);
        };
        requestAnimationFrame(quadro);
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const desenhar = useCallback(() => {
        const tela = telaRef.current;
        if (!tela) return;
        const ctx = tela.getContext('2d');
        if (!ctx) return;
        const lado = tela.width;
        ctx.clearRect(0, 0, lado, lado);

        // sala
        ctx.fillStyle = '#11151d';
        ctx.fillRect(0, 0, lado, lado);
        ctx.strokeStyle = '#2b3444';
        ctx.lineWidth = 2;
        const a = paraTela({ x: -LIMITE, z: -LIMITE }, lado);
        const b = paraTela({ x: LIMITE, z: LIMITE }, lado);
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);

        // elevador
        const e = paraTela(ELEVADOR, lado);
        ctx.fillStyle = '#c58a22';
        ctx.fillRect(e.x - 14, e.y - 5, 28, 10);
        ctx.fillStyle = '#f5c96b';
        ctx.font = '11px system-ui';
        ctx.fillText('elevador', e.x - 22, e.y - 10);

        // jogador
        const j = paraTela(jogador.current, lado);
        ctx.fillStyle = '#3a6df0';
        ctx.beginPath(); ctx.arc(j.x, j.y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a8bcf0';
        ctx.fillText('você', j.x - 12, j.y - 12);

        // Nilo, com a direção do olhar: sem ela não dá para dizer se ele está
        // "observando" ou apenas parado de costas.
        const n = paraTela(corpo.current, lado);
        ctx.fillStyle = '#7fe0b0';
        ctx.beginPath(); ctx.arc(n.x, n.y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7fe0b0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(n.x + Math.sin(corpo.current.yaw) * 18, n.y + Math.cos(corpo.current.yaw) * 18);
        ctx.stroke();
        ctx.fillStyle = '#7fe0b0';
        ctx.fillText('Nilo', n.x - 11, n.y - 13);
    }, []);

    /** Uma rodada de verdade: percepção real, modelo real, motor real. */
    const pensar = useCallback(async () => {
        if (rodando) return;
        setRodando(true);
        setErro('');
        const t0 = Date.now();
        try {
            const d = await deliberateFloor10({
                perception: percepcao(),
                drives: { social: 0.6, curiosity: 0.7, restlessness: 0.5, fatigue: 0.2 },
                memory: {
                    inspectedElevatorCount: 1, sleeps: 0, playerSilentSeconds: 20,
                    lastGoals: historico.slice(0, 3).map((r) => r.meta),
                    // O QUE DEU. Sem estas duas linhas o modelo relê as próprias
                    // ações sem nunca saber se funcionaram.
                    outcomes: memoria.current.linhas(),
                    stopRepeating: memoria.current.aviso(),
                },
                now: Date.now() / 1000,
            });
            if (!d) { setErro('a rodada não decidiu (veja o painel da vontade)'); return; }
            // O CORPO SEMPRE TEM UM PLANO. Quando o tradutor não respondeu —
            // e na primeira rodada ele nunca responde, porque os 640 MB dele
            // ainda estão subindo —, a meta sozinha já dá o destino. O plano do
            // tradutor apenas REFINA (ritmo, duração); a direção vem da meta.
            plano.current = d.motion ?? planoDaMeta(d.goal);
            // A duração do plano é do próprio plano: é ela que decide por
            // quanto tempo o corpo obedece antes de voltar a esperar ordem.
            planoAte.current = performance.now() / 1000 + (d.motion?.duration ?? 4);
            const antes = observar();
            // ── O VEREDITO DO VETOR, NA TELA ──────────────────────────────
            //
            // O motor já consultou o classificador lá dentro; isto aqui é para
            // o veredito ficar VISÍVEL. É a mesma função sobre o mesmo texto,
            // e ela é determinística, então mostra o que o motor viu — custa
            // um segundo embedding (~800 ms) e esta tela existe para medir,
            // não para ser rápida.
            //
            // O que interessa olhar: o alvo escolhido, a MARGEM e se ela foi
            // apertada. Margem larga = o Qwen nem acordou.
            const v = await classificarPensamento(d.rationale).catch(() => null);
            setVetor(v);
            setHistorico((h) => [{
                meta: d.goal,
                plano: d.motion ?? null,
                ms: Date.now() - t0,
                pensamento: d.rationale.slice(0, 220),
                vetor: v,
            }, ...h].slice(0, 12));
            // ── A CONFERÊNCIA ACONTECE DEPOIS, E TEM DE ESPERAR O CORPO ────
            // Julgar no instante da decisão diria sempre "ignorado": o gesto
            // ainda não aconteceu. A janela é a duração do plano mais uma folga
            // para o jogador reagir — reagir é coisa de humano, e humano demora.
            const janela = ((d.motion?.duration ?? 4) + 3) * 1000;
            globalThis.setTimeout(() => {
                const r = memoria.current.conferir(d.goal, antes, observar(), Date.now() / 1000);
                setHistorico((h) => {
                    // A lista é do mais NOVO para o mais velho, e as rodadas
                    // terminam na ordem em que começaram: logo, o veredito é do
                    // último item ainda sem veredito (o mais antigo pendente).
                    let i = -1;
                    for (let k = h.length - 1; k >= 0; k -= 1) {
                        if (h[k].resultado === undefined) { i = k; break; }
                    }
                    if (i < 0) return h;
                    const copia = [...h];
                    copia[i] = { ...copia[i], resultado: r };
                    return copia;
                });
            }, janela);
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setRodando(false);
        }
    }, [historico, percepcao, rodando]);

    // ── LAÇO AUTOMÁTICO ───────────────────────────────────────────────────
    // Sem ele o teste vira "aperte o botão e veja uma rodada", que não mostra o
    // que ele reclamou: a REPETIÇÃO. "só fica rondando de um lado pro outro" é
    // um padrão entre rodadas, e só aparece quando elas se sucedem sozinhas.
    const [auto, setAuto] = useState(false);
    // Espelho da posição para a TELA. Os refs mudam 60x por segundo sem
    // re-renderizar (de propósito: re-render a cada quadro derrubaria o
    // celular); este espelho anda a 5 Hz, que é o bastante para ler um número.
    const [nilo, setNilo] = useState({ x: 4, z: 4 });
    const [voce, setVoce] = useState({ x: -6, z: 6 });
    const [emMovimento, setEmMovimento] = useState(false);
    useEffect(() => {
        let ultima = { x: corpo.current.x, z: corpo.current.z };
        const t = globalThis.setInterval(() => {
            const agora = { x: corpo.current.x, z: corpo.current.z };
            setEmMovimento(Math.hypot(agora.x - ultima.x, agora.z - ultima.z) > 0.02);
            ultima = agora;
            setNilo(agora);
            setVoce({ x: jogador.current.x, z: jogador.current.z });
        }, 200);
        return () => globalThis.clearInterval(t);
    }, []);
    useEffect(() => {
        if (!auto) return;
        let vivo = true;
        const ciclo = async () => {
            while (vivo) {
                await pensar();
                await new Promise((r) => { setTimeout(r, 1500); });
            }
        };
        void ciclo();
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auto]);

    const arrastar = useCallback((ev: React.PointerEvent<HTMLCanvasElement>) => {
        if (ev.buttons === 0 && ev.type !== 'pointerdown') return;
        const tela = telaRef.current;
        if (!tela) return;
        const r = tela.getBoundingClientRect();
        const lado = tela.width;
        const escala = (lado - 24) / (LIMITE * 2);
        const px = ((ev.clientX - r.left) * (lado / r.width) - lado / 2) / escala;
        const pz = ((ev.clientY - r.top) * (lado / r.height) - lado / 2) / escala;
        jogador.current = {
            x: Math.max(-LIMITE, Math.min(LIMITE, px)),
            z: Math.max(-LIMITE, Math.min(LIMITE, pz)),
        };
    }, []);

    const metas = historico.map((r) => r.meta);
    const repetida = metas.length >= 3 && new Set(metas.slice(0, 3)).size === 1;

    return (
        <div style={{
            minHeight: '100vh', background: '#0a0c11', color: '#cfd6e4',
            font: '14px/1.5 system-ui', padding: 12,
        }}
        >
            <h1 style={{ font: '600 17px system-ui', margin: '4px 0 10px' }}>
                campo de provas · vontade + motor
            </h1>
            <canvas
                ref={telaRef}
                width={520}
                height={520}
                onPointerDown={arrastar}
                onPointerMove={arrastar}
                style={{
                    width: '100%', maxWidth: 520, aspectRatio: '1', touchAction: 'none',
                    border: '1px solid #2b3444', borderRadius: 10, display: 'block',
                }}
            />
            {/* ── A POSIÇÃO EM NÚMERO ──────────────────────────────────────
                Um ponto que anda devagar numa tela pequena é indistinguível de
                um ponto parado. O número desfaz a dúvida — e foi a primeira
                pergunta que ele fez sobre esta tela: "ele realmente está
                conseguindo andar né?". */}
            <div
                data-teste="posicao"
                style={{ font: '12px ui-monospace, monospace', opacity: 0.75, margin: '6px 0 0' }}
            >
                nilo {nilo.x.toFixed(1)}, {nilo.z.toFixed(1)} · você{' '}
                {voce.x.toFixed(1)}, {voce.z.toFixed(1)} · distância{' '}
                {Math.hypot(nilo.x - voce.x, nilo.z - voce.z).toFixed(1)}m
                {' · '}
                {emMovimento ? 'andando' : 'parado'}
            </div>
            <p style={{ opacity: 0.7, margin: '6px 0 10px' }}>
                arraste na sala para mover <b style={{ color: '#a8bcf0' }}>você</b>;
                o Nilo se move sozinho, seguindo o plano do motor.
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {!temModelo && (
                    <button type="button" onClick={() => void carregar()} disabled={carregando} style={botao}>
                        {carregando ? 'carregando a vontade…' : 'carregar a vontade'}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => void pensar()}
                    disabled={rodando || !temModelo}
                    style={botao}
                >
                    {rodando ? 'pensando…' : 'pensar uma vez'}
                </button>
                <button
                    type="button"
                    onClick={() => setAuto((v) => !v)}
                    disabled={!temModelo}
                    style={botao}
                >
                    {auto ? 'parar o laço' : 'laço automático'}
                </button>
            </div>

            {erro !== '' && (
                <div style={{ color: '#ff9c9c', marginBottom: 8 }}>{erro}</div>
            )}

            <div style={{ opacity: 0.85, marginBottom: 8 }}>
                vontade: {st.deliberationPhase} · {st.deliberationLoadText}
                {st.deliberationTps > 0 && ` · ${st.deliberationTps.toFixed(1)} tok/s`}
            </div>
            {/* ── O MOTOR PRECISA APARECER NUMA BANCADA CHAMADA "VONTADE +
                MOTOR" ────────────────────────────────────────────────────────
                Ela não mostrava o estado dele. Quando o plano veio nulo três
                execuções seguidas, não havia nada na tela que dissesse por quê —
                a bancada não instrumentava justamente a metade que ela existe
                para testar. */}
            <div style={{ opacity: 0.85, marginBottom: 8 }}>
                motor: {st.motorPhase} · {st.motorLoadText || '—'}
            </div>
            {/* ── O MOTOR NOVO TEM DE SE ANUNCIAR ──────────────────────────
                Sem esta linha, um `?campo` com o embeddinggemma fora do ar
                mediria o motor ANTIGO e pareceria idêntico. Já perdi uma tabela
                de roteamento inteira para código morto nesta base; aqui a tela
                diz na cara qual dos dois motores está decidindo. */}
            <div style={{
                opacity: 0.85,
                marginBottom: 8,
                color: temVetor ? '#9ce6a4' : '#ff9c9c',
            }} data-teste="vetor">
                vetor: {temVetor ? 'no ar' : 'FORA DO AR — rodando o motor antigo'}
                {vetor && ` · ${vetor.alvo} · margem ${vetor.margem.toFixed(3)}`}
                {vetor && (vetor.naDuvida
                    ? ' · apertado, o Qwen desempatou'
                    : ' · folgado, sem LLM')}
            </div>
            {st.deliberationLive !== '' && (
                <div style={caixa}>
                    <div style={rotulo}>pensando agora</div>
                    <div style={{ opacity: 0.9 }}>{st.deliberationLive.slice(-400)}</div>
                </div>
            )}

            {/* A REPETIÇÃO É O DEFEITO QUE ELE RELATOU, então ela tem de ser
                visível como AVISO e não só deduzível da lista. */}
            {repetida && (
                <div style={{ ...caixa, borderColor: '#8a2f2f', color: '#ff9c9c' }}>
                    três rodadas seguidas com a mesma meta ({metas[0]}) — é o
                    “rondando de um lado pro outro”.
                </div>
            )}

            <div style={rotulo}>últimas rodadas</div>
            {historico.length === 0 && <div style={{ opacity: 0.6 }}>nenhuma ainda.</div>}
            {historico.map((r, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={i} style={caixa}>
                    {r.vetor && (
                        <div style={{ opacity: 0.7, fontSize: 12 }}>
                            vetor → {r.vetor.alvo} (margem {r.vetor.margem.toFixed(3)}
                            {r.vetor.naDuvida ? ', desempatado' : ', direto'})
                            {' · '}candidatos: {r.vetor.candidatos.join(', ')}
                        </div>
                    )}
                    <div>
                        <b style={{ color: '#f5c96b' }}>{r.meta}</b>
                        {' · '}
                        {r.plano
                            ? `${r.plano.verb} ${r.plano.target} ${r.plano.pace} ${r.plano.duration}s`
                            : <span style={{ color: '#ff9c9c' }}>sem plano motor</span>}
                        {/* O GESTO É A METADE NÃO-LOCOMOTORA, e sem mostrá-lo
                            a bancada diria "sem plano" para uma rodada em que
                            ele encostou o ouvido na porta. */}
                        {r.plano?.act && (
                            <span style={{ color: '#c39bf0', marginLeft: 6 }}>
                                · {r.plano.act} {r.plano.actTarget ?? ''}
                            </span>
                        )}
                        {' · '}
                        {(r.ms / 1000).toFixed(1)}s
                        {r.resultado !== undefined && (
                            <span style={{
                                marginLeft: 8,
                                color: r.resultado === 'atendido' ? '#7fe0b0'
                                    : r.resultado === 'ignorado' ? '#ff9c9c' : '#7a8598',
                            }}
                            >
                                {r.resultado === 'atendido' ? '✓ funcionou'
                                    : r.resultado === 'ignorado' ? '✗ ignorado' : '— sem veredito'}
                            </span>
                        )}
                    </div>
                    <div style={{ opacity: 0.7, fontSize: 13 }}>{r.pensamento}</div>
                </div>
            ))}
        </div>
    );
};

const botao: React.CSSProperties = {
    background: '#1b2230', color: '#cfd6e4', border: '1px solid #2b3444',
    borderRadius: 8, padding: '8px 14px', font: '14px system-ui',
};
const caixa: React.CSSProperties = {
    border: '1px solid #2b3444', borderRadius: 8, padding: 8, marginBottom: 8,
};
const rotulo: React.CSSProperties = {
    opacity: 0.6, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5,
    margin: '4px 0',
};

export default Floor10Campo;
