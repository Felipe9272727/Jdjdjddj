// ── COORDENADOR DOS CÉREBROS DO 10º ───────────────────────────────────────
// SmolLM3, MiniBrain e o tradutor motor podem permanecer residentes. Os donos
// abaixo são PIPELINES: fala e deliberação (esta inclui o motor de 135M). A fila
// evita carregar dois runtimes ao mesmo tempo, mas NÃO expulsa o outro pipeline.
// A fala pode pausar MiniBrain + motor; pausar não apaga os pesos já residentes,
// então o livre-arbítrio volta sem baixar os modelos de novo.

export type Floor10BrainOwner = 'conversation' | 'deliberation';
type BrainUnloader = () => Promise<void> | void;
type BrainPreemptor = () => Promise<void> | void;

export class Floor10ModelCoordinator {
    private loadingOwner: Floor10BrainOwner | null = null;
    private lastActivatedOwner: Floor10BrainOwner | null = null;
    private transition: Promise<void> = Promise.resolve();
    private readonly residentOwners = new Set<Floor10BrainOwner>();
    private readonly cleanupNeededOwners = new Set<Floor10BrainOwner>();
    private readonly unloaders: Partial<Record<Floor10BrainOwner, BrainUnloader>> = {};
    private readonly preemptors: Partial<Record<Floor10BrainOwner, BrainPreemptor>> = {};
    private readonly generations: Record<Floor10BrainOwner, number> = {
        conversation: 0,
        deliberation: 0,
    };

    register(
        owner: Floor10BrainOwner,
        unload: BrainUnloader,
        preempt?: BrainPreemptor,
    ): void {
        this.unloaders[owner] = unload;
        if (preempt) this.preemptors[owner] = preempt;
    }

    /**
     * Carrega um cérebro sem descarregar o outro. Cargas são serializadas para
     * não duplicar o pico de inicialização. Se o Smol ainda não está residente,
     * uma carga/inferência do Mini é pausada imediatamente.
     */
    activate<T>(owner: Floor10BrainOwner, load: () => Promise<T>): Promise<T> {
        const generation = ++this.generations[owner];
        if (owner === 'conversation' && !this.residentOwners.has('conversation')) {
            this.generations.deliberation += 1;
            try {
                void Promise.resolve(this.preemptors.deliberation?.())
                    .catch(() => undefined);
            } catch { /* a carga serializada continuará com segurança */ }
        }

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
                    await this.unloaders[owner]?.();
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
        return (['conversation', 'deliberation'] as const)
            .filter((owner) => this.residentOwners.has(owner));
    }

    /** Compatibilidade: informa o último cérebro ativado, não posse exclusiva. */
    owner(): Floor10BrainOwner | null {
        return this.lastActivatedOwner;
    }
}

export const floor10ModelCoordinator = new Floor10ModelCoordinator();
