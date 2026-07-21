/**
 * f9Floresta.ts — ANDAR 9: "O VIVEIRO" (estado do andar; puro).
 *
 * O hotel PLANTA o que apaga: memórias esquecidas descem pelo fio vermelho e
 * daqui cresce floresta. O player chega ARREMESSADO (as portas abrem e não há
 * chão — a QUEDA pela copa) e é replantado em BICHO. O OBJETIVO (v4) é achar as
 * TRÊS OFERENDAS (frutos de memória viva, sob colunas de luz) e levá-las à RAIZ:
 * a 3ª entrega DESABROCHA a árvore-mãe e abre a passagem pra cima. A onda de
 * apagamento (f9Eco) obriga a se abrigar nos OCOS.
 */
import { f9eco, F9_OCOS, F9_RAIZ } from './f9Eco';

// F9_OCOS e F9_RAIZ vivem em f9Eco.ts (a IA se abriga nos ocos e entrega
// oferendas na Raiz) — reexportados aqui para manter o contrato antigo
// (App/constants/cena importam daqui).
export { F9_OCOS, F9_RAIZ };

export type F9Phase =
    | 'queda'        // caindo pela copa (cutscene)
    | 'chegada'      // acabou de pousar; primeira leitura do lugar
    | 'explorar'     // livre: ache as oferendas, leve à raiz, sobreviva às ondas
    | 'apagando'     // pego fora do oco pela onda (veil + replantio)
    | 'raiz';        // (legado v1; a conclusão v4 é o PORTAL — não é mais entrada)

export interface F9State {
    phase: F9Phase;
    t: number;
    quedaT: number;
    /** o oco em que o player está (-1 = nenhum) */
    abrigo: number;
    /** quantas vezes o player foi apagado/replantado */
    apagos: number;
    /** o que apagou o player da última vez (texto do replantio muda) */
    causa: 'onda' | 'vulto';
    version: number;
}

const FRESH = (): F9State => ({ phase: 'queda', t: 0, quedaT: 0, abrigo: -1, apagos: 0, causa: 'onda', version: 0 });
export const f9: F9State = FRESH();

const listeners = new Set<() => void>();
export function f9Subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function f9Bump(): void { f9.version++; listeners.forEach((fn) => fn()); }
export function f9Reset(): void {
    const v = f9.version;
    Object.assign(f9, FRESH());
    f9.version = v;
    events.length = 0;
    f9Bump();
}

export type F9Event = 'pousou' | 'apagado' | 'replantado' | 'raiz';
const events: F9Event[] = [];
function emit(e: F9Event): void { events.push(e); }
export function f9DrainEvents(): F9Event[] { return events.splice(0, events.length); }

// ── o mundo ──────────────────────────────────────────────────────────────────
// (F9_OCOS definido em f9Eco.ts e reexportado acima)

/** A trilha do FIO VERMELHO (waypoints até a RAIZ, no fundo do viveiro). */
export const F9_FIO: ReadonlyArray<readonly [number, number]> = [
    [0, 1.5], [-3, -4], [-10, -9], [-16, -16], [-12, -24], [-2, -28], [8, -33], [12, -40], [6, -47],
];
/** Onde fica a RAIZ (fim do fio) — definida em f9Eco.ts e reexportada no topo. */

/** ponto de pouso da queda */
export const F9_POUSO: readonly [number, number] = [0, -1.5];

/** A BOCA de cada OCO (ângulo rad no círculo do tronco; ponto no círculo =
 *  (x + cos a·r, z + sin a·r)). Aponta pro miolo do mapa (0,-26) — a entrada
 *  fica de frente pra quem chega. FONTE ÚNICA: a cena corta o tronco em C
 *  neste ângulo e a colisão (constants) abre o vão do anel no MESMO ângulo. */
export const F9_OCO_MOUTH: ReadonlyArray<number> =
    F9_OCOS.map(([x, z]) => Math.atan2(-26 - z, 0 - x));

/** A boca da câmara da RAIZ (aponta +z, pro mapa; câmara centrada em
 *  (F9_RAIZ[0], F9_RAIZ[1]-2.5) — o mesmo centro do tronco visual). */
export const F9_RAIZ_MOUTH = Math.PI / 2;
export const F9_RAIZ_CHAMBER: readonly [number, number, number] =
    [F9_RAIZ[0], F9_RAIZ[1] - 2.5, 4.05]; // cx, cz, raio do anel de colisão
// (as árvores-mãe/obstáculos vivem em f9Eco.F9_TREE_OBSTACLES — a IA desvia
// delas e a cena as renderiza da mesma lista, sem duplicação.)

/** limites andáveis do viveiro */
export const F9_STATIC_WALLS: number[][] = [
    [-34, 4, 34, 4], [-34, -52, 34, -52], [-34, -52, -34, 4], [34, -52, 34, 4],
];

/** A queda terminou (o Floor9Cutscene chama) → chegada. */
export function f9QuedaDone(): void {
    if (f9.phase !== 'queda') return;
    f9.phase = 'chegada'; f9.t = 0; emit('pousou'); f9Bump();
}

/** As primeiras legendas de chegada terminaram → livre. */
export function f9ChegadaDone(): void {
    if (f9.phase !== 'chegada') return;
    f9.phase = 'explorar'; f9Bump();
}

