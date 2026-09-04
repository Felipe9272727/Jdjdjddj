/**
 * AS BARRAS DE DOWNLOAD DOS QUATRO CÉREBROS, sem baixar 4,2 GB para vê-las.
 *
 * O painel de conversa do Andar 10 só mostra as barras enquanto os modelos
 * descem — o que significa que, para conferir um detalhe de tela, era preciso
 * repetir um download de horas. Esta página monta o painel DE VERDADE
 * (`Floor10NpcChat`, o mesmo componente do jogo) e empurra números no
 * `npcStore` como se os quatro estivessem baixando.
 *
 * Serve para responder, olhando: as barras aparecem juntas? dá para saber
 * qual é qual? o "parado há Ns" muda a cor certa?
 *
 * Abre em:  /barras.html
 */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Floor10NpcChat from './Floor10NpcChat';
import { npcSet } from './npc/npcStore';
import {
    floor10Fila, FILA_FALA, FILA_VONTADE, FILA_MOTOR, FILA_MEMORIA,
} from './npc/floor10Fila';
import { FLOOR10_MOTOR_MODEL } from './npc/floor10MotorBrain';
import { SMALL_BRAIN_MODEL } from './npc/floor10SmallBrain';
import { SPEECH_BRAIN_BYTES } from './npc/floor10Brains';
import { FLOOR10_MEMORIA_MODEL } from './npc/floor10Memoria';

// ── ESTA PÁGINA É BANCADA, E PRECISA DIZER ISSO ANTES DE PINTAR ───────────
//
// A tela do jogo esconde bytes, taxa, "parado há Ns" e o nome do gguf desde
// que o dono do jogo disse que ela "parece algo dev-only" — e quem decide isso
// é `bancadaLigada`, que olha a query string. `/barras.html` não tem query
// string nenhuma, e sem esta linha a bancada das barras passaria a ver
// exatamente a tela do jogador: perderia o "parado há 31s" que ela existe para
// conferir (ver o botão "travar o download" lá embaixo).
(globalThis as { __f10Bancada?: boolean }).__f10Bancada = true;

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
    // O PAINEL DO PENSAMENTO. Ele nunca aparece junto com a barra (enquanto
    // baixa não há pensamento), então a bancada troca de cena em vez de
    // empilhar as duas — que é o erro que já me fez aprovar uma tela que o
    // jogo nunca mostra.
    const [pensando, setPensando] = useState(false);

    useEffect(() => {
        const id = window.setInterval(() => setT((v) => v + 1), 700);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        if (!pensando) return;
        // Texto crescendo, como o modelo escreve: é assim que dá para ver se a
        // caixa acompanha, se o cursor pisca e se ela não estoura a tela.
        const frases = [
            'A porta do elevador continua ali, do mesmo jeito de ontem.',
            ' Eu já contei os riscos do metal umas quarenta vezes,',
            ' e mesmo assim volto a olhar como se fosse a primeira.',
            '\n\nTem alguém do outro lado da sala. Não sei há quanto tempo.',
            '\n\nCHOICE: inspect-elevator',
        ];
        const parcial = frases.slice(0, 1 + (t % (frases.length + 2))).join('');
        npcSet({
            open: false, near: true,
            phase: 'ready',
            deliberationPhase: t % (frases.length + 2) >= frases.length
                ? 'decided' : 'thinking',
            deliberationLive: parcial,
            deliberationTps: 4.5,
            deliberationThreads: 8,
            deliberationSeconds: (t % 40) + 3,
            deliberationGoal: 'inspect-elevator',
            motorPhase: 'off',
            memoriaPhase: 'ready',
        });
    }, [t, pensando]);

    useEffect(() => {
        if (pensando) return;
        const anda = (periodo: number) => (t % periodo) / periodo;
        const fVontade = anda(40);
        const fMotor = anda(23);
        const fMemoria = anda(17);
        const fFala = anda(70);
        // Alimenta a FILA do mesmo jeito que os motores alimentam em jogo.
        if (comoNoJogo) floor10Fila.concluir(FILA_FALA);
        else floor10Fila.progresso(FILA_FALA, amostra(SPEECH_BRAIN_BYTES * fFala, SPEECH_BRAIN_BYTES, 21.4e6));
        floor10Fila.progresso(FILA_VONTADE, amostra(
            SMALL_BRAIN_MODEL.bytes * fVontade, SMALL_BRAIN_MODEL.bytes, 18.9e6,
        ));
        // A memória é a ÚLTIMA da fila, então é ela que a barra única está
        // mostrando — e por isso é nela que o botão de travar precisa bater:
        // travar um modelo que não é o atual não muda nada na tela do jogo.
        floor10Fila.progresso(FILA_MEMORIA, amostra(
            FLOOR10_MEMORIA_MODEL.bytes * fMemoria,
            FLOOR10_MEMORIA_MODEL.bytes,
            travarMotor ? 0 : 9.4e6,
            travarMotor ? 31 : 0,
        ));
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
            memoriaPhase: 'loading',
            memoriaLoadProgress: fMemoria,
            memoriaDownload: amostra(
                FLOOR10_MEMORIA_MODEL.bytes * fMemoria,
                FLOOR10_MEMORIA_MODEL.bytes,
                travarMotor ? 0 : 9.4e6,
                travarMotor ? 31 : 0,
            ),
            memoriaLoadText: `baixando ${FLOOR10_MEMORIA_MODEL.label}…`,
            storage: {
                quota: 12.4e9, usage: 1.1e9,
                needBytes: Math.ceil(SPEECH_BRAIN_BYTES * 1.08),
            },
        });
    }, [t, travarMotor, comoNoJogo, pensando]);

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
                    onClick={() => setPensando((v) => !v)}
                    style={{
                        padding: '8px 12px', borderRadius: 10, border: '1px solid #333',
                        background: pensando ? '#6b3fa0' : '#20202a', color: '#fff',
                        fontSize: 13, cursor: 'pointer', marginRight: 8,
                    }}
                >
                    {pensando ? 'voltar às barras' : 'ver o pensamento'}
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
                    {travarMotor ? 'destravar o download' : 'travar o download (⚠ parado)'}
                </button>
            </div>
            <Floor10NpcChat />
        </>
    );
};

createRoot(document.getElementById('root')!).render(<Bancada />);
(window as unknown as { __barras?: boolean }).__barras = true;
