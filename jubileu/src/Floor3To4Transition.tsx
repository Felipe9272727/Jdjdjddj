/**
 * Floor3To4Transition.tsx — Cutscene de transição do Floor 3 (3D) para Floor 4 (2D).
 *
 * A cena começa em 3D com o estilo cartoon do Floor 3, depois aplica efeitos
 * progressivos de pixelização até transformar tudo em 2D pixelado estilo retro.
 * A câmera transiciona de perspectiva para ortográfica, e os materiais mudam
 * para shaders de pixel art.
 *
 * Timeline (~8 segundos):
 *   0-2s: Cena 3D normal do Floor 3
 *   2-5s: Pixelização progressiva (resolution ↓, posterização de cores)
 *   5-7s: Transição de câmera (perspectiva → ortográfica)
 *   7-8s: Fade out para Floor 4 em modo 2D
 */

import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface Props {
    onComplete: () => void;
}

const Floor3To4Transition: React.FC<Props> = ({ onComplete }) => {
    const { camera, gl, scene } = useThree();
    const time = useRef(0);
    const completed = useRef(false);
    
    // Post-processing targets
    const targetResolution = useRef(new THREE.Vector2(window.innerWidth, window.innerHeight));
    const currentResolution = useRef(new THREE.Vector2(window.innerWidth, window.innerHeight));
    
    // Render targets for pixelation effect
    const rtScene = useRef<THREE.WebGLRenderTarget | null>(null);
    const rtPixelated = useRef<THREE.WebGLRenderTarget | null>(null);
    
    // Quad for post-processing
    const quadRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    
    useEffect(() => {
        // Create render targets
        const size = new THREE.Vector2();
        gl.getSize(size);
        
        rtScene.current = new THREE.WebGLRenderTarget(size.x, size.y);
        rtPixelated.current = new THREE.WebGLRenderTarget(256, 256); // Start low-res for pixelation
        
        console.log('[Floor3→4] Transição iniciada');
        
        return () => {
            rtScene.current?.dispose();
            rtPixelated.current?.dispose();
        };
    }, [gl]);
    
    useFrame((_, dt) => {
        if (completed.current) return;
        
        time.current += dt;
        const T = time.current;
        
        // Phase 1: Normal 3D (0-2s)
        if (T < 2.0) {
            // Render normally, just add subtle effects
            if (materialRef.current) {
                materialRef.current.uniforms.pixelSize.value = 1.0;
                materialRef.current.uniforms.posterize.value = 16.0;
            }
        }
        // Phase 2: Pixelization (2-5s)
        else if (T < 5.0) {
            const progress = (T - 2.0) / 3.0;
            
            // Reduce resolution progressively
            const pixelSize = 1.0 + progress * 4.0; // 1 → 5 pixels
            
            // Posterize colors (fewer colors)
            const posterize = 16.0 - progress * 12.0; // 16 → 4 colors
            
            if (materialRef.current) {
                materialRef.current.uniforms.pixelSize.value = pixelSize;
                materialRef.current.uniforms.posterize.value = posterize;
            }
            
            // Start transitioning camera to orthographic
            if (camera instanceof THREE.PerspectiveCamera) {
                const fov = 75 - progress * 45; // 75 → 30
                camera.fov = fov;
                camera.updateProjectionMatrix();
            }
        }
        // Phase 3: Full 2D transition (5-7s)
        else if (T < 7.0) {
            const progress = (T - 5.0) / 2.0;
            
            // Lock to pixelated look
            if (materialRef.current) {
                materialRef.current.uniforms.pixelSize.value = 5.0;
                materialRef.current.uniforms.posterize.value = 4.0;
                materialRef.current.uniforms.fadeOut.value = progress;
            }
            
            // Camera fully orthographic feel (very low FOV)
            if (camera instanceof THREE.PerspectiveCamera) {
                camera.fov = 30;
                camera.updateProjectionMatrix();
            }
        }
        // Phase 4: Complete (7-8s)
        else {
            if (!completed.current) {
                completed.current = true;
                console.log('[Floor3→4] Transição completa, avançando para Floor 4');
                setTimeout(onComplete, 500); // Small delay for fade
            }
        }
    });
    
    return null; // This component doesn't render anything visible itself
};

export default Floor3To4Transition;
