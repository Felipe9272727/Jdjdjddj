/**
 * f3Mola.ts — a mola que dá PESO ao Diabrete.
 *
 * Estava copiada, idêntica, em `Floor3Cutscene.tsx` e em `Floor3Rival.tsx`: a
 * mesma classe, os mesmos padrões (k=22, d=7), dois donos. Duas cópias de uma
 * constante de sensação é como o mesmo personagem passa a ter peso diferente na
 * cutscene e no jogo sem ninguém perceber — e nesta sessão já apareceu um
 * `ARM_REST` declarado em dois lugares pelo mesmo motivo.
 *
 * Integração explícita, de propósito: é uma mola amortecida simples, e o valor
 * dela é ser previsível. Quem chama passa o `dt`; desde que a atuação passou a
 * ser desenhada EM DOIS (ver `f3Pose`), esse `dt` é o do DESENHO (1/12 s) e não
 * o da tela, então o gesto tem o mesmo tempo a 60 fps ou a 2.
 */

export class Mola {
    value = 0;
    vel = 0;
    constructor(readonly k = 22, readonly d = 7) {}
    tick(alvo: number, dt: number): number {
        this.vel += (-this.k * (this.value - alvo) - this.d * this.vel) * dt;
        this.value += this.vel * dt;
        return this.value;
    }
    reset(v = 0): void { this.value = v; this.vel = 0; }
}

/** Nome antigo, para os dois arquivos que já a chamavam assim. */
export { Mola as Spring };
