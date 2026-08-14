// ── A PRISÃO DO ANDAR 10 ──────────────────────────────────────────────────
// O Nilo está preso aqui. O elevador nunca obedeceu a ele — e não vai obedecer,
// porque a saída não foi feita para uma pessoa só: cada tranca precisa de DOIS
// corpos ao mesmo tempo, em lugares diferentes. Sozinho ele podia tentar por
// mais dez anos e não sairia. Por isso o jogador importa.
//
// A REGRA QUE MANDA NESTE ARQUIVO: o Nilo NÃO SABE o que fazer.
//
// Nada aqui diz a ele "pise na placa". Os aparelhos existem, respondem a quem
// os toca, e pronto. Descobrir que a placa da esquerda só conta quando a da
// direita também está pisada é trabalho DELE, tentando — é o que o aprendizado
// por reforço vai aprender, e é o que torna o campo de provas honesto. Se eu
// escrevesse a solução aqui, o teste de independência não testaria nada.
//
// Módulo PURO: sem three, sem react. O mundo 3D lê o estado e desenha; a
// vontade lê o estado e decide; o aprendizado lê os eventos e aprende.

export type PrisonDeviceKind = 'plate' | 'lever' | 'panel';

export type PrisonDevice = {
    id: string;
    kind: PrisonDeviceKind;
    /** Posição na sala, em metros (a sala vai de -5,5 a +5,5). */
    x: number;
    z: number;
    /** Quem está em cima/segurando agora. */
    heldByNpc: boolean;
    heldByPlayer: boolean;
    /** Quanto tempo seguido está acionado — algumas trancas exigem paciência. */
    heldSeconds: number;
};

export type PrisonLockId = 'placas' | 'alavancas';

export type PrisonLock = {
    id: PrisonLockId;
    /** Os aparelhos que participam desta tranca. */
    devices: [string, string];
    /**
     * Segundos que os DOIS precisam ficar acionados juntos. Não é enfeite: uma
     * tranca instantânea seria resolvida por acaso, e por acaso não se aprende.
     */
    holdSeconds: number;
    progress: number;
    solved: boolean;
    /** Quantas vezes os dois estiveram juntos e o tempo não foi suficiente. */
    nearMisses: number;
    /**
     * Os dois estavam acionados no quadro ANTERIOR.
     *
     * Existe para `nearMisses` contar OCORRÊNCIAS e não QUADROS. O evento
     * `quase` é contínuo de propósito (`prisonReward` o escala por `dt`), mas
     * `nearMisses` é uma contagem discreta que estava pegando carona nesse
     * sinal: enquanto o progresso escorria, ela somava 1 por quadro. Medido:
     * um único quase-acerto virava vinte.
     *
     * E o número não é enfeite — é o que diz se a dupla está APRENDENDO ou só
     * repetindo. Inflado em 20x, "chegaram perto duas vezes" vira "quarenta", e
     * qualquer leitura em cima disso mente.
     */
    juntosAntes: boolean;
};

export type F10PrisonState = {
    devices: Record<string, PrisonDevice>;
    locks: PrisonLock[];
    /** Todas as trancas abertas? Aí a porta cede. */
    doorOpen: boolean;
    /** Tentativas do Nilo em cima de um aparelho — o denominador do aprendizado. */
    npcAttempts: number;
    /** Segundos desde que alguma coisa mudou de verdade. */
    secondsSinceProgress: number;
    version: number;
};

export type PrisonEvent =
    /** O Nilo acionou algo sozinho e nada aconteceu. É a maior parte do começo. */
    | { type: 'tentativa-sozinho'; device: string }
    /** Os dois estão acionados ao mesmo tempo — a tranca começou a ceder. */
    | { type: 'juntos'; lock: PrisonLockId; progress: number }
    /** Estavam juntos e um saiu antes da hora. */
    | { type: 'quase'; lock: PrisonLockId; progress: number }
    | { type: 'tranca-aberta'; lock: PrisonLockId }
    | { type: 'porta-aberta' };

export const PRISON_DEVICES: readonly Omit<PrisonDevice, 'heldByNpc' | 'heldByPlayer' | 'heldSeconds'>[] =
    Object.freeze([
        // As duas placas ficam em cantos OPOSTOS: nenhuma pessoa alcança as
        // duas. É a geometria que obriga a dupla, não um aviso na tela.
        { id: 'placa-oeste', kind: 'plate', x: -7, z: -6 },
        { id: 'placa-leste', kind: 'plate', x: 7, z: -6 },
        { id: 'alavanca-norte', kind: 'lever', x: -7, z: 6 },
        { id: 'alavanca-sul', kind: 'lever', x: 7, z: 6 },
    ]);

const LOCKS: readonly Omit<PrisonLock, 'progress' | 'solved' | 'nearMisses' | 'juntosAntes'>[] = Object.freeze([
    { id: 'placas', devices: ['placa-oeste', 'placa-leste'], holdSeconds: 2.5 },
    { id: 'alavancas', devices: ['alavanca-norte', 'alavanca-sul'], holdSeconds: 4 },
]);

