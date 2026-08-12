// ── OS OLHOS DO HÓSPEDE ────────────────────────────────────────────────────
// Micro-IA espacial separada do LLM de fala. Em vez de tentar adivinhar a
// posição a partir de screenshots (caro e sujeito a alucinação), ela recebe os
// sensores exatos do motor 3D e transforma números em percepção semântica:
// onde Nilo está, para onde olha, o que está no campo de visão e onde ficam os
// marcos conhecidos. O módulo não baixa modelo e custa apenas algumas contas
// vetoriais; portanto continua ativo mesmo enquanto o cérebro de fala carrega.

import type { F10PrisonState } from './f10Prison';

export type Vec3Like = Readonly<{ x: number; y: number; z: number }>;

export type Floor10Zone =
    | 'elevator-threshold'
    | 'center'
    | 'north-side'
    | 'south-side'
    | 'east-side'
    | 'west-side'
    | 'north-east-corner'
    | 'north-west-corner'
    | 'south-east-corner'
    | 'south-west-corner';

export type CompassDirection =
    | 'north'
    | 'north-east'
    | 'east'
    | 'south-east'
    | 'south'
    | 'south-west'
    | 'west'
    | 'north-west';

export type RelativeDirection =
    | 'front'
    | 'front-right'
    | 'right'
    | 'back-right'
    | 'behind'
    | 'back-left'
    | 'left'
    | 'front-left';

export type Floor10VisibleObject =
    | 'grid-floor'
    | 'room-walls'
    | 'elevator-entrance'
    | 'player'
    // ── OS APARELHOS DA SALA TRANCADA, QUE OS OLHOS NÃO VIAM ─────────────
    // O andar tem duas placas em cantos opostos e duas alavancas: é o
    // quebra-cabeça cooperativo inteiro. A percepção não reportava nenhum.
    | 'device';

/** Um aparelho da prisão, do ponto de vista de quem está olhando para ele. */
export type Floor10VisibleDevice = {
    id: string;
    kind: string;
    distance: number;
    direction: RelativeDirection;
    visible: boolean;
    /** O Nilo está em cima dele agora. */
    heldByNpc: boolean;
    /** O JOGADOR está em cima dele — é este o sinal que pede cooperação. */
    heldByPlayer: boolean;
    position: { x: number; z: number };
};

export type Floor10Perception = {
    source: 'floor10-engine-sensors';
    floor: 10;
    certainty: 1;
    position: { x: number; y: number; z: number };
    zone: Floor10Zone;
    heading: CompassDirection;
    /**
     * O rumo em radianos, além do ponto cardeal. `heading` tem oito valores e
     * serve para o texto; medir o ângulo até uma parede — para dizer "a parede
     * norte está à sua esquerda" — precisa do número. Ver floor10Mapa.
     */
    yaw: number;
    locationDescription: string;
    player: null | {
        visible: boolean;
        distance: number;
        direction: RelativeDirection;
        zone: Floor10Zone;
        position: { x: number; y: number; z: number };
    };
    elevator: {
        visible: boolean;
        distance: number;
        direction: RelativeDirection;
    };
    visibleObjects: readonly Floor10VisibleObject[];
    /**
     * ── O QUE ELE PODE TOCAR ──────────────────────────────────────────────
     *
     * Vazio quando não há prisão. Existe porque a falta dele era um buraco em
     * cadeia, e cada elo escondia o seguinte:
     *
     *  - o MAPA que a vontade lê listava quatro coisas (jogador, elevador,
     *    duas paredes). Com um mundo desses não dá para querer nada além de
     *    chegar perto ou recuar — que é exatamente a repetição que o dono do
     *    jogo relatou desde o começo;
     *  - o MOTOR tinha os alvos `nearest-device` e `active-device` desde
     *    sempre, e a vontade nunca podia querê-los, porque não sabia que
     *    aparelho existia;
     *  - a REDE de reforço tem as ações `try-device` e `call-player`, e não
     *    tinha como aprender a usá-las: o estado nunca mostrava um aparelho.
     *
     * Três peças prontas, esperando um sentido que ninguém tinha ligado.
     */
    devices: readonly Floor10VisibleDevice[];
};

