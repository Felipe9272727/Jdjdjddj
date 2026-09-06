/**
 * Floor3Hands.tsx — First-person cartoon gloves for the endless parkour.
 *
 * Loads the cartoon gloves GLB (public/cartoon_gloves.glb) and pins it to the
 * camera so it reads as the player's own hands — exactly like the reference.
 *
 * The GLB is a single flat mesh lying in XZ (palms facing +Y). A -90° X
 * rotation stands it upright so palms face –Z (toward the camera). The mesh is
 * then parented to a world group that tracks camera position + quaternion each
 * frame, so it always sits at screen-bottom center.
 *
 * HUD-CORRECT FRAMING: the rest pose is NOT baked in fixed world units —
 * those only look right at one aspect ratio. Instead the depth, vertical
 * anchor and scale are recomputed every frame from the camera's vertical FOV
 * and current aspect ratio (the view-frustum half-extents at the hand depth).
 * That keeps the gloves anchored at the bottom and fitted to the screen width
 * in BOTH landscape and portrait — so on a narrow phone they shrink to stay
 * fully visible instead of spilling off the sides and leaving only the black
 * sleeve stumps in the centre.
 *
 * All animation is PROCEDURAL:
 *   • idle   → slow breathing bob
 *   • walk   → figure-eight bob, driven by f3HandState.moving
 *   • jump   → hands swing up rising / reach down falling, from f3HandState.vy
 */

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { f3HandState } from './f3Parkour';
import { molaDoTranco, TRANCO_DAS_MAOS, TRANCO_PARADO } from './f3Fisica';
import { glovesModel } from './assets/textureImports';

const GLOVES_URL = glovesModel; // bundled (inlined) — no runtime fetch

// Rx(π/2) stands the flat GLB upright so the white gloves point up with
// fingers curling toward the player (backs of hands to camera) while the black
// sleeves drop diagonally out the bottom corners — the reference \  / framing.
const BASE_ROT = new THREE.Euler(Math.PI / 2, 0, 0);

// ── HUD layout, expressed against the view frustum (not fixed world units) ──
// HAND_DEPTH   — distance in front of the camera; sets perspective foreshortening.
// FILL_WIDTH   — target span of the fused hands as a fraction of the screen WIDTH.
//                On wide screens this would exceed MAX_SCALE, so the cap wins and
//                landscape stays at the hand-tuned size; on narrow (portrait)
//                screens it shrinks the gloves so they stay on-screen.
// MAX_SCALE    — landscape-tuned upper bound so hands never grow huge on ultrawide.
// BOTTOM_ANCHOR— vertical centre of the rig, as a fraction of the visible
//                half-height below screen centre (≈ where the wrists sit).
const HAND_DEPTH     = 0.45;
const FILL_WIDTH     = 1.05;
const MAX_SCALE      = 1.42;
const BOTTOM_ANCHOR  = 0.71;

// Cuphead-style ink outline. An inverted-hull shell: the gloves are cloned
// with a black material that pushes every vertex out along its normal and
// renders only BACK faces, so a uniform black silhouette pokes out behind the
// white gloves. ShaderMaterial is used because it guarantees the `normal`
// attribute is bound (MeshBasicMaterial drops it). Thickness is in model-local
// units, so it scales with the gloves and reads consistently at any size.
const OUTLINE_THICKNESS = 0.006;

function makeOutlineMaterial(thickness: number) {
    const m = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { uThickness: { value: thickness } },
        vertexShader: `
            uniform float uThickness;
            void main() {
                vec3 p = position + normalize(normal) * uThickness;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }
        `,
        fragmentShader: `
            void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }
        `,
    });
    m.depthTest = false;
    m.depthWrite = false;
    return m;
}

// Dev-only layout override via URL. rx/ry/rz rotate; hd/fw/ba/ms retune the
// HUD layout live from the preview without a rebuild. No params in production
// → falls back to the constants above.
function layoutFromURL() {
    const q = new URLSearchParams(window.location.search);
    const n = (k: string, d: number) => (q.has(k) ? parseFloat(q.get(k)!) : d);
    return {
        rot: new THREE.Euler(n('rx', BASE_ROT.x), n('ry', BASE_ROT.y), n('rz', BASE_ROT.z)),
        depth: n('hd', HAND_DEPTH),
        fillW: n('fw', FILL_WIDTH),
        maxScale: n('ms', MAX_SCALE),
        anchor: n('ba', BOTTOM_ANCHOR),
        outline: n('ot', OUTLINE_THICKNESS),
    };
}

