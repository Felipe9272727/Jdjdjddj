/**
 * Floor9Oferendas.tsx — V4 "AS 3 OFERENDAS": o OBJETIVO do andar em cena.
 *
 *  - OFERENDAS (frutos dourados): pulsam no spot + FAROL VERTICAL de luz
 *    (ler de longe = objetivo legível). Em quality ≠ high o farol é EMISSIVE
 *    ONLY (P0: zero point light nova); no high cada fruto ganha uma point
 *    lightzinha âmbar.
 *  - CARREGADA: a oferenda flutua sobre a cabeça do Fiapo com glow + raio de
 *    luz; o "glow no player" é 1 point light SÓ no high — nos tiers leves é
 *    esfera emissiva + anel no chão (P0).
 *  - ENTREGUE: um glóbulo dourado voa do player pro coração da Raiz
 *    (lerp ~1.4 s com arco + fade).
 *  - PORTAL (Raiz desabrochada): arco de luz + raízes + silhueta de elevador
 *    dentro. 'low' = simplificado (emissive, SEM partículas — P0); medium
 *    ganha poucas partículas; high ganha o céu de faíscas.
 *  - PUNCH (pedido do Felipe): esporos dourados extras perto das oferendas e
 *    da Raiz — SÓ no high (P0: tiers leves sem esporos extras).
 *  - A conclusão: aqui mesmo, por frame — rootState 'desabrochada' e player a
 *    ≤1.8 u do portal → f9TryComplete() (idempotente via guarda local).
 *
 * Tudo lê o CONTRATO do motor (f9eco.offerings[].state/x/z, rootWake,
 * rootState, eventos f9EcoOn) — a lógica de pegar/entregar é do f9Eco.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { f9eco, f9EcoOn, f9TryComplete, F9_RAIZ } from './f9Eco';
import { f9GroundHeight } from './f9Ground';
import { f9Quality, type F9Quality } from './f9Quality';

// ── materiais compartilhados (1º render; andar é sessão longa) ───────────────
let OF: ReturnType<typeof buildOF> | null = null;
function buildOF() {
    return {
        fruit: new THREE.MeshStandardMaterial({ color: '#7a5a18', emissive: '#ffc84a', emissiveIntensity: 1.5, roughness: 0.32, metalness: 0.1 }),
        fruitGlow: new THREE.MeshBasicMaterial({ color: '#ffdf8a', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
        beacon: new THREE.MeshBasicMaterial({ color: '#ffd97a', transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        leaf: new THREE.MeshStandardMaterial({ color: '#2e4a2a', roughness: 0.9 }),
        ray: new THREE.MeshBasicMaterial({ color: '#ffe9b0', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        ring: new THREE.MeshBasicMaterial({ color: '#ffca4a', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        arch: new THREE.MeshStandardMaterial({ color: '#3a2c12', emissive: '#ffca4a', emissiveIntensity: 2.6, roughness: 0.5 }),
        door: new THREE.MeshBasicMaterial({ color: '#fff2cc', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        doorHalo: new THREE.MeshBasicMaterial({ color: '#ffca4a', transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        elev: new THREE.MeshStandardMaterial({ color: '#141a16', roughness: 0.8 }),
        spore: new THREE.PointsMaterial({ color: '#ffdf8a', size: 0.09, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }),
    };
}
const getOF = () => { if (!OF) OF = buildOF(); return OF; };

const PORTAL_POS: readonly [number, number] = [F9_RAIZ[0], F9_RAIZ[1] + 2.5]; // casa com f9TryComplete

// ── OFERENDA NO CHÃO: fruto pulsante + farol vertical (legível de longe) ─────
const OfferingFruit: React.FC<{ id: number; quality: F9Quality }> = ({ id, quality }) => {
    const g = useRef<THREE.Group>(null!);
    const fruit = useRef<THREE.Mesh>(null!);
    const glow = useRef<THREE.Mesh>(null!);
    const beaconMat = useRef<THREE.MeshBasicMaterial>(null!);
    useFrame(({ clock }) => {
        const o = f9eco.offerings[id];
        if (!o || !g.current) return;
        const onGround = o.state === 'noChao';
        g.current.visible = onGround;
        if (!onGround) return;
        const t = clock.elapsedTime;
        const gy = f9GroundHeight(o.x, o.z);
        g.current.position.set(o.x, gy, o.z);
        // fruto: flutua + pulsa (memória viva)
        fruit.current.position.y = 0.55 + Math.sin(t * 1.7 + id * 2.1) * 0.08;
        fruit.current.rotation.y = t * 0.6 + id;
        const pulse = 1 + Math.sin(t * 2.3 + id * 1.7) * 0.12;
        fruit.current.scale.setScalar(pulse);
        (fruit.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.35 + Math.sin(t * 2.3 + id * 1.7) * 0.45;
        glow.current.position.y = fruit.current.position.y;
        (glow.current.material as THREE.MeshBasicMaterial).opacity = 0.32 + Math.sin(t * 2.3 + id * 1.7) * 0.12;
        // farol: a coluna respira devagar (visível POR CIMA das samambaias)
        if (beaconMat.current) beaconMat.current.opacity = 0.12 + Math.sin(t * 1.1 + id * 2.4) * 0.05;
    });
    const lite = quality !== 'high';
    return (
        <group ref={g} visible={false}>
            {/* o fruto de memória */}
            <mesh ref={fruit} material={getOF().fruit}><icosahedronGeometry args={[0.22, 1]} /></mesh>
            <mesh ref={glow} material={getOF().fruitGlow}><sphereGeometry args={[0.42, 10, 8]} /></mesh>
            {/* folhinhas do berço */}
            {[0, 1, 2].map((k) => {
                const a = (k / 3) * Math.PI * 2 + id;
                return <mesh key={k} position={[Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3]} rotation={[0.9, a, 0]} material={getOF().leaf}><coneGeometry args={[0.09, 0.42, 5]} /></mesh>;
            })}
            {/* o FAROL VERTICAL: uma coluna de luz que atravessa a copa */}
            <mesh position={[0, 4.9, 0]} material={getOF().beacon}>
                <cylinderGeometry args={[0.14, 0.3, 9.4, 8, 1, true]} />
            </mesh>
            <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} material={getOF().ring}>
                <ringGeometry args={[0.42, 0.72, 20]} />
            </mesh>
            {/* P0: a point light do fruto existe SÓ no high */}
            {!lite && <pointLight position={[0, 1.2, 0]} color="#ffca4a" intensity={2.4} distance={6.5} decay={2} />}
        </group>
    );
};