/** Fim do replantio (overlay dirige o tempo do veil). */
export function f9ReplantioDone(): void {
    if (f9.phase !== 'apagando') return;
    f9.phase = 'explorar'; emit('replantado'); f9Bump();
}

/** O VULTO pegou o player (a cena chama ao drenar o evento do eco). */
export function f9Cacado(): void {
    if (f9.phase !== 'explorar') return;
    f9.phase = 'apagando'; f9.causa = 'vulto'; f9.apagos++; emit('apagado'); f9Bump();
}

/** Por frame: abrigo do player e onda×player. */
export function f9Tick(dt: number, px: number, pz: number): void {
    const s = f9;
    s.t += dt;
    if (s.phase === 'queda') { s.quedaT += dt; return; }

    // em qual oco o player está?
    let ab = -1;
    F9_OCOS.forEach(([x, z, r], i) => {
        const dx = px - x, dz = pz - z;
        if (dx * dx + dz * dz < r * r) ab = i;
    });
    if (ab !== s.abrigo) { s.abrigo = ab; f9Bump(); }

    // a onda pega quem está fora de um oco
    if (s.phase === 'explorar' && f9eco.phase === 'onda' && f9eco.waveT > 2.2 && ab < 0) {
        s.phase = 'apagando'; s.causa = 'onda'; s.apagos++; emit('apagado'); f9Bump();
        return;
    }

    // V4: a conclusão do andar é o PORTAL da Raiz DESABROCHADA (as 3 oferendas,
    // em Floor9Oferendas → f9TryComplete → evento 'f9Completo'). A antiga chegada
    // "por proximidade da Raiz" foi REMOVIDA daqui: ela disparava cedo demais (a
    // entrega da oferenda é a ≤3 u e a árvore fica a ~2.5 u), trancando o player
    // numa fase 'raiz' de beco-sem-saída com o final v1 antes das oferendas. O
    // 'tne_raiz_9' agora é gravado na conclusão REAL (Floor9Overlay, no
    // 'f9Completo'), não ao encostar na árvore.
}

/** A linha-objetivo do HUD (fallback; o overlay refina pras oferendas). */
export function f9Objective(): string | null {
    if (f9.phase === 'explorar') {
        if (f9eco.phase === 'aviso') return 'O ar está clareando demais. ACHE UM OCO.';
        if (f9eco.phase === 'onda') return 'A ONDA. Fique no oco.';
        return 'Ache os frutos de luz e leve-os à Raiz.';
    }
    return null;
}

/** Legendas da chegada — ENSINAM o objetivo (as 3 oferendas) e as regras. */
export const F9_CHEGADA_LINES: ReadonlyArray<string> = [
    'Você atravessa a copa inteira antes do chão te aceitar. Olha pras patas — quatro, com garras. O Viveiro só aceita BICHO, e te replantou em um.',
    'Aqui o hotel enterra o que esquece, e do enterro cresce floresta. Cada árvore já foi uma memória. O Arquivista te arremessou pra virar terra também.',
    'Mas três MEMÓRIAS ainda estão inteiras: frutos de luz pulsando entre os troncos, cada um sob uma coluna dourada que fura a copa. Leve os três até a RAIZ — a árvore-mãe, lá no fundo do viveiro.',
    'Quando a Raiz recebe os três, ela DESABROCHA, e onde uma árvore-mãe desabrocha abre passagem pra cima: a saída. Cuidado — quando o ar clareia demais vem a ONDA de apagamento. Fora de um OCO ela te apaga e te replanta. E rente ao chão, algo caça.',
];

/** O SUSSURRO de cada fruto ao ser colhido — cada oferenda é uma memória que o
 *  hotel apagou de um ANDAR (a lore do Viveiro: aqui se planta o que se
 *  esquece). id 0 = a foto das vinte portas (6º), id 1 = o navio (7º),
 *  id 2 = o interrogatório (8º). */
export const F9_MEMORIA_LINES: ReadonlyArray<string> = [
    '“…cloro, vinte portas iguais, o estouro de um flash.” Você conhece essa memória — a FOTO era sua. O fruto pesa como culpa.',
    '“…sal, ferro, um navio inteiro rangendo dentro de um corredor.” O mar que não coube no hotel. O fruto balança como maré.',
    '“…uma mesa, uma luz dura, alguém perguntando QUEM É VOCÊ.” Ninguém respondeu. O fruto treme feito quem mente.',
];

/** A resposta da RAIZ a cada entrega (a 3ª é o desabrochar — flash + teaser). */
export const F9_ENTREGA_LINES: ReadonlyArray<string> = [
    'A Raiz estremece. Um anel do tronco ACENDE — um andar inteiro, lembrado de volta.',
    'Segundo anel. A floresta inteira se inclina — os olhos entre as árvores agora seguem VOCÊ.',
];

/** As falas da RAIZ (agora no TEASER de fim de andar — o gancho do 10º). */
export const F9_RAIZ_LINES: ReadonlyArray<string> = [
    'A Raiz desabrocha. Cada anel do tronco é um corredor; cada nó, uma porta. A floresta inteira lembra de você agora.',
    'No coração dela, o fio vermelho não termina — ele SOBE. A passagem pro DÉCIMO abriu.',
];
