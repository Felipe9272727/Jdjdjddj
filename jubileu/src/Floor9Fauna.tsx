/**
 * Floor9Fauna.tsx — os CORPOS do Viveiro, v3 (overhaul Rain World).
 *
 * O que o v3 ganha em cima do v2 (anatomia + marcha):
 *  - PÉS NO RELEVO: toda pose nasce de f9GroundHeight (fonte única, f9Ground).
 *  - IDENTIDADE ESTÁVEL: o slot do ator casa com o ag.id (Map), não com o
 *    índice do filter — quando alguém morre/renasce ninguém "desliza" de corpo.
 *  - TOCAS VISÍVEIS: as dens viram BOCAS no chão (círculo escuro + anel de
 *    raízes + brilho que chama no aviso) e quem entra AFUNDA nelas (0.4 s)
 *    em vez de sumir seco; quem sai EMERGE.
 *  - NOVOS ESTADOS do motor: grabbed (presa mole na boca, balançando), drag
 *    (predador cabeça-baixa, passo pesado), investigate (focinho no chão),
 *    follow (saltito feliz: saltos mais altos, olhar no player).
 *  - OLHARES: cabeças viram pro player a <6 u (saltito e vulto te encaram);
 *    no AVISO os bichos olham pro CÉU 1 s antes da debandada (presságio).
 *  - MOLAS: orelhas/cauda com spring (overshoot), e antecipação de salto
 *    (crouch de 60–80 ms antes do saltito deixar o chão).
 *  - SOMBRAS-BLOB: um InstancedMesh de círculos escuros sob cada corpo (e do
 *    Fiapo) — barato, sem shadow maps; encolhe no ar, some na toca.
 *  - PERF: bySpecies SEM alocação por frame (cache por assinatura) e nada de
 *    getObjectByName no loop — refs de partes resolvidos uma vez no mount.
 *
 * Camada de LEGIBILIDADE NO ESCURO (brief de arte §4 — "os bichos apagam"):
 *  - RIM LIGHT: UMA directional fria #bfe0d8 em [-7,17,7] (oposta ao key),
 *    intensidade 0.42 no calmo escalando por fase — toda criatura ganha borda
 *    superior fria que a recorta do chão. Mora no BlobShadows (o "serviço de
 *    cena" do Fauna que o Forest monta) e se auto-dirige lendo f9eco.phase.
 *  - CATCHLIGHTS: olhos eram #141008 (invisíveis) → #1a120c + um mini-dot
 *    MeshBasic (#e8fff2; #ffffff no Fiapo) à frente de cada olho — no escuro,
 *    dois pontinhos = um ser vivo te encarando.
 *  - FOLLOW-LIGHT: pointLight #cfe0c0 (0.9, dist 7) acima do Fiapo — o player
 *    lê em todas as fases; P0 mobile: LIGADA em todas as qualities (o piso de
 *    brilho manda o Fiapo estar sempre visível). + glow quente na barriga.
 *  - POR ESPÉCIE: listra dorsal no saltito; lanterna do cervo com halo maior
 *    (lê a 30 u); brasas do vulto maiores + sheen 0.45 p/ pegar o rim frio.
 *    Budget: +2 luzes (rim dir + follow point), nenhuma projeta shadow (§7).
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { f9 } from './f9Floresta';
import { f9eco, f9CycleFrac, F9_AVISO_AT, type F9Agent, type F9CyclePhase, type F9Species } from './f9Eco';
import { f9GroundHeight } from './f9Ground';
import { f9StormShare } from './Floor9Storm';
import { f9Quality, f9IsLite } from './f9Quality';

const FM = {
    saltito: new THREE.MeshStandardMaterial({ color: '#c4b088', roughness: 0.9 }),
    saltitoBelly: new THREE.MeshStandardMaterial({ color: '#e0d4b4', roughness: 0.95 }),
    saltitoStripe: new THREE.MeshStandardMaterial({ color: '#8a7452', roughness: 0.9 }), // listra dorsal: silhueta lê de cima (brief §4.3)
    earIn: new THREE.MeshStandardMaterial({ color: '#9a7a5c', roughness: 0.95 }),
    cervo: new THREE.MeshStandardMaterial({ color: '#5c4630', roughness: 0.88 }),
    cervoLight: new THREE.MeshStandardMaterial({ color: '#7a6044', roughness: 0.9 }),
    antler: new THREE.MeshStandardMaterial({ color: '#f0e2b0', roughness: 0.45, emissive: '#ffd97a', emissiveIntensity: 1.4 }),
    hoof: new THREE.MeshStandardMaterial({ color: '#241c14', roughness: 0.6 }),
    vulto: new THREE.MeshStandardMaterial({ color: '#0e0b12', roughness: 1 }),
    vultoSheen: new THREE.MeshStandardMaterial({ color: '#1a1424', roughness: 0.45 }), // pelagem molhada: pega o rim frio na borda (brief §4.3)
    ember: new THREE.MeshBasicMaterial({ color: '#ff6a3a' }),
    guardian: new THREE.MeshStandardMaterial({ color: '#42523a', roughness: 1, flatShading: true }),
    guardianMoss: new THREE.MeshStandardMaterial({ color: '#33603a', roughness: 1, emissive: '#1c4a20', emissiveIntensity: 0.35 }),
    eye: new THREE.MeshBasicMaterial({ color: '#1a120c' }), // preto quente; o que lê no escuro é o catchlight (brief §4.2)
    catchlight: new THREE.MeshBasicMaterial({ color: '#e8fff2' }), // o pontinho que diz "um ser vivo te encara"
    catchlightFiapo: new THREE.MeshBasicMaterial({ color: '#ffffff' }), // o player lê SEMPRE (brief §5.8)
    fiapo: new THREE.MeshStandardMaterial({ color: '#d8c8a0', roughness: 0.92 }),
    fiapoBelly: new THREE.MeshStandardMaterial({ color: '#eee2c6', roughness: 0.95 }),
    fiapoDark: new THREE.MeshStandardMaterial({ color: '#9a8862', roughness: 0.95 }),
    denMouth: new THREE.MeshBasicMaterial({ color: '#05080a' }),
};

const POOL: Record<F9Species, number> = { saltito: 14, cervo: 5, vulto: 3, guardiao: 1 };

// ── LOD da fauna (P0 mobile) ─────────────────────────────────────────────────
// Medição do bench: os corpos detalhados (15–24 meshes por bicho) eram ~100
// dos ~163 draws no pior ângulo. No tier leve (quality ≠ high):
//   1. os MICRO-DETALHES nem montam (catchlights, patinhas, cascos, listras,
//      focinhos — num celular eles têm 2 px);
//   2. o bicho SOME além do raio de LOD (fog + escala já escondem — o draw
//      call não vale). O guardião nunca some (marco da clareira dele).
const F9_FAUNA_LITE = f9IsLite(f9Quality());
const FAUNA_FAR2: Record<F9Species, number> = { saltito: 22 * 22, cervo: 34 * 34, vulto: 30 * 30, guardiao: 0 };

/** esconde o corpo além do raio de LOD (só tier leve chama). true = escondido. */
function faunaLodHide(g: THREE.Group, sp: F9Species, cam: THREE.Camera): boolean {
    const far2 = FAUNA_FAR2[sp];
    if (!far2) return false;
    const dx = g.position.x - cam.position.x, dz = g.position.z - cam.position.z;
    if (dx * dx + dz * dz <= far2) return false;
    g.visible = false;
    return true;
}