// ── CARREGADA: flutua sobre a cabeça do Fiapo ────────────────────────────────
const CarriedOffering: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3>; quality: F9Quality }> = ({ playerPositionRef, quality }) => {
    const g = useRef<THREE.Group>(null!);
    const orb = useRef<THREE.Mesh>(null!);
    const ring = useRef<THREE.Mesh>(null!);
    useFrame(({ clock }) => {
        if (!g.current) return;
        const carrying = f9eco.offerings.some((o) => o.state === 'carregada');
        g.current.visible = carrying;
        if (!carrying) return;
        const t = clock.elapsedTime;
        const p = playerPositionRef.current;
        const gy = f9GroundHeight(p.x, p.z);
        g.current.position.set(p.x, gy, p.z);
        orb.current.position.y = 1.62 + Math.sin(t * 2.2) * 0.07;
        orb.current.rotation.y = t * 1.4;
        (orb.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6 + Math.sin(t * 3.1) * 0.5;
        ring.current.rotation.z = t * 0.8;
        (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.26 + Math.sin(t * 3.1) * 0.1;
    });
    const lite = quality !== 'high';
    return (
        <group ref={g} visible={false}>
            {/* o fruto flutuando sobre a cabeça (carregar é PESADO e BRILHANTE) */}
            <mesh ref={orb} material={getOF().fruit}><icosahedronGeometry args={[0.2, 1]} /></mesh>
            <mesh position={[0, 1.62, 0]} material={getOF().fruitGlow}><sphereGeometry args={[0.38, 10, 8]} /></mesh>
            {/* raio de luz coroando o Fiapo */}
            <mesh position={[0, 2.6, 0]} material={getOF().ray}>
                <coneGeometry args={[0.5, 2.2, 10, 1, true]} />
            </mesh>
            {/* anel no chão: o "glow do player" do tier leve (P0: sem luz nova) */}
            <mesh ref={ring} position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]} material={getOF().ring}>
                <ringGeometry args={[0.6, 0.85, 22]} />
            </mesh>
            {/* P0: a luz de carry é 1 point light SÓ no high */}
            {!lite && <pointLight position={[0, 1.9, 0]} color="#ffca4a" intensity={1.7} distance={5.5} decay={2} />}
        </group>
    );
};

