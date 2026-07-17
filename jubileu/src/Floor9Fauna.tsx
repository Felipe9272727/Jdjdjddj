/**
 * Floor9Fauna.tsx — os CORPOS do Viveiro, v2.
 *
 * A regra de ouro do Rain World: a IA só convence se o CORPO convence. Cada
 * espécie ganhou anatomia (silhueta própria) e marcha (gait com defasagem,
 * squash-and-stretch, cabeça que pasta, orelha que treme, cauda que chicoteia).
 * E o PLAYER agora é fauna: o FIAPO — o bichinho macio em que o Viveiro te
 * replantou — com câmera em terceira pessoa orbitando pelo mesmo theta do
 * look normal do jogo.
 */
import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { f9 } from './f9Floresta';
import { f9eco, type F9Agent, type F9Species } from './f9Eco';

const FM = {
    saltito: new THREE.MeshStandardMaterial({ color: '#d8c49a', roughness: 0.9 }),
    saltitoBelly: new THREE.MeshStandardMaterial({ color: '#efe4c4', roughness: 0.95 }),
    earIn: new THREE.MeshStandardMaterial({ color: '#b08a6a', roughness: 0.95 }),
    cervo: new THREE.MeshStandardMaterial({ color: '#6a5138', roughness: 0.88 }),
    cervoLight: new THREE.MeshStandardMaterial({ color: '#8a6e4e', roughness: 0.9 }),
    antler: new THREE.MeshStandardMaterial({ color: '#f0e2b0', roughness: 0.45, emissive: '#ffd97a', emissiveIntensity: 1.15 }),
    hoof: new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 0.6 }),
    vulto: new THREE.MeshStandardMaterial({ color: '#100d14', roughness: 1 }),
    vultoSheen: new THREE.MeshStandardMaterial({ color: '#1c1626', roughness: 0.55 }),
    ember: new THREE.MeshBasicMaterial({ color: '#ff6a3a' }),
    emberGlow: new THREE.MeshBasicMaterial({ color: '#ff5a2a', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
    guardian: new THREE.MeshStandardMaterial({ color: '#4a5a3c', roughness: 1, flatShading: true }),
    guardianMoss: new THREE.MeshStandardMaterial({ color: '#3a6a3c', roughness: 1, emissive: '#1c4a20', emissiveIntensity: 0.35 }),
    eye: new THREE.MeshBasicMaterial({ color: '#141008' }),
    fiapo: new THREE.MeshStandardMaterial({ color: '#e2d2ac', roughness: 0.92 }),
    fiapoBelly: new THREE.MeshStandardMaterial({ color: '#f4ead0', roughness: 0.95 }),
    fiapoDark: new THREE.MeshStandardMaterial({ color: '#a8946e', roughness: 0.95 }),
};

const POOL: Record<F9Species, number> = { saltito: 14, cervo: 5, vulto: 3, guardiao: 1 };
function bySpecies(sp: F9Species): F9Agent[] { return f9eco.agents.filter((a) => a.sp === sp); }

/** pose comum: posição/heading suaves, morte afundando, toca esconde. */
function poseFromAgent(g: THREE.Group | null, list: F9Agent[], i: number, dt: number): F9Agent | null {
    if (!g) return null;
    const ag = list[i];
    if (!ag || ag.state === 'denned') { g.visible = false; return null; }
    g.visible = true;
    g.position.x += (ag.x - g.position.x) * Math.min(1, dt * 10);
    g.position.z += (ag.z - g.position.z) * Math.min(1, dt * 10);
    let dh = ag.heading - g.rotation.y;
    while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    g.rotation.y += dh * Math.min(1, dt * 8);
    if (ag.state === 'dead') {
        g.position.y = -Math.min(0.9, ag.deadT * 0.2);
        g.scale.setScalar(Math.max(0.01, 1 - ag.deadT * 0.12));
        return ag;
    }
    return ag;
}

const Pool: React.FC<{ sp: F9Species; children: (i: number) => React.ReactNode }> = ({ sp, children }) => (
    <>{Array.from({ length: POOL[sp] }, (_, i) => children(i))}</>
);

// ── SALTITO v2: gota com orelhonas; senta pra farejar, salta com squash ──────
export const Saltitos: React.FC = () => {
    const refs = useRef<(THREE.Group | null)[]>([]);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const list = bySpecies('saltito');
        for (let i = 0; i < POOL.saltito; i++) {
            const g = refs.current[i];
            const ag = poseFromAgent(g, list, i, dt);
            if (!g || !ag || ag.state === 'dead') continue;
            const moving = ag.speedNow > 0.2;
            const hopPh = ag.anim * 2.3;
            const hop = moving ? Math.abs(Math.sin(hopPh)) * 0.42 : 0;
            g.position.y = hop;
            // squash no chão, stretch no ar
            const sq = moving ? 1 + Math.sin(hopPh * 2) * 0.16 : 1 + Math.sin(t * 2.1 + i) * 0.025;
            g.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
            const body = g.getObjectByName('sbody') as THREE.Group;
            if (body) {
                // sentado farejando (sniff) = empina; correndo = inclina pra frente
                const sit = ag.state === 'sniff' || ag.state === 'lookout' ? 1 : 0;
                body.rotation.x += ((moving ? -0.28 : sit * 0.5) - body.rotation.x) * Math.min(1, dt * 6);
            }
            const earL = g.getObjectByName('earL') as THREE.Mesh, earR = g.getObjectByName('earR') as THREE.Mesh;
            const flick = Math.sin(t * 1.7 + i * 3) > 0.96 ? 0.5 : 0;
            if (earL) earL.rotation.z = 0.35 + flick + (moving ? Math.sin(hopPh) * 0.2 : 0);
            if (earR) earR.rotation.z = -0.35 - (moving ? Math.sin(hopPh + 0.4) * 0.2 : 0);
        }
    });
    return (
        <Pool sp="saltito">
            {(i) => (
                <group key={i} ref={(el) => { refs.current[i] = el; }} visible={false}>
                    <group name="sbody">
                        {/* corpo-gota: esfera escalada, barriga clara, focinho */}
                        <mesh position={[0, 0.3, 0]} scale={[0.9, 1, 1.15]} material={FM.saltito}><sphereGeometry args={[0.27, 10, 9]} /></mesh>
                        <mesh position={[0, 0.22, 0.1]} scale={[0.72, 0.8, 0.95]} material={FM.saltitoBelly}><sphereGeometry args={[0.24, 9, 8]} /></mesh>
                        <mesh position={[0, 0.42, 0.24]} scale={[0.8, 0.75, 0.9]} material={FM.saltito}><sphereGeometry args={[0.15, 9, 8]} /></mesh>
                        <mesh position={[0, 0.38, 0.37]} material={FM.earIn}><sphereGeometry args={[0.035, 6, 5]} /></mesh>
                        {/* orelhonas */}
                        <mesh name="earL" position={[-0.09, 0.58, 0.16]} rotation={[0.1, 0, 0.35]} material={FM.saltito}><capsuleGeometry args={[0.05, 0.26, 4, 6]} /></mesh>
                        <mesh name="earR" position={[0.09, 0.58, 0.16]} rotation={[0.1, 0, -0.35]} material={FM.saltito}><capsuleGeometry args={[0.05, 0.26, 4, 6]} /></mesh>
                        {/* olhos-botão grandes */}
                        <mesh position={[-0.08, 0.46, 0.33]} material={FM.eye}><sphereGeometry args={[0.038, 6, 6]} /></mesh>
                        <mesh position={[0.08, 0.46, 0.33]} material={FM.eye}><sphereGeometry args={[0.038, 6, 6]} /></mesh>
                        {/* patinhas + rabinho pompom */}
                        <mesh position={[-0.1, 0.06, 0.12]} material={FM.earIn}><sphereGeometry args={[0.055, 6, 5]} /></mesh>
                        <mesh position={[0.1, 0.06, 0.12]} material={FM.earIn}><sphereGeometry args={[0.055, 6, 5]} /></mesh>
                        <mesh position={[0, 0.28, -0.3]} material={FM.saltitoBelly}><sphereGeometry args={[0.08, 6, 6]} /></mesh>
                    </group>
                </group>
            )}
        </Pool>
    );
};

