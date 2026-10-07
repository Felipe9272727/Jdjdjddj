/**
 * f14Descida.tsx — a cutscene na cratera (dentro do mundo, câmera roteirizada):
 * um pedestal sobe da areia; a entidade vai até ele e APERTA O BOTÃO; um círculo de juntas violeta
 * se acende no chão sob os dois; o disco se solta e vira um elevador que desce por um poço até o
 * laboratório. A câmera é os olhos do hóspede o tempo todo.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { alturaEm } from './f14Terreno';
import { FiguraDaEntidade, visualPadrao, type VisualEntidade } from './f14Entidade';

export const DURACAO_DESCIDA = 14.5;
const liso = (a: number, b: number, t: number) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };

let ac: AudioContext | null = null;
function som(tipo: 'pedra' | 'clique' | 'motor') {
    try {
        ac = ac ?? new AudioContext(); const c = ac, t = c.currentTime;
        const n = c.createBufferSource(), len = tipo === 'motor' ? 7 : tipo === 'pedra' ? 1.6 : .2, b = c.createBuffer(1, c.sampleRate * len, c.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (tipo === 'clique' ? Math.exp(-i / d.length * 12) : Math.sin(Math.PI * i / d.length));
        n.buffer = b; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = tipo === 'clique' ? 3000 : tipo === 'pedra' ? 300 : 160;
        const g = c.createGain(); g.gain.value = tipo === 'clique' ? .25 : tipo === 'pedra' ? .35 : .3; n.connect(f).connect(g).connect(c.destination); n.start(t);
        if (tipo === 'motor') { const o = c.createOscillator(); o.frequency.value = 48; const g2 = c.createGain(); g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(.1, t + 1); g2.gain.linearRampToValueAtTime(0, t + 7); o.connect(g2).connect(c.destination); o.start(t); o.stop(t + 7.2); }
    } catch { /* mudo */ }
}

export interface PontosDescida { ent: THREE.Vector3; jog: THREE.Vector3 }

