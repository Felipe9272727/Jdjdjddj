import { describe, expect, it } from 'vitest';
import {
    DownloadMeter, DOWNLOAD_STALL_SEC, downloadLine, formatBytes, formatEta, formatRate,
} from '../npc/floor10Download';

const GB = 1e9;

describe('npc/floor10Download — a barra que responde "está baixando ou travou?"', () => {
    it('conta os bytes e estima a velocidade', () => {
        const m = new DownloadMeter();
        m.reset(0);
        m.push(0, 2 * GB, 0);
        // O primeiro pedaço real só marca o início do relógio (ver o teste da
        // espera antes do primeiro byte); a velocidade sai a partir do próximo.
        m.push(20e6, 2 * GB, 1_000);
        // +100 MB em 5s = 20 MB/s.
        const s = m.push(120e6, 2 * GB, 6_000);
        expect(s.bytes).toBe(120e6);
        expect(s.fraction).toBeCloseTo(0.06, 3);
        expect(s.rate).toBeGreaterThan(15e6);
        expect(s.rate).toBeLessThan(25e6);
        expect(s.etaSec).toBeGreaterThan(0);
        expect(s.stalledSec).toBe(0);
    });

    it('DENUNCIA quando o contador para de andar', () => {
        // Este é o ponto do arquivo inteiro: uma porcentagem parada em 12% é
        // indistinguível de uma que ainda vai andar. O tempo sem avanço, não.
        const m = new DownloadMeter();
        m.reset(0);
        m.push(240e6, 2 * GB, 1_000);
        const parado = m.push(240e6, 2 * GB, 1_000 + 30_000);
        expect(parado.stalledSec).toBeCloseTo(30, 0);
        expect(downloadLine(parado)).toContain('parado há 30s');
        // E enquanto anda, não acusa nada.
        const andando = m.push(300e6, 2 * GB, 1_000 + 31_000);
        expect(andando.stalledSec).toBe(0);
        expect(downloadLine(andando)).not.toContain('parado');
    });

    it('NÃO conta a espera antes do primeiro byte como lentidão', () => {
        // Caso real: 68s abrindo cache/Worker, depois 150 MB de uma vez. A
        // conta ingênua dava "16 KB/s · faltam ~9h09" para um arquivo que
        // terminou 10s depois.
        const m = new DownloadMeter();
        m.reset(0);
        const primeiro = m.push(150e6, 688e6, 68_000);
        expect(primeiro.rate).toBe(0);
        expect(primeiro.etaSec).toBeNull();
        expect(primeiro.bytes).toBe(150e6);
        expect(downloadLine(primeiro)).toContain('150 MB de 688 MB');
        expect(downloadLine(primeiro)).not.toContain('9h');
        // E a partir daí mede o download de verdade: +300 MB em 5s.
        const depois = m.push(450e6, 688e6, 73_000);
        expect(depois.rate).toBeGreaterThan(50e6);
        expect(depois.etaSec).toBeLessThan(10);
    });

    it('não inventa progresso quando o servidor não diz o tamanho', () => {
        const m = new DownloadMeter();
        m.reset(0);
        const s = m.push(50e6, 0, 2_000);
        expect(s.fraction).toBe(0);
        expect(s.etaSec).toBeNull();
        expect(downloadLine(s)).toContain('50 MB');
        expect(downloadLine(s)).not.toContain(' de ');
    });

    it('antes do primeiro byte diz que está conectando, não 0%', () => {
        const m = new DownloadMeter();
        m.reset(0);
        expect(downloadLine(m.push(0, 0, 0))).toBe('conectando…');
    });

    it('o limiar de travamento é generoso o bastante para rede de celular', () => {
        // Celular oscila; acusar "parado" a cada engasgo de 2s seria mentira.
        expect(DOWNLOAD_STALL_SEC).toBeGreaterThanOrEqual(10);
    });

    it('formata em unidades que uma pessoa lê', () => {
        expect(formatBytes(806_058_240)).toBe('806 MB');
        expect(formatBytes(1_915_305_312)).toBe('1.92 GB');
        expect(formatBytes(0)).toBe('0 MB');
        expect(formatRate(1.5e6)).toBe('1.5 MB/s');
        expect(formatRate(250e3)).toBe('250 KB/s');
        expect(formatRate(0)).toBe('—');
        expect(formatEta(45)).toBe('faltam 45s');
        expect(formatEta(600)).toBe('faltam ~10 min');
        expect(formatEta(null)).toBe('');
    });
});
