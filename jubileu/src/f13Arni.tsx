/**
 * f13Arni.tsx — Árni, o velho do banco, e o final secreto da aceitação.
 *
 * Ideia e texto-base do autor do jogo, fatiado em visitas curtas. Ele fala
 * como gente: se distrai, reclama do joelho, procura o chapéu — o que ele
 * sabe aparece no meio das coisas pequenas, nunca como sermão.
 *
 * Cada camada é uma visita num momento diferente da história — a camada só
 * avança quando algo mudou no andar desde a última conversa:
 *   0 · o primeiro encontro (banal)            1 · depois da 1ª pista
 *   2 · depois que a entidade revelou o mundo   3 · com as três pistas
 * Na camada 3 ele oferece o banco. Sentar e ficar até o fim — sem se levantar
 * enquanto a entidade sussurra para ir embora — é o final da aceitação.
 */
import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Viking } from './Floor13Povo';
import { NPCS, type Fala, type FichaNpc } from './f13Lore';
import type { EstadoVisualNpc } from './Floor13Gente';
import { chaoEm } from './f13Mundo';

export const FALAS_DO_ARNI = {
    camada0: [
        { quem: "Árni", texto: "Ô, cuidado aí. Essa pedra solta já derrubou meio mundo. Eu inclusive." },
        { quem: "Você", texto: "Eu caí do céu. Literalmente." },
        { quem: "Árni", texto: "É, eu vi a fumaça. Achei que era a Ragnhild queimando pão de novo." },
        { quem: "Árni", texto: "Senta, senta. Não, espera, esse lado tá molhado. O outro." },
        { quem: "A filha", texto: "Pai, ele não quer sentar, ele tá procurando alguma coisa." },
        { quem: "Árni", texto: "Todo mundo tá procurando alguma coisa, filha. Eu tô procurando meu chapéu desde ontem." },
    ],
    camada1: [
        { quem: "Árni", texto: "Você de novo. Achou o que procurava?" },
        { quem: "Você", texto: "Mais ou menos. Tem uma coisa errada nessa vila." },
        { quem: "Árni", texto: "Tem muita coisa errada nessa vila. O telhado do Brokk, por exemplo." },
        { quem: "Árni", texto: "Mas não é disso que você tá falando, né. Tá com uma cara..." },
        { quem: "Árni", texto: "A minha mulher fazia essa cara quando o mar tava estranho. Ela sempre sabia antes de todo mundo." },
        { quem: "A filha", texto: "Pai." },
        { quem: "Árni", texto: "Tô bem, tô bem. Vai, rapaz, vai procurar. Depois você me conta." },
    ],
    camada2: [
        { quem: "Você", texto: "Senhor, eu descobri uma coisa. Isso aqui não é real. Nada disso. É tudo de mentira." },
        { quem: "Árni", texto: "Hm." },
        { quem: "Árni", texto: "Ah, meu filho. Como você pode ser tão pessimista? Olha em volta. Olha isso aqui." },
        { quem: "Árni", texto: "Real, falso... a minha esposa, a minha filha, a minha neta. Pra mim elas não deixaram de ser reais não." },
        { quem: "Árni", texto: "O dia que eu casei. O dia que essa aí deu os primeiros passos, bem ali, naquele gramado. E agora é ela que me ajuda a dar os meus." },
        { quem: "A filha", texto: "Ninguém mandou o senhor subir o morro sozinho." },
        { quem: "Árni", texto: "Tá vendo? Aconteceu, ué. Isso aconteceu." },
        { quem: "Você", texto: "E o senhor não tem medo? De tudo sumir, de você deixar de existir?" },
        { quem: "Árni", texto: "Medo? Não. Olha... eu vivi. Tá tudo aqui dentro. Se um dia apagar, apagou. Mas foi." },
    ],
    camada3: [
        { quem: "Você", texto: "Mas se tudo que a gente sofreu foi falso, pra que serviu? Do que vale descobrir alguma coisa, se é tudo mentira?" },
        { quem: "Árni", texto: "Eu já perdi muita coisa, rapaz. Gente. Amigo. Teve uma época que eu perdi até eu mesmo." },
        { quem: "Árni", texto: "E demorou, viu. Demorou muito. Mas a paz veio. E ela não veio de fora não." },
        { quem: "Árni", texto: "Teve um inverno que o celeiro pegou fogo. A neve ficou rosa. Tava tudo acabando e eu achei bonito. Fiquei com vergonha de achar bonito." },
        { quem: "Árni", texto: "Continua procurando o porquê. Só não faz da resposta uma condição pra viver." },
        { quem: "Árni", texto: "Esse lado do banco secou. O sol já vai descer. Se quiser, fica." },
    ],
    banco: [
        { quem: "Árni", texto: "Minha mulher sentava bem aí. Reclamava que o banco era duro." },
        { quem: "Árni", texto: "Olha as crianças. Os pais correndo atrás, preocupados. Isso é real, rapaz. Agora, isso é real." },
        { quem: "Árni", texto: "Você tá respirando. Tá ouvindo esse barulho das crianças. Tá sentindo a roupa pinicando. Isso aí já conta, viu. Já conta." },
        { quem: "Árni", texto: "Eu posso morrer amanhã e vou dizer: eu vivi. E tá de bom tamanho." },
        { quem: "Árni", texto: "Olha a vista." },
    ],
    depois: [
        { quem: "Árni", texto: "O chapéu apareceu. Tava na minha cabeça." },
        { quem: "Árni", texto: "Comeu alguma coisa hoje? A Ragnhild tem pão. Tem que chegar cedo." },
        { quem: "Árni", texto: "Meu joelho tá dizendo que vai chover. Meu joelho erra muito." },
    ],
    sussurro_do_glitch: [
        { quem: "▚ ENTIDADE ▞", texto: "l e v a n t a" },
        { quem: "▚ ENTIDADE ▞", texto: "o  e l e v a d o r  e s t á  a b e r t o" },
        { quem: "▚ ENTIDADE ▞", texto: "v o c ê  n ã o  é  d a q u i" },
        { quem: "▚ ENTIDADE ▞", texto: ". . .  f i c a ,  e n t ã o ." },
    ],
} as const satisfies Record<string, ReadonlyArray<Fala>>;

