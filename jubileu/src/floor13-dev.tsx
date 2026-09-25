/**
 * floor13-dev.tsx — a tela de bancada do ANDAR 12 (`?f13`).
 *
 * Para ver este andar no jogo é preciso atravessar onze andares de elevador, o
 * que num navegador de bancada a ~2 fps passa de meia hora. Esta rota monta o
 * andar sozinho.
 *
 * ── O SOM PRECISA DE UM GESTO ────────────────────────────────────────────────
 *
 * No jogo o `AudioContext` já vem destravado (o jogador clicou em "começar").
 * Aqui não: navegador nenhum deixa tocar som antes de um toque do usuário, e um
 * `AudioContext` criado sem gesto nasce suspenso e fica mudo para sempre. Por
 * isso a tela abre com um botão em vez de já entrar — e o botão é o gesto.
 */
import React, { useState } from 'react';
import Floor13 from './Floor13';
import { configureFloor13Sfx } from './floor13Sfx';

export const Floor13Dev: React.FC = () => {
    const [rodando, setRodando] = useState(false);

    const comecar = () => {
        try {
            const Ctor = window.AudioContext
                ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (Ctor) {
                const ctx = new Ctor();
                void ctx.resume();
                configureFloor13Sfx(ctx);
            }
        } catch { /* sem som é melhor do que sem andar */ }
        setRodando(true);
    };

    // a saída termina dentro da cabine do elevador: na bancada o andar fica
    // parado ali (no jogo o App assume e o elevador segue viagem)
    if (rodando) return <Floor13 onExit={() => { /* fim do andar */ }} inicio={new URLSearchParams(window.location.search).get('inicio') ?? undefined} />;

    return (
        <div style={{
            position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
            background: 'linear-gradient(180deg,#7ec0ef,#3a3f66)', touchAction: 'none',
        }}>
            <button onClick={comecar} style={{
                fontFamily: 'monospace', fontWeight: 900, fontSize: 22, letterSpacing: 2,
                color: '#fff', background: 'linear-gradient(180deg,#e8503a,#b03426)',
                border: '4px solid #11131a', borderRadius: 16, padding: '18px 34px',
                boxShadow: '0 6px 0 #11131a', cursor: 'pointer',
            }}>
                ANDAR 13 — VINDHJEM
            </button>
        </div>
    );
};

export default Floor13Dev;
