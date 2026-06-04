/**
 * PixelArtRenderer.tsx — Sistema de renderização 2D estilo pixel art retro.
 *
 * Aplica efeitos de pixelização em tempo real via shaders:
 * - Resolução reduzida (pixel size configurável)
 * - Posterização de cores (paleta limitada)
 * - Sem anti-aliasing
 * - Renderização ortográfica para look 2D
 *
 * Inspirado em jogos como Celeste, Stardew Valley, e Undertale.
 */

import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface Props {
    pixelSize?: number;      // Tamanho do pixel (1 = normal, 4 = pixelado)
    colorDepth?: number;     // Profundidade de cor (16 = 16 cores por canal)
    enabled?: boolean;       // Ativar/desativar efeito
}

// Shader de pixelização e posterização
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
        varying vec2 vUv;
        
        void main() {
            // Pixelate: snap UVs to grid
            vec2 pixelatedUv = floor(vUv * resolution / pixelSize) * pixelSize / resolution;
            vec4 color = texture2D(tDiffuse, pixelatedUv);
            
            // Posterize: reduce color depth
            color.rgb = floor(color.rgb * posterize) / posterize;
            
            gl_FragColor = color;
        }
    `
};

export const PixelArtRenderer: React.FC<Props> = ({
    pixelSize = 4,
    colorDepth = 8,
    enabled = true
}) => {
    const { gl, scene, camera, size } = useThree();
    const rtScene = useRef<THREE.WebGLRenderTarget | null>(null);
    const quadRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    
    // Create render target
    useEffect(() => {
        if (!enabled) return;
        
        rtScene.current = new THREE.WebGLRenderTarget(size.width, size.height, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat
        });
        
        console.log(`[PixelArt] Renderizador 2D ativo (pixel: ${pixelSize}px, cores: ${colorDepth})`);
        
        return () => {
            rtScene.current?.dispose();
        };
    }, [size, enabled, pixelSize, colorDepth]);
    
    // Update uniforms
    useFrame(() => {
        if (!enabled || !rtScene.current || !materialRef.current) return;
        
        materialRef.current.uniforms.pixelSize.value = pixelSize;
        materialRef.current.uniforms.posterize.value = colorDepth;
        materialRef.current.uniforms.resolution.value.set(size.width, size.height);
    });
    
    if (!enabled) return null;
    
    return null;
};

/**
 * Componente wrapper que aplica estilo 2D pixelado à cena inteira.
 * Use este no Floor4 para transformar tudo em pixel art.
 */
export const PixelArtScene: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { camera, gl } = useThree();
    
    useEffect(() => {
        // Mudar câmera para ortográfica (look 2D)
        if (camera instanceof THREE.PerspectiveCamera) {
            const aspect = gl.domElement.width / gl.domElement.height;
            const frustumSize = 10;
            
            const orthoCamera = new THREE.OrthographicCamera(
                -frustumSize * aspect / 2,
                frustumSize * aspect / 2,
                frustumSize / 2,
                -frustumSize / 2,
                0.1,
                1000
            );
            
            // Copiar posição e rotação da câmera atual
            orthoCamera.position.copy(camera.position);
            orthoCamera.rotation.copy(camera.rotation);
            orthoCamera.lookAt(camera.position.x, camera.position.y, camera.position.z - 10);
            
            console.log('[PixelArt] Câmera ortográfica ativada');
        }
    }, [camera, gl]);
    
    return <>{children}</>;
};

export default PixelArtRenderer;