// ── CERVO-LANTERNA v2: arco dorsal, pescoço que pasta, coroa acesa ───────────
export const Cervos: React.FC = () => {
    const refs = useRef<(THREE.Group | null)[]>([]);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const list = bySpecies('cervo');
        for (let i = 0; i < POOL.cervo; i++) {
            const g = refs.current[i];
            const ag = poseFromAgent(g, list, i, dt);
            if (!g || !ag || ag.state === 'dead') continue;
            g.position.y = 0;
            const speed = ag.speedNow;
            const gait = ag.anim * 1.7;
            // diagonais: FL+BR / FR+BL
            const legs = g.getObjectByName('legs') as THREE.Group;
            if (legs) legs.children.forEach((leg, li) => {
                const ph = (li === 0 || li === 3) ? 0 : Math.PI;
                leg.rotation.x = Math.sin(gait + ph) * Math.min(0.6, speed * 0.11);
            });
            // corpo embala com a passada; galope = leve pitch
            const body = g.getObjectByName('cbody') as THREE.Group;
            if (body) {
                body.position.y = Math.abs(Math.sin(gait)) * Math.min(0.06, speed * 0.012);
                body.rotation.z = Math.sin(gait) * Math.min(0.03, speed * 0.007);
                body.rotation.x = -Math.min(0.1, speed * 0.016);
            }
            const neck = g.getObjectByName('neck') as THREE.Group;
            if (neck) {
                const grazing = ag.state === 'graze' ? 1 : 0;
                const lookout = ag.state === 'lookout' ? 1 : 0;
                const want = grazing * 1.15 - lookout * 0.25 - 0.08 + Math.sin(t * 0.5 + i * 2) * 0.04;
                neck.rotation.x += (want - neck.rotation.x) * Math.min(1, dt * 4);
                neck.rotation.y = ag.state === 'lookout' ? Math.sin(t * 0.9 + i) * 0.5 : 0;
            }
            const tail = g.getObjectByName('tail') as THREE.Mesh;
            if (tail) tail.rotation.x = 0.5 + (Math.sin(t * 6 + i * 5) > 0.9 ? 0.45 : 0);
        }
    });
    return (
        <Pool sp="cervo">
            {(i) => (
                <group key={i} ref={(el) => { refs.current[i] = el; }} visible={false}>
                    <group name="cbody">
                        {/* torso arqueado: 2 esferas escaladas (peito maior, garupa) */}
                        <mesh position={[0, 1.22, 0.28]} scale={[0.72, 0.82, 1.05]} material={FM.cervo}><sphereGeometry args={[0.42, 10, 9]} /></mesh>
                        <mesh position={[0, 1.18, -0.32]} scale={[0.62, 0.7, 0.85]} material={FM.cervoLight}><sphereGeometry args={[0.4, 10, 9]} /></mesh>
                        <mesh name="tail" position={[0, 1.3, -0.66]} rotation={[0.5, 0, 0]} material={FM.saltitoBelly}><capsuleGeometry args={[0.05, 0.14, 3, 6]} /></mesh>
                        <group name="neck" position={[0, 1.45, 0.6]}>
                            {/* pescoço erguido em S + cabeça com focinho */}
                            <mesh position={[0, 0.28, 0.1]} rotation={[0.4, 0, 0]} material={FM.cervo}><capsuleGeometry args={[0.12, 0.5, 4, 7]} /></mesh>
                            <group position={[0, 0.6, 0.26]}>
                                <mesh scale={[0.85, 0.9, 1.15]} material={FM.cervo}><sphereGeometry args={[0.15, 9, 8]} /></mesh>
                                <mesh position={[0, -0.03, 0.18]} scale={[0.6, 0.6, 1]} material={FM.cervoLight}><sphereGeometry args={[0.1, 8, 7]} /></mesh>
                                <mesh position={[0, 0.02, 0.28]} material={FM.hoof}><sphereGeometry args={[0.032, 5, 5]} /></mesh>
                                <mesh position={[-0.07, 0.08, 0.12]} material={FM.eye}><sphereGeometry args={[0.028, 5, 5]} /></mesh>
                                <mesh position={[0.07, 0.08, 0.12]} material={FM.eye}><sphereGeometry args={[0.028, 5, 5]} /></mesh>
                                {/* orelhas */}
                                <mesh position={[-0.13, 0.14, -0.02]} rotation={[0, 0, 0.9]} material={FM.cervoLight}><capsuleGeometry args={[0.035, 0.12, 3, 5]} /></mesh>
                                <mesh position={[0.13, 0.14, -0.02]} rotation={[0, 0, -0.9]} material={FM.cervoLight}><capsuleGeometry args={[0.035, 0.12, 3, 5]} /></mesh>
                                {/* a COROA-LANTERNA: galhada em candelabro */}
                                {[-1, 1].map((sx) => (
                                    <group key={sx} position={[sx * 0.08, 0.16, -0.03]} rotation={[0, 0, sx * -0.5]}>
                                        <mesh position={[0, 0.2, 0]} material={FM.antler}><cylinderGeometry args={[0.02, 0.028, 0.4, 5]} /></mesh>
                                        <mesh position={[sx * 0.1, 0.36, 0.02]} rotation={[0, 0, sx * -0.7]} material={FM.antler}><cylinderGeometry args={[0.014, 0.02, 0.26, 4]} /></mesh>
                                        <mesh position={[sx * 0.03, 0.4, -0.06]} rotation={[0.6, 0, sx * -0.25]} material={FM.antler}><cylinderGeometry args={[0.012, 0.018, 0.2, 4]} /></mesh>
                                        <mesh position={[sx * 0.16, 0.5, 0.04]} material={FM.antler}><sphereGeometry args={[0.028, 5, 5]} /></mesh>
                                    </group>
                                ))}
                                {/* halo quente da lanterna */}
                                <mesh position={[0, 0.42, 0]}><sphereGeometry args={[0.42, 8, 6]} /><meshBasicMaterial color="#ffd97a" transparent opacity={0.09} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
                            </group>
                        </group>
                    </group>
                    {/* pernas finas com "joelho" (2 segmentos visuais) */}
                    <group name="legs">
                        {[[-0.22, 0.42], [0.22, 0.42], [-0.2, -0.42], [0.2, -0.42]].map(([x, z], li) => (
                            <group key={li} position={[x, 1.05, z]}>
                                <mesh position={[0, -0.28, 0]} material={FM.cervo}><cylinderGeometry args={[0.05, 0.038, 0.56, 6]} /></mesh>
                                <mesh position={[0, -0.75, 0.02]} rotation={[0.08, 0, 0]} material={FM.cervoLight}><cylinderGeometry args={[0.034, 0.026, 0.42, 5]} /></mesh>
                                <mesh position={[0, -0.98, 0.03]} material={FM.hoof}><cylinderGeometry args={[0.038, 0.045, 0.07, 6]} /></mesh>
                            </group>
                        ))}
                    </group>
                </group>
            )}
        </Pool>
    );
};

