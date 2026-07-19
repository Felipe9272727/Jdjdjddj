/**
 * A ENTREGA — cutscene final do Arquivista.
 *
 * Monta depois do Player para ser a última dona da câmera. O personagem é a
 * prancha 4×2 pintada no ChatGPT Image: livro fechado → aproximação → mãos no
 * casaco → empurrão. O relógio puro de f8Finale também dirige as barras e o
 * blackout em Floor8Overlay, então o sprite nunca termina antes do plano.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import archivistAtlasUrl from './assets/f8/archivist-finale-atlas-v1.png';
import elevatorGoneUrl from './assets/f8/elevator-out-of-service-v1.png';
import memoryVortexUrl from './assets/f8/finale-memory-vortex-atlas-v2.png';
import {
    f8finale,
    f8FinaleProgress,
    f8FinaleTick,
    type F8FinaleBeat,
} from './f8Finale';
import { f8BeginThrow } from './f8Arquivo';

function setAtlasFrame(geometry: THREE.PlaneGeometry, frame: number, cols: number, rows: number): void {
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const col = frame % cols;
    const row = Math.floor(frame / cols);
    for (let i = 0; i < uv.count; i++) {
        const x = i === 1 || i === 3 ? 1 : 0;
        const y = i < 2 ? 1 : 0;
        uv.setXY(i, (col + x) / cols, 1 - (row + 1 - y) / rows);
    }
    uv.needsUpdate = true;
}

const ease = (v: number): number => {
    const x = THREE.MathUtils.clamp(v, 0, 1);
    return x * x * (3 - 2 * x);
};

interface SpritePose {
    frame: number;
    next: number;
    mix: number;
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
}

function archivistPose(beat: F8FinaleBeat): SpritePose {
    const p = f8FinaleProgress(beat);
    if (beat === 'turn') return { frame: 0, next: 1, mix: ease(p), x: 0, y: 1.25, z: -3.75, width: 2.15, height: 2.3 };
    if (beat === 'reveal') return { frame: 1, next: 2, mix: ease(p), x: 0, y: 1.27, z: -3.75, width: 2.15, height: 2.3 };
    if (beat === 'approach') return {
        frame: p < 0.58 ? 2 : 4,
        next: p < 0.58 ? 4 : 5,
        mix: p < 0.58 ? ease(p / 0.58) : ease((p - 0.58) / 0.42),
        x: Math.sin(p * Math.PI) * 0.08,
        y: 1.28,
        z: THREE.MathUtils.lerp(-3.75, -6.3, ease(p)),
        width: THREE.MathUtils.lerp(2.15, 2.65, p),
        height: THREE.MathUtils.lerp(2.3, 2.55, p),
    };
    if (beat === 'grip') return { frame: 5, next: 6, mix: ease(p), x: 0, y: 1.42, z: -6.72, width: 3.25, height: 2.72 };
    if (beat === 'push') return { frame: 6, next: 7, mix: ease(p * 1.35), x: 0, y: 1.5, z: -6.88, width: 4.2, height: 3.05 };
    if (beat === 'black' || beat === 'done') return { frame: 7, next: 7, mix: 0, x: 0, y: 1.5, z: -6.88, width: 4.2, height: 3.05 };
    return { frame: 0, next: 0, mix: 0, x: 0, y: 1.25, z: -3.75, width: 2.15, height: 2.3 };
}

const Floor8FinaleCutscene: React.FC<{
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    onDone: () => void;
}> = ({ playerPositionRef, onDone }) => {
    const { camera } = useThree();
    const archivistRoot = useRef<THREE.Group>(null!);
    const archivistA = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const archivistB = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const memoryHalo = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const memoryBurst = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const memoryLight = useRef<THREE.PointLight>(null!);
    const lastFrames = useRef([-1, -1]);
    const lastMemoryFrames = useRef([-1, -1]);
    const lastBeat = useRef<F8FinaleBeat>('idle');
    const calledDone = useRef(false);
    const look = useRef(new THREE.Vector3());

    const atlas = useMemo(() => {
        const t = new THREE.TextureLoader().load(archivistAtlasUrl);
        t.colorSpace = THREE.SRGBColorSpace;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        return t;
    }, []);
    const elevator = useMemo(() => {
        const t = new THREE.TextureLoader().load(elevatorGoneUrl);
        t.colorSpace = THREE.SRGBColorSpace;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        return t;
    }, []);
    const memoryVortex = useMemo(() => {
        const t = new THREE.TextureLoader().load(memoryVortexUrl);
        t.colorSpace = THREE.SRGBColorSpace;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        return t;
    }, []);

    useEffect(() => () => {
        atlas.dispose();
        elevator.dispose();
        memoryVortex.dispose();
        camera.up.set(0, 1, 0);
    }, [atlas, elevator, memoryVortex, camera]);

    useFrame((_state, rawDt) => {
        const beat = f8FinaleTick(Math.min(rawDt, 0.05));
        if (beat === 'idle') return;
        if (beat !== lastBeat.current) {
            if (beat === 'push') f8BeginThrow();
            lastBeat.current = beat;
        }
        if (beat === 'done') {
            if (!calledDone.current) { calledDone.current = true; onDone(); }
            return;
        }

        // A posição lógica não pode continuar atravessando a sala enquanto a
        // câmera é cinematográfica. Também é o ponto de partida do Andar 9.
        playerPositionRef.current.set(0, 0, -7.35);

        const P = new THREE.Vector3();
        const T = look.current;
        let fov = 48;
        let roll = 0;
        if (beat === 'door') {
            const p = f8FinaleProgress('door');
            P.set(Math.sin(f8finale.t * 0.55) * 0.018, 1.58, -7.28 - p * 0.12);
            T.set(0, 1.48, -9.86);
            fov = 45;
        } else if (beat === 'turn') {
            const p = ease(f8FinaleProgress('turn'));
            const a = Math.PI * p;
            P.set(0, 1.59, -7.38);
            T.set(P.x + Math.sin(a) * 2.1, 1.46, P.z - Math.cos(a) * 2.8);
            roll = Math.sin(p * Math.PI) * -0.055;
            fov = 47;
        } else if (beat === 'reveal') {
            const p = ease(f8FinaleProgress('reveal'));
            P.set(-0.16 + p * 0.1, 1.58, -7.4 + p * 0.16);
            T.set(0, 1.48, -3.82);
            fov = 43 - p * 3;
        } else if (beat === 'approach') {
            const p = ease(f8FinaleProgress('approach'));
            P.set(Math.sin(f8finale.t * 8) * p * 0.008, 1.58, -7.24 - p * 0.42);
            T.set(0, 1.48, THREE.MathUtils.lerp(-3.78, -6.12, p));
            fov = 40 + p * 5;
        } else if (beat === 'grip') {
            const p = ease(f8FinaleProgress('grip'));
            const shake = p * 0.025;
            P.set(Math.sin(f8finale.t * 31) * shake, 1.62 + Math.cos(f8finale.t * 27) * shake, -7.72);
            T.set(0, 1.48, -6.62);
            fov = 47 + p * 5;
            roll = Math.sin(f8finale.t * 18) * shake;
        } else {
            const p = ease(f8FinaleProgress('push'));
            const kick = Math.sin(Math.min(1, p * 1.4) * Math.PI);
            P.set(Math.sin(f8finale.t * 42) * 0.045 * kick, 1.63 - p * 0.45, -7.76 - p * 1.5);
            T.set(0, 1.46 + p * 0.5, -6.68);
            fov = 52 + p * 16;
            roll = p * -0.32 + Math.sin(f8finale.t * 36) * 0.04 * kick;
        }
        camera.position.copy(P);
        camera.up.set(Math.sin(roll), Math.cos(roll), 0);
        camera.lookAt(T);
        const perspective = camera as THREE.PerspectiveCamera;
        perspective.fov += (fov - perspective.fov) * Math.min(1, rawDt * 10);
        perspective.updateProjectionMatrix();

        // O hotel perde a forma entre o olhar e o empurrão: primeiro só o fio
        // vermelho e poeira, depois páginas/chaves girando, por fim o rasgo
        // verde que já pertence ao Viveiro. São dois billboards do atlas
        // pintado (halo atrás do Arquivista + impacto diante da câmera), nunca
        // geometria procedural fingindo ser a animação principal.
        const halo = memoryHalo.current;
        const burst = memoryBurst.current;
        const memoryVisible = beat === 'turn' || beat === 'reveal' || beat === 'approach' || beat === 'grip' || beat === 'push';
        if (halo && burst) {
            halo.visible = memoryVisible;
            burst.visible = beat === 'grip' || beat === 'push';
            if (memoryVisible) {
                const revealP = beat === 'reveal' ? ease(f8FinaleProgress('reveal')) : 0;
                const approachP = beat === 'approach' ? ease(f8FinaleProgress('approach')) : 0;
                const gripP = beat === 'grip' ? ease(f8FinaleProgress('grip')) : 0;
                const pushP = beat === 'push' ? ease(f8FinaleProgress('push')) : 0;
                const haloFrame = beat === 'turn' ? 0
                    : beat === 'reveal' ? Math.min(1, Math.floor(revealP * 2))
                    : beat === 'approach' ? 1 + Math.min(2, Math.floor(approachP * 3))
                    : beat === 'grip' ? 3 + Math.min(1, Math.floor(gripP * 2))
                    : 4 + Math.min(3, Math.floor(pushP * 4));
                if (lastMemoryFrames.current[0] !== haloFrame) {
                    lastMemoryFrames.current[0] = haloFrame;
                    setAtlasFrame(halo.geometry, haloFrame, 4, 2);
                }
                const haloP = beat === 'approach' ? approachP : beat === 'grip' ? 1 : beat === 'push' ? 1 : revealP;
                halo.position.set(0, 1.48, THREE.MathUtils.lerp(-3.7, -6.42, haloP));
                halo.lookAt(camera.position);
                const haloScale = THREE.MathUtils.lerp(3.4, 5.8, haloP);
                halo.scale.set(haloScale, haloScale, 1);
                halo.rotation.z += rawDt * (beat === 'push' ? 1.8 : 0.34);
                halo.material.opacity = beat === 'turn' ? 0.08
                    : beat === 'reveal' ? 0.12 + revealP * 0.1
                    : beat === 'approach' ? 0.18 + approachP * 0.12
                    : beat === 'grip' ? 0.34
                    : 0.34 * (1 - pushP * 0.72);

                if (burst.visible) {
                    const impactP = beat === 'grip' ? gripP * 0.35 : 0.35 + pushP * 0.65;
                    const burstFrame = beat === 'grip'
                        ? 4 + Math.min(1, Math.floor(gripP * 2))
                        : 5 + Math.min(2, Math.floor(pushP * 3));
                    if (lastMemoryFrames.current[1] !== burstFrame) {
                        lastMemoryFrames.current[1] = burstFrame;
                        setAtlasFrame(burst.geometry, burstFrame, 4, 2);
                    }
                    burst.position.set(0, 1.52, THREE.MathUtils.lerp(-6.55, -7.58, impactP));
                    burst.lookAt(camera.position);
                    const burstScale = THREE.MathUtils.lerp(2.15, 8.6, impactP);
                    burst.scale.set(burstScale, burstScale, 1);
                    burst.rotation.z -= rawDt * (1.1 + pushP * 4.2);
                    burst.material.opacity = beat === 'grip'
                        ? 0.08 + gripP * 0.14
                        : 0.26 * (1 - pushP * 0.55);
                }
            }
        }
        if (memoryLight.current) {
            const lightP = beat === 'approach' ? ease(f8FinaleProgress('approach'))
                : beat === 'grip' ? 1.15
                : beat === 'push' ? 1.4 * (1 - ease(f8FinaleProgress('push')) * 0.45)
                : beat === 'reveal' ? 0.4 : 0;
            memoryLight.current.intensity = lightP * 3.8;
            memoryLight.current.position.set(0, 1.7, beat === 'push' ? -7.1 : -5.9);
        }

        const root = archivistRoot.current;
        const visible = beat !== 'door';
        root.visible = visible;
        if (!visible || !archivistA.current || !archivistB.current) return;
        const pose = archivistPose(beat);
        root.position.set(pose.x, pose.y, pose.z);
        root.lookAt(camera.position.x, pose.y, camera.position.z);
        root.scale.set(pose.width, pose.height, 1);
        if (lastFrames.current[0] !== pose.frame) {
            lastFrames.current[0] = pose.frame;
            setAtlasFrame(archivistA.current.geometry, pose.frame, 4, 2);
        }
        if (lastFrames.current[1] !== pose.next) {
            lastFrames.current[1] = pose.next;
            setAtlasFrame(archivistB.current.geometry, pose.next, 4, 2);
        }
        archivistA.current.material.opacity = 1 - pose.mix;
        archivistB.current.material.opacity = pose.mix;
        archivistB.current.visible = pose.next !== pose.frame && pose.mix > 0.002;
    });

    return (
        <group name="floor8-finale-images">
            {/* A porta pintada substitui o tapume procedural no plano de abertura. */}
            <mesh position={[0, 1.48, -9.82]} renderOrder={20}>
                <planeGeometry args={[2.55, 3.82]} />
                <meshBasicMaterial map={elevator} transparent alphaTest={0.025} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            <pointLight position={[0, 2.55, -8.95]} color="#d49d53" intensity={5.2} distance={4.2} decay={2} />

            <mesh ref={memoryHalo} visible={false} renderOrder={26}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial
                    map={memoryVortex}
                    transparent
                    alphaTest={0.006}
                    depthWrite={false}
                    toneMapped={false}
                    side={THREE.DoubleSide}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
            <mesh ref={memoryBurst} visible={false} renderOrder={40}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial
                    map={memoryVortex}
                    transparent
                    alphaTest={0.006}
                    depthWrite={false}
                    toneMapped={false}
                    side={THREE.DoubleSide}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
            <pointLight ref={memoryLight} color="#a9d6ad" intensity={0} distance={5.5} decay={2} />

            <group ref={archivistRoot} visible={false} renderOrder={30}>
                <mesh ref={archivistA} renderOrder={30}>
                    <planeGeometry args={[1, 1]} />
                    <meshBasicMaterial map={atlas} transparent alphaTest={0.018} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
                </mesh>
                <mesh ref={archivistB} position={[0, 0, 0.006]} renderOrder={31} visible={false}>
                    <planeGeometry args={[1, 1]} />
                    <meshBasicMaterial map={atlas} transparent alphaTest={0.018} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
                </mesh>
            </group>
        </group>
    );
};

export default Floor8FinaleCutscene;