// ── casamento estável slot ↔ ag.id (fix do deslize) + bySpecies sem alocação ─
interface SpeciesCache {
    sig: number;
    ver: number;
    slots: (F9Agent | null)[];
    slotOf: Map<number, number>; // agentId → slot
}
const caches: Record<F9Species, SpeciesCache> = {
    saltito: { sig: -1, ver: -1, slots: [], slotOf: new Map() },
    cervo: { sig: -1, ver: -1, slots: [], slotOf: new Map() },
    vulto: { sig: -1, ver: -1, slots: [], slotOf: new Map() },
    guardiao: { sig: -1, ver: -1, slots: [], slotOf: new Map() },
};

/**
 * Slots renderizáveis da espécie. Só recasa quando a assinatura muda (nasceu/
 * morreu alguém, ou o mundo resetou — version cobre o f9EcoReset); no frame a
 * frame devolve o array cacheado, ZERO alocação. Os agentes são as MESMAS
 * referências do motor — pose/posição continuam vivas.
 */
function speciesSlots(sp: F9Species): (F9Agent | null)[] {
    const c = caches[sp];
    let count = 0, maxId = 0;
    for (const a of f9eco.agents) {
        if (a.sp !== sp) continue;
        count++; if (a.id > maxId) maxId = a.id;
    }
    const sig = count * 4096 + maxId;
    if (sig === c.sig && c.ver === f9eco.version) return c.slots;
    // recasa: preserva o slot de quem continua, preenche vagas com os novos
    const present = new Set<number>();
    for (const a of f9eco.agents) if (a.sp === sp) present.add(a.id);
    for (const id of Array.from(c.slotOf.keys())) if (!present.has(id)) c.slotOf.delete(id);
    const used = new Set<number>(c.slotOf.values());
    for (const a of f9eco.agents) {
        if (a.sp !== sp || c.slotOf.has(a.id)) continue;
        for (let s = 0; s < POOL[sp]; s++) {
            if (!used.has(s)) { c.slotOf.set(a.id, s); used.add(s); break; }
        }
    }
    const slots: (F9Agent | null)[] = new Array(POOL[sp]).fill(null);
    for (const a of f9eco.agents) {
        if (a.sp !== sp) continue;
        const s = c.slotOf.get(a.id);
        if (s !== undefined) slots[s] = a;
    }
    c.sig = sig; c.ver = f9eco.version; c.slots = slots;
    return slots;
}

// ── refs de partes resolvidos NO MOUNT (nada de getObjectByName por frame) ───
interface BodySlot { g: THREE.Group | null; parts: Record<string, THREE.Object3D> }
interface SlotMeta { id: number; sink: number } // sink: 0 = fora, 1 = engolido pela toca

/** registro dos corpos pra sombra-blob (e pra qualquer passante global). */
const bodyRegistry = new Set<THREE.Group>();

function slotRef(slots: React.MutableRefObject<BodySlot[]>, metas: React.MutableRefObject<SlotMeta[]>, i: number, blobR: number) {
    return (el: THREE.Group | null) => {
        if (el) {
            el.userData.blobR = blobR;
            const parts: Record<string, THREE.Object3D> = {};
            el.traverse((o) => { if (o.name) parts[o.name] = o; });
            slots.current[i] = { g: el, parts };
            bodyRegistry.add(el);
        } else {
            const old = slots.current[i];
            if (old?.g) bodyRegistry.delete(old.g);
            slots.current[i] = { g: null, parts: {} };
            metas.current[i] = { id: -1, sink: 0 };
        }
    };
}

/** mola com overshoot (orelhas, cauda) — barata, sem alocação. */
class F9Spring {
    x = 0; v = 0;
    step(target: number, dt: number, stiff = 170, damp = 11): number {
        this.v += (target - this.x) * stiff * dt;
        this.v *= Math.exp(-damp * dt);
        this.x += this.v * dt;
        return this.x;
    }
}

/** quanto o player desvia o olhar (yaw relativo ao heading do corpo). */
function lookYaw(g: THREE.Group, px: number, pz: number): number {
    const want = Math.atan2(px - g.position.x, pz - g.position.z);
    let dh = want - g.rotation.y;
    while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    return dh;
}

/** segundos desde o início do aviso (0 fora dele) — o olhar pro céu. */
function avisoSecs(): number {
    if (f9eco.phase !== 'aviso') return 0;
    return Math.max(0, f9eco.cycleT - F9_AVISO_AT * f9eco.cycleLen);
}

/**
 * Quality vem de f9Quality.ts (fonte única — mesma chave do Settings, mesmo
 * fallback mobile→medium). P0 mobile: a follow-light do Fiapo fica LIGADA em
 * TODOS os tiers (o piso de brilho manda o Fiapo estar sempre visível — sem
 * composer o low/medium ficavam escuros demais sem ela).
 */

// ── RIM LIGHT: a contra-luz fria que recorta TODA criatura do chão (§4.1) ───
/**
 * UMA directional celadon vindo de cima-atrás-lado oposto ao key (que está em
 * [8,14,-6]). Sem shadow — a separação criatura×fundo vem da borda superior
 * fria. A intensidade segue o color script (§1.1, escala do dir: rim = 0.42 ×
 * dirI/0.75) — como o dimmer mora no Floor9Forest (outro dono), aqui a luz se
 * auto-dirige lendo f9eco.phase com as MESMAS taxas de lerp; o flash do
 * relâmpago soma por cima, como nas outras luzes.
 */
const RIM_I: Record<F9CyclePhase, number> = { calmo: 0.42, aviso: 0.34, onda: 0.62, renascer: 0.39 };
const FaunaRimLight: React.FC = () => {
    const light = useRef<THREE.DirectionalLight>(null!);
    const cur = useRef(RIM_I.calmo);
    const lastPhase = useRef<F9CyclePhase>('calmo');
    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const phase = f9eco.phase;
        let target = RIM_I[phase];
        if (phase === 'aviso') {
            // o aviso bronzeia aos poucos — a mistura acompanha a fração do ciclo
            const w = Math.min(1, Math.max(0, (f9CycleFrac() - F9_AVISO_AT) / (1 - F9_AVISO_AT)));
            target = RIM_I.calmo + (RIM_I.aviso - RIM_I.calmo) * w;
        }
        if (phase !== lastPhase.current) {
            if (phase === 'onda') cur.current = target; // aviso→onda é corte seco
            lastPhase.current = phase;
        }
        const rate = phase === 'renascer' ? 1.4 : phase === 'calmo' ? 0.55 : 2.5;
        cur.current += (target - cur.current) * Math.min(1, dt * rate);
        if (light.current) light.current.intensity = cur.current + f9StormShare.flash * 0.25;
    });
    return <directionalLight ref={light} position={[-7, 17, 7]} color="#bfe0d8" intensity={RIM_I.calmo} />;
};

