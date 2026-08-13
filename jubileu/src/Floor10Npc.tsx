import React, { useRef, useMemo, useEffect, useCallback } from 'react';
import {
    MemoriaDeConsequencia, type MundoObservado,
} from './npc/floor10Consequencia';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
    npc,
    npcAutonomousSay,
    npcPublishAutonomy,
    npcPublishPerception,
    npcSaiuDoAndar,
    npcSet,
} from './npc/npcStore';
import { perceiveFloor10 } from './npc/floor10Perception';
import {
    Floor10WillBrain,
    speedForWillGoal,
    stepFloor10Movement,
} from './npc/floor10Will';
import {
    deliberateFloor10, deliberationYieldedTurn, vontadeRuntimeAberto,
} from './npc/floor10SmallBrain';
import { describeMood, readClock } from './npc/floor10Drives';
import { describePrison, f10prison, prisonReward, prisonTick } from './npc/f10Prison';
import { initLLM } from './npc/wllamaEngine';
import { Cadencia, CADENCIA_PERCEPCAO, CADENCIA_VONTADE } from './npc/floor10Cadencia';
import { yawDaVarredura } from './npc/floor10Olhar';
import {
    POSE_PARADA, duracaoDoGesto, gestoPrendeOsPes, poseDoGesto,
} from './npc/floor10Gesto';
import type { Floor10MotorAct } from './npc/floor10MotorCortex';
import {
    deliberationRetryDelay,
    rearmeAposFala,
    type Floor10Deliberation,
} from './npc/floor10Deliberation';

// ── O CORPO DO NPC (procedural, v1) ────────────────────────────────────────
// Um hóspede humanoide de pé na base do Andar 10. Por enquanto o corpo é
// procedural (o Felipe pediu "inicialmente pode ser procedural"). Olhos,
// MiniBrain, vontade, córtex motor e fala são módulos separados: os olhos
// publicam a percepção real, a vontade escolhe, e este corpo executa.

const NPC_START = { x: 0, y: 0, z: 2.2 } as const;
const NEAR_DIST = 2.8;

const SKIN = '#c9986f';
const SHIRT = '#3b4a6b';
const PANTS = '#2a2d34';
const HAIR = '#2b2119';