// ── VULTO v2: pantera-sombra rente ao chão, ondulação, brasas por olhos ──────
export const Vultos: React.FC = () => {
    const refs = useRef<(THREE.Group | null)[]>([]);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const list = bySpecies('vulto');
        for (let i = 0; i < POOL.vulto; i++) {
            const g = refs.current[i];
            const ag = poseFromAgent(g, list, i, dt);
            if (!g || !ag || ag.state === 'dead') continue;
            const stalking = ag.state === 'stalk';
            const chasing = ag.state === 'chase';
            g.position.y = 0;
            // espreita = corpo colado no chão; bote = estica
            const crouch = stalking ? 0.55 : 1;
            g.scale.y += (crouch - g.scale.y) * Math.min(1, dt * 5);
            g.scale.z += ((chasing ? 1.18 : 1) - g.scale.z) * Math.min(1, dt * 5);
            const spine = g.getObjectByName('spine') as THREE.Group;
            if (spine) {
                // a ondulação felina da coluna
                spine.rotation.y = Math.sin(ag.anim * 1.8) * Math.min(0.12, ag.speedNow * 0.025);
                spine.position.y = Math.abs(Math.sin(ag.anim * 1.8)) * Math.min(0.05, ag.speedNow * 0.01);
            }
            const legs = g.getObjectByName('vlegs') as THREE.Group;
            if (legs) legs.children.forEach((leg, li) => {
                const ph = (li === 0 || li === 3) ? 0 : Math.PI;
                leg.rotation.x = Math.sin(ag.anim * 1.8 + ph) * Math.min(0.55, ag.speedNow * 0.1);
            });
            const tail = g.getObjectByName('vtail') as THREE.Group;
            if (tail) { tail.rotation.y = Math.sin(t * 2.2 + i * 4) * 0.4; tail.rotation.x = 0.4 + Math.sin(t * 1.4 + i) * 0.12; }
            // brasas pulsam ao espreitar
            const glow = g.getObjectByName('vglow') as THREE.Mesh;
            if (glow) (glow.material as THREE.MeshBasicMaterial).opacity = stalking || chasing ? 0.5 + Math.sin(t * 8) * 0.22 : 0.24;
        }
    });
    return (
        <Pool sp="vulto">
            {(i) => (
                <group key={i} ref={(el) => { refs.current[i] = el; }} visible={false}>
                    <group name="spine">
                        {/* corpo longo e baixo em 3 massas */}
                        <mesh position={[0, 0.42, 0.42]} scale={[0.75, 0.8, 1.1]} material={FM.vulto}><sphereGeometry args={[0.3, 9, 8]} /></mesh>
                        <mesh position={[0, 0.4, -0.05]} scale={[0.68, 0.72, 1.35]} material={FM.vultoSheen}><sphereGeometry args={[0.28, 9, 8]} /></mesh>
                        <mesh position={[0, 0.44, -0.52]} scale={[0.6, 0.68, 0.95]} material={FM.vulto}><sphereGeometry args={[0.27, 9, 8]} /></mesh>
                        {/* cabeça achatada + mandíbula */}
                        <group position={[0, 0.5, 0.82]}>
                            <mesh scale={[0.8, 0.62, 1.1]} material={FM.vulto}><sphereGeometry args={[0.19, 9, 8]} /></mesh>
                            <mesh position={[0, -0.05, 0.12]} scale={[0.55, 0.35, 0.8]} material={FM.vultoSheen}><sphereGeometry args={[0.14, 8, 7]} /></mesh>
                            {/* brasas + halo */}
                            <mesh position={[-0.08, 0.05, 0.15]} material={FM.ember}><sphereGeometry args={[0.026, 5, 5]} /></mesh>
                            <mesh position={[0.08, 0.05, 0.15]} material={FM.ember}><sphereGeometry args={[0.026, 5, 5]} /></mesh>
                            <mesh name="vglow" position={[0, 0.04, 0.16]}><sphereGeometry args={[0.16, 7, 6]} /><meshBasicMaterial color="#ff5a2a" transparent opacity={0.24} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
                            {/* orelhas pontudas pra trás */}
                            <mesh position={[-0.1, 0.14, -0.06]} rotation={[-0.6, 0, 0.3]} material={FM.vulto}><coneGeometry args={[0.045, 0.14, 4]} /></mesh>
                            <mesh position={[0.1, 0.14, -0.06]} rotation={[-0.6, 0, -0.3]} material={FM.vulto}><coneGeometry args={[0.045, 0.14, 4]} /></mesh>
                        </group>
                        {/* cauda-fita em 2 segmentos */}
                        <group name="vtail" position={[0, 0.5, -0.78]}>
                            <mesh position={[0, 0.05, -0.22]} rotation={[0.4, 0, 0]} material={FM.vulto}><capsuleGeometry args={[0.05, 0.4, 3, 6]} /></mesh>
                            <mesh position={[0, 0.22, -0.52]} rotation={[0.8, 0, 0]} material={FM.vultoSheen}><capsuleGeometry args={[0.032, 0.34, 3, 6]} /></mesh>
                        </group>
                    </group>
                    <group name="vlegs">
                        {[[-0.18, 0.45], [0.18, 0.45], [-0.17, -0.45], [0.17, -0.45]].map(([x, z], li) => (
                            <group key={li} position={[x, 0.4, z]}>
                                <mesh position={[0, -0.2, 0]} material={FM.vulto}><cylinderGeometry args={[0.05, 0.032, 0.4, 5]} /></mesh>
                                <mesh position={[0, -0.4, 0.03]} material={FM.vultoSheen}><sphereGeometry args={[0.045, 5, 5]} /></mesh>
                            </group>
                        ))}
                    </group>
                </group>
            )}
        </Pool>
    );
};