/** O banco: na ilha do Árni (o mirante), de frente para a vila e o gramado das crianças lá embaixo. */
export const BANCO = Object.freeze({ x: -15.2, z: 20.2, olhar: Math.atan2(-3.2 - -15.2, 5 - 20.2) });
/** Onde o hóspede senta (à direita do Árni) e para onde olha. */
export const ASSENTO = Object.freeze({ x: BANCO.x + Math.cos(BANCO.olhar) * .9, z: BANCO.z - Math.sin(BANCO.olhar) * .9 });

/** Qual camada o Árni deve contar agora, dado o que já foi contado e o que o hóspede sabe. */
export function camadaDoArni(contada: number, pistas: number, entidade: 'nao' | 'falando' | 'caido'): number | null {
    const alcance = pistas >= 3 && entidade === 'caido' ? 3 : entidade === 'caido' ? 2 : pistas >= 1 ? 1 : 0;
    const proxima = contada + 1;
    return proxima <= alcance ? proxima : null;
}

const corpo = (id: string, patch: Partial<FichaNpc>): FichaNpc => ({ ...NPCS.find((n) => n.id === id)!, ...patch });
// o velho: o corpo do escaldo (barba branca), túnica de lã crua; a filha: o corpo da pastora
// o velho tem corpo próprio (tools/blender/f13_humano.py, idade máxima, rosto esculpido)
const FICHA_ARNI = corpo('ulfgar', { id: 'arni' as FichaNpc['id'], nome: 'Árni', tunica: '#7a6e5e', barba: '#ece8de' });
const FICHA_FILHA = corpo('sigrun', { nome: 'A filha', tunica: '#6e3f38' });

/** O banco de tábuas, o velho sentado e a filha em pé ao lado, com a mão no ombro dele. */
export const ArniNoBanco: React.FC<{ falando: boolean }> = ({ falando }) => {
    const y = chaoEm(BANCO.x, BANCO.z) ?? 0;
    const estado = useRef<EstadoVisualNpc>({ olharPara: null, falando: false, possessao: 0, caido: false });
    const estadoFilha = useRef<EstadoVisualNpc>({ olharPara: null, falando: false, possessao: 0, caido: false });
    estado.current.falando = falando;
    const madeira = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: .85 }), []);
    return <group position={[BANCO.x, y, BANCO.z]} rotation={[0, BANCO.olhar, 0]}>
        {/* o banco: assento de duas tábuas, pés de tronco, encosto baixo */}
        <mesh position={[.2, .42, 0]} material={madeira} castShadow><boxGeometry args={[1.7, .06, .38]} /></mesh>
        <mesh position={[.2, .7, -.19]} material={madeira} castShadow><boxGeometry args={[1.7, .22, .05]} /></mesh>
        {[-.55, .95].map((x) => <mesh key={x} position={[x, .2, 0]} material={madeira}><cylinderGeometry args={[.07, .08, .4, 8]} /></mesh>)}
        {/* o Árni, sentado na ponta esquerda */}
        <group position={[-.5, -.1, -.04]}><Viking ficha={FICHA_ARNI} x={0} y={0} z={0} estado={estado} sentado escalaExtra={.97} /></group>
        {/* a filha, em pé atrás do banco */}
        <Viking ficha={FICHA_FILHA} x={-.9} y={0} z={-.55} estado={estadoFilha} semRecorte />
    </group>;
};
