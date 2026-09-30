/**
 * f13Noite.tsx — "O Sino das Horas": o sino grave da torre vira a noite.
 *
 * Três badaladas seguidas no sino GRAVE (sem melodia em curso) trazem a noite;
 * uma badalada grave à noite traz o dia de volta. A noite é uma ferramenta de
 * dedução: a casa certa acende um âmbar firme nas janelas, as erradas piscam
 * um azul frio; os moradores vão dormir; o cão uuiva para a casa certa.
 *
 * Regras de desempenho: nenhuma luz é criada ou removida (só cor/intensidade
 * das que já existem), nada é alocado por quadro, e as janelas são malhas com
 * material emissivo (escala 0 de dia, sem recompilar shader).
 */
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CASAS, CASA_CERTA } from './f13Lore';
import { LUGAR_DAS_CASAS, FORMA_DAS_CASAS, portaNoMundo } from './f13Mundo';

/** Segundos para a luz do dia virar luar (e o contrário). */
const DURACAO = 3;
/** Badaladas graves seguidas que chamam a noite, e a janela entre elas (s). */
const BADALADAS = 3;
const JANELA_DE_TEMPO = 12;

export const noite = {
    /** 0 = dia, 1 = noite (o alvo) */
    alvo: 0,
    /** 0..1, suavizado ao longo de DURACAO */
    v: 0,
    /** badaladas graves seguidas e quando foi a última */
    seguidas: 0,
    ultima: -100,
    /** o Floor13 registra aqui como mostrar um aviso na tela (uivo do cão) */
    aviso: null as ((t: string) => void) | null,
};

/** Materiais do mundo diurno que a noite escurece (registrados por Floor13Mundo). */
export const escurecer = {
    /** fumaça das chaminés (MeshBasicMaterial) */
    fumaca: null as THREE.MeshBasicMaterial | null,
    /** nuvens: uniform `noite` (0..1) */
    nuvens: null as THREE.ShaderMaterial | null,
    /** barcos: os grupos que os contêm (userData.frota) */
    frota: [] as THREE.Object3D[],
};
const COR_FUMACA_NOITE = new THREE.Color('#2a3350');
const corFumaca = new THREE.Color('#d9d4cc');
interface BaseMat { m: THREE.MeshStandardMaterial; cor: THREE.Color; env: number }

/** Nome de bússola (−z = norte) da direção de (x, z) até a casa certa. */
const PONTOS = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'];
export function bussolaParaCasaCerta(x: number, z: number): string {
    const p = portaNoMundo(CASA_CERTA);
    const a = Math.atan2(p.x - x, -(p.z - z));   // 0 = norte, cresce para leste
    return PONTOS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

/** De noite os moradores estão dormindo: o Floor13 não os deixa falar. */
export const moradoresDormem = (): boolean => noite.v > .5;
/** A direção (yaw) da casa certa vista de (x, z) — para o cão uivar. */
export function yawParaCasaCerta(x: number, z: number): number {
    const p = portaNoMundo(CASA_CERTA);
    return Math.atan2(p.x - x, p.z - z);
}

// ── SOM: o uivo (WebAudio puro) ─────────────────────────────────────────────
let ac: AudioContext | null = null;
function uivar(): void {
    try {
        if (!ac) {
            const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AC) return;
            ac = new AC();
        }
        if (ac.state === 'suspended') void ac.resume();
        const t = ac.currentTime;
        const o = ac.createOscillator(), vib = ac.createOscillator(), vg = ac.createGain(), g = ac.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(330, t);
        o.frequency.exponentialRampToValueAtTime(620, t + .9);
        o.frequency.setValueAtTime(620, t + 1.5);
        o.frequency.exponentialRampToValueAtTime(400, t + 2.6);
        vib.frequency.value = 6; vg.gain.value = 9;
        vib.connect(vg); vg.connect(o.frequency);
        g.gain.setValueAtTime(1e-4, t);
        g.gain.exponentialRampToValueAtTime(.12, t + .4);
        g.gain.exponentialRampToValueAtTime(1e-4, t + 2.7);
        o.connect(g); g.connect(ac.destination);
        o.start(t); vib.start(t); o.stop(t + 2.8); vib.stop(t + 2.8);
    } catch { /* sem áudio: a noite segue muda */ }
}

