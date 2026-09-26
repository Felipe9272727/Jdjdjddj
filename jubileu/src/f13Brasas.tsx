/** Brasas da fornalha do Brokk (a placa que fica na boca da fornalha, em [0, 1.05, 0], 1,1 × 0,8 m). */
import React from 'react';
import * as THREE from 'three';

export const BrasasDaFornalha: React.FC = () => (
    <mesh position={[0, 1.05, 0]}><boxGeometry args={[1.1, .12, .8]} /><meshBasicMaterial color={new THREE.Color('#ff7a2a').multiplyScalar(2)} toneMapped={false} /></mesh>
);