const FLOOR_BOUNDS = 22;
const ELEVATOR_ENTRANCE = Object.freeze({ x: 0, y: 0, z: -10 });
const SENSOR_RANGE = 18;
const HALF_FOV = Math.PI * (75 / 180);

const COMPASS: readonly CompassDirection[] = [
    'north', 'north-east', 'east', 'south-east',
    'south', 'south-west', 'west', 'north-west',
];
const RELATIVE: readonly RelativeDirection[] = [
    'front', 'front-right', 'right', 'back-right',
    'behind', 'back-left', 'left', 'front-left',
];

const ZONE_PT: Record<Floor10Zone, string> = {
    'elevator-threshold': 'no limiar do elevador',
    center: 'na região central da sala',
    'north-side': 'no lado norte da sala',
    'south-side': 'no lado sul da sala',
    'east-side': 'no lado leste da sala',
    'west-side': 'no lado oeste da sala',
    'north-east-corner': 'no canto nordeste da sala',
    'north-west-corner': 'no canto noroeste da sala',
    'south-east-corner': 'no canto sudeste da sala',
    'south-west-corner': 'no canto sudoeste da sala',
};

const ZONE_EN: Record<Floor10Zone, string> = {
    'elevator-threshold': 'at the elevator threshold',
    center: 'in the center of the room',
    'north-side': 'on the north side of the room',
    'south-side': 'on the south side of the room',
    'east-side': 'on the east side of the room',
    'west-side': 'on the west side of the room',
    'north-east-corner': 'in the north-east corner of the room',
    'north-west-corner': 'in the north-west corner of the room',
    'south-east-corner': 'in the south-east corner of the room',
    'south-west-corner': 'in the south-west corner of the room',
};

const ZONE_ES: Record<Floor10Zone, string> = {
    'elevator-threshold': 'en el umbral del ascensor',
    center: 'en el centro de la sala',
    'north-side': 'en el lado norte de la sala',
    'south-side': 'en el lado sur de la sala',
    'east-side': 'en el lado este de la sala',
    'west-side': 'en el lado oeste de la sala',
    'north-east-corner': 'en la esquina noreste de la sala',
    'north-west-corner': 'en la esquina noroeste de la sala',
    'south-east-corner': 'en la esquina sureste de la sala',
    'south-west-corner': 'en la esquina suroeste de la sala',
};

const COMPASS_PT: Record<CompassDirection, string> = {
    north: 'norte',
    'north-east': 'nordeste',
    east: 'leste',
    'south-east': 'sudeste',
    south: 'sul',
    'south-west': 'sudoeste',
    west: 'oeste',
    'north-west': 'noroeste',
};

const RELATIVE_PT: Record<RelativeDirection, string> = {
    front: 'à minha frente',
    'front-right': 'à minha frente e à direita',
    right: 'à minha direita',
    'back-right': 'atrás de mim e à direita',
    behind: 'atrás de mim',
    'back-left': 'atrás de mim e à esquerda',
    left: 'à minha esquerda',
    'front-left': 'à minha frente e à esquerda',
};

const RELATIVE_EN: Record<RelativeDirection, string> = {
    front: 'in front of me',
    'front-right': 'ahead and to my right',
    right: 'to my right',
    'back-right': 'behind me and to my right',
    behind: 'behind me',
    'back-left': 'behind me and to my left',
    left: 'to my left',
    'front-left': 'ahead and to my left',
};

const RELATIVE_ES: Record<RelativeDirection, string> = {
    front: 'frente a mí',
    'front-right': 'delante y a mi derecha',
    right: 'a mi derecha',
    'back-right': 'detrás de mí y a la derecha',
    behind: 'detrás de mí',
    'back-left': 'detrás de mí y a la izquierda',
    left: 'a mi izquierda',
    'front-left': 'delante y a mi izquierda',
};

