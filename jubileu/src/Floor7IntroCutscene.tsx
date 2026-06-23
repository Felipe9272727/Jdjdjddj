/**
 * Floor7IntroCutscene.tsx — the cinematic "meet the captain" intro for Andar 7.
 *
 * When the player steps onto the deck this takes over the camera (mounted AFTER
 * <Player> so its priority-0 useFrame overwrites the player's camera each frame)
 * and plays a scripted sequence, in the order the design calls for:
 *
 *   A  LEGS       — an exaggerated low close-up on the captain's boots striding in
 *   B  REVEAL     — dolly out + tilt up to reveal the whole (clumsy) captain
 *   C  LOOK BACK  — cut to the player's POV turning to watch the elevator they rode
 *                   in on dematerialise behind them ("…no way back")
 *   D  LAUGH      — frame his face; an ironic laugh, "Primeira vez?"
 *
 * It drives the CAMERA, the beat index (DOM bubble + SFX) and — during the intro —
 * the ELEVATOR fade (via introElevFadeRef) so the cab vanishes exactly on LOOK
 * BACK rather than in the brain's first 2.6s. The captain himself is still walked
 * by the WASM brain; we just frame him. When the sequence ends (or is skipped) it
 * hands back to the normal GREET quest dialogue.
 */
import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FLOOR7_SCALE } from './constants';

// play order — the index reported to the UI (only LAUGH shows the bubble)
export const F7_INTRO_BEATS = { LEGS: 0, REVEAL: 1, LOOK_BACK: 2, LAUGH: 3 } as const;

// beat boundaries (seconds). Synced to the brain: captain strides 0.6–3.6s, so
// LEGS catches him mid-stride and REVEAL lands as he plants at the talk spot.
const T_LEGS = 2.4, T_REVEAL = 4.6, T_LOOKBACK = 7.0, T_END = 9.5;

// elevator sits at ship-local (0,0,5.2); world ≈ local * FLOOR7_SCALE (ship ~origin).
const ELEV_W = new THREE.Vector3(0, 1.15 * FLOOR7_SCALE, 5.2 * FLOOR7_SCALE);

const smooth = (a: number, b: number, t: number) => {
    const k = Math.max(0, Math.min(1, t)); const e = k * k * (3 - 2 * k); return a + (b - a) * e;
};

interface Props {
    active: boolean;
    captainAnchorRef: React.MutableRefObject<THREE.Vector3>;     // captain feet (world)
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;    // player (world)
    elevFadeRef?: React.MutableRefObject<number | null>;         // we drive the cab fade during the intro
    laughRef?: React.MutableRefObject<number>;                   // we drive the captain's laugh pose (0..1)
    poseRef?: React.MutableRefObject<number>;                    // we drive the captain's REVEAL power stance (0..1)
    tRef?: React.MutableRefObject<number>;                       // (dev) publishes the cutscene elapsed time
    onBeat: (beat: number) => void;
    onLaugh: () => void;                                         // fire the laugh SFX once
    onDone: () => void;
}