// ── GUARDIÃO v2: catedral que anda — barba de musgo, passo que ecoa ─────────
export const Guardiao: React.FC = () => {
    const ref = useRef<THREE.Group>(null!);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const list = bySpecies('guardiao');
        const ag = poseFromAgent(ref.current, list, 0, dt);
        if (!ref.current || !ag) return;
        const gait = ag.anim * 0.5;
        ref.current.rotation.z = Math.sin(gait) * 0.035;
        ref.current.position.y = Math.abs(Math.sin(gait)) * 0.22;
        const legs = ref.current.getObjectByName('glegs') as THREE.Group;
        if (legs) legs.children.forEach((leg, li) => { leg.rotation.x = Math.sin(gait + li * Math.PI) * 0.36; });
        const beard = ref.current.getObjectByName('gbeard') as THREE.Group;
        if (beard) beard.children.forEach((v, vi) => { v.rotation.x = Math.sin(t * 0.8 + vi * 1.3) * 0.12; v.rotation.z = Math.sin(t * 0.6 + vi * 2) * 0.1; });
    });
    return (
        <group ref={ref} visible={false}>
            <group name="glegs">
                {[[-0.75, 0.32], [0.75, -0.32]].map(([x, z], i) => (
                    <group key={i} position={[x, 3.4, z]}>
                        <mesh position={[0, -1.4, 0]} material={FM.guardian}><cylinderGeometry args={[0.3, 0.62, 2.9, 7]} /></mesh>
                        <mesh position={[0, -2.85, 0.1]} scale={[1.3, 0.5, 1.6]} material={FM.guardian}><sphereGeometry args={[0.45, 7, 6]} /></mesh>
                    </group>
                ))}
            </group>
            {/* torso-tronco com casca facetada e corcova */}
            <mesh position={[0, 4.5, 0]} material={FM.guardian}><cylinderGeometry args={[0.8, 1.2, 3, 9]} /></mesh>
            <mesh position={[0, 5.6, -0.5]} scale={[1.1, 0.8, 1]} material={FM.guardianMoss}><sphereGeometry args={[0.85, 8, 7]} /></mesh>
            {/* copa-cabeça em 3 massas com clareiras de brilho */}
            <mesh position={[0, 6.5, 0.1]} material={FM.guardian}><icosahedronGeometry args={[1.5, 0]} /></mesh>
            <mesh position={[0.5, 7.3, -0.2]} material={FM.guardianMoss}><icosahedronGeometry args={[1.0, 0]} /></mesh>
            <mesh position={[-0.7, 7.0, 0.3]} material={FM.guardianMoss}><icosahedronGeometry args={[0.8, 0]} /></mesh>
            {/* BARBA de musgo/cipó pendendo da copa */}
            <group name="gbeard" position={[0, 5.6, 0.6]}>
                {[-0.7, -0.35, 0, 0.35, 0.7].map((x, i) => (
                    <group key={i} position={[x, 0, Math.abs(x) * -0.3]}>
                        <mesh position={[0, -0.7 - (i % 2) * 0.4, 0]} material={FM.guardianMoss}><cylinderGeometry args={[0.045, 0.02, 1.4 + (i % 2) * 0.8, 4]} /></mesh>
                    </group>
                ))}
            </group>
            {/* dois vagalumes moradores orbitando a copa */}
            <mesh position={[1.2, 6.8, 0.5]}><sphereGeometry args={[0.05, 5, 5]} /><meshBasicMaterial color="#d8ffb0" /></mesh>
            <mesh position={[-1.0, 7.4, -0.4]}><sphereGeometry args={[0.04, 5, 5]} /><meshBasicMaterial color="#d8ffb0" /></mesh>
        </group>
    );
};