const OBJECT_PT: Record<Floor10VisibleObject, string> = {
    'grid-floor': 'piso cinza em grade',
    'room-walls': 'paredes da sala',
    'elevator-entrance': 'entrada do elevador',
    player: 'jogador',
    device: 'placas e alavancas no chão',
};

const OBJECT_EN: Record<Floor10VisibleObject, string> = {
    'grid-floor': 'the gray grid floor',
    'room-walls': 'the room walls',
    'elevator-entrance': 'the elevator entrance',
    player: 'you',
    device: 'plates and levers on the floor',
};

const OBJECT_ES: Record<Floor10VisibleObject, string> = {
    'grid-floor': 'el suelo gris cuadriculado',
    'room-walls': 'las paredes de la sala',
    'elevator-entrance': 'la entrada del ascensor',
    player: 'a ti',
    device: 'placas y palancas en el suelo',
};

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

function normalizeAngle(angle: number): number {
    let normalized = angle;
    while (normalized > Math.PI) normalized -= Math.PI * 2;
    while (normalized <= -Math.PI) normalized += Math.PI * 2;
    return normalized;
}

function compassFromYaw(yaw: number): CompassDirection {
    const index = Math.round(normalizeAngle(yaw) / (Math.PI / 4));
    return COMPASS[(index + COMPASS.length) % COMPASS.length];
}

function relationFromDelta(dx: number, dz: number, yaw: number): RelativeDirection {
    const bearing = Math.atan2(dx, dz);
    const relativeAngle = normalizeAngle(bearing - yaw);
    const index = Math.round(relativeAngle / (Math.PI / 4));
    return RELATIVE[(index + RELATIVE.length) % RELATIVE.length];
}

function distanceXZ(a: Vec3Like, b: Vec3Like): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

function inViewCone(origin: Vec3Like, target: Vec3Like, yaw: number): boolean {
    const distance = distanceXZ(origin, target);
    if (distance > SENSOR_RANGE) return false;
    const bearing = Math.atan2(target.x - origin.x, target.z - origin.z);
    return Math.abs(normalizeAngle(bearing - yaw)) <= HALF_FOV;
}

export function classifyFloor10Zone(position: Vec3Like): Floor10Zone {
    if (position.z <= -9.2 && position.z >= -16.5 && Math.abs(position.x) <= 3.5) {
        return 'elevator-threshold';
    }
    if (Math.abs(position.x) <= 6 && Math.abs(position.z) <= 6) return 'center';

    const nearEast = position.x >= FLOOR_BOUNDS - 7;
    const nearWest = position.x <= -FLOOR_BOUNDS + 7;
    const nearNorth = position.z >= FLOOR_BOUNDS - 7;
    const nearSouth = position.z <= -FLOOR_BOUNDS + 7;
    if (nearNorth && nearEast) return 'north-east-corner';
    if (nearNorth && nearWest) return 'north-west-corner';
    if (nearSouth && nearEast) return 'south-east-corner';
    if (nearSouth && nearWest) return 'south-west-corner';

    if (Math.abs(position.x) > Math.abs(position.z)) {
        return position.x >= 0 ? 'east-side' : 'west-side';
    }
    return position.z >= 0 ? 'north-side' : 'south-side';
}

function absoluteLocation(position: Vec3Like, zone: Floor10Zone): string {
    const elevatorDistance = round1(distanceXZ(position, ELEVATOR_ENTRANCE));
    if (zone === 'elevator-threshold') return `${ZONE_PT[zone]}, no 10º andar`;

    const dx = position.x - ELEVATOR_ENTRANCE.x;
    const dz = position.z - ELEVATOR_ENTRANCE.z;
    const horizontal = Math.abs(dx) < 0.8 ? '' : dx > 0 ? ' a leste' : ' a oeste';
    const vertical = Math.abs(dz) < 0.8 ? '' : dz > 0 ? ' ao norte' : ' ao sul';
    const bearing = `${vertical}${horizontal}`.trim() || 'junto';
    return `${ZONE_PT[zone]}, no 10º andar, ${elevatorDistance} m ${bearing} da entrada do elevador`;
}

