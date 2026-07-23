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
import { useGLTF, useAnimations } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import saltitoModel from './assets/models/critters/saltitoRig.glb';
import cervoRig from './assets/models/critters/cervoRig.glb';
import vultoRig from './assets/models/critters/vultoRig.glb';
import fiapoFurAlbedoUrl from './assets/f9/fiapo-fur-albedo-v1.webp';
import fiapoFurHeightUrl from './assets/f9/fiapo-fur-height-v1.webp';
import fiapoSkinAlbedoUrl from './assets/f9/fiapo-skin-albedo-v1.webp';
import fiapoSkinHeightUrl from './assets/f9/fiapo-skin-height-v1.webp';
import { f9, f9WakeShare } from './f9Floresta';
import { f9eco, f9CycleFrac, F9_AVISO_AT, f9EcoTryPounce, type F9Agent, type F9CyclePhase, type F9Species } from './f9Eco';
import { f9GroundHeight } from './f9Ground';
import { wallsForState } from './constants';
import { resolveCollision } from './physics';
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
// ── SALTITO: modelo 3D real (GLB do Felipe) no lugar do corpo procedural ──────
// O GLB é um mesh estático (sem ossos). O "rig" é PROCEDURAL e vem de graça do
// motor do Fauna: o slot faz o SALTO (g.position.y) + squash/stretch (g.scale) e
// o sbody faz o LEAN (rotation.x) — o coelho salta como um corpo só, que é
// exatamente como coelho pula. Aqui só normalizamos, viramos o focinho pro +Z
// (forward do jogo; o modelo nasce olhando −X) e escalamos pro tamanho do bicho.
useGLTF.preload(saltitoModel);
// O Saltito agora é RIGADO: o hop VERTICAL + squash + lean continuam vindo do
// motor (g.position.y / g.scale / body.rotation), e por CIMA disso a skinning
// dá vida às patas/mãos, orelhas, perninhas, cauda e cabeça (ação "move",
// crossfade com "idle" pela velocidade). É o que faltava — o Felipe reclamou
// que "não mexe nem a mão nem o braço". Orientação preservada → wrap fica 0.
const SaltitoGLB: React.FC<{ slot: number }> = ({ slot }) => {
    const { scene, animations } = useGLTF(saltitoModel);
    const model = useMemo(() => {
        const s = SkeletonUtils.clone(scene) as THREE.Object3D;
        const box = new THREE.Box3().setFromObject(s);
        const ctr = new THREE.Vector3(); box.getCenter(ctr);
        s.position.set(-ctr.x, -box.min.y, -ctr.z);   // base em y=0, centrado no xz
        s.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; } });
        const wrap = new THREE.Group();
        wrap.add(s);
        wrap.rotation.y = 0;             // orientação nativa preservada (focinho já certo)
        wrap.scale.setScalar(0.6);       // ~0,6 u de altura (bicho pequeno)
        return wrap;
    }, [scene]);
    const { actions } = useAnimations(animations, model);
    const pick = (kw: string) => { for (const k in actions) if (k.toLowerCase().includes(kw)) return actions[k]; return null; };
    useEffect(() => {
        const mv = pick('move'), idle = pick('idle');
        if (idle) { idle.reset().play(); idle.setEffectiveWeight(1); }
        if (mv) { mv.reset().play(); mv.setEffectiveWeight(0); }
    }, [actions]);
    useFrame((_s, dt) => {
        const ag = speciesSlots('saltito')[slot];
        const spd = ag && ag.state !== 'dead' ? ag.speedNow : 0;
        const moving = spd > 0.06;
        const k = Math.min(1, dt * 6);
        const mv = pick('move'), idle = pick('idle');
        if (mv) {
            mv.setEffectiveWeight(THREE.MathUtils.lerp(mv.getEffectiveWeight(), moving ? 1 : 0, k));
            mv.timeScale = THREE.MathUtils.clamp(spd / 0.9, 0.9, 2.8);
        }
        if (idle) idle.setEffectiveWeight(THREE.MathUtils.lerp(idle.getEffectiveWeight(), moving ? 0 : 1, k));
    });
    return <primitive object={model} />;
};

