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
 *
 * Este arquivo só monta geometria e materiais: nada aqui mexe no resto da
 * cena, não acrescenta nem acende nem apaga nada do que já existe lá fora.
 */
import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Viking } from './Floor13Povo';
import { NPCS, type Fala, type FichaNpc } from './f13Lore';
import type { EstadoVisualNpc } from './Floor13Gente';
import { chaoEm } from './f13Mundo';
import { pbr } from './f13Texturas';

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

/**
 * O banco de tábuas, o velho sentado e a filha em pé ao lado, com a mão no ombro dele.
 *
 * Aqui dentro, "local" quer dizer: eixo X no comprimento do banco, +Z para a FRENTE
 * (a vila, o gramado das crianças) e Y para cima, com origem no chão, embaixo do meio
 * do assento. O hóspede senta em +X (é o ASSENTO, mais à direita); o Árni fica à
 * esquerda dele, sobre o meio do banco.
 *
 * O banco é o banco de verdade do velho, não uma caixa:
 *   · o assento são três tábuas grossas de carvalho (13,5 cm cada, 7,5 cm de espessura),
 *     com vão de dois dedos entre elas, comprimentos e alturas diferentes e as pontas
 *     desencontradas; a tábua de trás é a mais alta, a do meio cede um dedo e a da frente
 *     cede mais e ainda cai para a frente — é o jeito que ficou depois de tanto velho sentado;
 *   · os quatro pés são toros de tronco com casca, mais grossos na base (a raiz) e fincados
 *     no chão, cada um com a sua cunha de carvalho de quatro faces entre o toro e a tábua;
 *   · travessas de tronco rentes ao chão — uma comprida correndo por baixo da tábua da frente
 *     e uma de cada lado ligando o pé da frente ao de trás;
 *   · o encosto: dois montantes de tábua presos na borda de trás do assento e inclinados para
 *     trás, três ripas entre eles (de larguras diferentes) e a travessa de topo, que é onde a
 *     mão do velho se apoia quando ele levanta;
 *   · cavilhas de carvalho atravessando o assento em cima de cada pé e pregando as ripas nos
 *     montantes. Tudo com DOIS materiais: o carvalho das tábuas, ripas, cunhas e cavilhas e o
 *     mesmo carvalho escurecido da casca dos toros — cada tábua, ripa, pé e cavilha reaproveita
 *     o mesmo material, então o banco inteiro sai em pouquíssimas chamadas de desenho.
 *
 * Sentar certo era o outro problema: o assento é fundo (44 cm) e o quadril do Árni agora fica
 * EM CIMA das tábuas — sobre a tábua de trás e a do meio, com as coxas saindo por cima da tábua
 * da frente. Ou seja: a borda da frente fica bem depois do quadril, perto dos joelhos, e não
 * corta mais a coxa; e ninguém senta mais na quina esquerda, com metade do corpo no ar.
 *
 * O componente não toca em mais nada da cena: monta a geometria e os dois materiais de madeira
 * e devolve — nada aqui altera o que a vila já tem montado.
 */

/** Os quatro pés de tronco: onde estão, quanto medem (os de trás sustentam a tábua mais alta) e o giro do toro. */
const PES_DO_BANCO = [
    { x: -.42, z: -.16, h: .310, giro: .38 },  // traseiro esquerdo
    { x: -.42, z: .16, h: .278, giro: -.22 },  // dianteiro esquerdo
    { x: .90, z: -.16, h: .310, giro: .82 },   // traseiro direito
    { x: .90, z: .16, h: .278, giro: -.58 },   // dianteiro direito
] as const;

/** As ripas do encosto, cada uma no seu jeito, acompanhando a inclinação dos montantes. */
const RIPAS_DO_ENCOSTO = [
    { y: .600, z: -.1825, alt: .118, comp: 1.30, giro: .005 },
    { y: .730, z: -.1956, alt: .112, comp: 1.34, giro: -.004 },
    { y: .860, z: -.2087, alt: .126, comp: 1.28, giro: .006 },
] as const;