export function perceiveFloor10(input: {
    npcPosition: Vec3Like;
    npcYaw: number;
    playerPosition?: Vec3Like | null;
    /**
     * A sala trancada, quando existe. OPCIONAL de propósito: o `?campo` e os
     * testes chamam sem ela, e um NPC que não vê aparelho nenhum tem de
     * continuar funcionando exatamente como antes.
     */
    prison?: F10PrisonState | null;
}): Floor10Perception {
    const { npcPosition, npcYaw, playerPosition = null, prison = null } = input;
    const zone = classifyFloor10Zone(npcPosition);
    const elevatorDistance = round1(distanceXZ(npcPosition, ELEVATOR_ENTRANCE));
    const elevatorDirection = relationFromDelta(
        ELEVATOR_ENTRANCE.x - npcPosition.x,
        ELEVATOR_ENTRANCE.z - npcPosition.z,
        npcYaw,
    );
    const elevatorVisible = inViewCone(npcPosition, ELEVATOR_ENTRANCE, npcYaw);

    const playerDistance = playerPosition ? round1(distanceXZ(npcPosition, playerPosition)) : 0;
    const player = playerPosition
        ? {
            visible: inViewCone(npcPosition, playerPosition, npcYaw),
            distance: playerDistance,
            direction: relationFromDelta(
                playerPosition.x - npcPosition.x,
                playerPosition.z - npcPosition.z,
                npcYaw,
            ),
            zone: classifyFloor10Zone(playerPosition),
            position: {
                x: round1(playerPosition.x),
                y: round1(playerPosition.y),
                z: round1(playerPosition.z),
            },
        }
        : null;

    // ── OS APARELHOS ENTRAM PELA MESMA RÉGUA DOS OUTROS OBJETOS ─────────
    // Mesma distância, mesma direção relativa, mesmo teste de visão. Eles não
    // ganham um canal privilegiado: se o elevador precisa estar no campo de
    // visão para contar, uma placa também precisa.
    const devices: Floor10VisibleDevice[] = prison
        ? Object.values(prison.devices).map((d) => {
            const dx = d.x - npcPosition.x;
            const dz = d.z - npcPosition.z;
            return {
                id: d.id,
                kind: d.kind,
                distance: round1(Math.hypot(dx, dz)),
                direction: relationFromDelta(dx, dz, npcYaw),
                visible: inViewCone(npcPosition, { x: d.x, y: 0, z: d.z }, npcYaw),
                heldByNpc: d.heldByNpc,
                heldByPlayer: d.heldByPlayer,
                position: { x: d.x, z: d.z },
            };
        })
        : [];

    const visibleObjects: Floor10VisibleObject[] = ['grid-floor', 'room-walls'];
    if (devices.some((d) => d.visible)) visibleObjects.push('device');
    if (elevatorVisible) visibleObjects.push('elevator-entrance');
    if (player?.visible) visibleObjects.push('player');

    return {
        source: 'floor10-engine-sensors',
        floor: 10,
        certainty: 1,
        position: {
            x: round1(npcPosition.x),
            y: round1(npcPosition.y),
            z: round1(npcPosition.z),
        },
        zone,
        heading: compassFromYaw(npcYaw),
        yaw: npcYaw,
        locationDescription: absoluteLocation(npcPosition, zone),
        player,
        elevator: {
            visible: elevatorVisible,
            distance: elevatorDistance,
            direction: elevatorDirection,
        },
        visibleObjects,
        devices,
    };
}

/** Snapshot inicial verdadeiro; o corpo 3D o substitui pelos sensores ao vivo. */
export const INITIAL_FLOOR10_PERCEPTION: Floor10Perception = perceiveFloor10({
    npcPosition: { x: 0, y: 0, z: 2.2 },
    npcYaw: 0,
    playerPosition: null,
});

