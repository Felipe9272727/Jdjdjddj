/**
 * Floor9Cutscene.tsx — a QUEDA pela copa (montar DEPOIS do <Player>).
 *
 * As portas marcadas "9" abrem e não há chão: a câmera despenca pela copa —
 * folhas riscando, raios de deus girando — freia no susto perto do chão
 * (a floresta "aceita") e assenta na altura dos olhos. Aí o f9QuedaDone()
 * devolve pro Player, e as legendas de chegada assumem.
 */
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { f9, f9QuedaDone, F9_POUSO } from './f9Floresta';
import { rng } from './Floor6Textures';

const QUEDA_LEN = 5.2;

const Floor9Cutscene: React.FC = () => {
    const { camera } = useThree();
    const wasActive = useRef(false);
    const t = useRef(0);
    const leaves = useRef<THREE.Points>(null!);
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry(), n = 130, a = new Float32Array(n * 3), r = rng(931);
        for (let i = 0; i < n; i++) { a[i * 3] = (r() * 2 - 1) * 7; a[i * 3 + 1] = r() * 30 - 4; a[i * 3 + 2] = (r() * 2 - 1) * 7; }
        g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return g;
    }, []);
    const mat = useMemo(() => new THREE.PointsMaterial({ color: '#4a7a3c', size: 0.16, transparent: true, opacity: 0, depthWrite: false }), []);

    useFrame((_s, rawDt) => {
        const active = f9.phase === 'queda';
        if (!active) {
            if (wasActive.current) { wasActive.current = false; camera.up.set(0, 1, 0); mat.opacity = 0; if (leaves.current) leaves.current.visible = false; }
            return;
        }
        if (!wasActive.current) { wasActive.current = true; t.current = 0; if (leaves.current) leaves.current.visible = true; }
        const dt = Math.min(rawDt, 0.05);
        t.current += dt;
        const k = Math.min(1, t.current / QUEDA_LEN);
        // altura: despenca rápido, freia forte no fim (easing out quíntico invertido)
        const fall = 1 - Math.pow(1 - k, 3.2);
        const y = 30 - fall * 28.5;
        const [px, pz] = F9_POUSO;
        const spin = (1 - k) * 2.4;
        camera.position.set(px + Math.sin(t.current * 3.1) * (1 - k) * 0.9, y, pz + Math.cos(t.current * 2.7) * (1 - k) * 0.9);
        const roll = Math.sin(t.current * 2.2) * (1 - k) * 0.35;
        camera.up.set(Math.sin(roll), Math.cos(roll), 0);
        camera.lookAt(px + Math.sin(spin) * 2, Math.max(0.4, y - 6), pz + Math.cos(spin) * 2 - 2);
        const cam = camera as THREE.PerspectiveCamera;
        cam.fov += ((k > 0.86 ? 52 : 74) - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix();
        // folhas subindo em relação à câmera que cai
        if (leaves.current) {
            leaves.current.position.set(px, y - 6, pz);
            const arr = (geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
            for (let i = 1; i < arr.length; i += 3) { arr[i] += dt * (14 * (1 - k) + 1); if (arr[i] > 16) arr[i] = -6; }
            (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
            mat.opacity = Math.min(0.9, (1 - k) * 1.4);
        }
        if (t.current >= QUEDA_LEN) f9QuedaDone();
    });

    return <points ref={leaves} geometry={geo} material={mat} visible={false} />;
};

export default Floor9Cutscene;
