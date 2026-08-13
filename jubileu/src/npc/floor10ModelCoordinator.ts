// ── COORDENADOR DOS CÉREBROS DO 10º ───────────────────────────────────────
// SmolLM3, MiniBrain e o tradutor motor podem permanecer residentes. Os donos
// abaixo são PIPELINES: fala e deliberação (esta inclui o motor de 135M). A fila
// evita carregar dois runtimes ao mesmo tempo, mas NÃO expulsa o outro pipeline.
// A fala pode pausar MiniBrain + motor; pausar não apaga os pesos já residentes,
// então o livre-arbítrio volta sem baixar os modelos de novo.

// 'memory' é o modelo de embedding que escolhe o fato do cânone. Ele entra
// aqui só para as CARGAS não acontecerem ao mesmo tempo — nunca preempta nem é
// preemptado, porque a busca dele dura ~200ms e não disputa nada de verdade.
export type Floor10BrainOwner = 'conversation' | 'deliberation' | 'memory';
type BrainUnloader = () => Promise<void> | void;
type BrainPreemptor = () => Promise<void> | void;

export class Floor10ModelCoordinator {
    private loadingOwner: Floor10BrainOwner | null = null;
    private lastActivatedOwner: Floor10BrainOwner | null = null;
    private transition: Promise<void> = Promise.resolve();
    private readonly residentOwners = new Set<Floor10BrainOwner>();
    private readonly cleanupNeededOwners = new Set<Floor10BrainOwner>();
    // ── UM DONO É UM PIPELINE, E PIPELINE TEM MAIS DE UM MOTOR ───────────
    //
    // Eram dois mapas de UMA função por dono. O comentário no topo já dizia que
    // `deliberation` inclui a vontade E o tradutor motor de 135M — mas só a
    // vontade se registrava (`floor10SmallBrain`), e o motor apenas ATIVAVA sob
    // a mesma chave (`floor10MotorBrain`), sem registrar nada.
    //
    // Consequência medida por leitura direta: `pausarDeliberacao()` dispara
    // toda vez que a fala ou a memória sobem, e chamava o `preempt` da vontade
    // apenas. Uma tradução do motor em andamento nunca era avisada para parar —
    // exatamente a contenção de CPU ("está lagando absurdamente") que este
    // coordenador existe para evitar. E como o motor se desligava sozinho sem
    // avisar, `residentOwners` ficava desatualizado depois.
    //
    // Listas, não campos únicos: quem entra no pipeline se registra, e o
    // segundo a chegar deixa de apagar o primeiro em silêncio.
    private readonly unloaders: Partial<Record<Floor10BrainOwner, BrainUnloader[]>> = {};
    private readonly preemptors: Partial<Record<Floor10BrainOwner, BrainPreemptor[]>> = {};
    private readonly generations: Record<Floor10BrainOwner, number> = {
        conversation: 0,
        deliberation: 0,
        memory: 0,
    };

    register(
        owner: Floor10BrainOwner,
        unload: BrainUnloader,
        preempt?: BrainPreemptor,
    ): void {
        (this.unloaders[owner] ??= []).push(unload);
        if (preempt) (this.preemptors[owner] ??= []).push(preempt);
    }