export function formatFloor10PerceptionForPrompt(perception: Floor10Perception): string {
    const playerLine = perception.player
        ? `- Jogador: ${RELATIVE_PT[perception.player.direction]}, a ${perception.player.distance} m; `
            + (perception.player.visible ? 'visível agora.' : 'fora do campo de visão agora.')
        : '- Jogador: não detectado pelos olhos agora.';
    return `PERCEPÇÃO ESPACIAL AO VIVO (sensores do motor; verdade prioritária):
- Local: ${perception.locationDescription}; olhando para ${COMPASS_PT[perception.heading]}.
${playerLine}
- Elevador: ${RELATIVE_PT[perception.elevator.direction]}, ${perception.elevator.distance} m; `
        + `${perception.elevator.visible ? 'visível' : 'fora da visão'}. Vê agora: `
        + `${perception.visibleObjects.map((object) => OBJECT_PT[object]).join(', ')}.
- Nunca contradiga estes sensores.`;
}

function normalize(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase();
}

type PerceptionLanguage = 'pt' | 'en' | 'es';

function perceptionLanguage(text: string): PerceptionLanguage {
    const normalized = normalize(text);
    if (/[¿¡]/.test(text) || /\b(donde|estas|ves|puedes|piso|ascensor)\b/.test(normalized)) return 'es';
    if (/\b(where|what|see|floor|elevator|can you)\b/.test(normalized)) return 'en';
    return 'pt';
}

type PerceptionIntent =
    | 'self-location' | 'vision' | 'player-location' | 'elevator-location'
    // "tem alguém do seu lado?" / "você está sozinho?". Faltava, e a falta
    // custava caro: sem intenção reconhecida a pergunta ia para o 3B, e ele
    // respondia "Não, estou sozinho" com o jogador a 2,7m na frente dele.
    // Os olhos SABEM — quem não sabia era o classificador.
    | 'company';

function perceptionIntent(text: string): PerceptionIntent | null {
    const normalized = normalize(text);
    if (
        /\b(onde|aonde) (?:voce|vc|ce|tu) (?:esta|ta|fica)\b/.test(normalized)
        || /\b(?:voce|vc|ce|tu) sabe onde (?:esta|ta)\b/.test(normalized)
        || /\b(?:em )?que andar (?:voce|vc|ce|tu) (?:esta|ta)\b/.test(normalized)
        || /\b(?:em )?qual andar (?:voce|vc|ce|tu|a gente|nos) (?:esta|ta|estamos)\b/.test(normalized)
        || /\bonde (?:a gente|nos) (?:esta|ta|estamos)\b/.test(normalized)
        || /\bwhere are you\b/.test(normalized)
        || /\bwhere are we\b/.test(normalized)
        || /\bwhat floor are you on\b/.test(normalized)
        || /\bdonde estas\b/.test(normalized)
        || /\bdonde estamos\b/.test(normalized)
        || /\ben que piso estas\b/.test(normalized)
    ) return 'self-location';

    if (
        /\btem (?:mais )?alguem\b/.test(normalized)
        || /\b(?:ha|existe) (?:mais )?alguem\b/.test(normalized)
        || /\balguem (?:do seu lado|perto|contigo|com voce|aqui|ai)\b/.test(normalized)
        || /\b(?:voce|vc|ce|tu) (?:esta|ta) sozinh[oa]\b/.test(normalized)
        || /\b(?:estamos|a gente esta) sozinh/.test(normalized)
        || /\bare you alone\b/.test(normalized)
        || /\bis (?:there )?any(?:one|body) (?:there|here|with you)\b/.test(normalized)
        || /\bany(?:one|body) else\b/.test(normalized)
        || /\bestas solo\b/.test(normalized)
        || /\bhay alguien\b/.test(normalized)
    ) return 'company';

    if (
        /\bo que (?:voce|vc|ce|tu) (?:ve|enxerga)\b/.test(normalized)
        || /\b(?:voce|vc|ce|tu) (?:consegue )?me (?:ve|enxerga|vendo)\b/.test(normalized)
        || /\b(?:voce|vc|ce|tu) (?:esta|ta) me vendo\b/.test(normalized)
        || /\bwhat (?:can )?you see\b/.test(normalized)
        || /\bwhat is around you\b/.test(normalized)
        || /\bcan you see me\b/.test(normalized)
        || /\bque ves\b/.test(normalized)
        || /\bpuedes verme\b/.test(normalized)
    ) return 'vision';

    if (
        /\bonde eu (?:estou|to)\b/.test(normalized)
        || /\bwhere am i\b/.test(normalized)
        || /\bdonde estoy\b/.test(normalized)
    ) return 'player-location';

    if (
        /\bonde (?:fica|esta|ta) (?:o )?elevador\b/.test(normalized)
        || /\bwhere is the elevator\b/.test(normalized)
        || /\bdonde esta (?:el )?ascensor\b/.test(normalized)
    ) return 'elevator-location';

    return null;
}

