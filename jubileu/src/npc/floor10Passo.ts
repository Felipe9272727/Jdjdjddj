// ── O CORPO OBEDECENDO AO PLANO ───────────────────────────────────────────
//
// O dono do jogo, depois de ver o Nilo andando:
//
//   "eu queria que vc fizesse o utility aí mais inteligente, principalmente
//    porque ele só fica rondando de um lado pro outro, e o comportamento mais
//    NPC possível"
//
// "Rondar de um lado pro outro" é o que um corpo faz quando ninguém lhe deu
// destino: ele preenche o silêncio com movimento. O conserto não é inventar um
// movimento mais bonito — é PARAR de se mexer quando não há ordem, e obedecer
// direito quando há.
//
// AS DUAS REGRAS QUE MUDAM O QUE SE VÊ
//
// 1. SEM PLANO, NÃO ANDA. Ele fica parado e vira a cabeça. Um NPC parado
//    olhando em volta lê como alguém pensando; o mesmo NPC andando em ziguezague
//    lê como bug. É a diferença entre presença e agitação.
//
// 2. CHEGAR PERTO TEM FIM. `approach` para numa distância de conversa em vez de
//    grudar no jogador — que é o que faz um NPC parecer um cão de guarda. E
//    `withdraw` para quando já deu espaço, em vez de fugir para a parede.
//
// Puro de propósito: recebe o corpo e devolve o corpo mexido. Dá para testar
// cem passos em milissegundos, sem tela e sem modelo — que é como se descobre
// que "orbit" nunca completa uma volta.
import { FLOOR10_MOTOR_RELATIVE } from './floor10MotorCortex';
import type { Floor10MotorPlan, Floor10MotorTarget } from './floor10MotorCortex';
import type { DeliberationGoal } from './floor10Deliberation';

export type CorpoDoNilo = {
    x: number;
    z: number;
    yaw: number;
    /**
     * ── O DESTINO DE UMA ORDEM RELATIVA FICA TRAVADO ──────────────────────
     *
     * "5 passos à esquerda" significa a esquerda de ONDE ELE ESTAVA quando
     * decidiu — não uma direção que gira junto com ele. Sem travar, o alvo era
     * recalculado a cada quadro: ele virava para a esquerda, a esquerda virava
     * junto, e o resultado era um Nilo rodando no lugar (medido: 0,09 m em seis
     * segundos, quando devia atravessar cinco passos).
     *
     * Guardado no CORPO porque é estado do corpo, não do plano: o plano diz
     * "para a minha esquerda", e o corpo é quem sabe onde isso era.
     */
    destino?: { x: number; z: number; de: string } | null;
};

export type MundoDoPasso = {
    jogador: { x: number; z: number } | null;
    elevador: { x: number; z: number };
    /** Metade do lado da sala; o corpo nunca atravessa a parede. */
    limite: number;
    /** Segundos desde o quadro anterior. */
    dt: number;
};

/** Metros por segundo de cada ritmo. Andar humano tranquilo é ~1,3 m/s. */
const VELOCIDADE = { slow: 0.8, normal: 1.6, fast: 2.8 } as const;

/**
 * Onde ele PARA ao se aproximar. 1,6 m é distância de conversa: perto o
 * bastante para ser um gesto, longe o bastante para não ser invasão — e foi
 * justamente "jogador colado, incomodado" que apareceu como situação de teste.
 */
const PERTO_DEMAIS = 1.6;
/** Até onde vale a pena recuar. Além disso ele está só fugindo. */
const ESPACO_BASTA = 4.5;
/** Velocidade de giro da cabeça, rad/s. Virar instantâneo parece teletransporte. */
const GIRO = 2.6;

