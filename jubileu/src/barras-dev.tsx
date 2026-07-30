/**
 * AS BARRAS DE DOWNLOAD DOS TRÊS CÉREBROS, sem baixar 3,6 GB para vê-las.
 *
 * O painel de conversa do Andar 10 só mostra as barras enquanto os modelos
 * descem — o que significa que, para conferir um detalhe de tela, era preciso
 * repetir um download de horas. Esta página monta o painel DE VERDADE
 * (`Floor10NpcChat`, o mesmo componente do jogo) e empurra números no
 * `npcStore` como se os três estivessem baixando.
 *
 * Serve para responder, olhando: as três barras aparecem juntas? dá para saber
 * qual é qual? o "parado há Ns" muda a cor certa?
 *
 * Abre em:  /barras.html
 */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Floor10NpcChat from './Floor10NpcChat';
import { npcSet } from './npc/npcStore';
import { FLOOR10_MOTOR_MODEL } from './npc/floor10MotorBrain';
import { SMALL_BRAIN_MODEL } from './npc/floor10SmallBrain';
import { SPEECH_BRAIN_BYTES } from './npc/floor10Brains';

const amostra = (
    bytes: number, total: number, rate: number, parado = 0,
) => ({
    fraction: total > 0 ? bytes / total : 0,
    bytes,
    totalBytes: total,
    rate,
    etaSec: rate > 0 ? (total - bytes) / rate : null,
    stalledSec: parado,
});

const Bancada: React.FC = () => {
    // Um relógio só para as barras andarem: uma barra parada na tela não
    // mostra se a transição de largura funciona.
    const [t, setT] = useState(0);
    const [travarMotor, setTravarMotor] = useState(false);
    // O CENÁRIO DO JOGO DE VERDADE: a fala JÁ terminou e só então os pequenos
    // começam. Era exatamente aqui que as barras sumiam, e a bancada não
    // pegava porque eu ligava os três juntos.
    const [comoNoJogo, setComoNoJogo] = useState(true);

    useEffect(() => {
        const id = window.setInterval(() => setT((v) => v + 1), 700);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        const anda = (periodo: number) => (t % periodo) / periodo;
        const fVontade = anda(40);
        const fMotor = anda(23);
        const fFala = anda(70);
        npcSet({
            open: true,
            near: true,
            phase: comoNoJogo ? 'ready' : 'loading',
            modelLabel: '3B',
            loadProgress: fFala,
            loadDownload: amostra(SPEECH_BRAIN_BYTES * fFala, SPEECH_BRAIN_BYTES, 21.4e6),
            loadText: `baixando ${'SmolLM3-3B'}…`,
            deliberationPhase: 'loading',
            deliberationLoadProgress: fVontade,
            deliberationDownload: amostra(
                SMALL_BRAIN_MODEL.bytes * fVontade, SMALL_BRAIN_MODEL.bytes, 18.9e6,
            ),
            deliberationLoadText: `baixando ${SMALL_BRAIN_MODEL.label}…`,
            motorPhase: 'loading',
            motorLoadProgress: fMotor,
            motorDownload: amostra(
                FLOOR10_MOTOR_MODEL.bytes * fMotor,
                FLOOR10_MOTOR_MODEL.bytes,
                travarMotor ? 0 : 6.0e6,
                travarMotor ? 31 : 0,
            ),
            motorLoadText: `baixando ${FLOOR10_MOTOR_MODEL.label}…`,
            storage: {
                quota: 12.4e9, usage: 1.1e9,
                needBytes: Math.ceil(SPEECH_BRAIN_BYTES * 1.08),
            },
        });
    }, [t, travarMotor, comoNoJogo]);

    return (
        <>
            <div style={{
                position: 'fixed', zIndex: 200, left: 12, bottom: 12,
                color: '#cfd6e4', font: '13px system-ui, sans-serif',
            }}
            >
                <button
                    type="button"
                    onClick={() => setComoNoJogo((v) => !v)}
                    style={{
                        padding: '8px 12px', borderRadius: 10, border: '1px solid #333',
                        background: comoNoJogo ? '#2d6cdf' : '#20202a', color: '#fff',
                        fontSize: 13, cursor: 'pointer', marginRight: 8,
                    }}
                >
                    {comoNoJogo ? 'fala PRONTA (como no jogo)' : 'fala baixando junto'}
                </button>
                <button
                    type="button"
                    onClick={() => setTravarMotor((v) => !v)}
                    style={{
                        padding: '8px 12px', borderRadius: 10, border: '1px solid #333',
                        background: travarMotor ? '#c2554a' : '#20202a', color: '#fff',
                        fontSize: 13, cursor: 'pointer',
                    }}
                >
                    {travarMotor ? 'destravar o motor' : 'travar o motor (⚠ parado)'}
                </button>
            </div>
            <Floor10NpcChat />
        </>
    );
};

createRoot(document.getElementById('root')!).render(<Bancada />);
(window as unknown as { __barras?: boolean }).__barras = true;