export function isFloor10PerceptionQuestion(text: string): boolean {
    return perceptionIntent(text) !== null;
}

/** A micro-IA responde perguntas sensoriais sem acordar o LLM de 2B. */
export function answerFloor10PerceptionQuestion(
    userText: string,
    perception: Floor10Perception,
): string | null {
    const intent = perceptionIntent(userText);
    if (!intent) return null;
    const language = perceptionLanguage(userText);

    if (intent === 'self-location') {
        if (language === 'en') {
            return `I am on the tenth floor, ${ZONE_EN[perception.zone]}. The elevator entrance is ${perception.elevator.distance} m away.`;
        }
        if (language === 'es') {
            return `Estoy en el décimo piso, ${ZONE_ES[perception.zone]}. La entrada del ascensor está a ${perception.elevator.distance} m de mí.`;
        }
        return `Estou no 10º andar, ${ZONE_PT[perception.zone]}. A entrada do elevador está a ${perception.elevator.distance} m de mim.`;
    }

    if (intent === 'vision') {
        if (language === 'en') {
            const player = perception.player?.visible
                ? `I can see you ${RELATIVE_EN[perception.player.direction]}, ${perception.player.distance} m away.`
                : 'I cannot see you in my field of view right now.';
            return `${player} I can currently see: ${perception.visibleObjects.map((object) => OBJECT_EN[object]).join(', ')}.`;
        }
        if (language === 'es') {
            const player = perception.player?.visible
                ? `Te veo ${RELATIVE_ES[perception.player.direction]}, a ${perception.player.distance} m.`
                : 'Ahora mismo no te veo en mi campo de visión.';
            return `${player} En este instante veo: ${perception.visibleObjects.map((object) => OBJECT_ES[object]).join(', ')}.`;
        }
        const player = perception.player?.visible
            ? `Eu te vejo ${RELATIVE_PT[perception.player.direction]}, a ${perception.player.distance} m.`
            : 'Não te vejo no meu campo de visão agora.';
        return `${player} Neste instante vejo: ${perception.visibleObjects.map((object) => OBJECT_PT[object]).join(', ')}.`;
    }

    if (intent === 'company') {
        // A resposta sai do SENSOR, não do modelo. Instantânea, zero token,
        // e impossível de contradizer o que os olhos estão vendo.
        if (perception.player?.visible) {
            if (language === 'en') return `No, you are right there — ${RELATIVE_EN[perception.player.direction]}, ${perception.player.distance} m away.`;
            if (language === 'es') return `No, estás justo ahí — ${RELATIVE_ES[perception.player.direction]}, a ${perception.player.distance} m.`;
            return `Não, você está bem aí — ${RELATIVE_PT[perception.player.direction]}, a ${perception.player.distance} m.`;
        }
        if (perception.player) {
            // Existe, mas fora do campo de visão: não dá para afirmar solidão
            // nem posição. A honestidade aqui é parte do personagem.
            if (language === 'en') return 'I cannot see you from here, but I know you have not left this floor.';
            if (language === 'es') return 'No te veo desde aquí, pero sé que no saliste de este piso.';
            return 'Daqui eu não te vejo, mas sei que você não saiu deste andar.';
        }
        if (language === 'en') return 'Yes. Just me and the elevator that will not obey.';
        if (language === 'es') return 'Sí. Solo yo y el ascensor que no obedece.';
        return 'Estou. Só eu e o elevador que não obedece.';
    }

    if (intent === 'player-location') {
        if (!perception.player?.visible) {
            if (language === 'en') return 'I cannot see you in my field of view right now, so I will not pretend to know your position.';
            if (language === 'es') return 'Ahora mismo no te veo, así que no fingiré saber tu posición.';
            return 'Não te vejo no meu campo de visão agora, então não vou fingir saber sua posição.';
        }
        if (language === 'en') return `You are ${RELATIVE_EN[perception.player.direction]}, ${perception.player.distance} m away.`;
        if (language === 'es') return `Estás ${RELATIVE_ES[perception.player.direction]}, a ${perception.player.distance} m.`;
        return `Você está ${RELATIVE_PT[perception.player.direction]}, a ${perception.player.distance} m.`;
    }

    if (language === 'en') return `The elevator entrance is ${RELATIVE_EN[perception.elevator.direction]}, ${perception.elevator.distance} m away.`;
    if (language === 'es') return `La entrada del ascensor está ${RELATIVE_ES[perception.elevator.direction]}, a ${perception.elevator.distance} m.`;
    return `A entrada do elevador está ${RELATIVE_PT[perception.elevator.direction]}, a ${perception.elevator.distance} m.`;
}