/**
 * pose comum: casamento novo faz snap; posição/heading suaves; PÉS NO RELEVO;
 * denned AFUNDA na boca da toca (0.4 s) em vez de sumir seco; morte afunda.
 * Retorna { ag, gy } (gy = altura do chão sob o corpo) ou null (esconde).
 */
function poseFromAgent(
    g: THREE.Group | null,
    ag: F9Agent | null,
    dt: number,
    meta: SlotMeta,
): { ag: F9Agent; gy: number } | null {
    if (!g) return null;
    if (!ag) { g.visible = false; meta.id = -1; return null; }
    if (meta.id !== ag.id) { // casamento novo: snap sem transição (e reseta pose)
        meta.id = ag.id; meta.sink = 0;
        g.position.set(ag.x, f9GroundHeight(ag.x, ag.z), ag.z);
        g.rotation.set(0, ag.heading, 0);
        g.scale.setScalar(1);
    }
    // AFUNDA na toca (o v2 sumia num frame; agora a boca ENGole o bicho)
    if (ag.state === 'denned') {
        meta.sink = Math.min(1, meta.sink + dt / 0.4);
        if (meta.sink >= 1) { g.visible = false; return null; }
        g.visible = true;
        // no OCO afunda onde está; só na DEN desliza até a boca da toca
        const den = f9eco.dens[ag.den];
        const tx2 = ag.shelter === 'oco' ? ag.x : den.x;
        const tz2 = ag.shelter === 'oco' ? ag.z : den.z;
        g.position.x += (tx2 - g.position.x) * Math.min(1, dt * 6);
        g.position.z += (tz2 - g.position.z) * Math.min(1, dt * 6);
        g.position.y = f9GroundHeight(g.position.x, g.position.z) - meta.sink * 1.4;
        return null;
    }
    g.visible = true;
    g.position.x += (ag.x - g.position.x) * Math.min(1, dt * 10);
    g.position.z += (ag.z - g.position.z) * Math.min(1, dt * 10);
    let dh = ag.heading - g.rotation.y;
    while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    g.rotation.y += dh * Math.min(1, dt * 8);
    const gy = f9GroundHeight(g.position.x, g.position.z);
    if (ag.state === 'dead') {
        g.position.y = gy - Math.min(0.9, ag.deadT * 0.2);
        g.scale.setScalar(Math.max(0.01, 1 - ag.deadT * 0.12));
        return { ag, gy };
    }
    // EMERGE ao sair da toca (renascer/calmo): sobe de volta devagar
    meta.sink = Math.max(0, meta.sink - dt / 0.35);
    g.position.y = gy - meta.sink * 1.4;
    return { ag, gy };
}

const Pool: React.FC<{ sp: F9Species; children: (i: number) => React.ReactNode }> = ({ sp, children }) => (
    <>{Array.from({ length: POOL[sp] }, (_, i) => children(i))}</>
);

// ── SALTITO v3: gota com orelhonas; antecipação + molas + olhares + grabbed ──
export const Saltitos: React.FC<{ playerRef?: React.MutableRefObject<THREE.Vector3> }> = ({ playerRef }) => {
    const slots = useRef<BodySlot[]>([]);
    const metas = useRef<SlotMeta[]>([]);
    const springs = useRef<Array<{ earL: F9Spring; earR: F9Spring }>>([]);
    useFrame(({ clock, camera }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const list = speciesSlots('saltito');
        const pp = playerRef?.current;
        const skyK = Math.min(1, avisoSecs()); // 0→1 no 1º segundo do aviso
        for (let i = 0; i < POOL.saltito; i++) {
            const slot = slots.current[i];
            if (!slot) continue;
            if (!metas.current[i]) metas.current[i] = { id: -1, sink: 0 };
            if (!springs.current[i]) springs.current[i] = { earL: new F9Spring(), earR: new F9Spring() };
            const meta = metas.current[i];
            const posed = poseFromAgent(slot.g, list[i], dt, meta);
            if (!posed || !slot.g) continue;
            const { ag, gy } = posed;
            if (ag.state === 'dead') continue;
            if (F9_FAUNA_LITE && faunaLodHide(slot.g, 'saltito', camera)) continue;
            const g = slot.g, parts = slot.parts;
            const spr = springs.current[i];
            const body = parts.sbody as THREE.Group | undefined;
            const earL = parts.earL, earR = parts.earR;
            // GRABBED: pendurado na boca do vulto — corpo mole de lado, balança
            if (ag.state === 'grabbed') {
                g.position.y = gy + 0.38 + Math.sin(t * 6.5 + i) * 0.04;
                if (body) {
                    body.rotation.z = 1.2 + Math.sin(t * 5 + i) * 0.14;
                    body.rotation.x = 0.35;
                }
                if (earL) earL.rotation.z = 0.95 + Math.sin(t * 7 + i) * 0.1;
                if (earR) earR.rotation.z = -0.95 - Math.sin(t * 7.4 + i) * 0.1;
                continue;
            }
            const moving = ag.speedNow > 0.2;
            const hopPh = ag.anim * 2.3;
            const followK = ag.state === 'follow' ? 1 : 0; // follow: saltos felizes, mais altos
            const hop = moving ? Math.abs(Math.sin(hopPh)) * 0.42 * (1 + followK * 0.5) : 0;
            g.position.y = gy + hop - meta.sink * 1.4;
            // squash no chão, stretch no ar + ANTECIPAÇÃO (crouch antes do salto)
            const antic = moving ? Math.pow(1 - Math.abs(Math.sin(hopPh)), 6) * 0.22 : 0;
            const sq = moving ? 1 + Math.sin(hopPh * 2) * 0.16 - antic : 1 + Math.sin(t * 2.1 + i) * 0.025;
            g.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
            if (body) {
                body.rotation.z += (0 - body.rotation.z) * Math.min(1, dt * 6);
                const sit = ag.state === 'sniff' || ag.state === 'lookout' ? 1 : 0;
                let want = moving ? -0.28 : sit * 0.5;
                // presságio: olhar pro CÉU no 1º segundo do aviso (antes de correr)
                if (skyK > 0 && ag.state !== 'toDen') want -= skyK * 0.55;
                body.rotation.x += (want - body.rotation.x) * Math.min(1, dt * 6);
                // vira o corpinho pro player de perto (o follow te acompanha com os olhos)
                let wantYaw = 0;
                if (pp && !moving) {
                    const d = Math.hypot(pp.x - g.position.x, pp.z - g.position.z);
                    const w = Math.max(0, 1 - (d - 1.5) / 4.5) * (followK > 0 ? 1 : 0.7);
                    if (w > 0.01) wantYaw = THREE.MathUtils.clamp(lookYaw(g, pp.x, pp.z), -0.7, 0.7) * w;
                }
                body.rotation.y += (wantYaw - body.rotation.y) * Math.min(1, dt * 5);
            }
            const flick = Math.sin(t * 1.7 + i * 3) > 0.96 ? 0.5 : 0;
            const earT = 0.35 + flick + (moving ? Math.sin(hopPh) * 0.2 : 0);
            if (earL) earL.rotation.z = spr.earL.step(earT, dt);
            if (earR) earR.rotation.z = spr.earR.step(-earT, dt);
        }
    });
    return (
        <Pool sp="saltito">
            {(i) => (
                <group key={i} ref={slotRef(slots, metas, i, 0.34)} visible={false}>
                    <group name="sbody">
                        {/* corpo-gota: esfera escalada, barriga clara, focinho.
                            P0 (tier leve): micro-detalhes (listra/barriga/focinho/
                            catchlights/patinhas/pompom) NÃO montam — 6 meshes ficam. */}
                        <mesh position={[0, 0.3, 0]} scale={[0.9, 1, 1.15]} material={FM.saltito}><sphereGeometry args={[0.27, 10, 9]} /></mesh>
                        {/* listra dorsal escura: a silhueta lê de cima/costas (brief §4.3) */}
                        {!F9_FAUNA_LITE && <mesh position={[0, 0.48, -0.06]} rotation={[1.25, 0, 0]} scale={[0.55, 1, 0.42]} material={FM.saltitoStripe}><capsuleGeometry args={[0.055, 0.3, 4, 6]} /></mesh>}
                        {!F9_FAUNA_LITE && <mesh position={[0, 0.22, 0.1]} scale={[0.72, 0.8, 0.95]} material={FM.saltitoBelly}><sphereGeometry args={[0.24, 9, 8]} /></mesh>}
                        <mesh position={[0, 0.42, 0.24]} scale={[0.8, 0.75, 0.9]} material={FM.saltito}><sphereGeometry args={[0.15, 9, 8]} /></mesh>
                        {!F9_FAUNA_LITE && <mesh position={[0, 0.38, 0.37]} material={FM.earIn}><sphereGeometry args={[0.035, 6, 5]} /></mesh>}
                        {/* orelhonas */}
                        <mesh name="earL" position={[-0.09, 0.58, 0.16]} rotation={[0.1, 0, 0.35]} material={FM.saltito}><capsuleGeometry args={[0.05, 0.26, 4, 6]} /></mesh>
                        <mesh name="earR" position={[0.09, 0.58, 0.16]} rotation={[0.1, 0, -0.35]} material={FM.saltito}><capsuleGeometry args={[0.05, 0.26, 4, 6]} /></mesh>
                        {/* olhos-botão grandes: lê no escuro mesmo no tier leve (§4.2) */}
                        <mesh position={[-0.08, 0.46, 0.33]} material={FM.eye}><sphereGeometry args={[0.038, 6, 6]} /></mesh>
                        <mesh position={[0.08, 0.46, 0.33]} material={FM.eye}><sphereGeometry args={[0.038, 6, 6]} /></mesh>
                        {/* catchlight: dois pontinhos = um ser vivo te encarando (§4.2) */}
                        {!F9_FAUNA_LITE && <mesh position={[-0.08, 0.472, 0.362]} material={FM.catchlight}><sphereGeometry args={[0.012, 5, 5]} /></mesh>}
                        {!F9_FAUNA_LITE && <mesh position={[0.08, 0.472, 0.362]} material={FM.catchlight}><sphereGeometry args={[0.012, 5, 5]} /></mesh>}
                        {/* patinhas + rabinho pompom */}
                        {!F9_FAUNA_LITE && <mesh position={[-0.1, 0.06, 0.12]} material={FM.earIn}><sphereGeometry args={[0.055, 6, 5]} /></mesh>}
                        {!F9_FAUNA_LITE && <mesh position={[0.1, 0.06, 0.12]} material={FM.earIn}><sphereGeometry args={[0.055, 6, 5]} /></mesh>}
                        {!F9_FAUNA_LITE && <mesh position={[0, 0.28, -0.3]} material={FM.saltitoBelly}><sphereGeometry args={[0.08, 6, 6]} /></mesh>}
                    </group>
                </group>
            )}
        </Pool>
    );
};