export const Saltitos: React.FC<{ playerRef?: React.MutableRefObject<THREE.Vector3> }> = ({ playerRef }) => {
    const slots = useRef<BodySlot[]>([]);
    const metas = useRef<SlotMeta[]>([]);
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
            const meta = metas.current[i];
            const posed = poseFromAgent(slot.g, list[i], dt, meta);
            if (!posed || !slot.g) continue;
            const { ag, gy } = posed;
            if (ag.state === 'dead') continue;
            if (F9_FAUNA_LITE && faunaLodHide(slot.g, 'saltito', camera)) continue;
            const g = slot.g, parts = slot.parts;
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
            // limiar baixo: o saltito HOP mesmo vagando devagar (antes deslizava
            // parado abaixo de 0.2 — o GLB não tem orelha/respiração pra disfarçar).
            const moving = ag.speedNow > 0.06;
            const hopPh = ag.anim * 2.3;
            const followK = ag.state === 'follow' ? 1 : 0; // follow: saltos felizes, mais altos
            const hop = moving ? Math.abs(Math.sin(hopPh)) * 0.42 * (1 + followK * 0.5) : 0;
            g.position.y = gy + hop - meta.sink * 1.4;
            // squash no chão, stretch no ar + ANTECIPAÇÃO (crouch antes do salto).
            // Parado: respiração mais visível (o GLB precisa "viver" sem orelhas).
            const antic = moving ? Math.pow(1 - Math.abs(Math.sin(hopPh)), 6) * 0.22 : 0;
            const sq = moving ? 1 + Math.sin(hopPh * 2) * 0.16 - antic : 1 + Math.sin(t * 2.0 + i) * 0.05;
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
            // orelhas agora balançam pela skinning do GLB (ação "move"), não mais
            // por parts procedurais (que não existem no corpo GLB) — cf. SaltitoGLB.
        }
    });
    return (
        <Pool sp="saltito">
            {(i) => (
                <group key={i} ref={slotRef(slots, metas, i, 0.34)} visible={false}>
                    <group name="sbody">
                        {/* corpo 3D real RIGADO — hop/squash/lean vem do motor; a
                            skinning (patas/orelhas/cauda) vem da ação "move" no GLB */}
                        <SaltitoGLB slot={i} />
                    </group>
                </group>
            )}
        </Pool>
    );
};

// ── QUAD GLB: modelo 3D rigado (Cervo/Vulto) com WALK realista assado no
// Blender (4 tempos, pés plantados). Cada slot é uma cópia (SkeletonUtils
// preserva o skinning) com seu próprio mixer. O motor do Fauna posiciona/
// orienta o slot; aqui a gente só faz o crossfade walk↔idle pela velocidade
// real do bicho e sincroniza o timeScale (foot-lock aproximado). O modelo
// rigado olha −X, então giramos +90° em Y pra encarar o +Z (forward do jogo). ─
useGLTF.preload(cervoRig); useGLTF.preload(vultoRig);
const QuadGLB: React.FC<{ url: string; sp: F9Species; slot: number; scale: number }> = ({ url, sp, slot, scale }) => {
    const { scene, animations } = useGLTF(url);
    const model = useMemo(() => {
        const c = SkeletonUtils.clone(scene) as THREE.Object3D;
        const box = new THREE.Box3().setFromObject(c);
        const ctr = new THREE.Vector3(); box.getCenter(ctr);
        c.position.set(-ctr.x, -box.min.y, -ctr.z);
        c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; } });
        const wrap = new THREE.Group(); wrap.add(c);
        // o rig canoniza o focinho pra −X (Blender) → −X no glTF/three. O forward
        // do jogo é +Z, então giramos +90° em Y pra levar −X→+Z (senão anda de lado).
        wrap.rotation.y = Math.PI / 2; wrap.scale.setScalar(scale);
        return wrap;
    }, [scene, scale]);
    const { actions } = useAnimations(animations, model);
    const pick = (kw: string) => { for (const k in actions) if (k.toLowerCase().includes(kw)) return actions[k]; return null; };
    useEffect(() => {
        const w = pick('walk'), idle = pick('idle');
        if (idle) { idle.reset().play(); idle.setEffectiveWeight(1); }
        if (w) { w.reset().play(); w.setEffectiveWeight(0); }
    }, [actions]);
    useFrame((_s, dt) => {
        // DEV: focing tunável ao vivo (window.__quadFaceY) pra achar o valor certo
        const tune = (typeof window !== 'undefined') ? (window as unknown as { __quadFaceY?: number }).__quadFaceY : undefined;
        if (tune != null) model.rotation.y = tune;
        const ag = speciesSlots(sp)[slot];
        const spd = ag && ag.state !== 'dead' ? ag.speedNow : 0;
        const moving = spd > 0.08;
        const k = Math.min(1, dt * 6);
        const w = pick('walk'), idle = pick('idle');
        if (w) {
            w.setEffectiveWeight(THREE.MathUtils.lerp(w.getEffectiveWeight(), moving ? 1 : 0, k));
            w.timeScale = THREE.MathUtils.clamp(spd / 1.2, 0.8, 2.6);
        }
        if (idle) idle.setEffectiveWeight(THREE.MathUtils.lerp(idle.getEffectiveWeight(), moving ? 0 : 1, k));
    });
    return <primitive object={model} />;
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
                        {/* corpo 3D real do Felipe, rigado com WALK realista (Blender) */}
                        <QuadGLB url={cervoRig} sp="cervo" slot={i} scale={0.82} />
                        {/* a LANTERNA: halo quente acima da galhada — o farol do cervo
                            (lê a 30 u; a identidade "cervo-lanterna" mora aqui) */}
                        <mesh position={[0, 1.28, 0.12]}><sphereGeometry args={[0.34, 8, 6]} /><meshBasicMaterial color="#ffd97a" transparent opacity={0.17} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
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
                        {/* o Embervein Wolf do Felipe, rigado com WALK realista (Blender).
                            As brasas já vêm na textura; o glow abaixo é o farol de leitura
                            no breu (a identidade "predador que brilha" — §4.3/§5.19). */}
                        <QuadGLB url={vultoRig} sp="vulto" slot={i} scale={0.82} />
                        <mesh name="vglow" position={[0, 0.66, 0.55]}><sphereGeometry args={[0.17, 7, 6]} /><meshBasicMaterial color="#ff5a2a" transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
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