export const CenaDescida: React.FC<{ pontos: PontosDescida; aoLegenda: (t: string | null) => void; legenda: string; aoFim: () => void; abalo: { v: number } }> = ({ pontos, aoLegenda, legenda, aoFim, abalo }) => {
    const { camera } = useThree();
    const t0 = useRef(-1), feito = useRef(false), sons = useRef(new Set<string>());
    const vis = useRef<VisualEntidade>(visualPadrao());
    const fig = useRef<THREE.Group>(null), pedestal = useRef<THREE.Group>(null), plataforma = useRef<THREE.Group>(null);
    const luzBotao = useRef<THREE.MeshBasicMaterial>(null), juntas = useRef<THREE.MeshBasicMaterial>(null);
    const g = useMemo(() => {
        const E = pontos.ent.clone(), J = pontos.jog.clone();
        const u = new THREE.Vector3(J.x - E.x, 0, J.z - E.z).normalize(), lado = new THREE.Vector3(-u.z, 0, u.x);
        const C = E.clone().addScaledVector(u, Math.min(2.2, E.distanceTo(J) * .5));
        C.y = alturaEm(C.x, C.z);
        const B = E.clone().addScaledVector(lado, 1.6); B.y = alturaEm(B.x, B.z);
        return { E, J, C, B, u, lado, spotJog: C.clone().addScaledVector(u, 1.1), spotEnt: C.clone().addScaledVector(u, -1.1) };
    }, [pontos]);
    const mats = useMemo(() => ({
        pedra: new THREE.MeshStandardMaterial({ color: '#5a4436', roughness: .9 }),
        metal: new THREE.MeshStandardMaterial({ color: '#3b3a40', roughness: .45, metalness: .8 }),
        poco: new THREE.MeshStandardMaterial({ color: '#2a201c', roughness: 1, side: THREE.BackSide }),
    }), []);
    useEffect(() => () => { for (const m of Object.values(mats)) m.dispose(); }, [mats]);
    const cam = useMemo(() => ({ p: new THREE.Vector3(), a: new THREE.Vector3() }), []);

    useFrame(({ clock }) => {
        if (t0.current < 0) t0.current = clock.elapsedTime;
        const t = clock.elapsedTime - t0.current, { E, C, B, u, spotJog, spotEnt } = g;
        const uma = (k: string, f: () => void) => { if (!sons.current.has(k)) { sons.current.add(k); f(); } };
        // ── o pedestal sobe da areia
        const sobe = liso(0, 1.5, t);
        if (pedestal.current) pedestal.current.position.set(B.x, B.y - 1.3 + sobe * 1.3, B.z);
        if (t > .05) uma('pedra', () => { som('pedra'); abalo.v = .35; });
        // ── ela anda até o botão, aperta, e vai para o seu lugar no disco
        const ate = liso(1.5, 3.2, t), volta = liso(4.6, 6, t);
        const junto = B.clone().addScaledVector(u, .55).addScaledVector(g.lado, -.45);
        const pe = E.clone().lerp(junto, ate).lerp(spotEnt, volta);
        const desce = liso(7.5, 13.5, t) * 18;
        if (fig.current) {
            fig.current.position.set(pe.x, (volta > .99 ? C.y : alturaEm(pe.x, pe.z)) - (volta > .99 ? desce : 0), pe.z);
            const olhaPara = t < 4.6 ? B : camera.position;
            fig.current.rotation.y = Math.atan2(olhaPara.x - pe.x, olhaPara.z - pe.z);
        }
        vis.current.braco = liso(3.2, 4.0, t) * (1 - liso(4.4, 5.2, t)); vis.current.alturaBraco = -.35;
        if (t > 4.0) uma('clique', () => { som('clique'); aoLegenda(legenda); });
        if (t > 6.6 && t < 6.7) aoLegenda(null);
        if (luzBotao.current) luzBotao.current.color.set(t > 4.0 ? '#c79bff' : '#5a2e9a');
        // ── as juntas do círculo acendem; o chão treme; o disco se solta e desce
        if (juntas.current) juntas.current.opacity = liso(4.6, 6.2, t) * (.7 + Math.sin(t * 9) * .2);
        if (t > 6.2) uma('motor', () => { som('motor'); abalo.v = .5; });
        if (plataforma.current) plataforma.current.position.set(C.x, C.y + .03 - desce, C.z);
        // ── os olhos: encara a entidade; dá dois passos para o disco; na descida, olha para ela e para o céu que fecha
        const anda = liso(6.4, 7.6, t);
        cam.p.copy(pontos.jog).lerp(spotJog, anda); cam.p.y = (anda > .99 ? C.y : alturaEm(cam.p.x, cam.p.z)) + 1.68 - (anda > .99 ? desce : 0) + Math.sin(t * 7) * .02 * anda * (1 - anda) * 4;
        const cabeca = new THREE.Vector3(pe.x, (fig.current?.position.y ?? pe.y) + 2.7, pe.z);
        if (t < 3.6) cam.a.copy(cabeca).lerp(new THREE.Vector3(B.x, B.y + 1.2, B.z), liso(1.6, 3.4, t));
        else if (t < 11.5) cam.a.copy(new THREE.Vector3(B.x, B.y + 1.2, B.z)).lerp(cabeca, liso(4.6, 6.2, t));
        else cam.a.copy(cabeca).lerp(new THREE.Vector3(C.x, C.y + 30, C.z), liso(11.5, 13.5, t));
        if (abalo.v > 0) { cam.p.x += (Math.random() - .5) * .12 * abalo.v; cam.p.y += (Math.random() - .5) * .12 * abalo.v; abalo.v = Math.max(0, abalo.v - 1 / 60); }
        camera.position.copy(cam.p); camera.lookAt(cam.a);
        if (t > DURACAO_DESCIDA && !feito.current) { feito.current = true; aoFim(); }
    });

    return <>
        {/* o pedestal de pedra com o botão de latão e luz violeta */}
        <group ref={pedestal}>
            <mesh material={mats.pedra} position={[0, .55, 0]} castShadow><cylinderGeometry args={[.22, .3, 1.1, 8]} /></mesh>
            <mesh material={mats.metal} position={[0, 1.12, 0]}><cylinderGeometry args={[.16, .2, .06, 16]} /></mesh>
            <mesh position={[0, 1.16, 0]}><cylinderGeometry args={[.07, .07, .05, 16]} /><meshBasicMaterial ref={luzBotao} color="#5a2e9a" /></mesh>
        </group>
        {/* o disco-elevador: aro de metal, juntas que brilham e o poço por baixo */}
        <group ref={plataforma}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[2.55, 48]} /><meshStandardMaterial color="#8a5a3c" roughness={.95} /></mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .01, 0]}><ringGeometry args={[2.5, 2.62, 64]} /><meshBasicMaterial ref={juntas} color="#b48aff" transparent opacity={0} /></mesh>
            {[0, 1, 2, 3].map((i) => <mesh key={i} rotation={[-Math.PI / 2, 0, i * Math.PI / 4]} position={[0, .012, 0]}><planeGeometry args={[5, .03]} /><meshBasicMaterial color="#b48aff" transparent opacity={.5} /></mesh>)}
        </group>
        {/* o poço (só aparece de dentro) com fitas de luz */}
        <group position={[g.C.x, g.C.y, g.C.z]}>
            <mesh material={mats.poco} position={[0, -11, 0]}><cylinderGeometry args={[2.75, 2.75, 22, 32, 1, true]} /></mesh>
            {[0, 1, 2, 3, 4, 5].map((i) => <mesh key={i} position={[Math.cos(i * 1.047) * 2.7, -11, Math.sin(i * 1.047) * 2.7]} rotation={[0, -i * 1.047, 0]}><boxGeometry args={[.03, 22, .06]} /><meshBasicMaterial color="#8a5cff" /></mesh>)}
            <pointLight position={[0, -8, 0]} color="#a07bff" intensity={20} distance={14} />
        </group>
        <group ref={fig} scale={1.25}><FiguraDaEntidade vis={vis} /></group>
    </>;
};