// ── CERVO-LANTERNA v3: arco dorsal, pescoço que pasta, coroa acesa ──────────
export const Cervos: React.FC = () => {
    const slots = useRef<BodySlot[]>([]);
    const metas = useRef<SlotMeta[]>([]);
    useFrame(({ clock, camera }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const list = speciesSlots('cervo');
        const skyK = Math.min(1, avisoSecs());
        for (let i = 0; i < POOL.cervo; i++) {
            const slot = slots.current[i];
            if (!slot) continue;
            if (!metas.current[i]) metas.current[i] = { id: -1, sink: 0 };
            const posed = poseFromAgent(slot.g, list[i], dt, metas.current[i]);
            if (!posed || !slot.g) continue;
            const { ag, gy } = posed;
            if (ag.state === 'dead') continue;
            if (F9_FAUNA_LITE && faunaLodHide(slot.g, 'cervo', camera)) continue;
            const g = slot.g, parts = slot.parts;
            const body = parts.cbody as THREE.Group | undefined;
            const legs = parts.legs as THREE.Group | undefined;
            const neck = parts.neck as THREE.Group | undefined;
            const tail = parts.tail as THREE.Mesh | undefined;
            // GRABBED: cervo grande na boca do vulto — pescoço mole, corpo de lado
            if (ag.state === 'grabbed') {
                g.position.y = gy + 0.2;
                if (body) body.rotation.z = 0.5 + Math.sin(t * 4.5 + i) * 0.06;
                if (neck) neck.rotation.x = 1.5;
                if (legs) legs.children.forEach((leg, li) => { leg.rotation.x = Math.sin(t * 3 + li) * 0.08; });
                continue;
            }
            g.position.y = gy - metas.current[i].sink * 1.4;
            const speed = ag.speedNow;
            const gait = ag.anim * 1.7;
            // diagonais: FL+BR / FR+BL
            if (legs) legs.children.forEach((leg, li) => {
                const ph = (li === 0 || li === 3) ? 0 : Math.PI;
                leg.rotation.x = Math.sin(gait + ph) * Math.min(0.6, speed * 0.11);
            });
            // corpo embala com a passada; galope = leve pitch
            if (body) {
                body.rotation.z += (Math.sin(gait) * Math.min(0.03, speed * 0.007) - body.rotation.z) * Math.min(1, dt * 8);
                body.position.y = Math.abs(Math.sin(gait)) * Math.min(0.06, speed * 0.012);
                body.rotation.x = -Math.min(0.1, speed * 0.016);
            }
            if (neck) {
                const grazing = ag.state === 'graze' ? 1 : 0;
                const lookout = ag.state === 'lookout' ? 1 : 0;
                let want = grazing * 1.15 - lookout * 0.25 - 0.08 + Math.sin(t * 0.5 + i * 2) * 0.04;
                // presságio: a manada inteira olha pro céu junta (arrepio RW)
                if (skyK > 0 && ag.state !== 'toDen') want = -0.7 * skyK;
                neck.rotation.x += (want - neck.rotation.x) * Math.min(1, dt * 4);
                neck.rotation.y = ag.state === 'lookout' ? Math.sin(t * 0.9 + i) * 0.5 : 0;
            }
            if (tail) tail.rotation.x = 0.5 + (Math.sin(t * 6 + i * 5) > 0.9 ? 0.45 : 0);
        }
    });
    return (
        <Pool sp="cervo">
            {(i) => (
                <group key={i} ref={slotRef(slots, metas, i, 0.9)} visible={false}>
                    <group name="cbody">
                        {/* torso arqueado: 2 esferas escaladas (peito maior, garupa).
                            P0 (tier leve): rabo/focinho/nariz/catchlights/orelhas/galhada
                            e os 2ºs segmentos de perna NÃO montam (24 → 11 meshes). */}
                        <mesh position={[0, 1.22, 0.28]} scale={[0.72, 0.82, 1.05]} material={FM.cervo}><sphereGeometry args={[0.42, 10, 9]} /></mesh>
                        <mesh position={[0, 1.18, -0.32]} scale={[0.62, 0.7, 0.85]} material={FM.cervoLight}><sphereGeometry args={[0.4, 10, 9]} /></mesh>
                        {!F9_FAUNA_LITE && <mesh name="tail" position={[0, 1.3, -0.66]} rotation={[0.5, 0, 0]} material={FM.saltitoBelly}><capsuleGeometry args={[0.05, 0.14, 3, 6]} /></mesh>}
                        <group name="neck" position={[0, 1.45, 0.6]}>
                            {/* pescoço erguido em S + cabeça com focinho */}
                            <mesh position={[0, 0.28, 0.1]} rotation={[0.4, 0, 0]} material={FM.cervo}><capsuleGeometry args={[0.12, 0.5, 4, 7]} /></mesh>
                            <group position={[0, 0.6, 0.26]}>
                                <mesh scale={[0.85, 0.9, 1.15]} material={FM.cervo}><sphereGeometry args={[0.15, 9, 8]} /></mesh>
                                {!F9_FAUNA_LITE && <mesh position={[0, -0.03, 0.18]} scale={[0.6, 0.6, 1]} material={FM.cervoLight}><sphereGeometry args={[0.1, 8, 7]} /></mesh>}
                                {!F9_FAUNA_LITE && <mesh position={[0, 0.02, 0.28]} material={FM.hoof}><sphereGeometry args={[0.032, 5, 5]} /></mesh>}
                                <mesh position={[-0.07, 0.08, 0.12]} material={FM.eye}><sphereGeometry args={[0.028, 5, 5]} /></mesh>
                                <mesh position={[0.07, 0.08, 0.12]} material={FM.eye}><sphereGeometry args={[0.028, 5, 5]} /></mesh>
                                {/* catchlight: dois pontinhos = um ser vivo te encarando (§4.2) */}
                                {!F9_FAUNA_LITE && <mesh position={[-0.07, 0.09, 0.144]} material={FM.catchlight}><sphereGeometry args={[0.01, 5, 5]} /></mesh>}
                                {!F9_FAUNA_LITE && <mesh position={[0.07, 0.09, 0.144]} material={FM.catchlight}><sphereGeometry args={[0.01, 5, 5]} /></mesh>}
                                {/* orelhas */}
                                {!F9_FAUNA_LITE && <mesh position={[-0.13, 0.14, -0.02]} rotation={[0, 0, 0.9]} material={FM.cervoLight}><capsuleGeometry args={[0.035, 0.12, 3, 5]} /></mesh>}
                                {!F9_FAUNA_LITE && <mesh position={[0.13, 0.14, -0.02]} rotation={[0, 0, -0.9]} material={FM.cervoLight}><capsuleGeometry args={[0.035, 0.12, 3, 5]} /></mesh>}
                                {/* a COROA-LANTERNA: galhada em candelabro (só no high —
                                    no leve o HALO quente carrega a leitura a 30 u) */}
                                {!F9_FAUNA_LITE && [-1, 1].map((sx) => (
                                    <group key={sx} position={[sx * 0.08, 0.16, -0.03]} rotation={[0, 0, sx * -0.5]}>
                                        <mesh position={[0, 0.2, 0]} material={FM.antler}><cylinderGeometry args={[0.02, 0.028, 0.4, 5]} /></mesh>
                                        <mesh position={[sx * 0.1, 0.36, 0.02]} rotation={[0, 0, sx * -0.7]} material={FM.antler}><cylinderGeometry args={[0.014, 0.02, 0.26, 4]} /></mesh>
                                        <mesh position={[sx * 0.03, 0.4, -0.06]} rotation={[0.6, 0, sx * -0.25]} material={FM.antler}><cylinderGeometry args={[0.012, 0.018, 0.2, 4]} /></mesh>
                                        <mesh position={[sx * 0.16, 0.5, 0.04]} material={FM.antler}><sphereGeometry args={[0.028, 5, 5]} /></mesh>
                                    </group>
                                ))}
                                {/* halo quente da lanterna — o farol ambulante: lê a 30 u (§4.3/§5.18) */}
                                <mesh position={[0, 0.42, 0]}><sphereGeometry args={[0.55, 8, 6]} /><meshBasicMaterial color="#ffd97a" transparent opacity={0.16} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
                            </group>
                        </group>
                    </group>
                    {/* pernas finas: no leve só o segmento superior (o joelho some) */}
                    <group name="legs">
                        {[[-0.22, 0.42], [0.22, 0.42], [-0.2, -0.42], [0.2, -0.42]].map(([x, z], li) => (
                            <group key={li} position={[x, 1.05, z]}>
                                <mesh position={[0, -0.28, 0]} material={FM.cervo}><cylinderGeometry args={[0.05, 0.038, 0.56, 6]} /></mesh>
                                {!F9_FAUNA_LITE && <mesh position={[0, -0.75, 0.02]} rotation={[0.08, 0, 0]} material={FM.cervoLight}><cylinderGeometry args={[0.034, 0.026, 0.42, 5]} /></mesh>}
                                {!F9_FAUNA_LITE && <mesh position={[0, -0.98, 0.03]} material={FM.hoof}><cylinderGeometry args={[0.038, 0.045, 0.07, 6]} /></mesh>}
                            </group>
                        ))}
                    </group>
                </group>
            )}
        </Pool>
    );
};