// ── O TOQUE NO SINO ─────────────────────────────────────────────────────────
/**
 * O Floor13 chama isto depois de cada badalada. `passoAntes` é o passo da
 * melodia ANTES desta badalada (0 = nenhuma em curso). Devolve um aviso, ou
 * null quando nada mudou.
 */
export function aoTocarSino(i: number, passoAntes: number, agora: number): string | null {
    if (i !== 0) { noite.seguidas = 0; return null; }
    if (noite.alvo === 1) {
        noite.seguidas = 0;
        return definirNoite(false);
    }
    noite.seguidas = agora - noite.ultima < JANELA_DE_TEMPO ? noite.seguidas + 1 : 1;
    noite.ultima = agora;
    if (noite.seguidas >= BADALADAS && passoAntes === 0) {
        noite.seguidas = 0;
        return definirNoite(true);
    }
    if (noite.seguidas === BADALADAS - 1) return 'O bronze grave ainda vibra na viga, como se esperasse mais uma badalada.';
    return null;
}

/** Liga ou desliga a noite (também usada pela bancada). Devolve o aviso. */
export function definirNoite(ligada: boolean): string {
    noite.alvo = ligada ? 1 : 0;
    noite.seguidas = 0;
    if (ligada) {
        window.setTimeout(uivar, 900);
        return 'A terceira badalada rola pelo vale e a luz do dia escorre do céu. É noite em Vindhjem: o povo foi dormir e lá longe um cão uiva. Quando quiser o dia de volta, é só tocar o sino grave mais uma vez.';
    }
    return 'O sino grave chama o sol de volta. Vindhjem acorda.';
}

/** O rótulo do botão do sino grave, à noite. */
export const rotuloDaNoite = (i: number, base: string): string =>
    i === 0 && noite.alvo === 1 ? 'TOCAR O SINO GRAVE · CHAMAR O DIA' : base;

// ── LUZ E CÉU ───────────────────────────────────────────────────────────────
const COR_HEMI_CEU = new THREE.Color('#8fb0f0'), COR_HEMI_CHAO = new THREE.Color('#3d4d85');
const COR_SOL = new THREE.Color('#b8ccff'), COR_OUTRA = new THREE.Color('#7f9be8');
const COR_NEVOA_DIA = new THREE.Color('#a9c6e2');
const COR_NEVOA = new THREE.Color('#1d2c5c');
const NEVOA_DIA = .0014, NEVOA_NOITE = .0019;
const MAX = 8;

interface Guardada { luz: THREE.Light; cor: THREE.Color; chao: THREE.Color; inten: number; tipo: 0 | 1 | 2 }

// ── JANELAS ─────────────────────────────────────────────────────────────────
/** Onde ficam as janelas no modelo da casa (3,4 × 5,6 m, porta em +z). */
const JANELAS: ReadonlyArray<readonly [number, number, number, number]> = [
    // x, y, z, giro
    [-1.05, 1.55, 3.0, 0], [1.05, 1.55, 3.0, 0],
    [1.9, 1.55, .6, Math.PI / 2], [-1.9, 1.55, .6, -Math.PI / 2],
    [1.9, 1.55, -1.6, Math.PI / 2], [-1.9, 1.55, -1.6, -Math.PI / 2],
];
const AMBAR = new THREE.Color('#ff8f1f'), AZUL = new THREE.Color('#5f8dff');

/** Degradê radial para o halo aditivo das janelas. */
function texHalo(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
}

/**
 * <NoiteDoMundo/> — devolve as janelas e conduz o relógio da noite (luzes,
 * névoa, céu). Montar dentro do Canvas.
 */
