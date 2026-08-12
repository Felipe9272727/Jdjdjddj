// ── OS OLHOS ESCREVEM O MAPA ──────────────────────────────────────────────
//
// O desenho é do dono do jogo:
//
//   "pra isso serve os olhos, tipo o olho faz o mapa inteiro em texto, aí vamos
//    supor, o lfm fala, vou andar 5 passos a esquerda, e o motor traduz em
//    movimento, a vontade vai ficar jogando como se fosse um RPG de texto"
//
// O QUE A VONTADE RECEBIA ATÉ AQUI, na íntegra:
//
//     SEES: player visible, ahead, 3m; elevator visible, 9m.
//
// Duas coisas e duas distâncias. Com isso não dá para querer nada além de
// "chegar perto" ou "afastar" — e não por falta de inteligência do modelo, mas
// porque o mundo que ele enxerga tem dois objetos. Um jogador de RPG de texto
// com essa descrição também só saberia se aproximar ou recuar.
//
// A REGRA QUE ESTE ARQUIVO NÃO PODE QUEBRAR: só entra aqui o que os sensores
// sabem. Nada de "há uma porta trancada com um segredo atrás" — isso é o
// cânone, e misturar cânone com percepção é como um NPC começa a saber coisas
// que ninguém lhe contou. O mapa descreve GEOMETRIA e PRESENÇA; significado é
// com outro módulo.
//
// E ele é escrito em segunda pessoa, do ponto de vista do corpo ("à sua
// esquerda", "atrás de você"), porque é assim que uma pessoa pensa a sala em
// que está — e porque as direções relativas do motor (`to-my-left`) só fazem
// sentido se o que ele leu também era relativo.
import type { Floor10Perception, RelativeDirection } from './floor10Perception';

/** Metade do lado da sala. Igual ao `FLOOR_BOUNDS` da percepção. */
export const LADO_DA_SALA = 22;

const DIRECAO_EN: Record<RelativeDirection, string> = {
    front: 'ahead of you',
    'front-right': 'ahead and to your right',
    right: 'to your right',
    'back-right': 'behind you, to the right',
    behind: 'behind you',
    'back-left': 'behind you, to the left',
    left: 'to your left',
    'front-left': 'ahead and to your left',
};

/** Uma linha do mapa: o que é, onde está, a que distância. */
function linha(nome: string, direcao: RelativeDirection, metros: number): string {
    return `- ${nome}: ${metros.toFixed(1)}m, ${DIRECAO_EN[direcao]}`;
}

/**
 * A distância até cada parede, na direção relativa ao corpo. Sem isto o modelo
 * não tem como saber que "cinco passos à esquerda" bate na parede — e um
 * personagem que anda para dentro do concreto quebra a ilusão mais rápido que
 * qualquer erro de raciocínio.
 */
function paredes(perception: Floor10Perception, yaw: number): string[] {
    const { x, z } = perception.position;
    const cantos: Array<[string, number, number]> = [
        ['north wall', 0, LADO_DA_SALA - z],
        ['south wall', Math.PI, LADO_DA_SALA + z],
        ['east wall', Math.PI / 2, LADO_DA_SALA - x],
        ['west wall', -Math.PI / 2, LADO_DA_SALA + x],
    ];
    return cantos
        .map(([nome, rumo, metros]) => {
            // Quanto o corpo teria de girar para encarar esta parede.
            let delta = rumo - yaw;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            const grau = Math.abs(delta);
            const lado = grau < Math.PI / 4 ? 'ahead'
                : grau > (3 * Math.PI) / 4 ? 'behind'
                    : delta > 0 ? 'to your right' : 'to your left';
            return { nome, metros: Math.max(0, metros), lado };
        })
        // Só as duas mais próximas: as quatro sempre presentes viram parede de
        // texto (literalmente) e afogam o que interessa.
        .sort((a, b) => a.metros - b.metros)
        .slice(0, 2)
        .map((p) => `- the ${p.nome}: ${p.metros.toFixed(1)}m, ${p.lado}`);
}

/**
 * O mapa que a vontade lê. Em inglês, como o resto do prompt de deliberação.
 *
 * `yaw` entra separado porque a percepção guarda o rumo como ponto cardeal
 * (`heading`), e para medir ângulo até a parede é preciso o número.
 */
export function mapaEmTexto(perception: Floor10Perception, yaw: number): string {
    const linhas: string[] = [
        // `zone` e não `locationDescription`: o segundo é escrito em PORTUGUÊS
        // (ele alimenta o painel do ?mente) e o prompt de deliberação é todo em
        // inglês. Misturar idioma dentro do mesmo prompt é ruído gratuito para
        // um modelo de 1,2B — e eu quase publiquei assim.
        `YOU ARE: at the ${perception.zone.replace(/-/g, ' ')} of the floor, facing ${perception.heading}.`,
        'AROUND YOU:',
    ];

    if (perception.player) {
        const p = perception.player;
        linhas.push(p.visible
            ? `${linha('the player', p.direction, p.distance)} (you can see him)`
            : `${linha('the player', p.direction, p.distance)} (you cannot see him from here)`);
    } else {
        linhas.push('- the player: nowhere in sight');
    }

    linhas.push(perception.elevator.visible
        ? linha('the elevator door', perception.elevator.direction, perception.elevator.distance)
        : `${linha('the elevator door', perception.elevator.direction, perception.elevator.distance)} (out of sight)`);

    // ── OS APARELHOS DA SALA TRANCADA ─────────────────────────────────────
    //
    // Sem esta linha o mapa tinha QUATRO coisas: jogador, elevador e duas
    // paredes. Com um mundo desses não dá para querer nada além de chegar
    // perto ou recuar — e a repetição que o dono do jogo vê há semanas não é
    // teimosia do modelo, é a pobreza do que a gente mostra a ele.
    //
    // O estado importa tanto quanto a posição: "o jogador está em cima da outra"
    // é o que transforma um objeto de cenário em um CONVITE. É a única frase do
    // mapa que pede duas pessoas.
    // `?? []` NÃO é paranoia: percepções montadas à mão (testes, o `?campo`,
    // qualquer chamador que antecede este campo) chegam sem `devices`, e um
    // mapa que estoura derruba a deliberação inteira — o Nilo pararia de pensar
    // por causa de um campo novo. O mapa degrada, não quebra.
    for (const d of perception.devices ?? []) {
        const onde = linha(`the ${d.kind}`, d.direction, d.distance);
        const estado = d.heldByPlayer && d.heldByNpc ? ' (you are both on it right now)'
            : d.heldByPlayer ? ' (HE is standing on it right now)'
                : d.heldByNpc ? ' (you are standing on it)'
                    : d.visible ? '' : ' (out of sight)';
        linhas.push(`${onde}${estado}`);
    }

    linhas.push(...paredes(perception, yaw));

    // ── O QUE ELE PODE FAZER COM ISSO ─────────────────────────────────────
    // Um mapa sem verbos é uma foto. A lista de movimentos possíveis é o que
    // transforma a descrição em jogada — e é literalmente o que um RPG de texto
    // imprime depois da sala.
    linhas.push(
        'YOU CAN MOVE: forward, back, to your left, to your right, '
        + 'toward anything above, or away from it. You can also stay put.',
        ...((perception.devices?.length ?? 0) > 0
            ? ['YOU CAN ALSO: stand on a plate or pull a lever. '
               + 'Two of them must be held at the SAME TIME, and you cannot reach two at once.']
            : []),
    );
    return linhas.join('\n');
}