export const ArniNoBanco: React.FC<{ falando: boolean }> = ({ falando }) => {
    const y = chaoEm(BANCO.x, BANCO.z) ?? 0;
    const estado = useRef<EstadoVisualNpc>({ olharPara: null, falando: false, possessao: 0, caido: false });
    const estadoFilha = useRef<EstadoVisualNpc>({ olharPara: null, falando: false, possessao: 0, caido: false });
    estado.current.falando = falando;

    // dois materiais, e só: o carvalho das tábuas, ripas, cunhas e cavilhas, e o mesmo
    // carvalho escurecido e mais rugoso da casca dos toros — uma madeira, um material
    const [madeira, casca] = useMemo(() => [
        new THREE.MeshStandardMaterial({ ...pbr('carvalho', 2, 2), color: '#a98a62', roughness: .82 }),
        new THREE.MeshStandardMaterial({ ...pbr('carvalho', 1.5, 3), color: '#6d5b45', roughness: .96 }),
    ], []);

    return <group position={[BANCO.x, y, BANCO.z]} rotation={[0, BANCO.olhar, 0]}>
        {/* ── o assento: três tábuas grossas de carvalho, com vão entre elas e as pontas
            desencontradas. A de trás é a mais alta; a do meio cede um dedo; a da frente
            cede mais e cai para a frente — é sobre as duas de trás que o velho senta, e
            é a da frente que sustenta as coxas, sem borda cortando perna nenhuma. */}
        <mesh position={[.22, .4145, -.1525]} rotation={[-.004, .004, .002]} material={madeira}>
            <boxGeometry args={[1.60, .075, .135]} />
        </mesh>
        <mesh position={[.25, .4045, 0]} rotation={[.026, -.006, 0]} material={madeira}>
            <boxGeometry args={[1.66, .075, .135]} />
        </mesh>
        <mesh position={[.23, .3825, .1525]} rotation={[.055, .004, -.003]} material={madeira}>
            <boxGeometry args={[1.64, .075, .135]} />
        </mesh>

        {/* ── os quatro pés de tronco: toros com casca, fincados no chão e mais grossos na
            base, cada um com a sua cunha de carvalho de quatro faces indo de encontro à tábua */}
        {PES_DO_BANCO.map((p) => (
            <group key={`pe:${p.x}:${p.z}`} position={[p.x, 0, p.z]} rotation={[0, p.giro, p.x > 0 ? .014 : -.014]}>
                <mesh position={[0, p.h / 2, 0]} material={casca}>
                    <cylinderGeometry args={[.070, .102, p.h, 9]} />
                </mesh>
                <mesh position={[0, p.h + .0335, 0]} rotation={[0, Math.PI / 4, 0]} material={madeira}>
                    <cylinderGeometry args={[.092, .118, .067, 4]} />
                </mesh>
            </group>
        ))}

        {/* as travessas de tronco: uma comprida por baixo da tábua da frente, e uma de cada
            lado ligando o pé da frente ao de trás, rente ao chão */}
        {[-.42, .90].map((px) => (
            <mesh key={`trav:${px}`} position={[px, .135, 0]} rotation={[Math.PI / 2, 0, 0]} material={casca}>
                <cylinderGeometry args={[.038, .046, .40, 8]} />
            </mesh>
        ))}
        <mesh position={[.24, .125, .16]} rotation={[0, 0, Math.PI / 2]} material={casca}>
            <cylinderGeometry args={[.040, .047, 1.32, 8]} />
        </mesh>

        {/* ── o encosto: dois montantes de tábua presos na borda de trás do assento e inclinados
            para trás, três ripas de larguras diferentes entre eles e a travessa de topo */}
        {[-.44, .92].map((px, i) => (
            <mesh key={`mont:${px}`} position={[px, .718, -.247]} rotation={[-.10, i ? .014 : -.014, i ? .008 : -.008]} material={madeira}>
                <boxGeometry args={[.105, .64, .07]} />
            </mesh>
        ))}
        {RIPAS_DO_ENCOSTO.map((r) => (
            <mesh key={`ripa:${r.y}`} position={[.24, r.y, r.z]} rotation={[0, r.giro, r.giro]} material={madeira}>
                <boxGeometry args={[r.comp, r.alt, .035]} />
            </mesh>
        ))}
        <mesh position={[.245, 1.000, -.2127]} rotation={[0, .004, -.005]} material={madeira}>
            <boxGeometry args={[1.32, .055, .055]} />
        </mesh>

        {/* as cavilhas de carvalho: quatro atravessando o assento em cima de cada pé (com a
            cabeça aparecendo um dedo na tábua) e duas em cada ripa do encosto */}
        {PES_DO_BANCO.map((p) => (
            <mesh key={`cav:${p.x}:${p.z}`} position={[p.x, (p.z < 0 ? .452 : .420) - .015, p.z]} material={madeira}>
                <cylinderGeometry args={[.017, .019, .05, 6]} />
            </mesh>
        ))}
        {RIPAS_DO_ENCOSTO.flatMap((r) => [-.41, .89].map((px) => (
            <mesh key={`cav:${px}:${r.y}`} position={[px, r.y, r.z + .022]} rotation={[Math.PI / 2, 0, 0]} material={madeira}>
                <cylinderGeometry args={[.014, .016, .05, 6]} />
            </mesh>
        )))}

        {/* ── o Árni: o quadril EM CIMA das tábuas. Saiu da quina esquerda (x -.30) e foi para
            o meio do banco (x -.16), e recuou (z -.13) para ficar sobre a tábua de trás e a do
            meio — assim as coxas saem por cima da tábua da frente e a borda da frente cai perto
            dos joelhos, sem atravessar a perna. A altura do contato ficou a mesma (a tábua de
            trás continuou no mesmo lugar), então ele continua encostado, não flutuando. */}
        <group position={[-.16, -.10, -.13]}>
            <Viking ficha={FICHA_ARNI} x={0} y={0} z={0} estado={estado} sentado escalaExtra={.97} />
        </group>
        {/* a filha, em pé atrás do banco, do lado do ombro esquerdo dele — foi junto com ele */}
        <Viking ficha={FICHA_FILHA} x={-.54} y={0} z={-.67} estado={estadoFilha} semRecorte />
    </group>;
};
