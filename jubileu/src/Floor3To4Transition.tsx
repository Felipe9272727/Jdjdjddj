/**
 * Floor3To4Transition.tsx — Cutscene de transição do Floor 3 (3D) para o Floor 4 (2D).
 *
 * Esta cutscene faz:
 * 1. Começa com a cena 3D normal do Floor 3
 * 2. Gradualmente pixeliza tudo (aumenta o pixel size)
 * 3. Aplica posterização de cores
 * 4. Termina no Floor 4 em modo 2D
 *
 * Duração: ~8 segundos
 */

import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Effect } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';

interface TransitionProps {
    onComplete: () => void;
    duration?: number;
}

// Shader de pixelização progressiva para EffectComposer
const pixelateShader = {
    name: 'PixelateEffect',
    uniforms: {
        tDiffuse: { value: null },
        pixelSize: { value: 1.0 },
        posterize: { value: 16.0 },
        ditherAmount: { value: 0.0 },
        resolution: { value: new THREE.Vector2(1, 1) },
        progress: { value: 0.0 }
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform float pixelSize;
        uniform float posterize;
        uniform float ditherAmount;
        uniform vec2 resolution;
        uniform float progress;
        varying vec2 vUv;
        
        // Bayer matrix 4x4 para dithering
        float bayerDither4x4(vec2 position, float brightness) {
            int x = int(mod(position.x, 4.0));
            int y = int(mod(position.y, 4.0));
            float limit = 0.0;
            
            if (x == 0 && y == 0) limit = 0.0;
            else if (x == 0 && y == 1) limit = 8.0;
            else if (x == 0 && y == 2) limit = 2.0;
            else if (x == 0 && y == 3) limit = 10.0;
            else if (x == 1 && y == 0) limit = 12.0;
            else if (x == 1 && y == 1) limit = 4.0;
            else if (x == 1 && y == 2) limit = 14.0;
            else if (x == 1 && y == 3) limit = 6.0;
            else if (x == 2 && y == 0) limit = 3.0;
            else if (x == 2 && y == 1) limit = 11.0;
            else if (x == 2 && y == 2) limit = 1.0;
            else if (x == 2 && y == 3) limit = 9.0;
            else if (x == 3 && y == 0) limit = 15.0;
            else if (x == 3 && y == 1) limit = 7.0;
            else if (x == 3 && y == 2) limit = 13.0;
            else limit = 5.0;
            
            return brightness < limit / 16.0 ? 0.0 : 1.0;
        }
        
        void main() {
            // Pixelate: snap UVs to grid
            vec2 pixelatedUv = floor(vUv * resolution / pixelSize) * pixelSize / resolution;
            vec4 color = texture2D(tDiffuse, pixelatedUv);
            
            // Posterize: reduce color depth
            color.rgb = floor(color.rgb * posterize) / posterize;
            
            // Dithering for retro feel
            if (ditherAmount > 0.0) {
                float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                float dithered = bayerDither4x4(gl_FragCoord.xy, luma);
                color.rgb = mix(color.rgb, vec3(dithered), ditherAmount * 0.3);
            }
            
            // Fade to black at the end
            if (progress > 0.9) {
                float fadeProgress = (progress - 0.9) / 0.1;
                color.rgb = mix(color.rgb, vec3(0.0), fadeProgress);
            }
            
            gl_FragColor = color;
        }
    `
};

// Custom Effect para o EffectComposer
class PixelateEffect extends Effect {
    constructor() {
        super('PixelateEffect', pixelateShader.fragmentShader, {
            blendFunction: BlendFunction.NORMAL,
            uniforms: new Map([
                ['pixelSize', pixelateShader.uniforms.pixelSize],
                ['posterize', pixelateShader.uniforms.posterize],
                ['ditherAmount', pixelateShader.uniforms.ditherAmount],
                ['resolution', pixelateShader.uniforms.resolution],
                ['progress', pixelateShader.uniforms.progress]
            ])
        });
    }
}

export const Floor3To4Transition: React.FC<TransitionProps> = ({
    onComplete,
    duration = 8
}) => {
    const startTime = useRef(Date.now());
    const [completed, setCompleted] = useState(false);
    
    useEffect(() => {
        console.log('[Transition] 🎬 Iniciando transição 3D → 2D...');
        console.log('[Transition] Duração: 8 segundos');
        
        // Chamar onComplete após a duração
        const timer = setTimeout(() => {
            console.log('[Transition] ✅ Transição completa! Indo para Floor 4...');
            setCompleted(true);
            onComplete();
        }, duration * 1000);
        
        return () => clearTimeout(timer);
    }, [duration, onComplete]);
    
    // Atualizar uniforms a cada frame
    useFrame(({ gl }) => {
        if (completed) return;
        
        const elapsed = (Date.now() - startTime.current) / 1000;
        const progress = Math.min(elapsed / duration, 1.0);
        
        const pixelSize = pixelateShader.uniforms.pixelSize;
        const posterize = pixelateShader.uniforms.posterize;
        const ditherAmount = pixelateShader.uniforms.ditherAmount;
        const resolution = pixelateShader.uniforms.resolution;
        const progressUniform = pixelateShader.uniforms.progress;
        
        // Atualizar resolução
        resolution.value.set(gl.domElement.width, gl.domElement.height);
        
        // Phase 1: Pixelização progressiva (0-60% do tempo)
        if (progress < 0.6) {
            const pixelProgress = progress / 0.6;
            pixelSize.value = 1 + pixelProgress * 7; // 1 → 8 pixels
            posterize.value = 16 - pixelProgress * 12; // 16 → 4 cores
            ditherAmount.value = pixelProgress * 0.5;
        }
        // Phase 2: Manter pixelado (60-90% do tempo)
        else if (progress < 0.9) {
            pixelSize.value = 8;
            posterize.value = 4;
            ditherAmount.value = 0.5;
        }
        // Phase 3: Fade out (90-100% do tempo)
        else {
            pixelSize.value = 8;
            posterize.value = 4;
            ditherAmount.value = 0.5;
        }
        
        progressUniform.value = progress;
    });
    
    if (completed) return null;
    
    return <PixelateEffect />;
};

export default Floor3To4Transition;