// ── ENTREGUE: o glóbulo voa do player pro coração da Raiz ────────────────────
const DeliveredFlight: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const mesh = useRef<THREE.Mesh>(null!);
    const flight = useRef({ active: false, t: 0, fx: 0, fy: 0, fz: 0 });
    useEffect(() => f9EcoOn((e) => {
        if (e !== 'oferendaEntregue') return;
        const p = playerPositionRef.current;
        flight.current = { active: true, t: 0, fx: p.x, fy: f9GroundHeight(p.x, p.z) + 1.4, fz: p.z };
    }), [playerPositionRef]);
    useFrame((_, dt) => {
        const f = flight.current;
        if (!mesh.current) return;
        if (!f.active) { mesh.current.visible = false; return; }
        f.t += Math.min(dt, 0.05) / 1.4;
        if (f.t >= 1) { f.active = false; mesh.current.visible = false; return; }
        mesh.current.visible = true;
        const tx = F9_RAIZ[0], ty = 3.4, tz = F9_RAIZ[1] - 2.5 + 3.2; // o coração
        const k = f.t * f.t * (3 - 2 * f.t); // smoothstep
        const arc = Math.sin(f.t * Math.PI) * 2.2;
        mesh.current.position.set(f.fx + (tx - f.fx) * k, f.fy + (ty - f.fy) * k + arc, f.fz + (tz - f.fz) * k);
        (mesh.current.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - f.t * f.t);
    });
    return (
        <mesh ref={mesh} visible={false} material={getOF().fruitGlow.clone()}>
            <sphereGeometry args={[0.3, 10, 8]} />
        </mesh>
    );
};

