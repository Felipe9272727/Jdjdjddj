/**
 * Floor3To4Transition.tsx — Cutscene de transição do Floor 3 (3D) para o Floor 4 (2D).
 *
 * Esta cutscene faz:
 * 1. Começa com a cena 3D normal do Floor 3
 * 2. Gradualmente pixeliza tudo (aumenta o pixel size)
 * 3. Aplica posterização de cores
 * 4. Converte a câmera para ortográfica
 * 5. Termina no Floor 4 em modo 2D
 *
 * Duração: ~8 segundos
 */

import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface TransitionProps {
    onComplete: () => void;  // Callback quando a transição termina
    duration?: number;       // Duração em segundos (default: 8)
}

/**
 * Shader de pixelização progressiva
 */
const pixelateShader = {
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float pixelSize;
        uniform float posterize;
        uniform vec2 resolution;
        uniform float ditherAmount;
        varying vec2 vUv;
        
        // Bayer matrix 4x4 para dithering
        float bayerDither4x4(vec2 position, float brightness) {
            int x = int(mod(position.x, 4.0));
            int y = int(mod(position.y, 4.0));
            int index = x + y * 4;
            float limit = 0.0;
            
            if (x == 0) {
                if (y == 0) limit = 0.0;
                else if (y == 1) limit = 8.0;
                else if (y == 2) limit = 2.0;
                else limit = 10.0;
            } else if (x == 1) {
                if (y == 0) limit = 12.0;
                else if (y == 1) limit = 4.0;
                else if (y == 2) limit = 14.0;
                else limit = 6.0;
            } else if (x == 2) {
                if (y == 0) limit = 3.0;
                else if (y == 1) limit = 11.0;
                else if (y == 2) limit = 1.0;
                else limit = 9.0;
            } else {
                if (y == 0) limit = 15.0;
                else if (y == 1) limit = 7.0;
                else if (y == 2) limit = 13.0;
                else limit = 5.0;
            }
            
            return brightness < limit / 16.0 ? 0.0 : 1.0;
        }
        
        void main() {
            // Pixelate: snap UVs to grid
            vec2 pixelatedUv = floor(vUv * resolution / pixelSize) * pixelSize / resolution;
            vec4 color = texture2D(tDiffuse, pixelatedUv);
            
            // Posterize: reduce color depth
            color.rgb = floor(color.rgb * posterize) / posterize;
            
            // Optional dithering for retro feel
            if (ditherAmount > 0.0) {
                float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                float dithered = bayerDither4x4(gl_FragCoord.xy, luma);
                color.rgb = mix(color.rgb, vec3(dithered), ditherAmount * 0.3);
            }
            
            gl_FragColor = color;
        }
    `
};

export const Floor3To4Transition: React.FC<TransitionProps> = ({
    onComplete,
    duration = 8
}) => {
    const { gl, scene, camera, size } = useThree();
    const [phase, setPhase] = useState<'pixelating' | 'ortho' | 'complete'>('pixelating');
    const startTime = useRef(Date.now());
    const rtScene = useRef<THREE.WebGLRenderTarget | null>(null);
    const quadRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    const originalCamera = useRef<THREE.Camera | null>(null);
    
    // Salvar câmera original
    useEffect(() => {
        originalCamera.current = camera;
        console.log('[Transition] Iniciando transição 3D → 2D...');
    }, [camera]);
    
    // Criar render target
    useEffect(() => {
        rtScene.current = new THREE.WebGLRenderTarget(size.width, size.height, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat
        });
        
        return () => {
            rtScene.current?.dispose();
        };
    }, [size]);
    
    // Atualizar shader a cada frame
    useFrame(() => {
        if (!rtScene.current || !quadRef.current || !materialRef.current) return;
        
        const elapsed = (Date.now() - startTime.current) / 1000;
        const progress = Math.min(elapsed / duration, 1.0);
        
        // Phase 1: Pixelização progressiva (0-60% do tempo)
        if (progress < 0.6 && phase === 'pixelating') {
            const pixelProgress = progress / 0.6;
            materialRef.current.uniforms.pixelSize.value = 1 + pixelProgress * 7; // 1 → 8 pixels
            materialRef.current.uniforms.posterize.value = 16 - pixelProgress * 12; // 16 → 4 cores
            materialRef.current.uniforms.ditherAmount.value = pixelProgress * 0.5;
        }
        
        // Phase 2: Converter para ortográfica (60-90% do tempo)
        if (progress >= 0.6 && progress < 0.9 && phase === 'pixelating') {
            setPhase('ortho');
            console.log('[Transition] Convertendo para câmera ortográfica...');
            
            // Criar câmera ortográfica
            const aspect = size.width / size.height;
            const frustumSize = 10;
            const orthoCamera = new THREE.OrthographicCamera(
                -frustumSize * aspect / 2,
                frustumSize * aspect / 2,
                frustumSize / 2,
                -frustumSize / 2,
                0.1,
                1000
            );
            orthoCamera.position.copy(camera.position);
            orthoCamera.rotation.copy(camera.rotation);
            
            // Trocar câmera
            scene.remove(camera);
            scene.add(orthoCamera);
        }
        
        // Phase 3: Finalizar (90-100% do tempo)
        if (progress >= 0.9 && phase !== 'complete') {
            setPhase('complete');
            console.log('[Transition] Transição completa! Indo para Floor 4...');
            
            // Fade out
            materialRef.current.uniforms.pixelSize.value = 8;
            materialRef.current.uniforms.posterize.value = 4;
            
            // Chamar callback após um frame
            setTimeout(() => {
                onComplete();
            }, 500);
        }
        
        // Renderizar cena para o render target
        gl.setRenderTarget(rtScene.current);
        gl.render(scene, camera);
        gl.setRenderTarget(null);
        
        // Renderizar quad com shader
        materialRef.current.uniforms.tDiffuse.value = rtScene.current.texture;
    });
    
    if (!rtScene.current) return null;
    
    return (
        <mesh ref={quadRef}>
            <planeGeometry args={[2, 2]} />
            <shaderMaterial
                ref={materialRef}
                args={[pixelateShader]}
                uniforms={{
                    tDiffuse: { value: null },
                    pixelSize: { value: 1 },
                    posterize: { value: 16 },
                    resolution: { value: new THREE.Vector2(size.width, size.height) },
                    ditherAmount: { value: 0 }
                }}
                depthTest={false}
                depthWrite={false}
            />
        </mesh>
    );
};


export default Floor3To4Transition;