/** Distância para considerar que alguém está EM CIMA de um aparelho. */
export const PRISON_REACH = 0.9;

export function freshPrison(): F10PrisonState {
    const devices: Record<string, PrisonDevice> = {};
    for (const d of PRISON_DEVICES) {
        devices[d.id] = { ...d, heldByNpc: false, heldByPlayer: false, heldSeconds: 0 };
    }
    return {
        devices,
        locks: LOCKS.map((l) => ({
            ...l, progress: 0, solved: false, nearMisses: 0, juntosAntes: false,
        })),
        doorOpen: false,
        npcAttempts: 0,
        secondsSinceProgress: 0,
        version: 0,
    };
}

export type PrisonStepInput = {
    npc: { x: number; z: number } | null;
    player: { x: number; z: number } | null;
    dt: number;
};

function perto(a: { x: number; z: number } | null, d: PrisonDevice): boolean {
    if (!a) return false;
    return Math.hypot(a.x - d.x, a.z - d.z) <= PRISON_REACH;
}

/**
 * Um passo da prisão. Muta o estado (é um singleton de jogo, como f6Escape) e
 * devolve os eventos do passo — são eles que alimentam o aprendizado.
 */
export function stepPrison(state: F10PrisonState, input: PrisonStepInput): PrisonEvent[] {
    const dt = Math.max(0, Math.min(0.25, input.dt));
    const eventos: PrisonEvent[] = [];
    let houveProgresso = false;

    for (const device of Object.values(state.devices)) {
        const npcAntes = device.heldByNpc;
        device.heldByNpc = perto(input.npc, device);
        device.heldByPlayer = perto(input.player, device);
        const acionado = device.heldByNpc || device.heldByPlayer;
        device.heldSeconds = acionado ? device.heldSeconds + dt : 0;
        // Ele subiu em algo agora: conta como tentativa, mesmo que não sirva
        // para nada. Tentativa que não dá em nada também é informação.
        if (!npcAntes && device.heldByNpc) {
            state.npcAttempts += 1;
            if (!device.heldByPlayer) eventos.push({ type: 'tentativa-sozinho', device: device.id });
        }
    }

    for (const lock of state.locks) {
        if (lock.solved) continue;
        const [a, b] = lock.devices.map((id) => state.devices[id]);
        const aAcionado = a.heldByNpc || a.heldByPlayer;
        const bAcionado = b.heldByNpc || b.heldByPlayer;
        // A dupla de verdade: precisa de um em cada, e não a mesma pessoa
        // correndo entre os dois (a geometria já impede, mas a regra é
        // explícita para o teste poder cobrar).
        const dupla = aAcionado && bAcionado
            && (a.heldByNpc !== b.heldByNpc || a.heldByPlayer !== b.heldByPlayer);
        if (dupla) {
            const antes = lock.progress;
            lock.progress = Math.min(lock.holdSeconds, lock.progress + dt);
            if (lock.progress > antes) houveProgresso = true;
            eventos.push({ type: 'juntos', lock: lock.id, progress: lock.progress / lock.holdSeconds });
            if (lock.progress >= lock.holdSeconds) {
                lock.solved = true;
                eventos.push({ type: 'tranca-aberta', lock: lock.id });
            }
        } else if (lock.progress > 0) {
            // Soltou antes da hora. O progresso escorre — mas devagar, senão
            // uma dupla que quase acertou perde tudo e nunca aprende que
            // estava perto.
            eventos.push({ type: 'quase', lock: lock.id, progress: lock.progress / lock.holdSeconds });
            // A CONTAGEM É NA BORDA, não no quadro. O evento acima é contínuo
            // e `prisonReward` o escala por `dt`; esta é uma contagem discreta,
            // e somava 1 a cada quadro do escorrimento — um quase-acerto virava
            // vinte. Só conta quem ESTAVA junto e deixou de estar.
            if (lock.juntosAntes) lock.nearMisses += 1;
            lock.progress = Math.max(0, lock.progress - dt * 0.5);
        }
        lock.juntosAntes = dupla;
    }

    if (!state.doorOpen && state.locks.every((l) => l.solved)) {
        state.doorOpen = true;
        houveProgresso = true;
        eventos.push({ type: 'porta-aberta' });
    }

    state.secondsSinceProgress = houveProgresso ? 0 : state.secondsSinceProgress + dt;
    if (eventos.length) state.version += 1;
    return eventos;
}

/**
 * A recompensa que cada evento vale para o aprendizado do Nilo.
 *
 * Escala pensada para ele descobrir a COOPERAÇÃO, não para decorar um aparelho:
 * mexer sozinho custa quase nada (mas custa, senão ele fica pisando na mesma
 * placa a tarde toda), estar junto do jogador em duas pontas paga bem, e abrir
 * uma tranca paga muito.
 */