function alvoNoMundo(
    alvo: Floor10MotorTarget,
    corpo: CorpoDoNilo,
    mundo: MundoDoPasso,
): { x: number; z: number } | null {
    const L = mundo.limite;
    switch (alvo) {
        case 'player': return mundo.jogador;
        case 'elevator': return mundo.elevador;
        case 'room-center': return { x: 0, z: 0 };
        case 'north-side': return { x: 0, z: L - 4 };
        case 'south-side': return { x: 0, z: -L + 4 };
        case 'east-side': return { x: L - 4, z: 0 };
        case 'west-side': return { x: -L + 4, z: 0 };
        // Sem catálogo de aparelhos nesta réplica: o corpo trata como "aqui
        // mesmo" em vez de inventar uma posição que não existe no mundo real.
        // ── AS RELATIVAS SE RESOLVEM CONTRA O YAW DELE ───────────────────
        // "Esquerda" é a esquerda do NILO, não a do mapa — e por isso o alvo
        // tem de ser calculado no instante do passo, não uma vez. Sem estas
        // quatro, "5 passos à esquerda" era inexprimível e ele só sabia ir até
        // objetos: um corpo que pula de âncora em âncora, nunca um que anda
        // pela sala.
        case 'ahead':
        case 'behind':
        case 'to-my-left':
        case 'to-my-right': {
            // Um gesto de deslocamento: longe o bastante para ser visível,
            // perto o bastante para caber na sala sem bater na parede.
            const PASSOS = 5;
            const giro = alvo === 'ahead' ? 0
                : alvo === 'behind' ? Math.PI
                    : alvo === 'to-my-left' ? -Math.PI / 2 : Math.PI / 2;
            const a = corpo.yaw + giro;
            return {
                x: corpo.x + Math.sin(a) * PASSOS,
                z: corpo.z + Math.cos(a) * PASSOS,
            };
        }
        case 'nearest-device':
        case 'active-device':
        case 'self':
        default: return null;
    }
}

/** Vira a cabeça na direção pedida, no máximo `GIRO` por segundo. */
function encarar(corpo: CorpoDoNilo, dx: number, dz: number, dt: number): void {
    if (dx === 0 && dz === 0) return;
    const desejado = Math.atan2(dx, dz);
    let delta = desejado - corpo.yaw;
    // Normaliza para o caminho curto: sem isto ele dá a volta pelo lado longo,
    // que na tela parece um giro sem motivo.
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const passo = Math.max(-GIRO * dt, Math.min(GIRO * dt, delta));
    corpo.yaw += passo;
}

/**
 * Um quadro de movimento. `plano` nulo = nenhuma ordem em vigor: ele NÃO anda.
 * Devolve o mesmo objeto, mexido — é chamado 60 vezes por segundo.
 */
export function passoDoPlano(
    corpo: CorpoDoNilo,
    plano: Floor10MotorPlan | null,
    mundo: MundoDoPasso,
): CorpoDoNilo {
    const { dt } = mundo;

    if (!plano) {
        // ── PARADO, MAS NÃO MORTO ─────────────────────────────────────────
        // Ele acompanha o jogador com o olhar. É o mínimo que separa "presente"
        // de "travado", e não custa deslocamento nenhum — que é exatamente a
        // queixa que este arquivo existe para resolver.
        if (mundo.jogador) {
            encarar(corpo, mundo.jogador.x - corpo.x, mundo.jogador.z - corpo.z, dt);
        }
        return corpo;
    }

    const relativa = (FLOOR10_MOTOR_RELATIVE as readonly string[]).includes(plano.target);
    let alvo: { x: number; z: number } | null;
    if (relativa) {
        // Trava na primeira vez que ESTE plano é visto, e destrava quando vem
        // outro. `raw` identifica o plano; dois planos iguais em sequência são
        // a mesma ordem repetida, e repetir "5 passos à esquerda" deve andar
        // mais cinco a partir de onde ele parou.
        if (!corpo.destino || corpo.destino.de !== plano.raw) {
            const p = alvoNoMundo(plano.target, corpo, mundo);
            corpo.destino = p ? { ...p, de: plano.raw } : null;
        }
        alvo = corpo.destino;
    } else {
        corpo.destino = null;
        alvo = alvoNoMundo(plano.target, corpo, mundo);
    }
    const v = VELOCIDADE[plano.pace] ?? VELOCIDADE.normal;

    if (!alvo) {
        // `stay | self` e os aparelhos: fica onde está, olhando para o jogador.
        if (mundo.jogador) {
            encarar(corpo, mundo.jogador.x - corpo.x, mundo.jogador.z - corpo.z, dt);
        }
        return corpo;
    }

    const dx = alvo.x - corpo.x;
    const dz = alvo.z - corpo.z;
    const dist = Math.hypot(dx, dz) || 1e-6;
    let mx = 0;
    let mz = 0;

    switch (plano.verb) {
        case 'approach':
        case 'explore':
            // CHEGAR PERTO TEM FIM. Sem o freio ele encosta no jogador e fica
            // vibrando contra ele — a cara de um NPC quebrado.
            if (dist > (plano.target === 'player' ? PERTO_DEMAIS : 0.8)) {
                mx = (dx / dist) * v * dt;
                mz = (dz / dist) * v * dt;
            }
            encarar(corpo, dx, dz, dt);
            break;
        case 'withdraw':
            // Recuar tem fim também: passado o espaço confortável ele para de
            // andar mas continua de frente, que é dar espaço sem virar as
            // costas — a leitura de "incomodado", não de "fugindo".
            if (dist < ESPACO_BASTA) {
                mx = -(dx / dist) * v * dt;
                mz = -(dz / dist) * v * dt;
            }
            encarar(corpo, dx, dz, dt);
            break;
        case 'orbit': {
            // Anda pela tangente, mantendo o raio. É o movimento de quem está
            // avaliando alguém — e é o único que produz deslocamento SEM
            // aproximar nem afastar.
            const tx = -dz / dist;
            const tz = dx / dist;
            mx = tx * v * dt;
            mz = tz * v * dt;
            // Correção suave do raio, senão a órbita abre a cada volta.
            const desvio = dist - Math.max(PERTO_DEMAIS, Math.min(dist, 3.5));
            mx += (dx / dist) * desvio * 0.5 * dt;
            mz += (dz / dist) * desvio * 0.5 * dt;
            encarar(corpo, dx, dz, dt);
            break;
        }
        case 'hold':
        case 'stay':
        default:
            // Ordem explícita de ficar: só o olhar.
            encarar(corpo, dx, dz, dt);
            break;
    }

    const L = mundo.limite - 0.5;
    corpo.x = Math.max(-L, Math.min(L, corpo.x + mx));
    corpo.z = Math.max(-L, Math.min(L, corpo.z + mz));
    return corpo;
}

