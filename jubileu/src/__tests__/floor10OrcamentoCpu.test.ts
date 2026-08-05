// ── O ORÇAMENTO DE CPU DO 10º ANDAR ───────────────────────────────────────
//
// "meu celular até desligou sozinho". Este arquivo existe para essa conta
// nunca mais ser feita de cabeça.
//
// O aparelho do dono do jogo: 8 núcleos (4 rápidos + 4 lentos), Snapdragon
// 7s Gen 2. São CINCO runtimes no andar, cada um com pool próprio, e nenhum
// deles sabe da existência dos outros — quem impede a soma é o coordenador e
// a fila, não os runtimes.
import { describe, expect, it } from 'vitest';
import { cpuThreadCount, MAX_SPEECH_THREADS } from '../npc/wllamaEngine';
import { FLOOR10_MEMORIA_THREADS } from '../npc/floor10Memoria';
import { FLOOR10_MOTOR_THREADS } from '../npc/floor10MotorBrain';
import { REFLEXO_THREADS } from '../npc/floor10Reflexo';

/** O celular do dono do jogo. */
const NUCLEOS = 8;
/** Só metade é de núcleos rápidos; os lentos atrasam cada barreira do ggml. */
const NUCLEOS_RAPIDOS = 4;

describe('o orçamento de CPU cabe no aparelho', () => {
    it('a fala usa metade dos núcleos, não todos', () => {
        // Medido na bancada: 8 threads deram 0,18-0,23 tok/s contra 2,54-3,86
        // com 4. Pedir tudo não é pedir mais rápido — é parar a máquina.
        expect(cpuThreadCount(true, NUCLEOS)).toBe(NUCLEOS_RAPIDOS);
        expect(cpuThreadCount(true, NUCLEOS)).toBeLessThanOrEqual(MAX_SPEECH_THREADS);
    });

    it('nenhum cérebro de apoio pede mais que dois núcleos', () => {
        expect(FLOOR10_MEMORIA_THREADS).toBeLessThanOrEqual(2);
        expect(FLOOR10_MOTOR_THREADS).toBeLessThanOrEqual(2);
    });

    it('o reflexo pede UM — ele era o que pedia o aparelho inteiro', () => {
        // `env.backends` nunca era configurado, então o onnxruntime-web usava
        // `navigator.hardwareConcurrency`: mais oito threads que ninguém no
        // jogo contabilizava, num runtime que o coordenador nem enxerga.
        expect(REFLEXO_THREADS).toBe(1);
    });

    it('durante uma geração da fala, o orçamento é só o da fala', () => {
        // É esta a invariante que segura o aparelho. Todo o resto — vontade,
        // motor, memória, reflexo — está proibido de subir ou gerar enquanto o
        // SmolLM3 escreve, por `pausarDeliberacao`, `conversaOcupaOAparelho` e
        // `falaGerandoAgora`. Se alguém afrouxar uma dessas três, este teste
        // continua passando e o celular volta a desligar: a conta abaixo é o
        // lembrete de qual é o teto real.
        const durante = cpuThreadCount(true, NUCLEOS);
        expect(durante).toBeLessThanOrEqual(NUCLEOS_RAPIDOS);
    });

    it('mesmo se TUDO subisse junto, o número é o que era antes de hoje', () => {
        // A soma que o aparelho enfrentava quando nada estava serializado.
        // Serve de escala: 13 threads em 8 núcleos já é ruim; com o reflexo
        // pedindo `hardwareConcurrency` eram 20.
        const tudoJunto = cpuThreadCount(true, NUCLEOS)          // fala
            + cpuThreadCount(true, NUCLEOS)                       // vontade
            + FLOOR10_MOTOR_THREADS
            + FLOOR10_MEMORIA_THREADS
            + REFLEXO_THREADS;
        expect(tudoJunto).toBe(13);
        const antesDeHoje = tudoJunto - REFLEXO_THREADS + NUCLEOS;
        expect(antesDeHoje).toBe(20);
        expect(antesDeHoje).toBeGreaterThan(NUCLEOS * 2);
    });
});