// ── O FIAPO: o player-bicho + câmera em terceira pessoa ─────────────────────
/**
 * O corpo segue sharedPlayerPositionRef (o Player continua sendo o motor de
 * input/colisão); a câmera orbita pelo MESMO cameraThetaRef do look normal.
 * Montar DEPOIS do <Player> e ANTES da <Floor9Cutscene> (a queda ganha).
 */
export const Fiapo: React.FC<{
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    cameraThetaRef: React.MutableRefObject<number>;
}> = ({ playerPositionRef, cameraThetaRef }) => {
    const { camera } = useThree();
    const body = useRef<THREE.Group>(null!);
    const wasActive = useRef(false);
    const prev = useRef(new THREE.Vector3());
    const speed = useRef(0);
    const heading = useRef(Math.PI);
    const camPos = useRef(new THREE.Vector3());

    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const p = playerPositionRef.current;
        const active = f9.phase !== 'queda';
        if (body.current) body.current.visible = active;
        if (!active) { wasActive.current = false; prev.current.copy(p); return; }

        // velocidade e heading a partir do movimento real
        const dx = p.x - prev.current.x, dz = p.z - prev.current.z;
        const sp = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
        speed.current += (Math.min(sp, 9) - speed.current) * Math.min(1, dt * 8);
        if (sp > 0.4) {
            const want = Math.atan2(dx, dz);
            let dh = want - heading.current;
            while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
            heading.current += dh * Math.min(1, dt * 10);
        }
        prev.current.copy(p);

        // o corpo
        if (body.current) {
            const gait = t * 11;
            const run = Math.min(1, speed.current / 4);
            body.current.position.set(p.x, Math.abs(Math.sin(gait)) * 0.16 * run, p.z);
            body.current.rotation.y = heading.current;
            const sq = 1 + Math.sin(gait * 2) * 0.1 * run + (run < 0.05 ? Math.sin(t * 2.4) * 0.02 : 0);
            body.current.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
            const spine = body.current.getObjectByName('fspine') as THREE.Group;
            if (spine) spine.rotation.x = -run * 0.3;
            const tail = body.current.getObjectByName('ftail') as THREE.Group;
            if (tail) { tail.rotation.y = Math.sin(t * (3 + run * 6)) * 0.5; tail.rotation.x = 0.5 + run * 0.4; }
            const earL = body.current.getObjectByName('fearL') as THREE.Mesh;
            const earR = body.current.getObjectByName('fearR') as THREE.Mesh;
            const bounce = Math.sin(gait) * 0.24 * run;
            if (earL) earL.rotation.z = 0.4 + bounce + (Math.sin(t * 1.3) > 0.97 ? 0.4 : 0);
            if (earR) earR.rotation.z = -0.4 - bounce;
        }

        // a câmera em 3ª pessoa (orbita pelo theta do look normal) — mais longe
        // e mais baixa: enquadra o Fiapo "por cima do ombro", não de drone.
        const th = cameraThetaRef.current;
        const dist = 4.4, height = 1.75, pitchAim = 0.95;
        const tx = p.x + Math.sin(th) * dist;
        const tz = p.z + Math.cos(th) * dist;
        if (!wasActive.current) { wasActive.current = true; camPos.current.set(tx, height, tz); }
        camPos.current.x += (tx - camPos.current.x) * Math.min(1, dt * 7);
        camPos.current.z += (tz - camPos.current.z) * Math.min(1, dt * 7);
        camPos.current.y += (height - camPos.current.y) * Math.min(1, dt * 7);
        camera.position.copy(camPos.current);
        camera.up.set(0, 1, 0);
        camera.lookAt(p.x, pitchAim, p.z);
        const cam = camera as THREE.PerspectiveCamera;
        cam.fov += (62 - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix();
    });

    return (
        <group ref={body} visible={false}>
            <group name="fspine">
                {/* corpo macio alongado + barriga clara */}
                <mesh position={[0, 0.32, -0.05]} rotation={[Math.PI / 2, 0, 0]} scale={[0.95, 1, 0.9]} material={FM.fiapo}><capsuleGeometry args={[0.21, 0.42, 5, 9]} /></mesh>
                <mesh position={[0, 0.26, 0.02]} rotation={[Math.PI / 2, 0, 0]} scale={[0.78, 0.9, 0.72]} material={FM.fiapoBelly}><capsuleGeometry args={[0.19, 0.36, 4, 8]} /></mesh>
                {/* cabeçona redonda com focinho */}
                <group position={[0, 0.46, 0.34]}>
                    <mesh scale={[1, 0.95, 1]} material={FM.fiapo}><sphereGeometry args={[0.21, 10, 9]} /></mesh>
                    <mesh position={[0, -0.04, 0.16]} scale={[0.65, 0.55, 0.8]} material={FM.fiapoBelly}><sphereGeometry args={[0.13, 8, 7]} /></mesh>
                    <mesh position={[0, 0, 0.24]} material={FM.eye}><sphereGeometry args={[0.028, 5, 5]} /></mesh>
                    <mesh position={[-0.09, 0.06, 0.17]} material={FM.eye}><sphereGeometry args={[0.042, 6, 6]} /></mesh>
                    <mesh position={[0.09, 0.06, 0.17]} material={FM.eye}><sphereGeometry args={[0.042, 6, 6]} /></mesh>
                    <mesh name="fearL" position={[-0.11, 0.22, 0.02]} rotation={[0.1, 0, 0.4]} material={FM.fiapo}><capsuleGeometry args={[0.05, 0.2, 4, 6]} /></mesh>
                    <mesh name="fearR" position={[0.11, 0.22, 0.02]} rotation={[0.1, 0, -0.4]} material={FM.fiapo}><capsuleGeometry args={[0.05, 0.2, 4, 6]} /></mesh>
                </group>
                {/* patinhas */}
                {[[-0.12, 0.22], [0.12, 0.22], [-0.12, -0.22], [0.12, -0.22]].map(([x, z], li) => (
                    <mesh key={li} position={[x, 0.08, z]} material={FM.fiapoDark}><sphereGeometry args={[0.065, 6, 5]} /></mesh>
                ))}
                {/* a cauda longa em 2 segmentos */}
                <group name="ftail" position={[0, 0.34, -0.38]}>
                    <mesh position={[0, 0.03, -0.18]} rotation={[0.5, 0, 0]} material={FM.fiapo}><capsuleGeometry args={[0.055, 0.3, 3, 6]} /></mesh>
                    <mesh position={[0, 0.18, -0.4]} rotation={[0.9, 0, 0]} material={FM.fiapoDark}><capsuleGeometry args={[0.035, 0.24, 3, 6]} /></mesh>
                </group>
            </group>
        </group>
    );
};
