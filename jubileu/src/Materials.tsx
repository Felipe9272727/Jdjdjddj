import React, { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

export const TextureMaterial = React.memo(({ url, color = "#ffffff", repeat = [1, 1], roughness = 0.8, metalness = 0.0, bumpScale = 0.0, transparent = false, opacity = 1.0, rotation = 0 }: any) => {
    const rawTexture = useTexture(url);
    const texture = Array.isArray(rawTexture) ? rawTexture[0] : rawTexture;
    const rKey = repeat.join(',');
    const map = useMemo(() => {
        const c = (texture as THREE.Texture).clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(repeat[0], repeat[1]);
        if (rotation !== 0) { c.center.set(0.5, 0.5); c.rotation = rotation; }
        c.needsUpdate = true; return c;
    }, [texture, rKey, rotation]);
    return <meshStandardMaterial map={map} color={color} roughness={roughness} metalness={metalness} bumpMap={bumpScale > 0 ? map : undefined} bumpScale={bumpScale} transparent={transparent} opacity={opacity} />;
});
