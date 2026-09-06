type Medicao = { prompt_n?: number; cache_n?: number; prompt_ms?: number; predicted_ms?: number };
/** Timing snapshots are cumulative within a generation, not deltas per token. */
export class CustoDaFala {
    private chamadas: { teto: number; medicao: Medicao | null }[] = [];
    iniciar(teto: number): number { return this.chamadas.push({ teto, medicao: null }) - 1; }
    medir(id: number, medicao: Medicao): void {
        if (this.chamadas[id]) this.chamadas[id].medicao = { ...medicao };
    }
    resumo(): Record<string, number> {
        const soma = (campo: keyof Medicao) => this.chamadas.reduce((total,c) => {
            const n = c.medicao?.[campo]; return total + (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);
        },0);
        return {
            geracoes: this.chamadas.length,
            geracoes_medidas: this.chamadas.filter(c => c.medicao !== null).length,
            teto_saida_total: this.chamadas.reduce((total,c) => total+c.teto,0),
            tokens_prompt_reportados_total: soma('prompt_n'),
            tokens_cache_reportados_total: soma('cache_n'),
            leitura_total_s: soma('prompt_ms')/1000,
            fala_total_s: soma('predicted_ms')/1000,
        };
    }
}
