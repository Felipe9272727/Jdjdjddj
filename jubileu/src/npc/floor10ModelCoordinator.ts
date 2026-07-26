// ── COORDENADOR DOS CÉREBROS DO 10º ───────────────────────────────────────
// O navegador só pode manter um LLM residente por vez. Esta fila serializa a
// troca entre o cérebro de conversa e o de deliberação: antes de carregar um,
// ela aguarda a descarga completa do outro.

export type Floor10BrainOwner = 'conversation' | 'deliberation';
type BrainUnloader = () => Promise<void> | void;

export class Floor10ModelCoordinator {
    private activeOwner: Floor10BrainOwner | null = null;
    private loadingOwner: Floor10BrainOwner | null = null;
    private transition: Promise<void> = Promise.resolve();
    private readonly unloaders: Partial<Record<Floor10BrainOwner, BrainUnloader>> = {};
    private readonly generations: Record<Floor10BrainOwner, number> = {
        conversation: 0,
        deliberation: 0,
    };

    register(owner: Floor10BrainOwner, unload: BrainUnloader): void {
        this.unloaders[owner] = unload;
    }

    /**
     * Torna `owner` o único cérebro residente e só então executa `load`.
     * Chamadas concorrentes entram na mesma fila, preservando a ordem.
     *
     * A conversa é a única prioridade: se o MiniCPM estiver carregando, seu
     * unloader é acionado imediatamente para cancelar download/WASM. A tarefa
     * continua serializada, mas deixa de esperar um carregamento inútil.
     */
    activate<T>(owner: Floor10BrainOwner, load: () => Promise<T>): Promise<T> {
        const generation = ++this.generations[owner];
        let priorityUnload: Promise<void> | null = null;
        if (
            owner === 'conversation'
            && (
                this.activeOwner === 'deliberation'
                || this.loadingOwner === 'deliberation'
            )
        ) {
            // Impede a ativação cancelada de se declarar dona da memória caso
            // seu Promise resolva alguns microssegundos depois.
            this.generations.deliberation += 1;
            this.activeOwner = null;
            try {
                priorityUnload = Promise.resolve(this.unloaders.deliberation?.())
                    .catch(() => undefined);
            } catch { /* o fluxo serializado repetirá a descarga */ }
        }

        const task = this.transition
            .catch(() => undefined)
            .then(async () => {
                await priorityUnload;
                if (this.activeOwner && this.activeOwner !== owner) {
                    const previous = this.activeOwner;
                    this.activeOwner = null;
                    await this.unloaders[previous]?.();
                }

                this.loadingOwner = owner;
                try {
                    const value = await load();
                    if (this.generations[owner] === generation) {
                        this.activeOwner = owner;
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

    /** Libera um cérebro explicitamente sem atravessar outra transição. */
    release(owner: Floor10BrainOwner): Promise<void> {
        const task = this.transition
            .catch(() => undefined)
            .then(async () => {
                if (this.activeOwner !== owner) return;
                this.activeOwner = null;
                await this.unloaders[owner]?.();
            });

        this.transition = task.then(
            () => undefined,
            () => undefined,
        );
        return task;
    }

    owner(): Floor10BrainOwner | null {
        return this.activeOwner;
    }
}

export const floor10ModelCoordinator = new Floor10ModelCoordinator();