// ── PORTAL (a Raiz desabrochada): arco de luz + raízes + elevador dentro ─────
const RaizPortal: React.FC<{ quality: F9Quality }> = ({ quality }) => {
    const g = useRef<THREE.Group>(null!);
    const built = useMemo(() => {
        // partículas do portal: faíscas douradas subindo (high: 120 · medium: 56 · low: 0)
        const n = quality === 'high' ? 120 : quality === 'medium' ? 56 : 0;
        if (!n) return null;
        const pos = new Float32Array(n * 3);
        const seed = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 1.8;
            pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 4.6; pos[i * 3 + 2] = Math.sin(a) * r * 0.5;
            seed[i * 2] = 0.3 + Math.random() * 0.9; seed[i * 2 + 1] = Math.random() * Math.PI * 2;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const pts = new THREE.Points(geo, getOF().spore);
        return { pts, geo, n, seed };
    }, [quality]);
    useEffect(() => () => { built?.geo.dispose(); }, [built]);
    useFrame(({ clock }) => {
        if (!g.current) return;
        const open = f9eco.rootState === 'desabrochada';
        g.current.visible = open;
        if (!open) return;
        const t = clock.elapsedTime;
        // a porta respira (material compartilhado — só o portal usa)
        getOF().door.opacity = 0.78 + Math.sin(t * 1.9) * 0.12;
        getOF().doorHalo.opacity = 0.3 + Math.sin(t * 1.9 + 1.2) * 0.09;
        if (built) {
            const attr = built.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
            for (let i = 0; i < built.n; i++) {
                let y = attr.getY(i) + built.seed[i * 2] * 0.016;
                if (y > 4.6) y = 0;
                attr.setY(i, y);
                attr.setX(i, attr.getX(i) + Math.sin(t * 1.6 + built.seed[i * 2 + 1]) * 0.003);
            }
            attr.needsUpdate = true;
        }
    });
    const [px, pz] = PORTAL_POS;
    const gy = f9GroundHeight(px, pz);
    return (
        <group ref={g} position={[px, gy, pz]} visible={false}>
            {/* o arco de raiz-e-luz */}
            <mesh position={[0, 2.5, 0]} material={getOF().arch}>
                <torusGeometry args={[1.7, 0.16, 8, 22, Math.PI]} />
            </mesh>
            {/* a porta de luz (dentro do arco) + halo dourado atrás */}
            <mesh position={[0, 1.55, 0]} material={getOF().door}>
                <planeGeometry args={[3.0, 3.1]} />
            </mesh>
            <mesh position={[0, 1.75, -0.06]} material={getOF().doorHalo}>
                <planeGeometry args={[4.2, 4.4]} />
            </mesh>
            {/* o LIMIAR: um disco de luz no chão da entrada (lê de longe) */}
            <mesh position={[0, 0.07, 0.4]} rotation={[-Math.PI / 2, 0, 0]} material={getOF().doorHalo}>
                <circleGeometry args={[2.1, 22]} />
            </mesh>
            {/* a SILHUETA DO ELEVADOR dentro da luz (teaser do próximo andar) */}
            <mesh position={[0, 1.15, -0.12]} material={getOF().elev}>
                <boxGeometry args={[1.1, 2.3, 0.1]} />
            </mesh>
            <mesh position={[0, 2.42, -0.12]} material={getOF().elev}>
                <boxGeometry args={[1.5, 0.14, 0.12]} />
            </mesh>
            {/* raízes abraçando o portal */}
            {[[-1.7, 0.5], [1.7, -0.5]].map(([rx, tilt], i) => (
                <mesh key={i} position={[rx, 0.8, 0]} rotation={[0, 0, tilt]} material={getOF().arch}>
                    <cylinderGeometry args={[0.09, 0.2, 1.8, 6]} />
                </mesh>
            ))}
            {/* coluna de luz acima do portal (farol do fim do andar) */}
            <mesh position={[0, 5.6, 0]} material={getOF().beacon}>
                <cylinderGeometry args={[0.7, 1.5, 6.4, 10, 1, true]} />
            </mesh>
            {/* partículas (0 no low — P0: portal simplificado) */}
            {built && <primitive object={built.pts} />}
        </group>
    );
};

// ── ESPOROS DOURADOS EXTRAS perto das oferendas/Raiz — SÓ no high (P0) ───────
const OferendaSpores: React.FC = () => {
    const built = useMemo(() => {
        const anchors: Array<[number, number]> = f9eco.offerings.map((o) => [o.x, o.z]);
        anchors.push([F9_RAIZ[0], F9_RAIZ[1]]);
        const n = 150;
        const pos = new Float32Array(n * 3);
        const seed = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const [ax, az] = anchors[i % anchors.length];
            const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 3.2;
            const x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
            pos[i * 3] = x; pos[i * 3 + 1] = f9GroundHeight(x, z) + 0.2 + Math.random() * 2.4; pos[i * 3 + 2] = z;
            seed[i * 3] = x; seed[i * 3 + 1] = Math.random() * Math.PI * 2; seed[i * 3 + 2] = 0.12 + Math.random() * 0.3;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const pts = new THREE.Points(geo, getOF().spore);
        return { pts, geo, n, seed };
    }, []);
    useEffect(() => () => built.geo.dispose(), [built]);
    useFrame(({ clock }) => {
        const t = clock.elapsedTime;
        const attr = built.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < built.n; i++) {
            const ph = built.seed[i * 3 + 1];
            attr.setX(i, built.seed[i * 3] + Math.sin(t * built.seed[i * 3 + 2] + ph) * 0.6);
            attr.setY(i, attr.getY(i) + Math.sin(t * 0.4 + ph) * 0.002);
        }
        attr.needsUpdate = true;
    });
    return <primitive object={built.pts} />;
};

