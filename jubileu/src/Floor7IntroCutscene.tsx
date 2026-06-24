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
            const kk = Math.min(1, k / 0.9);                     // keep the crane easing almost the whole beat so the reveal breathes into the pose (not parked early)
            // continuous crane that STARTS at the LEGS low-side position and arcs up+around to
            // a low-hero 3/4 — no whip (the offsets blend from the boot shot, not a fresh cut).
            // stays in front of the foremast (z≈+3.2) so it can't cut across him.
            P.copy(feet);
            P.x += smooth(2.05, 1.7, kk);
            P.y = feet.y + smooth(0.30, 1.0, kk);               // rise from boot-height to low-hero
            P.z += smooth(0.15, 3.2, kk);                       // dolly out toward the player side
            T.copy(feet); T.x = smooth(feet.x, 0, kk); T.y = feet.y + smooth(0.36, 1.5, kk);   // tilt up boots → chest/head
            fov = smooth(46, 44, kk); lerp = 0.12; elev = 1;
            pose = smooth(0, 1, (k - 0.5) / 0.35);               // hands hit the hips as he plants & is revealed
        } else if (t < T_LOOKBACK) {
            // C — LOOK BACK: a 3/4 over-the-shoulder as the player turns to the cab they
            // rode in on. Framed to tilt DOWN the cab so the deck (not the blown-out sky
            // over the bow) backs it — then it holds solid a beat and dematerialises.
            if (beat.current !== F7_INTRO_BEATS.LOOK_BACK) { beat.current = F7_INTRO_BEATS.LOOK_BACK; onBeat(beat.current); snap = true; }
            const k = (t - T_REVEAL) / (T_LOOKBACK - T_REVEAL);
            // FRONT-ON at door height so the closed steel sliding doors + centre seam + gold
            // frame + lit "7" FILL the frame — an unmistakable elevator (a steep/high angle
            // foreshortened the doors into an ambiguous blue box, and the bulwark blocks a low
            // SIDE angle, so we shoot straight down the door normal where the doors fill frame
            // and the bulwark/sail fall outside it). The cab is yawed 0.7rad → its door normal
            // is (sin0.7, cos0.7); sit on that axis. Hold solid, then it ascends + dissolves.
            // the cab is staged on the open port mid-deck at world ~(-1.8, *, 3.8), doors
            // (yaw 0.32) facing ~+z toward this camera; we shoot low and front-on so the
            // doors + seam + gold frame + lit "7" fill the frame against clean deck.
            // slightly-high bow 3/4 (the framing the critic confirmed reads: steel doors +
            // centre seam + gold frame + lit "7" all legible). The bow is boxed in by
            // bulwark/bowsprit/masts/sails, so this is the one readable angle — the earlier
            // failure was it dissolved before it registered, so we now HOLD it solid ~1.1s.
            // tight + high (clears the bulwark) on the doors with the glowing "7" centred; the
            // bow foresail is intrinsic to this corner of the ship so a sliver stays upper-left,
            // but the lens is tight enough that the "7"/doors dominate and the gag reads clean.
            P.set(smooth(3.0, 2.7, k), 4.7, ELEV_W.z + smooth(3.4, 3.0, k));
            T.set(0.25, smooth(2.7, 2.2, k), ELEV_W.z + 0.3);
            fov = 39; lerp = 0.1; pose = 1;                     // captain holds his stance (off-camera) into the laugh
            // hold the lit doors solid ~1.1s so "an elevator?! out here?!" lands, then dissolve
            elev = 1 - smooth(0, 1, Math.max(0, k - 0.46) / 0.32);
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
