// A CHEGADA ao Andar 14 (Kessar-9): plano A e B do Blender, o POV do sufoco (quadro C do Blender
// animado aqui) e os gráficos do Manim (título KESSAR-9 e a linha da respiração achatando).
// Quadros em public/ch14/: A_0001…A_0072, B_0060…B_0120, C_0001, Titulo0000…, Folego0000…
import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, Sequence } from 'remotion';

export const DUR = 252;
const pad = (n, w = 4) => String(n).padStart(w, '0');
const TIT = 70, FOL = 109;   // quadros do Manim

export function Chegada14() {
    const f = useCurrentFrame();
    // ── plano A (0–71) e B (72–132) ──
    const placa = f < 72 ? `ch14/A_${pad(f + 1)}.jpg` : f < 133 ? `ch14/B_${pad(f - 72 + 60)}.jpg` : null;
    // ── POV (133–251): treme, embaça e pulsa vermelho; o capacete brilha lá na frente ──
    const p = f - 133, k = Math.max(0, p) / (DUR - 133);
    const batida = Math.pow(Math.max(0, Math.sin(p * .35)), 6);              // o coração
    const treme = p > 0 ? Math.sin(p * 1.7) * (3 + k * 9) : 0;
    const desfoque = p > 0 ? 1.5 + k * 5 + batida * 3 : 0;
    const escurece = interpolate(f, [228, 251], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const flash = interpolate(f, [12, 17, 30], [0, .85, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (
        <AbsoluteFill style={{ background: '#000' }}>
            {placa && <Img src={staticFile(placa)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            {p >= 0 && <AbsoluteFill style={{ transform: `translate(${treme}px, ${treme * .6}px) scale(${1.04 + k * .08}) rotate(${Math.sin(p * .2) * 2 * k}deg)`, filter: `blur(${desfoque}px) saturate(${1 - k * .6})` }}>
                <Img src={staticFile('ch14/C_0001.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </AbsoluteFill>}
            {p >= 0 && <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, transparent ${50 - k * 30}%, rgba(110,0,12,${.35 + batida * .35 + k * .4}) 100%)` }} />}
            {/* o clarão da porta abrindo */}
            <AbsoluteFill style={{ background: '#ffd9a0', opacity: flash, mixBlendMode: 'screen' }} />
            {/* Manim: o título sobre os planos A/B, a respiração no POV */}
            <Sequence from={24} durationInFrames={TIT}><Quadros prefixo="ch14/Titulo" total={TIT} /></Sequence>
            <Sequence from={133} durationInFrames={FOL}><Quadros prefixo="ch14/Folego" total={FOL} /></Sequence>
            <AbsoluteFill style={{ background: '#000', opacity: escurece }} />
        </AbsoluteFill>
    );
}
function Quadros({ prefixo, total }) {
    const f = Math.min(total - 1, useCurrentFrame());
    return <Img src={staticFile(`${prefixo}${pad(f)}.png`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}
