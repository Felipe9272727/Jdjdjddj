// ── COORDENADOR DOS CÉREBROS DO 10º ───────────────────────────────────────
// O navegador só pode manter um LLM residente por vez. Esta fila serializa a
// troca entre o cérebro de conversa e o de deliberação: antes de carregar um,
// ela aguarda a descarga completa do outro.

export type Floor10BrainOwner = 'conversation' | 'deliberation';
type BrainUnloader = () => Promise<void> | void;

export class Floor10ModelCoordinator {
    private activeOwner: Floor10BrainOwner | null = null;
    private transition: Promise<void> = Promise.resolve();
    private readonly unloaders: Partial<Record<Floor10BrainOwner, BrainUnloader>> = {};

    register(owner: Floor10BrainOwner, unload: BrainUnloader): void {
        this.unloaders[owner] = unload;
    }

    /**
     * Torna `owner` o único cérebro residente e só então executa `load`.
     * Chamadas concorrentes entram na mesma fila, preservando a ordem.
     */
    activate<T>(owner: Floor10BrainOwner, load: () => Promise<T>): Promise<T> {
        const task = this.transition
            .catch(() => undefined)
            .then(async () => {
                if (this.activeOwner && this.activeOwner !== owner) {
                    const previous = this.activeOwner;
                    this.activeOwner = null;
                    await this.unloaders[previous]?.();
                }

                const value = await load();
                this.activeOwner = owner;
                return value;
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
