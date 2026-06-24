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
 *   D  LAUGH      — frame his face; an ironic laugh
 *   E  TALK       — he settles into a captain's stance and delivers his welcome
 *                   (a multi-line bit of dialogue), then hands back to gameplay
 *
 * It drives the CAMERA, the beat index (DOM bubble + SFX), the active dialogue
 * LINE, a transition DIM (a quick dip-to-dark that masks the hard cuts so they
 * read smooth), the captain's LAUGH/TALK/pose, the LEGS-closeup model swap and —
 * during the intro — the ELEVATOR fade. The captain is walked by the WASM brain;
 * we just frame him. When the sequence ends (or is skipped) it hands back to the
 * normal GREET quest dialogue.
 */
import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FLOOR7_SCALE } from './constants';

// play order — the index reported to the UI
export const F7_INTRO_BEATS = { LEGS: 0, REVEAL: 1, LOOK_BACK: 2, LAUGH: 3, TALK: 4 } as const;

// the captain's welcome — shown one line at a time, timed to LINE_AT below.
export const F7_DIALOGUE = [
    'Arr arr arr… primeira vez no mar, grumete?',
    'Aquele teu elevadorzinho já era. O mar não devolve ninguém.',
    'Aqui quem manda sou eu — eu e o oceano.',
    'Ou tu esfrega esse convés até ele brilhar…',
    '…ou vira jantar dos tubarão! Arr arr arr!',
] as const;

// beat boundaries (seconds). Synced to the brain: captain strides 0.6–3.6s, so
// LEGS catches him mid-stride and REVEAL lands as he plants at the talk spot.
const T_LEGS = 2.4, T_REVEAL = 4.6, T_LOOKBACK = 7.0, T_LAUGH = 9.3, T_END = 16.8;
// when each dialogue line appears (s). First line lands on the laugh; the rest
// pace out across the TALK beat with a beat of breathing room between them.
const LINE_AT = [7.15, 9.7, 11.8, 13.6, 15.3];

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
    poseRef?: React.MutableRefObject<number>;                    // we drive the captain's REVEAL/TALK power stance (0..1)
    talkRef?: React.MutableRefObject<number>;                    // we drive the captain's speaking gesture (0..1)
    hideSailsRef?: React.MutableRefObject<number>;               // 1 during LOOK BACK → hide the bow sails behind the cab
    legsRef?: React.MutableRefObject<number>;                    // 1 during the LEGS close-up → swap GLB for the rigid primitive legs
    dimRef?: React.MutableRefObject<number>;                     // 0..1 transition dip (UI darkens to mask the hard cuts)
    tRef?: React.MutableRefObject<number>;                       // (dev) publishes the cutscene elapsed time
    onBeat: (beat: number) => void;
    onLine?: (line: number) => void;                             // active dialogue line index (-1 = none)
    onLaugh: () => void;                                         // fire the laugh SFX once
    onDone: () => void;
}