// ── O FIAPO em PRIMEIRA PESSOA: viewmodel 3D texturizado ────────────────────

function baked(
    geometry: THREE.BufferGeometry,
    position: readonly [number, number, number],
    rotation: readonly [number, number, number] = [0, 0, 0],
    scale: readonly [number, number, number] = [1, 1, 1],
): THREE.BufferGeometry {
    const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...scale),
    );
    geometry.applyMatrix4(matrix);
    return geometry;
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
    const result = mergeGeometries(parts, false);
    if (!result) throw new Error('Fiapo viewmodel geometry could not be merged');
    for (const part of parts) part.dispose();
    result.computeBoundingSphere();
    return result;
}

interface FiapoViewGeometry {
    muzzleFur: THREE.BufferGeometry;
    muzzleSkin: THREE.BufferGeometry;
    nostrils: THREE.BufferGeometry;
    whiskers: THREE.BufferGeometry;
    pawFur: THREE.BufferGeometry;
    pawPads: THREE.BufferGeometry;
    pawClaws: THREE.BufferGeometry;
}

function buildFiapoViewGeometry(): FiapoViewGeometry {
    const muzzleFur = merged([
        // Only the upper ridge survives at the bottom edge of the frame. A
        // complete head reads as a floating trunk in first person.
        baked(new THREE.SphereGeometry(1, 20, 12), [0, -0.860, -1.050], [0.05, 0, 0], [0.075, 0.030, 0.060]),
    ]);
    const muzzleSkin = merged([
        baked(new THREE.SphereGeometry(1, 20, 12), [0, -0.810, -1.115], [0.12, 0, 0], [0.045, 0.018, 0.030]),
    ]);
    const mouthCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.026, -0.855, -1.080),
        new THREE.Vector3(0, -0.861, -1.090),
        new THREE.Vector3(0.026, -0.855, -1.080),
    ]);
    const nostrils = merged([
        baked(new THREE.SphereGeometry(1, 10, 7), [-0.015, -0.802, -1.139], [0, 0, 0], [0.0055, 0.003, 0.004]),
        baked(new THREE.SphereGeometry(1, 10, 7), [0.015, -0.802, -1.139], [0, 0, 0], [0.0055, 0.003, 0.004]),
        new THREE.TubeGeometry(mouthCurve, 8, 0.0011, 4, false),
    ]);
    const whiskerParts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            const y = -0.834 + i * 0.009;
            const curve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(side * 0.043, y, -1.096),
                new THREE.Vector3(side * (0.108 + i * 0.005), y + 0.002, -1.105),
                new THREE.Vector3(side * (0.170 + i * 0.010), y + (i - 1) * 0.012, -1.086 + i * 0.004),
            ]);
            whiskerParts.push(new THREE.TubeGeometry(curve, 7, 0.00065, 4, false));
        }
    }
    const whiskers = merged(whiskerParts);

    const pawFurParts: THREE.BufferGeometry[] = [
        // Tapered forearm and one flat dorsal paw mass: animal anatomy rather
        // than a human palm with long sausage fingers.
        baked(new THREE.CylinderGeometry(0.055, 0.035, 0.220, 12, 2, false), [0, -0.004, 0.085], [Math.PI / 2, 0, 0]),
        baked(new THREE.SphereGeometry(1, 16, 11), [0, -0.003, -0.035], [0, 0, 0], [0.047, 0.034, 0.060]),
        baked(new THREE.SphereGeometry(1, 18, 12), [0, 0.003, -0.112], [-0.04, 0, 0], [0.074, 0.035, 0.070]),
    ];
    const pawPadParts: THREE.BufferGeometry[] = [
        baked(new THREE.SphereGeometry(1, 12, 8), [0, -0.038, -0.126], [0, 0, 0], [0.040, 0.006, 0.042]),
    ];
    const pawClawParts: THREE.BufferGeometry[] = [];
    const toeX = [-0.044, -0.015, 0.015, 0.044];
    for (let i = 0; i < toeX.length; i++) {
        const inner = i === 1 || i === 2;
        pawFurParts.push(baked(
            new THREE.SphereGeometry(1, 12, 8),
            [toeX[i], 0.006, -0.172 - (inner ? 0.006 : 0)],
            [0, 0, (i - 1.5) * 0.025],
            [0.016, 0.015, 0.021 + (inner ? 0.003 : 0)],
        ));
        pawPadParts.push(baked(
            new THREE.SphereGeometry(1, 10, 7),
            [toeX[i], -0.017, -0.178],
            [0, 0, 0],
            [0.010, 0.0035, 0.011],
        ));
        pawClawParts.push(baked(
            new THREE.ConeGeometry(0.004, 0.016, 6),
            [toeX[i], 0.004, -0.202 - (inner ? 0.004 : 0)],
            [-Math.PI / 2, 0, 0],
        ));
    }
    return {
        muzzleFur,
        muzzleSkin,
        nostrils,
        whiskers,
        pawFur: merged(pawFurParts),
        pawPads: merged(pawPadParts),
        pawClaws: merged(pawClawParts),
    };
}