// ── BURST da desabrochada — SÓ no high (P0) ──────────────────────────────────
const DesabrochaBurst: React.FC = () => {
    const built = useMemo(() => {
        const n = 180;
        const pos = new Float32Array(n * 3);
        const vel = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            pos[i * 3] = F9_RAIZ[0]; pos[i * 3 + 1] = 3 + Math.random() * 2; pos[i * 3 + 2] = F9_RAIZ[1] - 2.5 + 2;
            const a = Math.random() * Math.PI * 2, up = 1.2 + Math.random() * 3.4, out = 1 + Math.random() * 3.6;
            vel[i * 3] = Math.cos(a) * out; vel[i * 3 + 1] = up; vel[i * 3 + 2] = Math.sin(a) * out;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = getOF().spore.clone(); mat.size = 0.14;
        const pts = new THREE.Points(geo, mat);
        pts.visible = false;
        return { pts, geo, mat, n, vel, t: 9 };
    }, []);
    useEffect(() => () => { built.geo.dispose(); built.mat.dispose(); }, [built]);
    useEffect(() => f9EcoOn((e) => {
        if (e !== 'raizDesabrocha') return;
        built.t = 0;
        built.pts.visible = true;
        const attr = built.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < built.n; i++) {
            attr.setXYZ(i, F9_RAIZ[0] + (Math.random() - 0.5) * 1.4, 3 + Math.random() * 2, F9_RAIZ[1] - 0.5 + (Math.random() - 0.5) * 1.4);
        }
        attr.needsUpdate = true;
    }), [built]);
    useFrame((_, dt) => {
        if (built.t > 1.8) { built.pts.visible = false; return; }
        built.t += Math.min(dt, 0.05);
        const attr = built.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < built.n; i++) {
            attr.setXYZ(i,
                attr.getX(i) + built.vel[i * 3] * dt,
                attr.getY(i) + built.vel[i * 3 + 1] * dt,
                attr.getZ(i) + built.vel[i * 3 + 2] * dt);
        }
        attr.needsUpdate = true;
        built.mat.opacity = Math.max(0, 0.9 * (1 - built.t / 1.8));
    });
    return <primitive object={built.pts} />;
};

// ── o componente raiz ────────────────────────────────────────────────────────
export const Floor9Oferendas: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const quality = useMemo(f9Quality, []);
    const doneRef = useRef(false);
    // a conclusão do andar: portal + player perto → f9TryComplete (uma vez)
    useFrame(() => {
        if (doneRef.current || f9eco.rootState !== 'desabrochada') return;
        const p = playerPositionRef.current;
        if (f9TryComplete(p.x, p.z)) doneRef.current = true;
    });
    return (<>
        {[0, 1, 2].map((i) => <OfferingFruit key={i} id={i} quality={quality} />)}
        <CarriedOffering playerPositionRef={playerPositionRef} quality={quality} />
        <DeliveredFlight playerPositionRef={playerPositionRef} />
        <RaizPortal quality={quality} />
        {quality === 'high' && <OferendaSpores />}
        {quality === 'high' && <DesabrochaBurst />}
    </>);
};
