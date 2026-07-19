/**
 * Floor9Cutscene.tsx — a QUEDA pela copa (montar DEPOIS do <Player>).
 *
 * A ENTREGA do Arquivista continua sem corte: o vórtice de páginas e chaves
 * vira um portal de raízes pintado em oito quadros, e então dissolve em
 * esporos na freada. Folhas com duas temperaturas, vento crescente, shake e
 * thud de pouso completam a passagem para o Viveiro novo.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { f9, f9QuedaDone, F9_POUSO } from './f9Floresta';
import { rng } from './Floor6Textures';
import { floor9SfxQueda, floor9SfxPousou } from './floor9Sfx';
import fallPortalUrl from './assets/f9/viveiro-fall-portal-atlas-v1.png';

const QUEDA_LEN = 5.2;

function setAtlasFrame(geometry: THREE.PlaneGeometry, frame: number): void {
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const col = frame % 4;
    const row = Math.floor(frame / 4);
    for (let i = 0; i < uv.count; i++) {
        const x = i === 1 || i === 3 ? 1 : 0;
        const y = i < 2 ? 1 : 0;
        uv.setXY(i, (col + x) / 4, 1 - (row + 1 - y) / 2);
    }
    uv.needsUpdate = true;
}

const smoothstep = (a: number, b: number, v: number): number => {
    const x = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1);
    return x * x * (3 - 2 * x);
};

const Floor9Cutscene: React.FC = () => {
    const { camera } = useThree();
    const wasActive = useRef(false);
    const t = useRef(0);
    const leaves = useRef<THREE.Points>(null!);
    const portalNear = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const portalFar = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!);
    const lastPortalFrames = useRef([-1, -1]);
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry();
        const n = 130;
        const a = new Float32Array(n * 3);
        const c = new Float32Array(n * 3);
        const r = rng(931);
        const escuro = new THREE.Color('#33512f');
        const luz = new THREE.Color('#92b279');
        for (let i = 0; i < n; i++) {
            a[i * 3] = (r() * 2 - 1) * 7;
            a[i * 3 + 1] = r() * 30 - 4;
            a[i * 3 + 2] = (r() * 2 - 1) * 7;
            const cor = r() < 0.6 ? luz : escuro;
            c[i * 3] = cor.r;
            c[i * 3 + 1] = cor.g;
            c[i * 3 + 2] = cor.b;
        }
        g.setAttribute('position', new THREE.BufferAttribute(a, 3));
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
        return g;
    }, []);
    const mat = useMemo(() => new THREE.PointsMaterial({
        size: 0.19,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        vertexColors: true,
    }), []);
    const portalAtlas = useMemo(() => {
        const texture = new THREE.TextureLoader().load(fallPortalUrl);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        return texture;
    }, []);

    useEffect(() => () => {
        portalAtlas.dispose();
        camera.up.set(0, 1, 0);
    }, [portalAtlas, camera]);

    useFrame((_s, rawDt) => {
        const active = f9.phase === 'queda';
        if (!active) {
            if (wasActive.current) {
                wasActive.current = false;
                camera.up.set(0, 1, 0);
                mat.opacity = 0;
                if (leaves.current) leaves.current.visible = false;
                if (portalNear.current) portalNear.current.visible = false;
                if (portalFar.current) portalFar.current.visible = false;
                floor9SfxPousou();
            }
            return;
        }
        if (!wasActive.current) {
            wasActive.current = true;
            t.current = 0;
            lastPortalFrames.current = [-1, -1];
            if (leaves.current) leaves.current.visible = true;
            if (portalNear.current) portalNear.current.visible = true;
            if (portalFar.current) portalFar.current.visible = true;
        }

        const dt = Math.min(rawDt, 0.05);
        t.current += dt;
        const k = Math.min(1, t.current / QUEDA_LEN);
        floor9SfxQueda(k);

        // Despenca rápido e freia forte no fim.
        const fall = 1 - Math.pow(1 - k, 3.2);
        const y = 30 - fall * 28.5;
        const [px, pz] = F9_POUSO;
        const spin = (1 - k) * 2.4;
        const brakeK = Math.max(0, Math.min(1, (k - 0.82) / 0.18));
        const shake = Math.sin(brakeK * Math.PI) * 0.16;
        const sx = (Math.sin(t.current * 47) + Math.sin(t.current * 31 + 1.7)) * 0.5 * shake;
        const sy = (Math.sin(t.current * 53 + 0.6) + Math.sin(t.current * 37)) * 0.5 * shake * 0.6;
        camera.position.set(
            px + Math.sin(t.current * 3.1) * (1 - k) * 0.9 + sx,
            y + sy,
            pz + Math.cos(t.current * 2.7) * (1 - k) * 0.9,
        );
        const roll = Math.sin(t.current * 2.2) * (1 - k) * 0.35 + shake * 0.12 * Math.sin(t.current * 41);
        camera.up.set(Math.sin(roll), Math.cos(roll), 0);
        camera.lookAt(px + Math.sin(spin) * 2, Math.max(0.4, y - 6), pz + Math.cos(spin) * 2 - 2);
        const cam = camera as THREE.PerspectiveCamera;
        cam.fov += ((k > 0.86 ? 52 : 74) - cam.fov) * Math.min(1, dt * 3);
        cam.updateProjectionMatrix();

        // Dois planos em profundidades diferentes deixam o atlas parecer um
        // túnel de verdade. Os últimos quadros já são esporos transparentes,
        // então a arte se desfaz exatamente quando o freio revela a floresta.
        const near = portalNear.current;
        const far = portalFar.current;
        if (near && far) {
            const nearFrame = Math.min(7, Math.floor(k * 8));
            const farFrame = Math.min(7, Math.floor(Math.max(0, k - 0.08) * 8));
            if (lastPortalFrames.current[0] !== nearFrame) {
                lastPortalFrames.current[0] = nearFrame;
                setAtlasFrame(near.geometry, nearFrame);
            }
            if (lastPortalFrames.current[1] !== farFrame) {
                lastPortalFrames.current[1] = farFrame;
                setAtlasFrame(far.geometry, farFrame);
            }
            const fade = smoothstep(0.015, 0.12, k) * (1 - smoothstep(0.82, 0.995, k));
            near.position.set(px + Math.sin(t.current * 0.8) * 0.32, y - 7.2, pz - 2.4);
            far.position.set(px - Math.cos(t.current * 0.65) * 0.45, y - 11.8, pz - 4.5);
            near.lookAt(camera.position);
            far.lookAt(camera.position);
            near.rotation.z += dt * (0.28 + k * 1.2);
            far.rotation.z -= dt * (0.16 + k * 0.65);
            const nearScale = THREE.MathUtils.lerp(7.6, 12.8, smoothstep(0, 0.82, k));
            const farScale = THREE.MathUtils.lerp(12.5, 18.5, smoothstep(0, 0.8, k));
            near.scale.setScalar(nearScale);
            far.scale.setScalar(farScale);
            near.material.opacity = fade * 0.72;
            far.material.opacity = fade * 0.32;
        }

        // Folhas sobem em relação à câmera que cai e ficam por cima do portal.
        if (leaves.current) {
            leaves.current.position.set(px, y - 6, pz);
            const arr = (geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
            for (let i = 1; i < arr.length; i += 3) {
                arr[i] += dt * (14 * (1 - k) + 1);
                if (arr[i] > 16) arr[i] = -6;
            }
            (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
            mat.opacity = Math.min(0.9, (1 - k) * 1.4);
        }
        if (t.current >= QUEDA_LEN) f9QuedaDone();
    });

    return (
        <>
            <mesh ref={portalFar} visible={false} renderOrder={60}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial map={portalAtlas} transparent alphaTest={0.004} opacity={0} depthWrite={false} depthTest={false} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            <mesh ref={portalNear} visible={false} renderOrder={61}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial map={portalAtlas} transparent alphaTest={0.004} opacity={0} depthWrite={false} depthTest={false} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            <points ref={leaves} geometry={geo} material={mat} visible={false} renderOrder={70} />
        </>
    );
};

export default Floor9Cutscene;