export default function FpHands() {
    const { camera } = useThree();
    const root  = useRef<THREE.Group>(null);
    const inner = useRef<THREE.Group>(null);
    const walk  = useRef(0);
    // ── O TRANCO DO POUSO ────────────────────────────────────────────────
    // `f3HandState.impacto` é a velocidade no instante do toque e vem zerada em
    // todo quadro que não é o do pouso — ou seja, é um IMPULSO. A mola guarda o
    // resto: as luvas afundam e se abrem na proporção do tombo e voltam
    // sozinhas. Sem isso, cair de oito metros mexia menos nas mãos do que
    // andar, porque só o bob de caminhada as movia.
    const tranco = useRef(TRANCO_PARADO);

    const layout = useMemo(layoutFromURL, []);

    const { scene } = useGLTF(GLOVES_URL);
    // Clone once; keep the original GLB material/texture intact.
    const model = useMemo(() => {
        const c = scene.clone(true);
        c.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) {
                const m = o as THREE.Mesh;
                m.castShadow = false;
                m.frustumCulled = false;
                m.renderOrder = 11; // in front of the outline shell (10)
                // Clone materials so our tweaks don't leak into the cached GLB.
                const src = Array.isArray(m.material) ? m.material : [m.material];
                const mats = src.map((mat) => (mat ? mat.clone() : mat));
                for (const mat of mats) {
                    if (!mat) continue;
                    // HUD element — always render in front of scene geometry.
                    mat.depthTest = false;
                    mat.depthWrite = false;
                    // Flat cartoon brightening — lift the gloves toward the bright
                    // white of the reference WITHOUT discarding the texture: drive
                    // emissive from the diffuse map (or colour) so white reads white
                    // and the black sleeves stay black.
                    const std = mat as THREE.MeshStandardMaterial;
                    if ('emissive' in std) {
                        if (std.map) {
                            std.emissiveMap = std.map;
                            std.emissive.setRGB(1, 1, 1);
                            std.emissiveIntensity = 0.55;
                        } else if (std.color) {
                            std.emissive.copy(std.color);
                            std.emissiveIntensity = 0.45;
                        }
                        if ('roughness' in std) std.roughness = Math.min(1, (std.roughness ?? 1));
                        std.needsUpdate = true;
                    }
                }
                m.material = Array.isArray(m.material) ? mats as THREE.Material[] : mats[0] as THREE.Material;
            }
        });
        return c;
    }, [scene]);

    // Black ink-outline shell drawn just behind the gloves.
    const outline = useMemo(() => {
        const c = scene.clone(true);
        const mat = makeOutlineMaterial(layout.outline);
        c.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) {
                const m = o as THREE.Mesh;
                m.material = mat;
                m.castShadow = false;
                m.frustumCulled = false;
                m.renderOrder = 10; // behind the gloves (11)
            }
        });
        return c;
    }, [scene, layout.outline]);

    useFrame((s, dt) => {
        if (!root.current || !inner.current) return;
        const t = s.clock.elapsedTime;
        const cam = camera as THREE.PerspectiveCamera;

        // Stick the rig to the camera.
        root.current.position.copy(camera.position);
        root.current.quaternion.copy(camera.quaternion);

        // ── HUD framing from the live view frustum ───────────────────────
        // Visible half-extents at the hand depth, for the current FOV/aspect.
        // (cam.aspect is updated by R3F on every resize / orientation change.)
        const halfH = layout.depth * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
        const halfW = halfH * cam.aspect;
        // Fit the 1.0-wide fused mesh to FILL_WIDTH of the screen, capped so
        // landscape keeps the tuned size and portrait shrinks to stay on-screen.
        const fitScale = Math.min(layout.maxScale, layout.fillW * 2 * halfW);
        const restY = -layout.anchor * halfH;       // wrists near the bottom edge
        const restZ = -layout.depth;
        // Bob/jump amplitudes scale with the gloves so motion reads the same at
        // any size (smaller portrait hands → proportionally smaller sway).
        const k = fitScale / layout.maxScale;

        // Smooth walk flag.
        const target = f3HandState.moving && f3HandState.grounded ? 1 : 0;
        walk.current += (target - walk.current) * Math.min(1, dt * 10);
        const w = walk.current;

        // ── Procedural pose ──────────────────────────────────────────────
        const breath = Math.sin(t * 1.6) * 0.012 * k;
        const bobY   = Math.sin(t * 12) * 0.025 * w * k;
        const bobX   = Math.sin(t * 6)  * 0.028 * w * k;
        const vy     = f3HandState.vy;
        const jumpY  = THREE.MathUtils.clamp(vy * 0.016, -0.10, 0.12) * k;
        const jumpRX = THREE.MathUtils.clamp(-vy * 0.02, -0.18, 0.22);

        // Impulso do pouso + mola de volta. O piso de 4 m/s é o mesmo da
        // câmera: abaixo disso é degrau, não queda, e tremer aí só cansaria.
        tranco.current = molaDoTranco(
            tranco.current, f3HandState.impacto, dt, TRANCO_DAS_MAOS,
        );
        const impacto = tranco.current.valor;      // negativo: afunda

        inner.current.position.set(
            bobX,
            restY + breath + bobY + jumpY + impacto * k,
            // Afundar também traz as mãos para PERTO da cara: é o que dá o
            // baque, e não só o movimento vertical.
            restZ + Math.abs(bobX) * 0.4 - impacto * 0.22,
        );
        inner.current.rotation.set(
            // Os punhos abrem para fora no baque (impacto é negativo, daí o −).
            layout.rot.x + jumpRX - impacto * 0.9 + Math.sin(t * 12) * 0.02 * w,
            layout.rot.y + bobX * 0.5,
            layout.rot.z + Math.sin(t * 6) * 0.04 * w,
        );
        // E esparramam de leve — mão que bate no chão se abre.
        inner.current.scale.set(
            fitScale * (1 - impacto * 0.10),
            fitScale * (1 + impacto * 0.06),
            fitScale,
        );
    });

    return (
        <group ref={root}>
            <group ref={inner}>
                <primitive object={outline} />
                <primitive object={model} />
            </group>
        </group>
    );
}

useGLTF.preload(GLOVES_URL);
