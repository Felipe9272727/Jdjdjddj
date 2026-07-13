import React, { forwardRef, useMemo } from 'react';
import * as THREE from 'three';
import { createFloor7V2Materials } from './materials';
import { FLOOR7_HELM } from './helm';

/** A real quarterdeck wheel, positioned in front of the cabin and within reach. */
export const Floor7HelmV2 = forwardRef<THREE.Group>(function Floor7HelmV2(_, wheelRef) {
    const M = useMemo(createFloor7V2Materials, []);
    return (
        <group name="floor7-v2-helm-station">
            {/* Broad binnacle: visually anchors the wheel to the raised deck. */}
            <mesh position={[FLOOR7_HELM.wheelX, 0.82, FLOOR7_HELM.wheelZ - 0.08]} material={M.darkWood} castShadow receiveShadow>
                <boxGeometry args={[0.52, 0.52, 0.38]} />
            </mesh>
            <mesh position={[FLOOR7_HELM.wheelX, 1.08, FLOOR7_HELM.wheelZ - 0.08]} material={M.brass} castShadow>
                <cylinderGeometry args={[0.16, 0.2, 0.08, 12]} />
            </mesh>
            <mesh position={[FLOOR7_HELM.wheelX, 1.13, FLOOR7_HELM.wheelZ - 0.08]} material={M.glass}>
                <sphereGeometry args={[0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            </mesh>

            {/* The forwarded group rotates around Z when the captain steers. */}
            <group ref={wheelRef} name="floor7-v2-wheel" position={[FLOOR7_HELM.wheelX, FLOOR7_HELM.wheelY, FLOOR7_HELM.wheelZ]}>
                <mesh material={M.trim} castShadow><torusGeometry args={[0.4, 0.055, 8, 24]} /></mesh>
                {Array.from({ length: 8 }).map((_, i) => {
                    const a = (i / 8) * Math.PI * 2;
                    return (
                        <React.Fragment key={i}>
                            <mesh rotation={[0, 0, a]} material={M.trim} castShadow>
                                <boxGeometry args={[0.045, 0.94, 0.045]} />
                            </mesh>
                            <mesh position={[Math.sin(a) * 0.47, Math.cos(a) * 0.47, 0]} material={M.darkWood} castShadow>
                                <sphereGeometry args={[0.075, 8, 6]} />
                            </mesh>
                        </React.Fragment>
                    );
                })}
                <mesh rotation={[Math.PI / 2, 0, 0]} material={M.brass} castShadow>
                    <cylinderGeometry args={[0.09, 0.09, 0.22, 12]} />
                </mesh>
            </group>

        </group>
    );
});

export default Floor7HelmV2;
