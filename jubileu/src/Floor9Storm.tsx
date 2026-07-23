/**
 * Floor9Storm.tsx — A TEMPESTADE DE VERDADE do Viveiro (B1 + pass de arte D3).
 *
 * A onda de apagamento deixa de ser "a parede branca que vem" e vira CLIMA:
 *  - CHUVA instanciada (~1200 gotas-risco 0.008×0.55) caindo ~18 u/s numa
 *    caixa 30×18×30 ANCORADA NA CÂMERA (wrap no Y, padrão das folhas da
 *    cutscene). Densidade por fase: 0 calmo · ~8% aviso (pingos) · 100% onda.
 *  - SPLASHES: 200 anéis instanciados no chão (y = f9GroundHeight + 0.02),
 *    escala 0→~0.3 com fade de 0.4 s, reciclados por uma fila circular.
 *  - POÇAS: discos metalness 0.9 / roughness 0.15 (cor fria #1c2a28) nos
 *    pontos baixos da trilha do fio; enchem com f9eco.waveT na onda e secam
 *    no renascer. 4 são PERMANENTES (o lugar é ENCHARCADO, não só chove às
 *    vezes): nunca descem de 0.65 de cheio, mancham o chão em volta e
 *    devolvem a luz com um disco aditivo sutil na cor do céu da fase.
 *  - RELÂMPAGOS: agendador 3–8 s durante a onda — spike de uma directional
 *    própria (→6) + o céu clareia em 2 pulsos de ~90 ms + trovão (floor9Sfx)
 *    com atraso de 0.5–2 s. O clarão também vaza pro fog via f9StormShare.
 *    O céu é escrito SÓ durante o clarão (congelando a cor da fase como
 *    base); fora dele a floresta é dona da cor (lerp por fase).
 *  - GAROA DO RENASCER: ~40 esporos caindo lento ao redor da câmera durante
 *    o renascer — o "pó do mundo refeito" (a chuva morre com a onda; o que
 *    fica é o pó luminoso, 80% quente #e8f4d8 / 20% frio #cfe0ff).
 *  - A PAREDE da onda continua (é o apagamento), mas recuada: branco-osso
 *    #e6eee0 (o fog da onda), opacidade 0.55, ATRÁS da chuva (renderOrder)
 *    — a chuva protagoniza.
 *
 * Perf: 1 draw de chuva + 1 de splash + 3 de poças (lâmina/reflexo/mancha)
 * + 1 da garoa (só no renascer) + 1 da parede. Matrizes só são reescritas
 * enquanto a fase pede densidade > 0.
 *
 * P0 MOBILE: os orçamentos vêm de f9Quality.ts (mesma chave do Settings) —
 * fora do 'high' a chuva cai pra ≤300 gotas e os splashes pra ≤48 (o dilúvio
 * de 1200 gotas + 200 splashes travava o celular na onda).
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rng } from './Floor6Textures';
import { f9eco } from './f9Eco';
import { F9_FIO } from './f9Floresta';
import { f9GroundHeight } from './f9Ground';
import { playFloor9Thunder } from './floor9Sfx';
import { f9Quality, F9_RAIN_N, F9_SPLASH_N, F9_SPLASH_RATE } from './f9Quality';

/** refs compartilhadas com a floresta (sem traversal de cena por frame). */
export const f9StormShare = {
    /** material do céu acima da copa — a floresta o registra no mount. */
    skyMat: null as THREE.MeshBasicMaterial | null,
    /** 0..1 clarão do relâmpago neste frame (a floresta lê pro fog/luz). */
    flash: 0,
};

const RAIN_BOX = 15;     // metade da caixa x/z ao redor da câmera
const RAIN_TOP = 18;     // altura da caixa (wrap)
const FALL_SPEED = 18;   // u/s

// densidade alvo por fase (0 calmo · pingos no aviso · dilúvio na onda)
function rainTarget(): number {
    if (f9eco.phase === 'onda') return 1;
    if (f9eco.phase === 'aviso') return 0.08;
    return 0; // calmo e renascer (a chuva morre com a onda; o renascer tem a garoa)
}