export function NoiteDoMundo(): React.ReactElement {
    const geo = useMemo(() => new THREE.PlaneGeometry(.62, .8), []);
    const geoQuadro = useMemo(() => new THREE.PlaneGeometry(.82, 1.0), []);
    const matQuadro = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: .9 }), []);
    const mats = useMemo(() => CASAS.map((_, i) => new THREE.MeshStandardMaterial({
        color: '#000000', emissive: i === CASA_CERTA ? AMBAR : AZUL, emissiveIntensity: 0,
    })), []);
    const halos = useMemo(() => {
        const tex = texHalo();
        return CASAS.map((_, i) => new THREE.SpriteMaterial({
            map: tex, color: i === CASA_CERTA ? AMBAR : AZUL, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
        }));
    }, []);
    const glows = useMemo(() => {
        const tex = halos[0].map!;
        return CASAS.map((_, i) => new THREE.SpriteMaterial({
            map: tex, color: i === CASA_CERTA ? AMBAR : AZUL, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
        }));
    }, [halos]);
    const spr = useRef<THREE.Sprite[][]>(CASAS.map(() => []));
    const bases = useRef<BaseMat[]>([]);
    const grupos = useRef<Array<THREE.Group | null>>([]);
    const luzes = useRef<Guardada[]>([]);
    const ceu = useRef<THREE.Object3D | null>(null);
    const ceuBase = useRef({ y: 0, ray: 0, achado: false });
    const quadros = useRef(0);
    const envBase = useRef(-1);
    const fase = useRef(0);   // dia = 0; muda quando a v cruza para o lado oposto

    useFrame((estado, dt) => {
        const cena = estado.scene;
        const d = dt > .25 ? .25 : dt;
        // acha as luzes e o céu uma vez (sem alocar por quadro depois)
        if ((luzes.current.length === 0 || !ceu.current) && (quadros.current++ % 30 === 0)) {
            cena.traverse((o) => {
                const l = o as THREE.Light;
                if (luzes.current.length < MAX && (l as THREE.HemisphereLight).isHemisphereLight
                    && !luzes.current.some((g) => g.luz === l)) {
                    const h = l as THREE.HemisphereLight;
                    luzes.current.push({ luz: l, cor: h.color.clone(), chao: h.groundColor.clone(), inten: h.intensity, tipo: 0 });
                } else if (luzes.current.length < MAX && (l as THREE.DirectionalLight).isDirectionalLight
                    && !luzes.current.some((g) => g.luz === l)) {
                    luzes.current.push({ luz: l, cor: l.color.clone(), chao: l.color, inten: l.intensity, tipo: (l as THREE.DirectionalLight).castShadow ? 1 : 2 });
                }
                if ((o as { isSky?: boolean }).isSky) ceu.current = o;
            });
        }
        // o relógio
        const alvo = noite.alvo;
        if (noite.v !== alvo) {
            const passo = d / DURACAO;
            noite.v = alvo > noite.v ? Math.min(alvo, noite.v + passo) : Math.max(alvo, noite.v - passo);
        }
        const v = noite.v, s = v * v * (3 - 2 * v);
        // luzes (só cor e intensidade; a base é relida enquanto é dia pleno)
        for (const g of luzes.current) {
            const l = g.luz;
            if (v === 0) {
                g.inten = l.intensity;
                if (g.tipo === 0) { const h = l as THREE.HemisphereLight; g.cor.copy(h.color); g.chao.copy(h.groundColor); }
                else g.cor.copy(l.color);
                continue;
            }
            if (g.tipo === 0) {
                const h = l as THREE.HemisphereLight;
                h.color.lerpColors(g.cor, COR_HEMI_CEU, s); h.groundColor.lerpColors(g.chao, COR_HEMI_CHAO, s);
                h.intensity = g.inten * (1 + 1.5 * s);
            } else if (g.tipo === 1) {
                l.color.lerpColors(g.cor, COR_SOL, s); l.intensity = g.inten * (1 - .68 * s);
            } else {
                l.color.lerpColors(g.cor, COR_OUTRA, s); l.intensity = g.inten * (1 + .6 * s);
            }
        }
        // névoa, reflexo de ambiente e céu
        const nv = cena.fog;
        if (nv instanceof THREE.FogExp2) {
            if (v > 0 || fase.current) { nv.color.copy(COR_NEVOA_DIA).lerp(COR_NEVOA, s); nv.density = THREE.MathUtils.lerp(NEVOA_DIA, NEVOA_NOITE, s); }
        }
        if (envBase.current < 0) envBase.current = cena.environmentIntensity;
        if (v > 0 || fase.current) cena.environmentIntensity = envBase.current * (1 - .25 * s);
        const c = ceu.current as THREE.Mesh | null;
        if (c) {
            const u = (c.material as THREE.ShaderMaterial).uniforms;
            if (!ceuBase.current.achado) { ceuBase.current.y = u.sunPosition.value.y; ceuBase.current.ray = u.rayleigh.value; ceuBase.current.achado = true; }
            if (v > 0 || fase.current) {
                u.sunPosition.value.y = THREE.MathUtils.lerp(ceuBase.current.y, -.12, s);
                if (u.noite) u.noite.value = s;
                u.rayleigh.value = THREE.MathUtils.lerp(ceuBase.current.ray, 2.2, s);
            }
        }
        // fumaça, nuvens e barcos: escurecem com a noite (só cor/uniform)
        if (v > 0 || fase.current) {
            if (escurecer.fumaca) escurecer.fumaca.color.lerpColors(corFumaca, COR_FUMACA_NOITE, s);
            if (escurecer.nuvens) escurecer.nuvens.uniforms.noite.value = s;
            if (bases.current.length === 0 && escurecer.frota.length) {
                const vistos = new Set<THREE.Material>();
                for (const r of escurecer.frota) r.traverse((o) => {
                    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
                    if (m && m.isMeshStandardMaterial && !vistos.has(m)) { vistos.add(m); bases.current.push({ m, cor: m.color.clone(), env: m.envMapIntensity }); }
                });
            }
            for (const b of bases.current) { b.m.color.copy(b.cor).multiplyScalar(1 - .72 * s); b.m.envMapIntensity = b.env * (1 - .85 * s); }
        }
        fase.current = v > 0 ? 1 : 0;
        // janelas: apagadas (escala 0) de dia; à noite acendem
        const t = estado.clock.elapsedTime;
        const gs = grupos.current;
        for (let i = 0; i < gs.length; i++) {
            const gr = gs[i]; if (!gr) continue;
            const on = v > .02;
            if (gr.visible !== on) gr.visible = on;
            if (!on) continue;
            let k: number;
            if (i === CASA_CERTA) k = 3.4 * s;   // âmbar firme e forte
            else {
                // azul frio tremendo: dois senos incomensuráveis por casa + falha rara
                const f = .5 + .35 * Math.sin(t * 7.3 + i * 2.1) + .3 * Math.sin(t * 17.9 + i * 5.3);
                k = Math.max(.05, f) * 2.6 * s;
            }
            mats[i].emissiveIntensity = k;
            halos[i].opacity = i === CASA_CERTA ? .85 * s : Math.min(.55, k * .22);
            glows[i].opacity = i === CASA_CERTA ? .5 * s : Math.min(.3, k * .1);
            // halos crescem com a distância para ler da praça
            const d = gr.position.distanceTo(estado.camera.position);
            const m = Math.min(5, Math.max(1, d / 14));
            const ss = spr.current[i];
            for (let q = 0; q < ss.length; q++) {
                const sp = ss[q]; if (!sp) continue;
                const e = q === 6 ? 9 * m : 2.3 * m;
                sp.scale.set(e, e, 1);
            }
        }
    });

    return <group>
        {CASAS.map((_, i) => {
            const l = LUGAR_DAS_CASAS[i], f = FORMA_DAS_CASAS[i];
            return <group key={i} ref={(r) => { grupos.current[i] = r; }} visible={false}
                position={[l.x, l.y, l.z]} rotation={[0, f.giro, 0]} scale={f.escala as [number, number, number]}>
                {JANELAS.map((w, k) => <group key={k} position={[w[0], w[1], w[2]]} rotation={[0, w[3], 0]}>
                    <mesh geometry={geoQuadro} material={matQuadro} />
                    <mesh geometry={geo} material={mats[i]} position={[0, 0, .012]} />
                    <sprite ref={(r) => { if (r) spr.current[i][k] = r; }} material={halos[i]} position={[0, 0, .25]} scale={[2.3, 2.3, 1]} />
                </group>)}
                <sprite ref={(r) => { if (r) spr.current[i][6] = r; }} material={glows[i]} position={[0, 2, 3.4]} scale={[9, 9, 1]} />
            </group>;
        })}
    </group>;
}