const Floor7IntroCutscene: React.FC<Props> = ({ active, captainAnchorRef, playerPositionRef, elevFadeRef, laughRef, poseRef, tRef, onBeat, onLaugh, onDone }) => {
    const { camera } = useThree();
    const elapsed = useRef(0);          // accumulated from CLAMPED delta — immune to the big frame-delta spike when the captain GLB resolves from Suspense
    const primed = useRef(false);
    const beat = useRef(-1);
    const laughed = useRef(false);
    // smoothed camera state + scratch vectors (no per-frame allocation)
    const camPos = useRef(new THREE.Vector3());
    const camLook = useRef(new THREE.Vector3());
    const _p = useRef(new THREE.Vector3());
    const _t = useRef(new THREE.Vector3());
    const _dir = useRef(new THREE.Vector3());

    useEffect(() => {
        if (!active) {
            elapsed.current = 0; primed.current = false; beat.current = -1; laughed.current = false;
            if (elevFadeRef) elevFadeRef.current = null;     // hand the cab fade back to the brain
            if (laughRef) laughRef.current = 0;
            if (poseRef) poseRef.current = 0;
        }
    }, [active, elevFadeRef, laughRef, poseRef]);

    // unit vector (XZ) from the captain toward the player — the "front" side to film
    const frontDir = (feet: THREE.Vector3, player: THREE.Vector3) => {
        const d = _dir.current.copy(player).sub(feet); d.y = 0;
        if (d.lengthSq() < 1e-4) d.set(0, 0, 1);
        return d.normalize();
    };

    useFrame((_state, delta) => {
        if (!active) return;
        if (!primed.current) {
            primed.current = true;
            camPos.current.copy(camera.position);
            camera.getWorldDirection(_dir.current);
            camLook.current.copy(camera.position).addScaledVector(_dir.current, 3);
            return;   // skip this frame's (possibly huge) delta — start the clock clean next frame
        }
        // clamp so a stall (GLB decode, tab refocus) can't fast-forward the whole sequence in one frame
        elapsed.current += Math.min(delta, 0.05);
        const t = elapsed.current;
        if (tRef) tRef.current = t;
        const feet = captainAnchorRef.current, player = playerPositionRef.current;
        const P = _p.current, T = _t.current;
        let fov = 50, lerp = 0.12, snap = false, elev = 0, laugh = 0, pose = 0;

        if (t < T_LEGS) {
            // A — LEGS: a low SIDE-TRACKING dolly that stays locked beside the boots as
            // he clomps across the deck (tight lerp = no lag, no central-mast occlusion).
            // Exaggerated low lens on the stride — you read the gait before you see him.
            if (beat.current !== F7_INTRO_BEATS.LEGS) { beat.current = F7_INTRO_BEATS.LEGS; onBeat(beat.current); snap = true; }
            // low side-track on the BOOTS striding (boots anchored low, up to mid-coat) — read
            // the clumsy waddle before the face. Level horizon (look-at level with the camera,
            // same x) so the silhouette stays clean — no Dutch tilt scrambling the legs.
            P.copy(feet); P.x += 2.05; P.y = feet.y + 0.30; P.z += 0.15;
            T.copy(feet); T.x = feet.x; T.y = feet.y + 0.36; T.z = feet.z;   // level, tight on the boots/lower coat — keeps the high sail out of frame
            fov = 49; lerp = 0.5; elev = 1;
        } else if (t < T_REVEAL) {
            // B — REVEAL: continue from the LEGS shot into a LOW-HERO crane that pulls back
            // and arcs to a 3/4, ending on the full captain looming against the sky/mast —
            // then HOLDS (motion settles by ~70%) so the reveal lands instead of drifting.
            if (beat.current !== F7_INTRO_BEATS.REVEAL) { beat.current = F7_INTRO_BEATS.REVEAL; onBeat(beat.current); }
            const k = (t - T_LEGS) / (T_REVEAL - T_LEGS);
            const kk = Math.min(1, k / 0.7);                     // reach the hero framing by 70%, then hold
            const d = frontDir(feet, player);
            // keep the dolly SHORT (stay in front of the foremast at z~7.5 so it can't cut
            // across him) and arc wide to starboard so the centre capstan/mast clear his
            // silhouette — ending on a clean low-hero 3/4.
            P.copy(feet).addScaledVector(d, smooth(1.3, 3.2, kk));
            P.x += smooth(0, 1.7, kk);                           // wide starboard arc → clears the deck clutter
            P.y = feet.y + smooth(0.42, 1.0, kk);               // stay LOW → he looms (low-hero)
            T.copy(feet); T.y = feet.y + smooth(0.6, 1.5, kk);   // tilt UP to his chest/head
            fov = smooth(40, 44, kk); lerp = 0.1; elev = 1;
            pose = smooth(0, 1, (k - 0.5) / 0.35);               // hands hit the hips as he plants & is revealed
        } else if (t < T_LOOKBACK) {
            // C — LOOK BACK: a 3/4 over-the-shoulder as the player turns to the cab they
            // rode in on. Framed to tilt DOWN the cab so the deck (not the blown-out sky
            // over the bow) backs it — then it holds solid a beat and dematerialises.
            if (beat.current !== F7_INTRO_BEATS.LOOK_BACK) { beat.current = F7_INTRO_BEATS.LOOK_BACK; onBeat(beat.current); snap = true; }
            const k = (t - T_REVEAL) / (T_LOOKBACK - T_REVEAL);
            // shot from off the starboard bow, looking back-down INTO the warm-lit cab
            // doorway sitting in the bow, backed by the ship's hull/sail (no sky washout,
            // no mast occlusion). The lone hotel elevator reads instantly; it holds, then
            // dematerialises, leaving empty bow deck — the "no way back" beat.
            // pulled back so the WHOLE elevator box reads — closed steel doors + gold frame
            // + lit "7" facing us, with deck around it (the incongruity gag). High enough to
            // clear the bulwark, low enough that the doors read front-on. Gentle push-in; the
            // closed-door box then dematerialises.
            // looks down past the bulwark at the cab so the steel sliding doors + centre seam
            // + gold frame + lit "7" all read (the bow bulwark otherwise clips a side angle).
            // the bow bulwark wraps the cab, so a flat side angle clips it — this slightly-high
            // 3/4 clears the rail while the recessed-seam doors + gold frame + lit "7" still
            // read as an elevator. Gentle push-in, then the box dissolves.
            P.set(smooth(2.7, 2.4, k), 5.0, ELEV_W.z + smooth(3.4, 3.0, k));   // gentle push-in
            T.set(0, 1.5, ELEV_W.z + 0.3);                      // hold on the doors; the cab ASCENDS up out of frame as it fades, leaving bare deck
            fov = 46; lerp = 0.1; pose = 1;                     // captain holds his stance (off-camera) into the laugh
            // hold the lit cab ~0.7s, dissolve over ~1s, then a clear ~0.5s beat on the EMPTY deck
            elev = 1 - smooth(0, 1, Math.max(0, k - 0.28) / 0.42);
        } else if (t < T_END) {
            // D — LAUGH: low hero angle on his face; fire the laugh once
            if (beat.current !== F7_INTRO_BEATS.LAUGH) { beat.current = F7_INTRO_BEATS.LAUGH; onBeat(beat.current); snap = true; }
            if (!laughed.current) { laughed.current = true; onLaugh(); }
            const lk = (t - T_LOOKBACK) / (T_END - T_LOOKBACK);
            const d = frontDir(feet, player);
            P.copy(feet).addScaledVector(d, smooth(2.5, 2.0, lk));             // slow push-in through the laugh
            P.y = feet.y + 1.12;                                               // LOW → look up under the hat brim (hero)
            P.x += 0.55 + Math.sin(t * 0.9) * 0.05; P.y += Math.cos(t * 1.1) * 0.03;   // 3/4 + handheld drift
            T.copy(feet); T.y = feet.y + 1.92;                                 // his face, framed looking up
            fov = 40; lerp = 0.12; elev = 0;
            laugh = smooth(0, 1, (t - T_LOOKBACK - 0.25) / 0.45);              // ramp the laugh pose in just after the cut
        } else { if (elevFadeRef) elevFadeRef.current = null; if (laughRef) laughRef.current = 0; onDone(); return; }

        if (elevFadeRef) elevFadeRef.current = elev;
        if (laughRef) laughRef.current = laugh;
        if (poseRef) poseRef.current = pose;
        // FRAME-RATE-INDEPENDENT smoothing: convert the per-frame lerp into a
        // dt-aware factor so the camera converges in the same WALL time at 5fps
        // (headless) or 144fps (real device) — fixed lerp would lag at low fps.
        const a = snap ? 1 : 1 - Math.pow(1 - lerp, Math.min(delta, 0.05) * 60);
        camPos.current.lerp(P, a);
        camLook.current.lerp(T, a);
        camera.position.copy(camPos.current);
        camera.lookAt(camLook.current);
        const cam = camera as THREE.PerspectiveCamera;
        cam.fov += (fov - cam.fov) * a; cam.updateProjectionMatrix();
    });

    return null;
};

export default Floor7IntroCutscene;