// ── VULTO v3: pantera-sombra; drag cabeça-baixa, investigate focinho no chão ──
export const Vultos: React.FC<{ playerRef?: React.MutableRefObject<THREE.Vector3> }> = ({ playerRef }) => {
    const slots = useRef<BodySlot[]>([]);
    const metas = useRef<SlotMeta[]>([]);
    useFrame(({ clock, camera }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const list = speciesSlots('vulto');
        const pp = playerRef?.current;
        const skyK = Math.min(1, avisoSecs());
        for (let i = 0; i < POOL.vulto; i++) {
            const slot = slots.current[i];
            if (!slot) continue;
            if (!metas.current[i]) metas.current[i] = { id: -1, sink: 0 };
            const posed = poseFromAgent(slot.g, list[i], dt, metas.current[i]);
            if (!posed || !slot.g) continue;
            const { ag, gy } = posed;
            if (ag.state === 'dead') continue;
            if (F9_FAUNA_LITE && faunaLodHide(slot.g, 'vulto', camera)) continue;
            const g = slot.g, parts = slot.parts;
            const stalking = ag.state === 'stalk';
            const chasing = ag.state === 'chase';
            const dragging = ag.state === 'drag';           // arrastando presa pra toca
            const sniffing = ag.state === 'investigate';    // farejando memória
            g.position.y = gy - metas.current[i].sink * 1.4;
            // espreita = colado no chão; drag = pesado, meio agachado
            const crouch = stalking ? 0.55 : dragging ? 0.8 : 1;
            g.scale.y += (crouch - g.scale.y) * Math.min(1, dt * 5);
            g.scale.z += ((chasing ? 1.18 : 1) - g.scale.z) * Math.min(1, dt * 5);
            const spine = parts.spine as THREE.Group | undefined;
            if (spine) {
                // a ondulação felina da coluna (mais lenta e PESADA no drag)
                const wave = dragging ? ag.anim * 1.1 : ag.anim * 1.8;
                spine.rotation.y = Math.sin(wave) * Math.min(0.12, ag.speedNow * 0.025);
                spine.position.y = Math.abs(Math.sin(wave)) * Math.min(0.05, ag.speedNow * 0.01) * (dragging ? 1.8 : 1);
                // drag/investigate = cabeça baixa, focinho no chão
                let pitch = dragging ? 0.3 : sniffing ? 0.36 : 0;
                if (skyK > 0 && ag.state !== 'toDen') pitch = -0.4 * skyK; // até o predador olha pro céu
                spine.rotation.x += (pitch - spine.rotation.x) * Math.min(1, dt * 5);
            }
            const legs = parts.vlegs as THREE.Group | undefined;
            if (legs) legs.children.forEach((leg, li) => {
                const ph = (li === 0 || li === 3) ? 0 : Math.PI;
                leg.rotation.x = Math.sin(ag.anim * 1.8 + ph) * Math.min(0.55, ag.speedNow * 0.1);
            });
            const tail = parts.vtail as THREE.Group | undefined;
            if (tail) {
                // cauda: chicoteia livre; no drag vai baixa e pesada
                const wantX = dragging ? 0.95 : 0.4 + Math.sin(t * 1.4 + i) * 0.12;
                tail.rotation.x += (wantX - tail.rotation.x) * Math.min(1, dt * 4);
                tail.rotation.y = Math.sin(t * (dragging ? 1.1 : 2.2) + i * 4) * 0.4;
            }
            // cabeça ENCARA o player de perto (você é presa em potencial)
            const head = parts.vhead as THREE.Group | undefined;
            if (head && pp && !dragging) {
                const d = Math.hypot(pp.x - g.position.x, pp.z - g.position.z);
                const w = Math.max(0, 1 - d / 6);
                const wantYaw = w > 0.01 ? THREE.MathUtils.clamp(lookYaw(g, pp.x, pp.z), -0.8, 0.8) * w : 0;
                head.rotation.y += (wantYaw - head.rotation.y) * Math.min(1, dt * 4.5);
            }
            // brasas pulsam ao espreitar; no drag ficam fixas (ocupado demais)
            // (base 0.34: o vulto lê no breu mesmo em repouso — brief §5.19)
            const glow = parts.vglow as THREE.Mesh | undefined;
            if (glow) (glow.material as THREE.MeshBasicMaterial).opacity = dragging ? 0.5 : stalking || chasing ? 0.5 + Math.sin(t * 8) * 0.22 : 0.34;
        }
    });
    return (
        <Pool sp="vulto">
            {(i) => (
                <group key={i} ref={slotRef(slots, metas, i, 0.62)} visible={false}>
                    <group name="spine">
                        {/* corpo longo e baixo em 3 massas */}
                        <mesh position={[0, 0.42, 0.42]} scale={[0.75, 0.8, 1.1]} material={FM.vulto}><sphereGeometry args={[0.3, 9, 8]} /></mesh>
                        <mesh position={[0, 0.4, -0.05]} scale={[0.68, 0.72, 1.35]} material={FM.vultoSheen}><sphereGeometry args={[0.28, 9, 8]} /></mesh>
                        <mesh position={[0, 0.44, -0.52]} scale={[0.6, 0.68, 0.95]} material={FM.vulto}><sphereGeometry args={[0.27, 9, 8]} /></mesh>
                        {/* cabeça achatada + mandíbula (ENCARA o player — nomeada).
                            P0 (tier leve): mandíbula/orelhas/2º segmento de cauda e
                            as bolinhas das patas NÃO montam (as brasas ficam — é
                            como o predador lê no breu). */}
                        <group name="vhead" position={[0, 0.5, 0.82]}>
                            <mesh scale={[0.8, 0.62, 1.1]} material={FM.vulto}><sphereGeometry args={[0.19, 9, 8]} /></mesh>
                            {!F9_FAUNA_LITE && <mesh position={[0, -0.05, 0.12]} scale={[0.55, 0.35, 0.8]} material={FM.vultoSheen}><sphereGeometry args={[0.14, 8, 7]} /></mesh>}
                            {/* brasas + halo — o predador lê pelas brasas no breu (§4.3/§5.19) */}
                            <mesh position={[-0.08, 0.05, 0.15]} material={FM.ember}><sphereGeometry args={[0.034, 5, 5]} /></mesh>
                            <mesh position={[0.08, 0.05, 0.15]} material={FM.ember}><sphereGeometry args={[0.034, 5, 5]} /></mesh>
                            <mesh name="vglow" position={[0, 0.04, 0.16]}><sphereGeometry args={[0.16, 7, 6]} /><meshBasicMaterial color="#ff5a2a" transparent opacity={0.34} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
                            {/* orelhas pontudas pra trás */}
                            {!F9_FAUNA_LITE && <mesh position={[-0.1, 0.14, -0.06]} rotation={[-0.6, 0, 0.3]} material={FM.vulto}><coneGeometry args={[0.045, 0.14, 4]} /></mesh>}
                            {!F9_FAUNA_LITE && <mesh position={[0.1, 0.14, -0.06]} rotation={[-0.6, 0, -0.3]} material={FM.vulto}><coneGeometry args={[0.045, 0.14, 4]} /></mesh>}
                        </group>
                        {/* cauda-fita em 2 segmentos (no leve: 1) */}
                        <group name="vtail" position={[0, 0.5, -0.78]}>
                            <mesh position={[0, 0.05, -0.22]} rotation={[0.4, 0, 0]} material={FM.vulto}><capsuleGeometry args={[0.05, 0.4, 3, 6]} /></mesh>
                            {!F9_FAUNA_LITE && <mesh position={[0, 0.22, -0.52]} rotation={[0.8, 0, 0]} material={FM.vultoSheen}><capsuleGeometry args={[0.032, 0.34, 3, 6]} /></mesh>}
                        </group>
                    </group>
                    <group name="vlegs">
                        {[[-0.18, 0.45], [0.18, 0.45], [-0.17, -0.45], [0.17, -0.45]].map(([x, z], li) => (
                            <group key={li} position={[x, 0.4, z]}>
                                <mesh position={[0, -0.2, 0]} material={FM.vulto}><cylinderGeometry args={[0.05, 0.032, 0.4, 5]} /></mesh>
                                {!F9_FAUNA_LITE && <mesh position={[0, -0.4, 0.03]} material={FM.vultoSheen}><sphereGeometry args={[0.045, 5, 5]} /></mesh>}
                            </group>
                        ))}
                    </group>
                </group>
            )}
        </Pool>
    );
};

