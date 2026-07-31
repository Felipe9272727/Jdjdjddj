/**
 * Floor6Guest.tsx — O HÓSPEDE QUE SABIA DEMAIS (Aurélio Campos), in person.
 *
 * O GLB estático (Meshy "Midnight Trenchcoat") agora tem ESQUELETO: o
 * guestRig.ts sintetiza ossos + pesos em runtime (padrão pirateRig), e este
 * componente os dirige osso a osso:
 *  - respiração no torso (nunca nos pés);
 *  - cabeça + pescoço RASTREANDO o player de verdade, um tempo atrasado;
 *  - aceno de cabeça e gesto de braço a cada fala dos atos 1 e 2;
 *  - passos arrastados (pernas alternando) no step-aside de 'free'/'leave'.
 *
 * O inquietante continua sendo a QUIETUDE: ele só... espera. Mas agora
 * respira de verdade enquanto espera.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { f6 } from './f6Escape';
import { guestTrenchcoatModel } from './assets/textureImports';
import { buildGuestRig, GB } from './guestRig';

const GUEST_GLB_URL = guestTrenchcoatModel;
useGLTF.preload(GUEST_GLB_URL);

const GUEST_START = new THREE.Vector3(0, 0, -8.2);      // barrando a porta
const GUEST_ASIDE = new THREE.Vector3(-2.35, 0, -8.75);  // encostado, vão livre
const ASIDE_SPEED = 0.35;                                // m/s — arrastar de pés

export const Floor6Guest: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const { scene } = useGLTF(GUEST_GLB_URL);
    const root = useRef<THREE.Group>(null!);
    const pos = useRef(GUEST_START.clone());
    const walkPh = useRef(0);
    const gesture = useRef(0);            // impulso de fala (decai)
    const lastLine = useRef(-1);
    const headYaw = useRef(0);

    const rig = useMemo(() => buildGuestRig(scene), [scene]);
    useEffect(() => () => { rig?.dispose(); }, [rig]);

    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const g = root.current;
        if (!g || !rig) return;
        const bones = rig.bones, rest = rig.restPos;

        // ── step-aside: arrasta os pés até o canto quando 'free'/'leave' ──
        const target = (f6.phase === 'free' || f6.phase === 'leave') ? GUEST_ASIDE : GUEST_START;
        const dx = target.x - pos.current.x, dz = target.z - pos.current.z;
        const dist = Math.hypot(dx, dz);
        const moving = dist > 0.02;
        if (moving) {
            const step = Math.min(dist, ASIDE_SPEED * dt);
            pos.current.x += (dx / dist) * step;
            pos.current.z += (dz / dist) * step;
            walkPh.current += dt * 5.2;
        }
        g.position.set(pos.current.x, 0, pos.current.z);

        // ── corpo encara: o player, ou a direção da caminhada — atrasado ──
        const p = playerPositionRef.current;
        const lookX = moving ? pos.current.x + dx : p.x;
        const lookZ = moving ? pos.current.z + dz : p.z;
        const want = Math.atan2(lookX - pos.current.x, lookZ - pos.current.z);
        let d = want - g.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        g.rotation.y += d * Math.min(1, dt * 1.6);

        // ── gesto a cada fala (atos 1 e 2): aceno + mão que sobe e cai ──
        const talking = f6.phase === 'guest' || f6.phase === 'guest2' || f6.phase === 'guestGift';
        if (talking && f6.guestLine !== lastLine.current) {
            lastLine.current = f6.guestLine;
            gesture.current = 1;
        }
        if (!talking) lastLine.current = -1;
        gesture.current = Math.max(0, gesture.current - dt * 0.7);
        const ges = gesture.current * gesture.current;    // decai suave

        // ── OSSOS ──
        // torso: respiração lenta (sobe/desce + leve inflar) + troca de peso
        const br = Math.sin(t * 1.7);
        bones[GB.body].position.y = rest[GB.body].y + br * 0.006;
        bones[GB.body].rotation.z = Math.sin(t * 0.31) * 0.02 + (moving ? Math.sin(walkPh.current) * 0.05 : 0);
        bones[GB.body].rotation.x = br * 0.008 + ges * 0.05;

        // pescoço + cabeça: rastreiam o player (60/40), sempre um passo atrás
        const wantHead = Math.max(-1.0, Math.min(1.0, Math.atan2(Math.sin(want - g.rotation.y), Math.cos(want - g.rotation.y))));
        headYaw.current += (wantHead - headYaw.current) * Math.min(1, dt * 2.2);
        bones[GB.head].rotation.y = headYaw.current * 0.6;
        bones[GB.neck].rotation.y = headYaw.current * 0.4;
        // cabeça baixa de quem esperou 47 dias + aceno na fala
        bones[GB.head].rotation.x = 0.10 + br * 0.012 - ges * 0.18;

        // braços: micro-balanço de vivo + o braço direito ergue no gesto de fala
        bones[GB.l_arm].rotation.z = Math.sin(t * 0.9) * 0.02;
        bones[GB.r_arm].rotation.z = -Math.sin(t * 0.9 + 1.3) * 0.02 - ges * 0.35;
        bones[GB.r_arm].rotation.x = -ges * 0.30;
        if (moving) {
            bones[GB.l_arm].rotation.x = Math.sin(walkPh.current) * 0.18;
            bones[GB.r_arm].rotation.x = -Math.sin(walkPh.current) * 0.18;
        }

        // pernas: arrastar alternado só quando anda; plantadas quando parado
        const swing = moving ? 0.32 : 0;
        bones[GB.l_leg].rotation.x += (Math.sin(walkPh.current) * swing - bones[GB.l_leg].rotation.x) * Math.min(1, dt * 8);
        bones[GB.r_leg].rotation.x += (-Math.sin(walkPh.current) * swing - bones[GB.r_leg].rotation.x) * Math.min(1, dt * 8);
        // o corpo quica de leve nos passos (no osso do torso, pés no chão)
        if (moving) bones[GB.body].position.y = rest[GB.body].y + Math.abs(Math.sin(walkPh.current)) * 0.03;
    });

    if (!rig) return null;
    return (
        <group ref={root} position={[0, 0, -8.2]}>
            {/* GLB: 2.0 de altura (y −1..1) → escala 0.9 e pés no chão ⇒ ~1.8 m */}
            <group scale={0.9} position={[0, 0.9, 0]}>
                <primitive object={rig.group} />
            </group>
        </group>
    );
};

export default Floor6Guest;