export function hasFloor10PerceptionContradiction(
    reply: string,
    perception: Floor10Perception,
): boolean {
    const normalized = normalize(reply);
    const unknownLocation = /\b(?:nao sei onde estou|i do not know where i am|no se donde estoy)\b/.test(normalized);
    if (unknownLocation) return true;

    // NEGAR A PRESENÇA DE QUEM ESTÁ À VISTA.
    //
    // Este detector só olhava o número do andar, e por isso "Não, estou
    // sozinho" — com o jogador a 2,7m e dentro do campo de visão — passava
    // pela validação sem ninguém reclamar. É a contradição mais grosseira
    // possível: os sensores estão no prompt e a fala diz o contrário.
    //
    // Só entram formas que AFIRMAM ausência. "Me sinto sozinho" continua
    // válido: solidão é sentimento, e o Nilo tem direito a ela mesmo
    // acompanhado.
    if (perception.player?.visible) {
        const negaPresenca = /\b(?:estou|to) sozinh[oa]\b/.test(normalized)
            || /\bnao (?:tem|ha) ningu[eé]m\b/.test(normalized)
            || /\bningu[eé]m (?:aqui|comigo|do meu lado|mais)\b/.test(normalized)
            || /\bi am alone\b/.test(normalized)
            || /\b(?:there is )?no ?(?:one|body) (?:here|with me)\b/.test(normalized)
            || /\bestoy solo\b/.test(normalized)
            || /\bno hay nadie\b/.test(normalized);
        if (negaPresenca) return true;
    }

    const floorPatterns = [
        /\b(?:andar|piso)\s*(?:numero\s*)?(\d{1,2})\b/g,
        /\b(\d{1,2})\s*(?:º|o)?\s*(?:andar|piso)\b/g,
        /\bfloor\s*(\d{1,2})\b/g,
        /\b(\d{1,2})(?:st|nd|rd|th)\s+floor\b/g,
    ];
    for (const pattern of floorPatterns) {
        for (const match of normalized.matchAll(pattern)) {
            if (Number(match[1]) !== perception.floor) return true;
        }
    }
    return false;
}