const Floor7IntroCutscene: React.FC<Props> = ({ active, captainAnchorRef, playerPositionRef, elevFadeRef, laughRef, poseRef, talkRef, hideSailsRef, legsRef, dimRef, tRef, onBeat, onLine, onLaugh, onDone }) => {
    const { camera } = useThree();
    const elapsed = useRef(0);          // accumulated from CLAMPED delta — immune to the big frame-delta spike when the captain GLB resolves from Suspense
    const primed = useRef(false);
    const beat = useRef(-1);
    const line = useRef(-2);
    const laughed = useRef(false);
    // smoothed camera state + scratch vectors (no per-frame allocation)
    const camPos = useRef(new THREE.Vector3());
    const camLook = useRef(new THREE.Vector3());
    const _p = useRef(new THREE.Vector3());
    const _t = useRef(new THREE.Vector3());
    const _dir = useRef(new THREE.Vector3());

    useEffect(() => {
        if (!active) {
            elapsed.current = 0; primed.current = false; beat.current = -1; line.current = -2; laughed.current = false;
            if (elevFadeRef) elevFadeRef.current = null;     // hand the cab fade back to the brain
            if (laughRef) laughRef.current = 0;
            if (poseRef) poseRef.current = 0;
            if (talkRef) talkRef.current = 0;
            if (hideSailsRef) hideSailsRef.current = 0;
            if (legsRef) legsRef.current = 0;
            if (dimRef) dimRef.current = 0;
        }
    }, [active, elevFadeRef, laughRef, poseRef, talkRef, hideSailsRef, legsRef, dimRef]);

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
        let fov = 50, lerp = 0.12, snap = false, elev = 0, laugh = 0, pose = 0, talk = 0, hideSails = 0, legs = 0;

        if (t < T_LEGS) {
            // A — LEGS: a low SIDE-TRACKING dolly that stays locked beside the boots as
            // he clomps across the deck (tight lerp = no lag, no central-mast occlusion).
            // Exaggerated low lens on the stride — you read the gait before you see him.
            if (beat.current !== F7_INTRO_BEATS.LEGS) { beat.current = F7_INTRO_BEATS.LEGS; onBeat(beat.current); snap = true; }
            P.copy(feet); P.x += 2.05; P.y = feet.y + 0.30; P.z += 0.15;
            T.copy(feet); T.x = feet.x; T.y = feet.y + 0.36; T.z = feet.z;   // level, tight on the boots/lower coat
            fov = 49; lerp = 0.5; elev = 1; legs = 1;   // rigid primitive legs stand in for the GLB during this tight close-up
        } else if (t < T_REVEAL) {
            // B — REVEAL: continue from the LEGS shot into a LOW-HERO crane that pulls back
            // and arcs to a 3/4, ending on the full captain looming against the sky/mast —
            // then HOLDS (motion settles by ~70%) so the reveal lands instead of drifting.
            if (beat.current !== F7_INTRO_BEATS.REVEAL) { beat.current = F7_INTRO_BEATS.REVEAL; onBeat(beat.current); }
            const k = (t - T_LEGS) / (T_REVEAL - T_LEGS);
            const kk = Math.min(1, k / 0.9);
            P.copy(feet);
            P.x += smooth(2.05, 1.7, kk);
            P.y = feet.y + smooth(0.30, 1.0, kk);
            P.z += smooth(0.15, 3.2, kk);
            T.copy(feet); T.x = smooth(feet.x, 0, kk); T.y = feet.y + smooth(0.36, 1.5, kk);
            fov = smooth(46, 44, kk); lerp = 0.12; elev = 1;
            // keep the rigid legs a beat into the crane so the GLB swap happens once the
            // boots are smaller in frame (masked further by the dip at T_LEGS)
            legs = t < T_LEGS + 0.28 ? 1 : 0;
            pose = smooth(0, 1, (k - 0.5) / 0.35);
        } else if (t < T_LOOKBACK) {
            // C — LOOK BACK: a 3/4 over-the-shoulder as the player turns to the cab they
            // rode in on. Hold the lit doors solid a beat, then they ascend + dissolve.
            if (beat.current !== F7_INTRO_BEATS.LOOK_BACK) { beat.current = F7_INTRO_BEATS.LOOK_BACK; onBeat(beat.current); snap = true; }
            const k = (t - T_REVEAL) / (T_LOOKBACK - T_REVEAL);
            P.set(smooth(3.0, 2.7, k), 4.7, ELEV_W.z + smooth(3.4, 3.0, k));
            T.set(0.25, smooth(2.7, 2.2, k), ELEV_W.z + 0.3);
            fov = 39; lerp = 0.1; pose = 1; hideSails = 1;
            elev = 1 - smooth(0, 1, Math.max(0, k - 0.46) / 0.32);
        } else if (t < T_LAUGH) {
            // D — LAUGH: low hero angle on his face; fire the laugh once
            if (beat.current !== F7_INTRO_BEATS.LAUGH) { beat.current = F7_INTRO_BEATS.LAUGH; onBeat(beat.current); snap = true; }
            if (!laughed.current) { laughed.current = true; onLaugh(); }
            const lk = (t - T_LOOKBACK) / (T_LAUGH - T_LOOKBACK);
            const d = frontDir(feet, player);
            P.copy(feet).addScaledVector(d, smooth(2.5, 2.1, lk));
            P.y = feet.y + 1.12;                                               // LOW → look up under the hat brim (hero)
            P.x += 0.55 + Math.sin(t * 0.9) * 0.05; P.y += Math.cos(t * 1.1) * 0.03;
            T.copy(feet); T.y = feet.y + 1.92;
            fov = 40; lerp = 0.12; elev = 0;
            laugh = smooth(0, 1, (t - T_LOOKBACK) / 0.3);                     // throw the head back ON the first "Arr"
        } else if (t < T_END) {
            // E — TALK: he settles out of the laugh into a confident captain's stance and
            // delivers his welcome. NOT a hard cut — the camera eases from the low laugh
            // hero up to a steady eye-level 3/4 medium, with a touch of handheld so it
            // breathes while he talks. The laugh bleeds out as the talk gesture takes over.
            if (beat.current !== F7_INTRO_BEATS.TALK) { beat.current = F7_INTRO_BEATS.TALK; onBeat(beat.current); }
            const tk = Math.min(1, (t - T_LAUGH) / 1.0);
            const d = frontDir(feet, player);
            P.copy(feet).addScaledVector(d, 2.75);
            P.x += 0.95;
            P.y = feet.y + 1.6;
            P.x += Math.sin(t * 0.55) * 0.045; P.y += Math.sin(t * 0.72 + 1.0) * 0.03;   // gentle handheld drift
            T.copy(feet); T.y = feet.y + 1.78;
            fov = 37; lerp = 0.07; elev = 0;
            laugh = smooth(1, 0, tk);         // laugh fades out smoothly as he settles into talking
            pose = smooth(0, 1, tk);          // confident akimbo eases in (no arm snap)
            talk = smooth(0, 1, tk);
        } else { if (elevFadeRef) elevFadeRef.current = null; if (laughRef) laughRef.current = 0; if (talkRef) talkRef.current = 0; onDone(); return; }

        // active dialogue line (during LAUGH + TALK) — report only on change
        let li = -1;
        for (let i = 0; i < LINE_AT.length; i++) if (t >= LINE_AT[i]) li = i;
        if (li !== line.current) { line.current = li; onLine?.(li); }

        // TRANSITION DIP — a quick dip-to-dark centred on the hard cuts (and a softer one
        // on the LEGS→GLB model swap) so the discontinuity happens behind darkness and
        // reads as a clean film cut instead of a jump.
        const dip = (b: number) => { const w = 0.19; const dd = Math.abs(t - b); return dd < w ? (1 - dd / w) : 0; };
        const dim = Math.max(dip(T_LEGS) * 0.5, dip(T_REVEAL) * 0.92, dip(T_LOOKBACK) * 0.92);

        if (elevFadeRef) elevFadeRef.current = elev;
        if (laughRef) laughRef.current = laugh;
        if (poseRef) poseRef.current = pose;
        if (talkRef) talkRef.current = talk;
        if (hideSailsRef) hideSailsRef.current = hideSails;
        if (legsRef) legsRef.current = legs;
        if (dimRef) dimRef.current = dim;
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
