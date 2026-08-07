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
import type { Floor10MotorPlan, Floor10MotorTarget } from './floor10MotorCortex';

export type CorpoDoNilo = { x: number; z: number; yaw: number };

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

    const alvo = alvoNoMundo(plano.target, corpo, mundo);
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