// ── O CORPO NÃO PODE DEPENDER DO TRADUTOR PARA EXISTIR ────────────────────
//
// Medido na réplica: uma rodada, `deslocamento total: 0.00 m`. A vontade
// decidiu, e o Nilo não saiu do lugar — porque `motion` veio nulo e o corpo só
// obedecia a plano motor.
//
// E `motion` nulo na PRIMEIRA rodada não é acidente: o tradutor tem 640 MB e
// ainda está subindo quando a primeira decisão sai. Eu já tinha visto isso
// ("rodada 1: motor null") e anotado como conhecido — sem perceber que, para
// quem olha a tela, "conhecido" significa um NPC que nasce paralisado.
//
// A meta sozinha já diz o suficiente para andar. `approach-player` é um destino
// completo: o tradutor acrescenta ritmo e duração, não a direção. Então o corpo
// passa a ter um plano SEMPRE, e o do tradutor apenas o refina quando chega.
//
// É a inversa de `metaDoPlanoMotor`, e as duas juntas fecham o ciclo:
// pensamento -> meta -> plano -> corpo, sem nenhum elo que possa faltar.
export function planoDaMeta(meta: DeliberationGoal): Floor10MotorPlan {
    const base = { pace: 'normal' as const, duration: 6 as const, raw: `fallback ${meta}` };
    switch (meta) {
        case 'approach-player':
        case 'talk-player':
            return { ...base, verb: 'approach', target: 'player' };
        case 'seek-player':
            // Procurar não é aproximar: ele não sabe onde o jogador está, então
            // varre a sala em vez de mirar numa posição que pode não existir.
            return { ...base, verb: 'explore', target: 'room-center' };
        case 'make-space':
            return { ...base, verb: 'withdraw', target: 'player' };
        case 'observe-player':
            // Observar é ficar de olho SEM avançar — `hold` não desloca.
            return { ...base, verb: 'hold', target: 'player' };
        case 'inspect-elevator':
            return { ...base, verb: 'approach', target: 'elevator' };
        case 'wander':
            return { ...base, verb: 'explore', target: 'room-center' };
        case 'idle':
        default:
            return { ...base, verb: 'stay', target: 'self' };
    }
}
