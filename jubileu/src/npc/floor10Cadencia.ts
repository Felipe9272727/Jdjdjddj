// ── QUEM PENSA A 60 Hz PENSA À TOA ────────────────────────────────────────
//
// A vontade do Nilo era avaliada uma vez por QUADRO. Só que ela é alimentada
// pela percepção, e a percepção é atualizada 6 vezes por segundo: nove em cada
// dez avaliações liam exatamente o mesmo mundo e chegavam exatamente à mesma
// conclusão. Cada uma dessas passadas ainda alocava um `drives` novo e lia o
// relógio — lixo para o coletor, 60 vezes por segundo.
//
// E não é um celular sobrando: enquanto o jogador conversa, o mesmo aparelho
// está rodando um modelo de 3B em 8 threads. O que a thread principal não gasta
// aqui, sobra para o render (é o FPS medido DURANTE a geração que o gerente de
// GPU julga) e para a fala.
//
// A regra deste módulo é a única coisa que importa para não quebrar nada:
// NENHUM `dt` SE PERDE. O acumulador guarda o tempo dos quadros pulados e o
// entrega inteiro no quadro em que o passo acontece. Quem integra por dt
// (impulsos, cooldowns, recompensa da prisão) continua integrando o mesmo total
// — apenas em passos maiores e mais espaçados.

/** 12 passos por segundo: o dobro da taxa da percepção, metade de nada. */
export const CADENCIA_VONTADE = 1 / 12;

/** A percepção continua nos mesmos 6 Hz de antes desta mudança. */
export const CADENCIA_PERCEPCAO = 1 / 6;

export class Cadencia {
    private acumulado = 0;

    /**
     * @param intervalo Segundos entre dois passos. <= 0 roda todo quadro.
     */
    constructor(private readonly intervalo: number) {}

    /**
     * Devolve o `dt` ACUMULADO quando é hora de dar o passo, ou 0 quando ainda
     * não é. Zero é a resposta que o chamador usa para pular o trabalho — e
     * como o tempo pulado fica guardado, ele volta no próximo passo.
     */
    passo(dt: number): number {
        const seguro = Number.isFinite(dt) && dt > 0 ? dt : 0;
        if (this.intervalo <= 0) return seguro;
        this.acumulado += seguro;
        if (this.acumulado < this.intervalo) return 0;
        const total = this.acumulado;
        this.acumulado = 0;
        return total;
    }

    /**
     * Força o próximo quadro a dar o passo. Serve para quando algo muda e a
     * decisão não pode esperar 83 ms — o jogador abrir a conversa, por exemplo.
     */
    agora(): void {
        this.acumulado = this.intervalo;
    }

    /** Só para teste e diagnóstico. */
    pendente(): number {
        return this.acumulado;
    }
}