function poseFiapoPaw(
    group: THREE.Group,
    side: -1 | 1,
    stride: number,
    run: number,
    t: number,
    portrait: boolean,
): void {
    const swing = stride * run;
    const lift = Math.max(0, stride) * 0.095 * run;
    const plant = Math.max(0, -stride) * 0.020 * run;
    const idle = Math.sin(t * 1.35 + side * 0.8) * 0.0025 * (1 - run);
    const spread = portrait ? 0.345 : 0.410;
    const baseY = portrait ? -0.760 : -0.720;
    group.position.set(
        side * spread + side * swing * 0.010,
        baseY + lift - plant + idle,
        -0.710 - swing * 0.055,
    );
    group.rotation.set(
        0.08 - Math.max(0, stride) * 0.20 * run,
        side * (0.055 + swing * 0.022),
        side * -0.105 + side * swing * 0.025,
    );
}

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
}> = ({ playerPositionRef, cameraThetaRef }) => {
    const { camera, gl, size } = useThree();
    const body = useRef<THREE.Group>(null!);
    const rig = useRef<THREE.Group>(null!);
    const view = useRef<THREE.Group>(null!);
    const snout = useRef<THREE.Group>(null!);
    const pawL = useRef<THREE.Group>(null!);
    const pawR = useRef<THREE.Group>(null!);
    const prev = useRef(new THREE.Vector3());
    const speed = useRef(0);
    const drop = useRef(0);
    const gait = useRef(0);
    const viewDirection = useRef(new THREE.Vector3());
    const lunge = useRef(0);   // M20: o impulso do BOTE (0..~0.26 s)
    const pounceWalls = useMemo(() => wallsForState(9, false, false), []);

    const viewGeometry = useMemo(buildFiapoViewGeometry, []);
    const viewResources = useMemo(() => {
        const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        const load = (url: string, color: boolean, repeat: number): THREE.Texture => {
            const texture = new THREE.TextureLoader().load(url);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(repeat, repeat);
            texture.anisotropy = anisotropy;
            if (color) texture.colorSpace = THREE.SRGBColorSpace;
            return texture;
        };
        const furMap = load(fiapoFurAlbedoUrl, true, 2.8);
        const furHeight = load(fiapoFurHeightUrl, false, 2.8);
        const skinMap = load(fiapoSkinAlbedoUrl, true, 2.2);
        const skinHeight = load(fiapoSkinHeightUrl, false, 2.2);
        const common = { transparent: true, opacity: 1, depthTest: true, depthWrite: true, metalness: 0 };
        const fur = new THREE.MeshStandardMaterial({
            ...common, map: furMap, bumpMap: furHeight, bumpScale: 0.0045,
            color: '#ead5aa', roughness: 0.96,
            emissive: '#211a11', emissiveMap: furMap, emissiveIntensity: 0.065,
        });
        const skin = new THREE.MeshStandardMaterial({
            ...common, map: skinMap, bumpMap: skinHeight, bumpScale: 0.0028,
            color: '#746259', roughness: 0.86,
            emissive: '#100c0a', emissiveMap: skinMap, emissiveIntensity: 0.045,
        });
        const deep = new THREE.MeshStandardMaterial({ ...common, color: '#241b18', roughness: 0.64 });
        const whisker = new THREE.MeshStandardMaterial({ ...common, color: '#e6dcc4', roughness: 0.72 });
        return { textures: [furMap, furHeight, skinMap, skinHeight], materials: { fur, skin, deep, whisker } };
    }, [gl]);

    useEffect(() => () => {
        for (const geometry of Object.values(viewGeometry)) geometry.dispose();
        for (const texture of viewResources.textures) texture.dispose();
        for (const material of Object.values(viewResources.materials)) material.dispose();
    }, [viewGeometry, viewResources]);

    // The invisible anchor keeps the follow-light and blob shadow in the world.
    useEffect(() => {
        const b = body.current;
        if (!b) return;
        b.userData.blobR = 0.34;
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
        if (!active) {
            drop.current = 0;
            gait.current = 0;
            speed.current = 0;
            lunge.current = 0;
            prev.current.copy(p);
            return;
        }

        // ── M20: O BOTE (pounce) — a caça ATIVA ──
        // consome o pedido do player (o botão/tecla chamou f9RequestPounce); o
        // abate acontece no motor (cone de ~60° à frente, ≤2.6 u). Aqui vem o
        // IMPULSO físico: um salto curto pra frente (fecha o último metro e dá
        // peso ao bote), resolvido por colisão como o resto do movimento.
        if (f9.phase === 'explorar') {
            const res = f9EcoTryPounce(p.x, p.z, cameraThetaRef.current);
            if (res) lunge.current = 0.26;   // 'catch' e 'whiff' ambos saltam
        }
        if (lunge.current > 0) {
            const th = cameraThetaRef.current;
            const fx = -Math.sin(th), fz = -Math.cos(th);
            const stp = 5.5 * dt;            // ~5,5 u/s → ~1,4 u no salto
            const [rx, rz] = resolveCollision(p.x + fx * stp, p.z + fz * stp, 0.5, pounceWalls);
            p.set(rx, p.y, rz);
            camera.position.x = rx; camera.position.z = rz;   // a lente acompanha o salto
            lunge.current -= dt;
        }

        // Real movement drives the gait. Respawn/teleport jumps do not count as
        // speed, otherwise one frame would fling both paws through the camera.
        const dx = p.x - prev.current.x, dz = p.z - prev.current.z;
        const teleported = dx * dx + dz * dz > 2.25;
        const sp = teleported ? 0 : Math.hypot(dx, dz) / Math.max(dt, 1e-4);
        if (teleported) { speed.current = 0; gait.current = 0; }
        speed.current += (Math.min(sp, 9) - speed.current) * Math.min(1, dt * 8);
        prev.current.copy(p);
        const gy = f9GroundHeight(p.x, p.z);
        const run = Math.min(1, speed.current / 4);
        if (run >= 0.08) gait.current = (gait.current + dt * (3.8 + speed.current * 1.45)) % 6;
        const gaitPhase = gait.current / 6 * Math.PI * 2;

        // a ÂNCORA invisível na posição do player: sombra-blob + follow-light
        if (body.current) body.current.position.set(p.x, gy, p.z);

        // 1ª PESSOA DE BICHO: desce a câmera do olho humano (1.6) pro olho do
        // Fiapo (~0.55 + relevo), com easing na chegada, + galope
        drop.current += (1 - drop.current) * Math.min(1, dt * 2.2);
        camera.position.y -= (1.05 - gy) * drop.current;
        camera.position.y += Math.abs(Math.sin(gaitPhase)) * 0.024 * run;
        // M21: DESPERTAR no respawn — a câmera BROTA do chão da toca (sobe da
        // terra até a altura do olho, ~1,4 s, ease-out) + uma leve tontura de
        // "acordar". É a animação de respawn que o Felipe pediu.
        if (f9WakeShare.at >= 0) {
            const wk = (f9.t - f9WakeShare.at) / 1.4;
            if (wk >= 0 && wk < 1) {
                const rise = (1 - wk) * (1 - wk);          // fundo → topo (ease-out)
                camera.position.y -= rise * 0.72;           // brota de ~0,7 u abaixo do olho
            }
        }
        const cam = camera as THREE.PerspectiveCamera;
        const viewFov = size.width / size.height < 0.85 ? 87 : 80;
        cam.fov += (viewFov - cam.fov) * (1 - Math.exp(-dt * 7));
        cam.updateProjectionMatrix();
        camera.updateMatrixWorld();

        // The rig follows the camera, while its composition stays peripheral.
        if (rig.current) {
            rig.current.position.copy(camera.position);
            rig.current.quaternion.copy(camera.quaternion);
        }
        let lookDown = 0;
        const portrait = size.width / size.height < 0.85;
        if (view.current) {
            camera.getWorldDirection(viewDirection.current);
            lookDown = THREE.MathUtils.clamp(-viewDirection.current.y, 0, 0.8);
            view.current.position.set(0, (portrait ? -0.095 : 0) + lookDown * 0.035, portrait ? -0.140 : 0);
            view.current.scale.setScalar(portrait ? 0.88 : 1);
        }
        const stride = Math.sin(gaitPhase);
        if (pawL.current) poseFiapoPaw(pawL.current, -1, stride, run, t, portrait);
        if (pawR.current) poseFiapoPaw(pawR.current, 1, -stride, run, t, portrait);
        if (snout.current) {
            const sniff = Math.pow(Math.max(0, Math.sin(t * 0.62)), 12);
            // Looking straight ahead almost erases the nose; it returns when
            // the player looks down, like a real muzzle at the edge of vision.
            const reveal = -0.230 + lookDown * 0.280;
            snout.current.position.set(
                stride * 0.0015 * run,
                reveal + sniff * 0.005 + Math.abs(stride) * 0.002 * run,
                0,
            );
            snout.current.rotation.set(
                -0.018 + sniff * 0.032 + run * 0.008,
                0,
                stride * 0.004 * run,
            );
        }
    });

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
        {/* Textured geometry lives in camera space, never as a flat image. */}
        <group ref={rig} visible={false}>
            <group ref={view}>
                <group ref={snout}>
                    <mesh geometry={viewGeometry.muzzleFur} material={viewResources.materials.fur} renderOrder={970} frustumCulled={false} onBeforeRender={(renderer) => renderer.clearDepth()} />
                    <mesh geometry={viewGeometry.muzzleSkin} material={viewResources.materials.skin} renderOrder={971} frustumCulled={false} />
                    <mesh geometry={viewGeometry.nostrils} material={viewResources.materials.deep} renderOrder={972} frustumCulled={false} />
                    <mesh geometry={viewGeometry.whiskers} material={viewResources.materials.whisker} renderOrder={973} frustumCulled={false} />
                </group>
                <group ref={pawL}>
                    <mesh geometry={viewGeometry.pawFur} material={viewResources.materials.fur} renderOrder={975} frustumCulled={false} />
                    <mesh geometry={viewGeometry.pawPads} material={viewResources.materials.skin} renderOrder={976} frustumCulled={false} />
                    <mesh geometry={viewGeometry.pawClaws} material={viewResources.materials.deep} renderOrder={977} frustumCulled={false} />
                </group>
                <group ref={pawR}>
                    <mesh geometry={viewGeometry.pawFur} material={viewResources.materials.fur} renderOrder={975} frustumCulled={false} />
                    <mesh geometry={viewGeometry.pawPads} material={viewResources.materials.skin} renderOrder={976} frustumCulled={false} />
                    <mesh geometry={viewGeometry.pawClaws} material={viewResources.materials.deep} renderOrder={977} frustumCulled={false} />
                </group>
            </group>
        </group>
    </>);
};