// ── CHUVA ────────────────────────────────────────────────────────────────────
const Rain: React.FC = () => {
    const quality = useMemo(f9Quality, []); // P0: fora do high a caixa cai pra ≤300 gotas
    const RAIN_N = F9_RAIN_N(quality);
    const built = useMemo(() => {
        // gotas mais longas/grossas que o B1: contra o fog branco da onda a
        // chuva precisa RISCAR pra ler como dilúvio (cor/opacidade do brief).
        // No tier leve a gota engrossa um pouco (300 precisam LER como chuva).
        const lite = RAIN_N <= 300;
        const geo = new THREE.CylinderGeometry(lite ? 0.011 : 0.008, lite ? 0.011 : 0.008, lite ? 0.62 : 0.55, 4);
        const mat = new THREE.MeshBasicMaterial({ color: '#9db4c2', transparent: true, opacity: lite ? 0.5 : 0.42, depthWrite: false });
        const mesh = new THREE.InstancedMesh(geo, mat, RAIN_N);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false; // ancorada na câmera: sempre visível
        mesh.renderOrder = 9;       // na FRENTE da parede da onda
        mesh.count = 0;
        const r = rng(941);
        // por gota: offset na caixa + fator de velocidade
        const ox = new Float32Array(RAIN_N), oy = new Float32Array(RAIN_N), oz = new Float32Array(RAIN_N);
        const vf = new Float32Array(RAIN_N);
        for (let i = 0; i < RAIN_N; i++) {
            ox[i] = (r() * 2 - 1) * RAIN_BOX;
            oy[i] = r() * RAIN_TOP;
            oz[i] = (r() * 2 - 1) * RAIN_BOX;
            vf[i] = 0.85 + r() * 0.3;
        }
        return { mesh, geo, mat, ox, oy, oz, vf };
    }, []);
    const density = useRef(0);
    const scratch = useMemo(() => ({ m4: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1) }), []);

    useFrame(({ camera, clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const { mesh, ox, oy, oz, vf } = built;
        const { m4, q, e, p, s } = scratch;
        // densidade suavizada (a chuva "chega" e "vai embora", não pisca)
        const target = rainTarget();
        density.current += (target - density.current) * Math.min(1, dt * (target > density.current ? 1.4 : 0.55));
        const n = Math.floor(RAIN_N * density.current);
        mesh.count = n;
        if (n === 0) return;
        const cx = camera.position.x, cz = camera.position.z;
        // vento: inclinação compartilhada (rajada lenta), cresce na onda
        const windK = f9eco.phase === 'onda' ? 1 : 0.35;
        const tiltZ = (-0.12 - Math.sin(t * 0.6) * 0.05) * windK;
        const tiltX = (Math.sin(t * 0.43) * 0.06) * windK;
        e.set(tiltX, 0, tiltZ); q.setFromEuler(e);
        for (let i = 0; i < n; i++) {
            let y = oy[i] - FALL_SPEED * vf[i] * dt;
            const wx = cx + ox[i], wz = cz + oz[i];
            if (y < f9GroundHeight(wx, wz)) {
                y += RAIN_TOP; // wrap pro topo (nova coluna x/z pra não canalizar)
                ox[i] = (Math.random() * 2 - 1) * RAIN_BOX;
                oz[i] = (Math.random() * 2 - 1) * RAIN_BOX;
            }
            oy[i] = y;
            p.set(wx, y, wz);
            m4.compose(p, q, s);
            mesh.setMatrixAt(i, m4);
        }
        mesh.instanceMatrix.needsUpdate = true;
    });

    return <primitive object={built.mesh} />;
};

