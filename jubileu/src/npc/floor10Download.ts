// ── O MEDIDOR DE DOWNLOAD ─────────────────────────────────────────────────
// "não estou conseguindo baixar nada" — e a tela não dizia nem se tinha
// começado. Havia uma porcentagem, mas porcentagem sozinha mente: 0% pode ser
// "acabou de começar" ou "travou faz três minutos", e são problemas opostos.
//
// Este módulo transforma os pares (bytes, total) que o wllama entrega em algo
// que dá para OLHAR e concluir: quanto já veio em MB, a que velocidade, quanto
// falta, e — o mais importante — há quanto tempo nada chega.

export type DownloadSample = {
    /** 0..1; null quando o servidor não informou o tamanho. */
    fraction: number;
    bytes: number;
    totalBytes: number;
    /** Bytes por segundo na janela recente; 0 antes da primeira medida. */
    rate: number;
    /** Segundos estimados para terminar; null quando não dá para saber. */
    etaSec: number | null;
    /** Há quantos segundos o contador não anda. É isto que denuncia um travamento. */
    stalledSec: number;
};

export const DOWNLOAD_ZERO: DownloadSample = Object.freeze({
    fraction: 0, bytes: 0, totalBytes: 0, rate: 0, etaSec: null, stalledSec: 0,
});

/** A partir daqui a tela para de dizer "baixando" e passa a dizer "parado". */
export const DOWNLOAD_STALL_SEC = 12;

/** Janela da média de velocidade. Curta demais pula; longa demais mente. */
const JANELA_MS = 4_000;

/**
 * Acumula o progresso de UM arquivo. Guarda o mínimo necessário para responder
 * "está andando?" sem depender de relógio de parede externo — o `agora` entra
 * por parâmetro justamente para o teste poder controlar o tempo.
 */
export class DownloadMeter {
    // Sentinela própria em vez de "inicio === 0": o teste controla o relógio e
    // começa em zero, e usar o zero como "ainda não começou" fazia o medidor se
    // reiniciar a cada amostra — a velocidade nunca saía de 0 MB/s.
    private iniciado = false;
    private ultimoBytes = 0;
    private ultimoAvanco = 0;
    private janelaBytes = 0;
    private janelaInicio = 0;
    private taxa = 0;

    reset(agora = Date.now()): void {
        this.iniciado = true;
        this.ultimoBytes = 0;
        this.ultimoAvanco = agora;
        this.janelaBytes = 0;
        this.janelaInicio = agora;
        this.taxa = 0;
    }

    push(bytes: number, totalBytes: number, agora = Date.now()): DownloadSample {
        if (!this.iniciado) this.reset(agora);
        // O RELÓGIO COMEÇA NO PRIMEIRO BYTE, não quando a carga foi pedida.
        //
        // Entre o pedido e o primeiro pedaço o wllama ainda abre o cache e o
        // Worker — foram 68s numa medição real. Contando esse tempo morto, a
        // primeira leitura saiu "16 KB/s · faltam ~9h09" para um arquivo que
        // chegou inteiro 10s depois. Uma barra que mente assim é pior que
        // nenhuma: descartar a espera e começar a medir agora dá "—" por alguns
        // segundos e a verdade em seguida.
        if (this.ultimoBytes === 0 && bytes > 0) {
            this.ultimoBytes = bytes;
            this.ultimoAvanco = agora;
            this.janelaBytes = 0;
            this.janelaInicio = agora;
            return {
                fraction: totalBytes > 0 ? Math.max(0, Math.min(1, bytes / totalBytes)) : 0,
                bytes,
                totalBytes,
                rate: 0,
                etaSec: null,
                stalledSec: 0,
            };
        }
        const avancou = bytes > this.ultimoBytes;
        if (avancou) {
            this.janelaBytes += bytes - this.ultimoBytes;
            this.ultimoBytes = bytes;
            this.ultimoAvanco = agora;
        }
        const decorridoJanela = agora - this.janelaInicio;
        if (decorridoJanela >= JANELA_MS) {
            this.taxa = (this.janelaBytes / decorridoJanela) * 1000;
            this.janelaBytes = 0;
            this.janelaInicio = agora;
        } else if (this.taxa === 0 && decorridoJanela > 0 && this.janelaBytes > 0) {
            // Primeira estimativa antes de fechar a janela: melhor um número
            // grosseiro logo do que "0 MB/s" enquanto o arquivo claramente vem.
            this.taxa = (this.janelaBytes / decorridoJanela) * 1000;
        }
        const restante = totalBytes > 0 ? Math.max(0, totalBytes - bytes) : 0;
        return {
            fraction: totalBytes > 0 ? Math.max(0, Math.min(1, bytes / totalBytes)) : 0,
            bytes,
            totalBytes,
            rate: this.taxa,
            etaSec: this.taxa > 0 && restante > 0 ? restante / this.taxa : null,
            stalledSec: Math.max(0, (agora - this.ultimoAvanco) / 1000),
        };
    }
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    return `${Math.round(bytes / 1e6)} MB`;
}

export function formatRate(bytesPerSec: number): string {
    if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '—';
    if (bytesPerSec >= 1e6) return `${(bytesPerSec / 1e6).toFixed(1)} MB/s`;
    return `${Math.round(bytesPerSec / 1e3)} KB/s`;
}

export function formatEta(segundos: number | null): string {
    if (segundos === null || !Number.isFinite(segundos) || segundos <= 0) return '';
    if (segundos < 60) return `faltam ${Math.ceil(segundos)}s`;
    const min = Math.floor(segundos / 60);
    if (min < 60) return `faltam ~${min} min`;
    return `faltam ~${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

/**
 * A linha que o jogador lê embaixo da barra. É a resposta honesta para "está
 * baixando ou travou?" — e, quando travou, ela diz há quanto tempo em vez de
 * ficar fingindo que ainda vai.
 */
export function downloadLine(sample: DownloadSample): string {
    if (sample.totalBytes <= 0 && sample.bytes <= 0) return 'conectando…';
    const partes: string[] = [];
    partes.push(sample.totalBytes > 0
        ? `${formatBytes(sample.bytes)} de ${formatBytes(sample.totalBytes)}`
        : formatBytes(sample.bytes));
    if (sample.stalledSec >= DOWNLOAD_STALL_SEC) {
        partes.push(`⚠ parado há ${Math.round(sample.stalledSec)}s`);
        return partes.join(' · ');
    }
    partes.push(formatRate(sample.rate));
    const eta = formatEta(sample.etaSec);
    if (eta) partes.push(eta);
    return partes.join(' · ');
}