// ── GUARDIÃO v3: catedral que anda, agora com os pés no relevo ──────────────
export const Guardiao: React.FC = () => {
    const slots = useRef<BodySlot[]>([]);
    const metas = useRef<SlotMeta[]>([]);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const list = speciesSlots('guardiao');
        if (!metas.current[0]) metas.current[0] = { id: -1, sink: 0 };
        const slot = slots.current[0];
        const posed = slot ? poseFromAgent(slot.g, list[0], dt, metas.current[0]) : null;
        if (!posed || !slot?.g) return;
        const { ag, gy } = posed;
        const g = slot.g, parts = slot.parts;
        const gait = ag.anim * 0.5;
        g.rotation.z = Math.sin(gait) * 0.035;
        g.position.y = gy + Math.abs(Math.sin(gait)) * 0.22;
        const legs = parts.glegs as THREE.Group | undefined;
        if (legs) legs.children.forEach((leg, li) => { leg.rotation.x = Math.sin(gait + li * Math.PI) * 0.36; });
        const beard = parts.gbeard as THREE.Group | undefined;
        if (beard) beard.children.forEach((v, vi) => { v.rotation.x = Math.sin(t * 0.8 + vi * 1.3) * 0.12; v.rotation.z = Math.sin(t * 0.6 + vi * 2) * 0.1; });
    });
    return (
        <group ref={slotRef(slots, metas, 0, 1.9)} visible={false}>
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

// ── TOCAS VISÍVEIS: bocas no chão (círculo escuro + raízes + brilho-chamado) ──
export const DenMouths: React.FC = () => {
    const built = useMemo(() => {
        const dens = f9eco.dens;
        const n = dens.length;
        // boca: círculo quase-preto afundado
        const mouthGeo = new THREE.CircleGeometry(1.15, 16);
        mouthGeo.rotateX(-Math.PI / 2);
        const mouths = new THREE.InstancedMesh(mouthGeo, FM.denMouth, n);
        // anel de raízes: 6 estacas tortas por toca (todas num InstancedMesh só)
        const rootGeo = new THREE.CylinderGeometry(0.05, 0.14, 1.5, 5);
        rootGeo.translate(0, 0.6, 0);
        const rootMat = new THREE.MeshStandardMaterial({ color: '#33291e', roughness: 1 });
        const roots = new THREE.InstancedMesh(rootGeo, rootMat, n * 6);
        // brilho-chamado: anel verde-fraco que ACENDE no aviso (a toca chama)
        const glowGeo = new THREE.RingGeometry(0.85, 1.6, 18);
        glowGeo.rotateX(-Math.PI / 2);
        const glowMat = new THREE.MeshBasicMaterial({
            color: '#4a8a58', transparent: true, opacity: 0.05,
            depthWrite: false, blending: THREE.AdditiveBlending,
        });
        const glows = new THREE.InstancedMesh(glowGeo, glowMat, n);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
        dens.forEach((d, i) => {
            const gy = f9GroundHeight(d.x, d.z);
            e.set(0, i * 1.31, 0); q.setFromEuler(e);
            p.set(d.x, gy + 0.035, d.z); s.set(1.2, 1, 0.9);
            m4.compose(p, q, s); mouths.setMatrixAt(i, m4);
            p.y = gy + 0.045; s.set(1, 1, 1);
            m4.compose(p, q, s); glows.setMatrixAt(i, m4);
            for (let k = 0; k < 6; k++) {
                const a = (k / 6) * Math.PI * 2 + i * 0.83;
                const rr = 1.35 + (k % 2) * 0.3;
                p.set(d.x + Math.cos(a) * rr, gy, d.z + Math.sin(a) * rr);
                e.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55); q.setFromEuler(e);
                s.setScalar(0.8 + (k % 3) * 0.25);
                m4.compose(p, q, s); roots.setMatrixAt(i * 6 + k, m4);
            }
        });
        mouths.instanceMatrix.needsUpdate = true;
        roots.instanceMatrix.needsUpdate = true;
        glows.instanceMatrix.needsUpdate = true;
        return { mouths, roots, glows, glowMat, geos: [mouthGeo, rootGeo, glowGeo], mats: [rootMat, glowMat] };
    }, []);
    useEffect(() => () => { built.geos.forEach((g) => g.dispose()); built.mats.forEach((m) => m.dispose()); }, [built]);
    useFrame(({ clock }) => {
        // o chamado da toca: o anel respira fraco no calmo e PULA no aviso
        const avisoK = f9eco.phase === 'aviso' ? 1 : f9eco.phase === 'onda' ? 0.6 : 0;
        built.glowMat.opacity = 0.045 + avisoK * 0.16 + Math.sin(clock.elapsedTime * (2 + avisoK * 4)) * 0.02;
    });
    return (<>
        <primitive object={built.mouths} />
        <primitive object={built.roots} />
        <primitive object={built.glows} />
    </>);
};