const Floor10Npc: React.FC<{ playerPositionRef?: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const root = useRef<THREE.Group>(null);
    const torso = useRef<THREE.Group>(null);
    const head = useRef<THREE.Group>(null);
    const armL = useRef<THREE.Group>(null);
    const armR = useRef<THREE.Group>(null);
    const legL = useRef<THREE.Group>(null);
    const legR = useRef<THREE.Group>(null);
    const eyeL = useRef<THREE.Mesh>(null);
    const eyeR = useRef<THREE.Mesh>(null);
    // ── NASCE SEM RESPOSTA, DE PROPÓSITO ─────────────────────────────────
    // Era `useRef(false)`, e isso é uma AFIRMAÇÃO ("o jogador está longe") que
    // o componente não tinha como fazer ao montar. Se a loja tivesse ficado com
    // `near: true` da visita anterior, a comparação `near !== nearRef.current`
    // dava falso no primeiro quadro e a loja nunca era corrigida. Começando sem
    // valor, o primeiro quadro SEMPRE publica a verdade medida.
    const nearRef = useRef<boolean | null>(null);
    /** Conferências de consequência agendadas e ainda não disparadas. */
    const conferencias = useRef(new Set<ReturnType<typeof setTimeout>>());
    const tmp = useMemo(() => new THREE.Vector3(), []);
    const npcWorld = useMemo(() => new THREE.Vector3(), []);
    const forward = useMemo(() => new THREE.Vector3(), []);
    const worldQuaternion = useMemo(() => new THREE.Quaternion(), []);
    const willBrain = useMemo(() => new Floor10WillBrain(), []);
    const consumedWillCommandId = useRef(0);
    const autonomousTalkUntil = useRef(0);
    // Os dois relógios do NPC. Ver floor10Cadencia.ts: a vontade deixou de ser
    // reavaliada uma vez por quadro — ela lê uma percepção de 6 Hz, então 60
    // avaliações por segundo eram 48 conclusões idênticas e 60 objetos de lixo.
    const cadenciaPercepcao = useMemo(() => new Cadencia(CADENCIA_PERCEPCAO), []);
    const cadenciaVontade = useMemo(() => new Cadencia(CADENCIA_VONTADE), []);
    // O último veredito da vontade continua valendo entre os passos: o corpo se
    // move e anima a 60 Hz mirando o alvo que ela escolheu.
    const ultimaVontade = useRef<ReturnType<Floor10WillBrain['tick']> | null>(null);
    // O rumo em que ele estava quando parou — a varredura do olhar oscila em
    // volta dele em vez de girar sem fim.
    const rumoParado = useRef<number | null>(null);
    const conversaAberta = useRef(false);
    /** A fala estava ocupando o aparelho no quadro anterior? */
    const falaOcupando = useRef(false);
    // ── DELIBERAÇÃO ────────────────────────────────────────────────────────
    // O cérebro pequeno pensa por fora, sem pressa. Guardamos só a última
    // intenção pronta; o reflexo abaixo continua decidindo a cada quadro.
    const deliberation = useRef<Floor10Deliberation | null>(null);
    const nextDeliberationAt = useRef(6);
    // Falhas seguidas do cérebro pequeno; zera assim que ele decide de novo.
    const deliberationFailures = useRef(0);
    const elevatorInspections = useRef(0);
    const lastGoalTrail = useRef<string[]>([]);
    const playerQuietSince = useRef(0);
    // ── O QUE DEU CERTO E O QUE NÃO DEU ───────────────────────────────────
    // "ele se aproximou do player, e o player ignorou (não abriu o chat ou sla)
    //  ele vai saber disso entendeu?"
    // Vive AQUI, e não dentro do cérebro, porque quem OBSERVA o mundo é a tela
    // do andar. Misturar as duas coisas já fez a fila perguntar a si mesma.
    const memoriaConsequencia = useRef(new MemoriaDeConsequencia());
    // ── O GESTO EM CURSO ──────────────────────────────────────────────────
    // O motor escolhe `ACT:` desde que a gramática ganhou a linha do gesto, e
    // até aqui isso só aparecia no texto do `?campo`: ele decidia bater na
    // porta e continuava andando de braço solto. Guarda-se o quê e QUANDO
    // começou; a pose sai de floor10Gesto, que é puro e testado.
    // `dura` é quanto o gesto deve durar, já resolvido: para ação é a tabela,
    // para postura é a duração do PLANO que a pediu. Guardar aqui em vez de
    // reconsultar a tabela é o que faz a postura acompanhar a ordem — sem isso,
    // o Nilo agachava para examinar um aparelho e se levantava sozinho no meio,
    // com o corpo ainda preso no lugar.
    const gesto = useRef<{ act: Floor10MotorAct; comecou: number; dura: number } | null>(null);

    /**
     * O mundo como a memória de consequência precisa vê-lo. Lido da loja no
     * instante da chamada — é justamente a diferença entre dois instantes que
     * responde "ele me deu atenção?".
     */
    const observarMundo = useCallback((): MundoObservado => ({
        distanciaDoJogador: npc.perception.player?.distance ?? null,
        distanciaDoElevador: npc.perception.elevator.distance,
        conversaAberta: npc.open,
        // Só as mensagens DELE: as respostas do Nilo não são sinal de atenção
        // recebida, são o Nilo falando sozinho do ponto de vista desta conta.
        mensagensDoJogador: npc.history.filter((m) => m.role === 'user').length,
    }), []);

    // Sonda: colocar o Nilo num ponto para testar a prisão sem esperar a
    // vontade dele escolher ir. Não muda nada do jogo — só existe para o teste
    // headless conseguir montar a cena dos dois em pontas opostas.
    const forcado = useRef<{ x: number; z: number } | null>(null);
    useEffect(() => {
        (window as unknown as Record<string, unknown>).__f10moveNpc = (x: number, z: number) => {
            forcado.current = { x, z };
        };
    }, []);

    // ── SAIR DO ANDAR APAGA O ECO, NÃO A MEMÓRIA ──────────────────────────
    //
    // A loja do NPC vive fora do React de propósito: o cérebro não pode
    // reiniciar porque um componente desmontou. Mas o que está na TELA é outra
    // coisa, e ficava sujo — o aviso de "Conversar" aceso com o Nilo longe, a
    // bolha do último pensamento reaparecendo antes de qualquer raciocínio
    // novo, uma fala antiga ressurgindo literal. Eco da visita anterior.
    //
    // A conversa NÃO é apagada aqui: ela é a memória dele, e lembrar do que
    // vocês falaram é o ponto do personagem.
    //
    // No mesmo lugar morrem as conferências de consequência agendadas: elas são
    // marcadas de dentro de um callback assíncrono do `useFrame` e sobreviviam
    // ao desmonte, disparando com o jogador já em outro andar para medir o
    // efeito de um gesto num mundo que não existe mais.
    useEffect(() => {
        const pendentes = conferencias.current;
        return () => {
            for (const bilhete of pendentes) globalThis.clearTimeout(bilhete);
            pendentes.clear();
            npcSaiuDoAndar();
        };
    }, []);

    // ── O RELÓGIO DESTE ANDAR É NOSSO, E ISSO NÃO É PREFERÊNCIA ─────────────
    //
    // Aqui se lia `clock.elapsedTime`, e no Andar 10 esse relógio VOLTA A ZERO
    // sozinho. O App troca o `frameloop` do Canvas quando o painel de conversa
    // abre e fecha:
    //
    //     frameloop={... (currentLevel === 10 && npcChatOpen) ? 'demand' : 'always'}
    //
    // e o `setFrameloop` do react-three-fiber faz, literalmente,
    // `clock.stop(); clock.elapsedTime = 0; clock.start(); clock.elapsedTime = 0`.
    // Ou seja: CADA abrir e fechar do chat zera o tempo do andar.
    //
    // Tudo aqui usa esse número como marco ABSOLUTO — `nextDeliberationAt`,
    // `playerQuietSince`, `autonomousTalkUntil` — e a vontade também
    // (`goalLockedUntil`, `lastSeenPlayer.at`, `deliberation.at`). Com o relógio
    // andando para trás:
    //
    //   `t >= nextDeliberationAt` vira falso pelo tanto de tempo que o jogador
    //   tinha passado no andar — ele simplesmente PARA DE PENSAR, e de fora
    //   isso é indistinguível de travado;
    //
    //   `input.time >= this.goalLockedUntil` idem: a vontade congela na última
    //   meta, e as idades (`time - ...at`) ficam negativas, então tudo parece
    //   ter acabado de acontecer.
    //
    // O acumulador não volta atrás nunca. E ele PARA junto com os quadros: com
    // o painel aberto o andar está congelado de propósito, e é certo que os
    // cooldowns não corram enquanto ninguém se mexe.
    const tempoDoAndar = useRef(0);

    useFrame((_, dt) => {
        const safeDt = Math.min(0.1, Math.max(0, dt));
        tempoDoAndar.current += safeDt;
        const t = tempoDoAndar.current;
        const pp = playerPositionRef?.current;
        const g = root.current;

        if (forcado.current && g) {
            g.position.x = forcado.current.x;
            g.position.z = forcado.current.z;
        }

        // Primeiro os olhos leem a transformação atual. A vontade nunca decide
        // usando uma posição inventada ou a coordenada de spawn.
        let livePerception = npc.perception;
        const passoPercepcao = cadenciaPercepcao.passo(safeDt);
        if (g && passoPercepcao > 0) {
            g.getWorldPosition(npcWorld);
            g.getWorldQuaternion(worldQuaternion);
            forward.set(0, 0, 1).applyQuaternion(worldQuaternion);
            const worldYaw = Math.atan2(forward.x, forward.z);
            livePerception = perceiveFloor10({
                npcPosition: npcWorld,
                npcYaw: worldYaw,
                playerPosition: pp ?? null,
                // ── SEM ISTO OS OLHOS NOVOS SERIAM CEGOS NO JOGO ──────────
                // A percepção passou a enxergar as placas e alavancas, mas
                // quem decide se ela as vê é quem CHAMA: sem a prisão aqui, o
                // campo chega vazio e tudo continua como antes — mais uma peça
                // pronta e desligada, que é o defeito que esta base já teve
                // três vezes.
                prison: f10prison,
            });
            npcPublishPerception(livePerception);
        }

        // A micro-IA escolhe. O corpo executa o alvo, mas conversa aberta e
        // fala em andamento sempre vencem o movimento.
        let moving = false;
        let desiredYaw: number | null = null;
        if (g) {
            const languageCommand = npc.willCommand;
            if (languageCommand && languageCommand.id !== consumedWillCommandId.current) {
                willBrain.applyLanguageDecision(
                    languageCommand.action,
                    t,
                    languageCommand.reason,
                );
                consumedWillCommandId.current = languageCommand.id;
            }
            // Dispara uma deliberação quando a anterior já envelheceu. É async:
            // NADA aqui espera por ela. Se o
            // cérebro pequeno não carregar, a promessa resolve null e o reflexo
            // segue sozinho, como sempre fez.
            // Os dois modelos ficam residentes, mas não geram ao mesmo tempo:
            // o Mini pensa nas janelas ociosas, inclusive enquanto o jogador
            // escreve. Ao começar uma fala, ele é pausado sem perder os pesos.
            // ── A FALA ACABOU: A VONTADE VOLTA EM SEGUIDA ─────────────────
            //
            // Sem isto, o próximo pensamento só podia acontecer no ciclo cheio
            // de 60s contado a partir do ÚLTIMO disparo — e, como a pausa agora
            // encerra o runtime, ainda havia a reabertura por cima. Depois de
            // cada conversa dava mais de um minuto de silêncio, tempo de sobra
            // para quem está jogando concluir que ele parou de pensar.
            //
            // E o contador de falhas é zerado: ser interrompido pela fala não é
            // fracasso, e o castigo exponencial não pode sobreviver à conversa.
            const falaOcupa = npc.phase === 'thinking' || npc.phase === 'loading';
            if (falaOcupando.current && !falaOcupa) {
                // O PREÇO DEPENDE DE O RUNTIME AINDA ESTAR ABERTO. Se a fala
                // encerrou o Worker da vontade, voltar custa reabrir 1,32 GB —
                // e cobrar isso 6s depois de CADA resposta era o que fazia o
                // celular do dono do jogo quase reiniciar. Ver
                // floor10Deliberation.rearmeAposFala.
                nextDeliberationAt.current = Math.min(
                    nextDeliberationAt.current,
                    t + rearmeAposFala(vontadeRuntimeAberto()),
                );
                deliberationFailures.current = 0;
            }
            falaOcupando.current = falaOcupa;

            if (npc.phase !== 'thinking' && npc.phase !== 'loading'
                && t >= nextDeliberationAt.current) {
                nextDeliberationAt.current = t + 60;
                void deliberateFloor10({
                    perception: livePerception,
                    drives: npc.autonomy.drives,
                    memory: {
                        inspectedElevatorCount: elevatorInspections.current,
                        sleeps: 44,
                        playerSilentSeconds: Math.max(0, t - playerQuietSince.current),
                        lastGoals: lastGoalTrail.current.slice(-3) as never,
                        // ── O QUE DEU DE CADA UMA ─────────────────────────
                        // `lastGoals` sozinho é a metade que causava a
                        // repetição: ele relia as próprias ações sem nunca
                        // saber se funcionaram. Ver floor10Consequencia.
                        outcomes: memoriaConsequencia.current.linhas(),
                        stopRepeating: memoriaConsequencia.current.aviso(),
                        // Os dois cérebros conversando: o que o 3B prometeu ao
                        // jogador chega aqui e a deliberação honra a palavra.
                        agreedAction: npc.willCommand?.action ?? npc.autonomy.commitment ?? null,
                        agreedReason: npc.willCommand?.reason
                            ?? npc.autonomy.commitmentReason ?? null,
                        mood: `${describeMood(npc.autonomy.drives, readClock())} `
                            + describePrison(f10prison),
                    },
                    prison: f10prison,
                    now: t,
                }).then((decided) => {
                    if (decided) {
                        deliberation.current = decided;
                        deliberationFailures.current = 0;
                        // ── O GESTO COMEÇA AQUI ───────────────────────────
                        // `tempoDoAndar.current` e não o `t` do fecho: este
                        // `.then` resolve muitos quadros depois da chamada, e
                        // usar o `t` velho faria o gesto nascer no passado —
                        // ou seja, já terminado, invisível.
                        const ato = decided.motion?.act;
                        if (ato && ato !== 'none') {
                            gesto.current = {
                                act: ato,
                                comecou: tempoDoAndar.current,
                                dura: duracaoDoGesto(ato, decided.motion?.duration),
                            };
                        }
                        // ── AGENDA A CONFERÊNCIA ──────────────────────────
                        // Julgar agora diria sempre "ignorado": o gesto ainda
                        // não aconteceu. A janela é a duração do plano mais uma
                        // folga para o jogador reagir — reagir é coisa de
                        // humano, e humano demora.
                        const antes = observarMundo();
                        const meta = decided.goal;
                        const espera = ((decided.motion?.duration ?? 6) + 4) * 1000;
                        // O temporizador é REGISTRADO: agendado de dentro de um
                        // callback assíncrono do `useFrame`, ele sobrevivia ao
                        // desmonte e disparava com o jogador já em outro andar,
                        // medindo consequência de um mundo que não existe mais.
                        const bilhete = globalThis.setTimeout(() => {
                            conferencias.current.delete(bilhete);
                            memoriaConsequencia.current.conferir(
                                meta, antes, observarMundo(), Date.now() / 1000,
                            );
                        }, espera);
                        conferencias.current.add(bilhete);
                    } else if (
                        npc.deliberationPhase !== 'unavailable'
                        // CEDER A VEZ NÃO É FALHAR. Enquanto o modelo de fala
                        // baixa, a deliberação cede a cada 5s — e contar isso
                        // como fracasso levava a espera ao teto de 300s. Quando
                        // a CPU enfim liberava, o cérebro de vontade estava de
                        // castigo por 5 minutos sem nunca ter tentado.
                        && !deliberationYieldedTurn()
                    ) {
                        // Uma fala pode ter interrompido só esta rodada, e aí
                        // retomar em segundos é certo. Mas insistir a cada 5s
                        // PARA SEMPRE, quando o modelo pequeno está enrolado,
                        // só cozinha o celular — então a espera cresce a cada
                        // falha seguida até voltar ao ciclo normal.
                        deliberationFailures.current += 1;
                        nextDeliberationAt.current = Math.min(
                            nextDeliberationAt.current,
                            t + deliberationRetryDelay(deliberationFailures.current),
                        );
                    }
                });
            }

            // ── O PASSO DA VONTADE ────────────────────────────────────────
            // 12 vezes por segundo, não 60. O `dt` dos quadros pulados vem
            // acumulado dentro de `passoVontade`, então a prisão, os impulsos e
            // os cooldowns integram exatamente o mesmo tempo de antes.
            //
            // Abrir a conversa não espera os 83 ms: ali a decisão muda de
            // verdade e o jogador está olhando.
            if (npc.open !== conversaAberta.current) {
                conversaAberta.current = npc.open;
                cadenciaVontade.agora();
            }
            const passoVontade = cadenciaVontade.passo(safeDt);
            if (passoVontade > 0) {
                // A SALA TRANCADA anda antes da vontade decidir: o que ele sente
                // da prisão precisa estar atualizado quando a rede olhar o
                // estado. E cada evento vira recompensa — quem diz que a tranca
                // cedeu é a sala, não a minha tabela de utilidade.
                const eventos = prisonTick({
                    npc: { x: g.position.x, z: g.position.z },
                    player: pp ? { x: pp.x, z: pp.z } : null,
                    dt: passoVontade,
                });
                for (const evento of eventos) {
                    willBrain.addExternalReward(prisonReward(evento, passoVontade));
                }

                const passo = willBrain.tick({
                    dt: passoVontade,
                    time: t,
                    perception: livePerception,
                    npcPosition: g.position,
                    conversationOpen: npc.open,
                    speaking: npc.speaking,
                    deliberation: deliberation.current,
                    prison: f10prison,
                });
                ultimaVontade.current = passo;
                npcPublishAutonomy(passo.snapshot);
                if (passo.snapshot.goal !== lastGoalTrail.current.at(-1)) {
                    lastGoalTrail.current = [...lastGoalTrail.current.slice(-4), passo.snapshot.goal];
                    if (passo.snapshot.goal === 'inspect-elevator') elevatorInspections.current += 1;
                }
                // A fala nasce no passo que a produziu e morre nele: fora do
                // `if`, ela seria dita de novo em cada quadro até o passo
                // seguinte.
                if (passo.speech) {
                    autonomousTalkUntil.current = t + 2.8;
                    npcAutonomousSay(passo.speech);
                }
            }
            if (npc.open || npc.speaking) playerQuietSince.current = t;
            // O corpo continua a 60 Hz, mirando o que a vontade decidiu por
            // último — é isso que mantém o andar liso sem reavaliar nada.
            // Antes do primeiro passo não há veredito nenhum, e isso é normal
            // no primeiro quadro. O corpo segue respirando e piscando abaixo.
            const will = ultimaVontade.current;

            // ── O GESTO PODE SEGURAR OS PÉS ───────────────────────────────
            // Bater, tocar e agachar acontecem CONTRA alguma coisa: continuar
            // andando durante um deles arrasta a mão pela sala. Acenar, escutar
            // e olhar em volta combinam com o passo.
            const gestoAtivo = gesto.current
                && tempoDoAndar.current - gesto.current.comecou < gesto.current.dura
                ? gesto.current
                : null;
            if (!gestoAtivo) gesto.current = null;
            const pesPresos = gestoPrendeOsPes(gestoAtivo?.act);

            if (will && !npc.open && !npc.speaking && will.snapshot.target && !pesPresos) {
                const step = stepFloor10Movement(
                    g.position,
                    will.snapshot.target,
                    speedForWillGoal(
                        will.snapshot.goal,
                        will.snapshot.motionSpeed,
                    ),
                    safeDt,
                );
                g.position.x = step.x;
                g.position.z = step.z;
                moving = step.moving;
                if (moving) desiredYaw = step.yaw;
            }

            const meta = will?.snapshot.goal;
            const shouldFacePlayer = pp && (
                npc.open
                || npc.speaking
                || meta === 'talk-player'
                || meta === 'observe-player'
                || meta === 'follow-player'
                || (meta === 'embodied-intent' && will?.snapshot.motion?.target === 'player')
            );
            if (!moving && shouldFacePlayer) {
                rumoParado.current = null;
                tmp.copy(pp).sub(g.position);
                tmp.y = 0;
                if (tmp.lengthSq() > 0.0001) desiredYaw = Math.atan2(tmp.x, tmp.z);
            } else if (!moving && !shouldFacePlayer) {
                // Sem alvo imediato, ele VARRE a sala: olha para um ponto, segura
                // alguns segundos, escolhe outro. Ver floor10Olhar.ts — antes era
                // `rotation.y + 0.32` por quadro, um alvo que ele nunca alcançava,
                // e o Nilo girava a ~40°/s para sempre.
                rumoParado.current ??= g.rotation.y;
                desiredYaw = yawDaVarredura(rumoParado.current, t);
            } else if (moving) {
                rumoParado.current = null;
            }

            if (desiredYaw !== null) {
                let deltaYaw = desiredYaw - g.rotation.y;
                while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
                while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
                g.rotation.y += deltaYaw * Math.min(1, safeDt * (moving ? 7 : 2.2));
            }
        }

        // Respiração e caminhada procedural. A animação é consequência da
        // decisão, não um loop visual desconectado do deslocamento.
        const walkPhase = t * 7.2;
        const walkAmount = moving ? 1 : 0;
        // ── O GESTO SOMA, NÃO SUBSTITUI ───────────────────────────────────
        // Ele acena ENQUANTO caminha. Trocar a animação pela pose faria o corpo
        // congelar no meio do passo, que é pior que não ter gesto nenhum.
        const pose = gesto.current
            ? poseDoGesto(gesto.current.act, t - gesto.current.comecou, gesto.current.dura)
            : POSE_PARADA;
        if (torso.current) {
            torso.current.scale.y = 1 + Math.sin(t * 1.6) * 0.02;
            torso.current.rotation.z = Math.sin(t * 0.5) * 0.02
                + Math.sin(walkPhase * 0.5) * 0.025 * walkAmount;
            torso.current.rotation.x = pose.troncoX;
        }
        if (root.current) root.current.position.y = NPC_START.y + pose.altura;
        if (armL.current) {
            armL.current.rotation.x = Math.sin(t * 0.8) * 0.05
                + Math.sin(walkPhase + Math.PI) * 0.34 * walkAmount
                + pose.bracoEsqX;
        }
        if (armR.current) {
            armR.current.rotation.x = Math.sin(t * 0.8 + Math.PI) * 0.05
                + Math.sin(walkPhase) * 0.34 * walkAmount
                + pose.bracoDirX;
            armR.current.rotation.z = pose.bracoDirZ;
        }
        if (legL.current) legL.current.rotation.x = Math.sin(walkPhase) * 0.38 * walkAmount;
        if (legR.current) legR.current.rotation.x = Math.sin(walkPhase + Math.PI) * 0.38 * walkAmount;

        // Proximidade acompanha a posição MÓVEL do corpo.
        if (pp && g) {
            tmp.copy(pp).sub(g.position); tmp.y = 0;
            const dist = tmp.length();
            const near = dist < NEAR_DIST;
            if (near !== nearRef.current) {
                nearRef.current = near;
                npcSet({ near });
                // Começa a carregar e a AQUECER quando o jogador se aproxima,
                // não quando ele abre o painel. No celular do Felipe a carga
                // sozinha leva ~200s: esperar o painel abrir jogava tudo isso
                // em cima da primeira pergunta. Aqui o custo corre enquanto ele
                // ainda está andando. Falhar é inofensivo — só fica mais lento.
                if (near) void initLLM().catch(() => undefined);
            }
        }

        // "fala": cabeça balança enquanto o NPC responde
        if (head.current) {
            const talking = npc.speaking || t < autonomousTalkUntil.current;
            const talk = talking ? Math.sin(t * 9) * 0.05 + Math.sin(t * 13) * 0.03 : 0;
            head.current.rotation.x = talk + pose.cabecaX;
            head.current.rotation.y = pose.cabecaY;
            head.current.rotation.z = pose.cabecaZ;
            head.current.position.y = 1.52 + (talking ? Math.abs(Math.sin(t * 7)) * 0.01 : 0);
        }

        // Piscar dá um feedback visual de que os olhos são um sistema vivo.
        const blinkPhase = t % 4.1;
        const eyeScaleY = blinkPhase > 3.94 ? 0.12 : 1;
        if (eyeL.current) eyeL.current.scale.y = eyeScaleY;
        if (eyeR.current) eyeR.current.scale.y = eyeScaleY;

    });

    return (
        <group ref={root} position={[NPC_START.x, NPC_START.y, NPC_START.z]}>
            {/* pernas */}
            <group ref={legL} position={[-0.11, 0.74, 0]}>
                <mesh position={[0, -0.32, 0]}><capsuleGeometry args={[0.1, 0.62, 4, 8]} /><meshStandardMaterial color={PANTS} roughness={0.9} /></mesh>
            </group>
            <group ref={legR} position={[0.11, 0.74, 0]}>
                <mesh position={[0, -0.32, 0]}><capsuleGeometry args={[0.1, 0.62, 4, 8]} /><meshStandardMaterial color={PANTS} roughness={0.9} /></mesh>
            </group>
            {/* tronco */}
            <group ref={torso} position={[0, 0.82, 0]}>
                <mesh position={[0, 0.22, 0]}><capsuleGeometry args={[0.22, 0.42, 6, 12]} /><meshStandardMaterial color={SHIRT} roughness={0.85} /></mesh>
                {/* braços */}
                <group ref={armL} position={[-0.26, 0.36, 0]}>
                    <mesh position={[0, -0.24, 0]}><capsuleGeometry args={[0.07, 0.44, 4, 8]} /><meshStandardMaterial color={SHIRT} roughness={0.85} /></mesh>
                    <mesh position={[0, -0.5, 0]}><sphereGeometry args={[0.07, 10, 10]} /><meshStandardMaterial color={SKIN} roughness={0.7} /></mesh>
                </group>
                <group ref={armR} position={[0.26, 0.36, 0]}>
                    <mesh position={[0, -0.24, 0]}><capsuleGeometry args={[0.07, 0.44, 4, 8]} /><meshStandardMaterial color={SHIRT} roughness={0.85} /></mesh>
                    <mesh position={[0, -0.5, 0]}><sphereGeometry args={[0.07, 10, 10]} /><meshStandardMaterial color={SKIN} roughness={0.7} /></mesh>
                </group>
            </group>
            {/* cabeça */}
            <group ref={head} position={[0, 1.52, 0]}>
                <mesh><sphereGeometry args={[0.17, 20, 20]} /><meshStandardMaterial color={SKIN} roughness={0.65} /></mesh>
                {/* cabelo */}
                <mesh position={[0, 0.06, -0.02]}><sphereGeometry args={[0.178, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.62]} /><meshStandardMaterial color={HAIR} roughness={0.9} /></mesh>
                {/* olhos */}
                <mesh ref={eyeL} position={[-0.06, 0.01, 0.15]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#141414" /></mesh>
                <mesh ref={eyeR} position={[0.06, 0.01, 0.15]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#141414" /></mesh>
            </group>
            {/* luzinha suave pra destacar o NPC na base cinza */}
            <pointLight position={[0, 1.7, 0.5]} intensity={0.5} distance={4} color="#ffe6c0" />
        </group>
    );
};

export default Floor10Npc;
