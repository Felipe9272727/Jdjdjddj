/**
 * floor12-dev.tsx — a tela de bancada do ANDAR 12 (`?f12`).
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
import Floor12, { configureFloor12Sfx } from './Floor12';

export const Floor12Dev: React.FC = () => {
    const [rodando, setRodando] = useState(false);

    const comecar = () => {
        try {
            const Ctor = window.AudioContext
                ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (Ctor) {
                const ctx = new Ctor();
                void ctx.resume();
                configureFloor12Sfx(ctx);
            }
        } catch { /* sem som é melhor do que sem andar */ }
        setRodando(true);
    };

    if (rodando) return <Floor12 onExit={() => setRodando(false)} />;

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
                ANDAR 12 — A CABEÇA ✈
            </button>
        </div>
    );
};

export default Floor12Dev;