// ── SOMBRAS-BLOB: círculo escuro sob cada corpo (e do Fiapo) — 1 draw call ───
const BLOB_CAP = 26;
export const BlobShadows: React.FC = () => {
    const built = useMemo(() => {
        const geo = new THREE.CircleGeometry(1, 14);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ color: '#030608', transparent: true, opacity: 0.34, depthWrite: false });
        const mesh = new THREE.InstancedMesh(geo, mat, BLOB_CAP);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.renderOrder = 1;
        mesh.frustumCulled = false;
        mesh.count = 0;
        return { mesh, geo, mat };
    }, []);
    useEffect(() => () => { built.geo.dispose(); built.mat.dispose(); }, [built]);
    const scratch = useMemo(() => ({ m4: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3() }), []);
    useFrame(() => {
        const { mesh } = built;
        const { m4, q, e, p, s } = scratch;
        let n = 0;
        bodyRegistry.forEach((g) => {
            if (n >= BLOB_CAP || !g.visible) return;
            const gy = f9GroundHeight(g.position.x, g.position.z);
            const h = Math.max(0, g.position.y - gy);
            const k = (1 / (1 + h * 1.3)) * g.scale.x; // sombra some no ar e no shrink
            if (k < 0.06) return;
            e.set(0, g.rotation.y, 0); q.setFromEuler(e);
            p.set(g.position.x, gy + 0.03, g.position.z);
            const r = (g.userData.blobR as number | undefined) ?? 0.4;
            s.set(r * 1.15 * k, 1, r * 0.85 * k);
            m4.compose(p, q, s);
            mesh.setMatrixAt(n++, m4);
        });
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
    });
    // o rim das criaturas mora aqui: o BlobShadows é o "serviço de cena" do
    // Fauna que o Floor9Forest sempre monta (assim a luz entra sem tocar nele)
    return (<>
        <primitive object={built.mesh} />
        <FaunaRimLight />
    </>);
};