export function prisonReward(evento: PrisonEvent, dt = 1): number {
    switch (evento.type) {
        // Discretos: acontecem UMA vez e valem o número cheio.
        case 'tentativa-sozinho': return -0.02;
        case 'tranca-aberta': return 1;
        case 'porta-aberta': return 2;
        // CONTÍNUOS: 'juntos' e 'quase' disparam a cada quadro enquanto a
        // situação dura. Sem escalar pelo dt, um único segundo lado a lado
        // valia 60 × 0,35 = 21 de recompensa — mais de dez vezes o prêmio de
        // ABRIR a porta, e saturando o teto o tempo todo. O sinal que deveria
        // ensinar a cooperar afogava todo o resto, inclusive o próprio final.
        case 'juntos': return 0.35 * dt;
        case 'quase': return 0.05 * dt;
        default: return 0;
    }
}

/**
 * O que o Nilo SENTE da prisão agora — entra no estado do aprendizado.
 *
 * De propósito NÃO existe aqui nada como "a tranca das placas precisa das duas
 * ao mesmo tempo". Ele recebe o que dá para perceber estando na sala: em quê
 * ele está pisando, se alguma coisa está zumbindo (progresso), quantas trancas
 * já cederam, e há quanto tempo nada acontece.
 */
export function prisonSenses(state: F10PrisonState): number[] {
    const emCima = Object.values(state.devices).map((d) => (d.heldByNpc ? 1 : 0));
    const zumbindo = state.locks.map((l) => l.progress / l.holdSeconds);
    const abertas = state.locks.filter((l) => l.solved).length / state.locks.length;
    return [
        ...emCima,
        ...zumbindo,
        abertas,
        Math.min(1, state.secondsSinceProgress / 60),
        state.doorOpen ? 1 : 0,
    ];
}

/** Quantos números prisonSenses devolve — o RL precisa saber de antemão. */
export const PRISON_SENSE_SIZE = PRISON_DEVICES.length + LOCKS.length + 3;

/**
 * A linha que vai para o cérebro pequeno. Descreve a situação SEM ensinar a
 * solução: ele lê que está preso, que há coisas na sala e que sozinho nada
 * cede. A conclusão de chamar o jogador tem que ser dele.
 */
export function describePrison(state: F10PrisonState): string {
    if (state.doorOpen) return 'THE DOOR IS OPEN. After all this time, it is open.';
    const abertas = state.locks.filter((l) => l.solved).length;
    const emCima = Object.values(state.devices).filter((d) => d.heldByNpc).map((d) => d.id);
    const partes = [
        'YOU ARE LOCKED IN. The elevator door will not move for you.',
        `There are ${PRISON_DEVICES.length} things in this room that react when someone stands on them.`,
        `${abertas} of ${state.locks.length} locks have given way so far.`,
    ];
    if (emCima.length) partes.push(`You are standing on: ${emCima.join(', ')}.`);
    if (state.locks.some((l) => !l.solved && l.progress > 0)) {
        partes.push('Something is humming right now — it started when you were not alone.');
    }
    if (state.secondsSinceProgress > 90) {
        partes.push('Nothing has changed in a long while, no matter what you try alone.');
    }
    // ── O QUE ELE JÁ VIVEU, E NINGUÉM CONTAVA A ELE ───────────────────────
    //
    // `nearMisses` era contado desde o começo e lido por NINGUÉM. O Nilo
    // recomeçava do zero a cada rodada: nunca lembrava que já tinha chegado
    // perto, nem quantas vezes.
    //
    // E isto NÃO é entregar a solução — é o oposto. A solução seria a regra
    // ("dois ao mesmo tempo"), que saiu daqui de propósito. Isto é a MEMÓRIA
    // do que aconteceu com ele: o zumbido começou, e parou antes da hora. Ele
    // viveu esse momento; não lembrar dele é que era artificial.
    //
    // É também a única pista que a experiência dá sozinha, e a diferença entre
    // um agente que tenta ao acaso e um que percebe que estava perto.
    const quases = state.locks.reduce((a, l) => a + l.nearMisses, 0);
    if (quases === 1) {
        partes.push('Once, the humming started and then stopped before anything gave way.');
    } else if (quases > 1) {
        partes.push(
            `${quases} times now, the humming started and then stopped before anything gave way.`,
        );
    }
    return partes.join(' ');
}

// ── O ESTADO VIVO ─────────────────────────────────────────────────────────
// Singleton observável, mesmo padrão de f6Escape/npcStore: o mundo 3D desenha,
// a vontade decide e o aprendizado aprende, todos lendo a mesma sala.

export const f10prison: F10PrisonState = freshPrison();

const inscritos = new Set<() => void>();

export function prisonSubscribe(fn: () => void): () => void {
    inscritos.add(fn);
    return () => { inscritos.delete(fn); };
}

export function prisonBump(): void {
    for (const fn of inscritos) fn();
}

/** Um passo da sala viva. Devolve os eventos para quem quiser recompensar. */
export function prisonTick(input: PrisonStepInput): PrisonEvent[] {
    const antes = f10prison.version;
    const eventos = stepPrison(f10prison, input);
    if (f10prison.version !== antes) prisonBump();
    return eventos;
}

/** Zera a sala — o jogador saiu do andar e voltou. */
export function prisonReset(): void {
    Object.assign(f10prison, freshPrison());
    prisonBump();
}