// ── SPLASHES: anéis que nascem, abrem e morrem (0.4 s) ───────────────────────
const Splashes: React.FC = () => {
    const quality = useMemo(f9Quality, []); // P0: ≤48 anéis fora do high (era 200)
    const SPLASH_N = F9_SPLASH_N(quality);
    const SPAWN_RATE = F9_SPLASH_RATE(quality);
    const built = useMemo(() => {
        const geo = new THREE.RingGeometry(0.05, 0.1, 10);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({
            color: '#ffffff', transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, // preto = invisível: o fade é por cor
        });
        const mesh = new THREE.InstancedMesh(geo, mat, SPLASH_N);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.renderOrder = 9;
        const px = new Float32Array(SPLASH_N), py = new Float32Array(SPLASH_N), pz = new Float32Array(SPLASH_N);
        const age = new Float32Array(SPLASH_N).fill(9); // 9 = slot morto
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
        const black = new THREE.Color(0, 0, 0);
        for (let i = 0; i < SPLASH_N; i++) { // tudo morto no boot
            p.set(0, -50, 0); s.setScalar(0.001); m4.compose(p, q, s);
            mesh.setMatrixAt(i, m4); mesh.setColorAt(i, black);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        return { mesh, geo, mat, px, py, pz, age };
    }, []);
    const scratch = useMemo(() => ({
        m4: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(),
        c: new THREE.Color(), live: new THREE.Color('#8fa8b8'),
    }), []);
    const cursor = useRef(0);
    const spawnAcc = useRef(0);

    useFrame(({ camera }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const { mesh, px, py, pz, age } = built;
        const { m4, q, p, s, c, live } = scratch;
        // nasce splash na taxa da chuva (~110/s no dilúvio high, ~36/s no leve)
        const target = rainTarget();
        spawnAcc.current += dt * SPAWN_RATE * target;
        while (spawnAcc.current >= 1) {
            spawnAcc.current -= 1;
            // procura um slot morto a partir do cursor (fila circular)
            for (let k = 0; k < SPLASH_N; k++) {
                const i = (cursor.current + k) % SPLASH_N;
                if (age[i] > 0.4) {
                    cursor.current = (i + 1) % SPLASH_N;
                    const a = Math.random() * Math.PI * 2, rr = 1.5 + Math.random() * 12.5;
                    const x = camera.position.x + Math.cos(a) * rr;
                    const z = camera.position.z + Math.sin(a) * rr;
                    px[i] = x; pz[i] = z; py[i] = f9GroundHeight(x, z) + 0.02; age[i] = 0;
                    break;
                }
            }
        }
        let any = target > 0;
        for (let i = 0; i < SPLASH_N; i++) {
            if (age[i] > 0.4) continue;
            any = true;
            age[i] += dt;
            const kk = Math.min(1, age[i] / 0.4);
            p.set(px[i], py[i], pz[i]); s.setScalar(0.2 + kk * 3.0);
            m4.compose(p, q, s);
            mesh.setMatrixAt(i, m4);
            c.copy(live).multiplyScalar((1 - kk) * 0.55);
            mesh.setColorAt(i, c);
        }
        if (any) {
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
    });

    return <primitive object={built.mesh} />;
};

// ── POÇAS: espelhos frios nos pontos baixos da trilha. 4 PERMANENTES (o
// viveiro é encharcado, não só chove às vezes); as demais enchem na onda e
// secam no renascer. Cada poça devolve a luz: um disco aditivo sutil por cima
// segue a cor do céu da fase (clarão do relâmpago incluso). ──────────────────
const PUDDLE_R = [1.3, 0.9, 1.5, 1.0, 1.2, 0.8, 1.4, 1.0, 1.1]; // 1 por ponto do fio (9)
// os 4 pontos mais baixos junto à trilha (amostrados de f9GroundHeight):
// [x, z, raio] — vivem meio-cheios até no calmo e mancham o chão em volta
const PUDDLE_PERM: ReadonlyArray<readonly [number, number, number]> = [
    [-10.4, -27.2, 1.6], [12.9, -36.7, 1.3], [-15.0, -22.5, 1.5], [-4.7, -2.0, 1.2],
];
const Puddles: React.FC = () => {
    const built = useMemo(() => {
        const geo = new THREE.CircleGeometry(1, 22);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({
            color: '#1c2a28', metalness: 0.9, roughness: 0.15,
            transparent: true, opacity: 0.88,
            // lift frio próprio: sem envmap o metal puro apaga — a lâmina
            // precisa ler como ÁGUA mesmo no breu do calmo
            emissive: '#16211e', emissiveIntensity: 0.65,
        });
        const total = PUDDLE_R.length + PUDDLE_PERM.length;
        const mesh = new THREE.InstancedMesh(geo, mat, total);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.renderOrder = 2;
        // o REFLEXO do céu: disco aditivo menor, um fio acima da lâmina
        const skyGeo = new THREE.CircleGeometry(1, 22);
        skyGeo.rotateX(-Math.PI / 2);
        const skyMatRef = new THREE.MeshBasicMaterial({
            // brief dizia op 0.06 — na prática (chão escuro, sem envmap) a
            // poça não "devolvia" luz nenhuma; 0.2 é o mínimo que lê
            color: '#7e9a82', transparent: true, opacity: 0.2, depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const skyRef = new THREE.InstancedMesh(skyGeo, skyMatRef, total);
        skyRef.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        skyRef.renderOrder = 3;
        // a MANCHA de terra encharcada sob as permanentes (o chão escurece)
        const stainGeo = new THREE.CircleGeometry(1, 22);
        stainGeo.rotateX(-Math.PI / 2);
        const stainMat = new THREE.MeshBasicMaterial({
            color: '#0b130e', transparent: true, opacity: 0.42, depthWrite: false,
        });
        const stain = new THREE.InstancedMesh(stainGeo, stainMat, PUDDLE_PERM.length);
        stain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        stain.renderOrder = 1;
        // pontos baixos AO LADO da trilha do fio (a trilha é aplanada/alta)
        const spots: Array<[number, number, number]> = [];
        const r = rng(943);
        F9_FIO.forEach(([fx, fz], i) => {
            if (i === 0) spots.push([1.8, -0.5, PUDDLE_R[0]]); // perto do pouso
            else {
                const side = i % 2 === 0 ? 1 : -1;
                const off = 1.4 + r() * 1.2;
                spots.push([fx + side * off, fz + (r() - 0.5) * 1.6, PUDDLE_R[i]]);
            }
        });
        PUDDLE_PERM.forEach(([x, z, pr]) => spots.push([x, z, pr]));
        return { mesh, geo, mat, skyRef, skyMatRef, stain, spots, total };
    }, []);
    const scale = useRef(new Float32Array(PUDDLE_R.length + PUDDLE_PERM.length));
    const scratch = useMemo(() => ({ m4: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3() }), []);

    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const { mesh, skyRef, skyMatRef, stain, spots, total } = built;
        const { m4, q, p, s } = scratch;
        // alvo: aviso começa a encher; onda cresce com waveT; renascer seca;
        // calmo ~0 — menos as PERMANENTES, que nunca descem de 0.5
        let target = 0;
        if (f9eco.phase === 'aviso') target = 0.35;
        else if (f9eco.phase === 'onda') target = 0.35 + Math.min(1, f9eco.waveT / 9) * 0.75;
        else if (f9eco.phase === 'renascer') target = 0.1;
        const permT = Math.max(0.65, target);
        // a poça "devolve" a cor do céu da fase (e o clarão, quando há)
        const sky = f9StormShare.skyMat;
        if (sky) skyMatRef.color.copy(sky.color);
        for (let i = 0; i < total; i++) {
            const perm = i >= PUDDLE_R.length;
            const tgt = perm ? permT : target;
            const cur = scale.current[i];
            const next = cur + (tgt - cur) * Math.min(1, dt * (tgt > cur ? 0.5 : 0.35));
            scale.current[i] = next;
            const [x, z, pr] = spots[i];
            const gy = f9GroundHeight(x, z);
            p.set(x, gy + 0.015, z);
            s.setScalar(Math.max(0.001, next * pr));
            m4.compose(p, q, s);
            mesh.setMatrixAt(i, m4);
            p.set(x, gy + 0.024, z);
            s.setScalar(Math.max(0.001, next * pr * 0.9));
            m4.compose(p, q, s);
            skyRef.setMatrixAt(i, m4);
            if (perm) {
                p.set(x, gy + 0.008, z);
                s.setScalar(Math.max(0.001, next * pr * 1.45));
                m4.compose(p, q, s);
                stain.setMatrixAt(i - PUDDLE_R.length, m4);
            }
        }
        mesh.instanceMatrix.needsUpdate = true;
        skyRef.instanceMatrix.needsUpdate = true;
        stain.instanceMatrix.needsUpdate = true;
    });

    return (
        <>
            <primitive object={built.stain} />
            <primitive object={built.mesh} />
            <primitive object={built.skyRef} />
        </>
    );
};

// ── RELÂMPAGOS: agendador 3–8 s na onda; spike de luz + céu + trovão atrasado ─
const Lightning: React.FC = () => {
    const light = useRef<THREE.DirectionalLight>(null!);
    const nextAt = useRef(4 + Math.random() * 4);
    const flashT = useRef(9); // 9 = sem clarão
    // base congelada no início do clarão (a cor da fase naquele instante) —
    // fora do clarão o céu é da floresta e a gente só acompanha
    const skyBase = useMemo(() => new THREE.Color('#7e9a82'), []);
    const skyHot = useMemo(() => new THREE.Color('#f4faec'), []); // branco-osso estourado
    const wasFlash = useRef(false);
    const scratch = useMemo(() => ({ c: new THREE.Color() }), []);

    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        // agenda só durante a onda (o aviso ameaça, a onda DESABA)
        if (f9eco.phase === 'onda' && t >= nextAt.current) {
            nextAt.current = t + 3 + Math.random() * 5;
            flashT.current = 0;
            playFloor9Thunder(0.5 + Math.random() * 1.5);
        }
        if (f9eco.phase !== 'onda' && flashT.current > 1) nextAt.current = t + 2 + Math.random() * 3;
        // envelope: 2 pulsos de ~90 ms (pico → queda → pico menor → fim)
        flashT.current += dt;
        const ft = flashT.current;
        let v = 0;
        if (ft < 0.09) v = 1 - ft / 0.09 * 0.55;
        else if (ft < 0.16) v = 0.45 + (ft - 0.09) / 0.07 * 0.35;
        else if (ft < 0.3) v = Math.max(0, 0.8 * (1 - (ft - 0.16) / 0.14));
        f9StormShare.flash = v;
        if (light.current) light.current.intensity = v * 6;
        const sky = f9StormShare.skyMat;
        if (sky) {
            if (v > 0) {
                // o clarão escreve POR CIMA da cor da fase congelada
                scratch.c.copy(skyBase).lerp(skyHot, v * 0.85);
                sky.color.copy(scratch.c);
            } else {
                if (wasFlash.current) sky.color.copy(skyBase); // devolve o céu pré-clarão
                skyBase.copy(sky.color); // segue a fase enquanto não há clarão
            }
            wasFlash.current = v > 0;
        }
    });

    return <directionalLight ref={light} position={[6, 18, 4]} intensity={0} color="#edf7e4" />;
};