// ── O FIAPO em PRIMEIRA PESSOA: você DENTRO do corpo do bicho ───────────────
/**
 * O Player nativo segue dono do input/colisão/olhar; aqui a gente (1) abaixa
 * a câmera pra altura de olho de bicho (~0.55 m — samambaia vira mata fechada,
 * cervo vira gigante) somando o galope, e (2) cola um RIG no nariz da câmera:
 * focinho, bigodes e as patinhas dianteiras remando quando você corre. O
 * "corpo" continua existindo como âncora invisível na posição do player — é
 * ele que carrega o follow-light e a sombra-blob do v3 (os bichos e a cena
 * seguem te "vendo"). `cameraThetaRef` fica no contrato pra poses futuras.
 * Montar DEPOIS do <Player> e ANTES da <Floor9Cutscene> (a queda ganha).
 */
export const Fiapo: React.FC<{
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    cameraThetaRef: React.MutableRefObject<number>;
}> = ({ playerPositionRef, cameraThetaRef: _cameraThetaRef }) => {
    const { camera } = useThree();
    const body = useRef<THREE.Group>(null!);
    const rig = useRef<THREE.Group>(null!);
    const prev = useRef(new THREE.Vector3());
    const speed = useRef(0);
    const drop = useRef(0);

    // o Fiapo também tem sombra-blob (e entra no registro de corpos); refs de
    // partes resolvidos UMA vez no mount (nada de getObjectByName por frame)
    const parts = useRef<Record<string, THREE.Object3D>>({});
    useEffect(() => {
        const b = body.current;
        if (!b) return;
        b.userData.blobR = 0.34;
        const p: Record<string, THREE.Object3D> = {};
        b.traverse((o) => { if (o.name) p[o.name] = o; });
        parts.current = p;
        bodyRegistry.add(b);
        return () => { bodyRegistry.delete(b); };
    }, []);

    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const p = playerPositionRef.current;
        const active = f9.phase !== 'queda';
        if (body.current) body.current.visible = active;
        if (rig.current) rig.current.visible = active;
        if (!active) { drop.current = 0; prev.current.copy(p); return; }

        // velocidade a partir do movimento real
        const dx = p.x - prev.current.x, dz = p.z - prev.current.z;
        const sp = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
        speed.current += (Math.min(sp, 9) - speed.current) * Math.min(1, dt * 8);
        prev.current.copy(p);
        const gy = f9GroundHeight(p.x, p.z);
        const run = Math.min(1, speed.current / 4);
        const gait = t * 11;

        // a ÂNCORA invisível na posição do player: sombra-blob + follow-light
        if (body.current) body.current.position.set(p.x, gy, p.z);

        // 1ª PESSOA DE BICHO: desce a câmera do olho humano (1.6) pro olho do
        // Fiapo (~0.55 + relevo), com easing na chegada, + galope
        drop.current += (1 - drop.current) * Math.min(1, dt * 2.2);
        camera.position.y -= (1.05 - gy) * drop.current;
        camera.position.y += Math.abs(Math.sin(gait)) * 0.055 * run;
        const cam = camera as THREE.PerspectiveCamera;
        cam.fov += (80 - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix();
        camera.updateMatrixWorld();

        // o RIG cola no nariz da câmera
        if (rig.current) {
            rig.current.position.copy(camera.position);
            rig.current.quaternion.copy(camera.quaternion);
            const pawL = parts.current.pawL as THREE.Group | undefined;
            const pawR = parts.current.pawR as THREE.Group | undefined;
            // as patas remam alternadas no galope; paradas, descansam
            const stride = Math.sin(gait) * 0.16 * run;
            if (pawL) { pawL.position.z = -0.52 + stride; pawL.position.y = -0.34 + Math.max(0, Math.sin(gait)) * 0.1 * run; }
            if (pawR) { pawR.position.z = -0.52 - stride; pawR.position.y = -0.34 + Math.max(0, -Math.sin(gait)) * 0.1 * run; }
            const snout = parts.current.snout as THREE.Group | undefined;
            if (snout) {
                // o focinho fareja de leve quando você para
                snout.position.y = -0.315 + (run < 0.1 ? Math.sin(t * 5.2) * 0.006 : 0);
                snout.rotation.x = run * 0.1;
            }
        }
    });

    // os refs de partes agora vivem no RIG (o corpo é âncora sem malha)
    useEffect(() => {
        const r = rig.current;
        if (!r) return;
        const p: Record<string, THREE.Object3D> = {};
        r.traverse((o) => { if (o.name) p[o.name] = o; });
        Object.assign(parts.current, p);
    }, []);

    return (<>
        {/* âncora: follow-light + sombra-blob na posição do player (sem malha —
            em 1ª pessoa o corpo não pode tapar a lente) */}
        <group ref={body} visible={false}>
            {/* follow-light suave: o player + o chão imediato leem em TODAS as
                fases (breu do calmo, estouro da onda). P0 mobile: LIGADA em
                todos os tiers — o piso de brilho exige o Fiapo sempre visível
                (sem ela o low/medium, sem composer, apagavam o player) */}
            <pointLight position={[0, 2.2, 0.6]} color="#cfe0c0" intensity={0.9} distance={7} decay={2} />
        </group>
        {/* o RIG do focinho: o que você vê de SI MESMO */}
        <group ref={rig} visible={false}>
            <group name="snout" position={[0, -0.315, -0.45]} scale={[0.6, 0.6, 0.6]}>
                <mesh scale={[1.5, 0.75, 1]} material={FM.fiapo}><sphereGeometry args={[0.13, 10, 8]} /></mesh>
                <mesh position={[0, 0.045, -0.1]} material={FM.eye}><sphereGeometry args={[0.035, 6, 6]} /></mesh>
                <mesh position={[-0.09, -0.02, -0.03]} scale={[1, 0.8, 1]} material={FM.fiapoBelly}><sphereGeometry args={[0.075, 8, 6]} /></mesh>
                <mesh position={[0.09, -0.02, -0.03]} scale={[1, 0.8, 1]} material={FM.fiapoBelly}><sphereGeometry args={[0.075, 8, 6]} /></mesh>
                {/* bigodes */}
                {[-1, 1].map((s) => [0, 1, 2].map((k) => (
                    <mesh key={`${s}-${k}`} position={[s * 0.16, -0.01 + k * 0.018, -0.06]} rotation={[0, 0, s * (-0.24 - k * 0.12)]} material={FM.fiapoDark}>
                        <cylinderGeometry args={[0.0022, 0.0022, 0.2, 3]} />
                    </mesh>
                )))}
            </group>
            {/* as PATINHAS dianteiras remando na borda de baixo da visão */}
            <group name="pawL" position={[-0.17, -0.34, -0.52]}>
                <mesh rotation={[0.5, 0, 0]} material={FM.fiapo}><capsuleGeometry args={[0.05, 0.16, 4, 7]} /></mesh>
                <mesh position={[0, -0.1, 0.04]} material={FM.fiapoDark}><sphereGeometry args={[0.055, 7, 6]} /></mesh>
            </group>
            <group name="pawR" position={[0.17, -0.34, -0.52]}>
                <mesh rotation={[0.5, 0, 0]} material={FM.fiapo}><capsuleGeometry args={[0.05, 0.16, 4, 7]} /></mesh>
                <mesh position={[0, -0.1, 0.04]} material={FM.fiapoDark}><sphereGeometry args={[0.055, 7, 6]} /></mesh>
            </group>
        </group>
    </>);
};
