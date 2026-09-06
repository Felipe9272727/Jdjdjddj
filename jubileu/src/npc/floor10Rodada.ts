/** A late model response cannot act in another visit or override a newer request. */
export class RodadaDoNilo {
    private visita = 0;
    private ativa = false;
    private sequencia = 0;
    entrar(): void { this.visita++; this.ativa = true; }
    sair(): void { this.ativa = false; }
    iniciar(comando: number) { return { visita: this.visita, sequencia: ++this.sequencia, comando }; }
    aceitar(bilhete: { visita: number; sequencia: number; comando: number }, comando: number): boolean {
        return this.ativa && bilhete.visita === this.visita && bilhete.sequencia === this.sequencia && bilhete.comando === comando;
    }
}