    /**
     * Carrega um cérebro sem descarregar o outro. Cargas são serializadas para
     * não duplicar o pico de inicialização. Se o Smol ainda não está residente,
     * uma carga/inferência do Mini é pausada imediatamente.
     */
    activate<T>(owner: Floor10BrainOwner, load: () => Promise<T>): Promise<T> {
        const generation = ++this.generations[owner];
        // A guarda `!residentOwners.has('conversation')` que existia aqui
        // pausava a vontade UMA vez — na primeira carga da fala. Depois disso o
        // SmolLM3 ficava residente, a condição nunca mais dava verdadeira, e a
        // vontade voltava a deliberar POR CIMA da fala: dois llama.cpp com oito
        // threads cada no mesmo celular. Era o "está lagando absurdamente".
        //
        // A regra que o jogo sempre quis é a que o dono dele descreveu: quando a
        // mente trabalha, a vontade e o motor ficam pausados.
        // A memória entra junto, e o comentário no topo deste arquivo explica
        // por que ela ficava de fora: "a busca dele dura ~200ms e não disputa
        // nada de verdade". Isso vale para a BUSCA, que nem passa por aqui —
        // não para a CARGA, que é um llama.cpp inteiro subindo. No print do
        // travamento eram três runtimes vivos: fala residente, vontade
        // deliberando e memória carregando.
        if (owner === 'conversation' || owner === 'memory') this.pausarDeliberacao();

        const task = this.transition
            .catch(() => undefined)
            .then(async () => {
                this.loadingOwner = owner;
                this.cleanupNeededOwners.add(owner);
                try {
                    const value = await load();
                    if (
                        this.generations[owner] === generation
                        && value !== null
                        && value !== undefined
                    ) {
                        this.residentOwners.add(owner);
                        this.lastActivatedOwner = owner;
                    }
                    return value;
                } finally {
                    if (this.loadingOwner === owner) this.loadingOwner = null;
                }
            });

        this.transition = task.then(
            () => undefined,
            () => undefined,
        );
        return task;
    }

    /**
     * Pausa a vontade (e o motor, que vive no mesmo pipeline) AGORA.
     *
     * Pausar não apaga peso: `abortDeliberation` guarda o pensamento parcial e
     * encerra o worker, então quando a vez volta ela retoma de onde parou. O
     * que sai da CPU é o pool de threads do llama.cpp da vontade — que é o que
     * estava disputando os núcleos com a fala.
     *
     * Chamado na CARGA da fala e também no começo de CADA geração: carregar
     * acontece uma vez, falar acontece a cada mensagem.
     */
    pausarDeliberacao(): void {
        this.generations.deliberation += 1;
        try {
            for (const parar of this.preemptors.deliberation ?? []) {
                void Promise.resolve(parar()).catch(() => undefined);
            }
        } catch { /* a carga serializada continuará com segurança */ }
    }

    /** Libera somente o cérebro pedido; o outro continua residente. */
    release(owner: Floor10BrainOwner): Promise<void> {
        this.generations[owner] += 1;
        const task = this.transition
            .catch(() => undefined)
            .then(async () => {
                this.residentOwners.delete(owner);
                // Uma falha/cancelamento pode ter produzido um Promise<null>
                // sem chegar a marcar residência. A limpeza explícita também
                // precisa zerar esse Promise para permitir nova tentativa.
                if (this.cleanupNeededOwners.delete(owner)) {
                    // Um a um, e um que falha não impede os outros: descarregar
                    // já custou uma sessão inteira aqui quando uma exceção no
                    // meio deixou o resto residente.
                    for (const soltar of this.unloaders[owner] ?? []) {
                        try {
                            await soltar();
                        } catch { /* o próximo ainda precisa tentar */ }
                    }
                }
                if (this.lastActivatedOwner === owner) {
                    this.lastActivatedOwner = this.residentOwners.has('conversation')
                        ? 'conversation'
                        : this.residentOwners.has('deliberation')
                            ? 'deliberation'
                            : null;
                }
            });

        this.transition = task.then(
            () => undefined,
            () => undefined,
        );
        return task;
    }

    isResident(owner: Floor10BrainOwner): boolean {
        return this.residentOwners.has(owner);
    }

    /** Sincroniza falhas encerradas diretamente pelo próprio runtime. */
    markUnloaded(owner: Floor10BrainOwner): void {
        this.residentOwners.delete(owner);
        this.cleanupNeededOwners.delete(owner);
        if (this.lastActivatedOwner === owner) {
            this.lastActivatedOwner = this.residentOwners.has('conversation')
                ? 'conversation'
                : this.residentOwners.has('deliberation')
                    ? 'deliberation'
                    : null;
        }
    }

    residents(): Floor10BrainOwner[] {
        return (['conversation', 'deliberation', 'memory'] as const)
            .filter((owner) => this.residentOwners.has(owner));
    }

    /** Compatibilidade: informa o último cérebro ativado, não posse exclusiva. */
    owner(): Floor10BrainOwner | null {
        return this.lastActivatedOwner;
    }
}

export const floor10ModelCoordinator = new Floor10ModelCoordinator();