// ── GAROA DO RENASCER: o pó do mundo refeito caindo lento (não é chuva — é o
// que sobra dela). ~40 esporos ancorados na câmera, 80% quente / 20% frio. ────
const DRIZZLE_N = 44;
const DRIZZLE_BOX = 11;   // metade da caixa x/z ao redor da câmera
const DRIZZLE_TOP = 7.5;  // altura do wrap
const RebirthDrizzle: React.FC = () => {
    const built = useMemo(() => {
        const r = rng(947);
        const pos = new Float32Array(DRIZZLE_N * 3);
        const col = new Float32Array(DRIZZLE_N * 3);
        const ox = new Float32Array(DRIZZLE_N), oy = new Float32Array(DRIZZLE_N), oz = new Float32Array(DRIZZLE_N);
        const vf = new Float32Array(DRIZZLE_N), ph = new Float32Array(DRIZZLE_N);
        const warm = new THREE.Color('#e8f4d8'), cold = new THREE.Color('#cfe0ff');
        for (let i = 0; i < DRIZZLE_N; i++) {
            ox[i] = (r() * 2 - 1) * DRIZZLE_BOX;
            oy[i] = 0.4 + r() * DRIZZLE_TOP;
            oz[i] = (r() * 2 - 1) * DRIZZLE_BOX;
            // as duas temperaturas do color script: vida quente × frio
            const c = r() < 0.8 ? warm : cold;
            col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
            vf[i] = 0.3 + r() * 0.25; // cai devagar — pó, não gota
            ph[i] = r() * Math.PI * 2;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const mat = new THREE.PointsMaterial({
            size: 0.09, transparent: true, opacity: 0, depthWrite: false,
            blending: THREE.AdditiveBlending, vertexColors: true,
        });
        const pts = new THREE.Points(g, mat);
        pts.frustumCulled = false;
        pts.renderOrder = 9;
        pts.visible = false;
        return { g, mat, pts, ox, oy, oz, vf, ph };
    }, []);
    const op = useRef(0);

    useFrame(({ camera, clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const { g, mat, pts, ox, oy, oz, vf, ph } = built;
        // só no renascer: entra suave e some com a fase (sem piscar).
        // op alta: contra o fog CLARO do renascer o aditivo precisa de força
        const target = f9eco.phase === 'renascer' ? 0.7 : 0;
        op.current += (target - op.current) * Math.min(1, dt * 1.2);
        mat.opacity = op.current;
        pts.visible = op.current > 0.01;
        if (!pts.visible) return;
        const t = clock.elapsedTime;
        const cx = camera.position.x, cz = camera.position.z;
        const attr = g.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < DRIZZLE_N; i++) {
            let y = oy[i] - vf[i] * dt;
            const wx = cx + ox[i] + Math.sin(t * 0.7 + ph[i]) * 0.5;
            const wz = cz + oz[i];
            if (y < f9GroundHeight(wx, wz) + 0.05) {
                y += DRIZZLE_TOP; // volta pro alto (nova coluna, como a chuva)
                ox[i] = (Math.random() * 2 - 1) * DRIZZLE_BOX;
                oz[i] = (Math.random() * 2 - 1) * DRIZZLE_BOX;
            }
            oy[i] = y;
            attr.setXYZ(i, wx, y, wz);
        }
        attr.needsUpdate = true;
    });

    return <primitive object={built.pts} />;
};

// ── A PAREDE da onda (repensada: recuada, a chuva é a protagonista) ──────────
const WaveWall: React.FC = () => {
    const wall = useRef<THREE.Mesh>(null!);
    const mat = useMemo(() => new THREE.MeshBasicMaterial({
        color: '#e6eee0', transparent: true, opacity: 0, depthWrite: false, fog: false,
    }), []);
    useFrame(() => {
        if (!wall.current) return;
        if (f9eco.phase === 'onda') {
            wall.current.visible = true;
            const k = Math.min(1, f9eco.waveT / 10);
            wall.current.position.z = 6 - k * 62;
            mat.opacity = 0.55; // era 0.9 branco-cego: agora a chuva cobre o resto
        } else if (f9eco.phase === 'aviso') {
            wall.current.visible = true;
            wall.current.position.z = 8;
            mat.opacity = 0.16 + Math.sin(f9eco.t * 3) * 0.06;
        } else { wall.current.visible = false; mat.opacity = 0; }
    });
    return (
        <mesh ref={wall} visible={false} material={mat} position={[0, 6, 8]} renderOrder={8}>
            <boxGeometry args={[76, 17, 3]} />
        </mesh>
    );
};

/** A tempestade completa (montar uma vez dentro da cena do andar). */
export const Floor9Storm: React.FC = () => (
    <>
        <Rain />
        <Splashes />
        <Puddles />
        <Lightning />
        <RebirthDrizzle />
        <WaveWall />
    </>
);

export default Floor9Storm;
