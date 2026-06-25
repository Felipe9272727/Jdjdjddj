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
    '…ou vira jantar dos tubarões!',
] as const;

// beat boundaries (seconds). Synced to the brain: captain strides 0.6–3.6s, so
// LEGS catches him mid-stride and REVEAL lands as he plants at the talk spot.
// LOOK_BACK trimmed ~0.3s (the sign reads instantly); the punchline now gets a
// long, unhurried hold so the comedic button lands before the fade-out.
const T_LEGS = 2.4, T_REVEAL = 4.6, T_LOOKBACK = 6.7, T_LAUGH = 8.9, T_END = 19.9;
// when each dialogue line appears (s). First lands on the laugh; the rest pace out
// across TALK ~2.2s apart; after the last threat lands the captain LAUGHS again as the
// button (T_LAUGH2) before the fade.
const LINE_AT = [6.95, 9.3, 11.5, 13.7, 15.9];
const T_LAUGH2 = 17.4;

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
    onStep?: () => void;                                         // a footfall during the entry stride (boot clomp SFX)
    onElevatorVanish?: () => void;                               // fire once, synced to the cab starting to dissolve
    onLaugh: (short?: boolean) => void;                          // fire the laugh SFX (short = the closing smirk-laugh)
    onDone: () => void;
}

const Floor7IntroCutscene: React.FC<Props> = ({ active, captainAnchorRef, playerPositionRef, elevFadeRef, laughRef, poseRef, talkRef, hideSailsRef, legsRef, dimRef, tRef, onBeat, onLine, onStep, onElevatorVanish, onLaugh, onDone }) => {
    const { camera } = useThree();
    const elapsed = useRef(0);          // accumulated from CLAMPED delta — immune to the big frame-delta spike when the captain GLB resolves from Suspense
    const primed = useRef(false);
    const beat = useRef(-1);
    const line = useRef(-2);
    const stepIdx = useRef(-1);
    const vanished = useRef(false);
    const laughed = useRef(false);
    const laughed2 = useRef(false);
    // smoothed camera state + scratch vectors (no per-frame allocation)
    const camPos = useRef(new THREE.Vector3());
    const camLook = useRef(new THREE.Vector3());
    const _p = useRef(new THREE.Vector3());
    const _t = useRef(new THREE.Vector3());
    const _dir = useRef(new THREE.Vector3());

    useEffect(() => {
        if (!active) {
            elapsed.current = 0; primed.current = false; beat.current = -1; line.current = -2; stepIdx.current = -1; vanished.current = false; laughed.current = false; laughed2.current = false;
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
            P.x += smooth(2.05, 1.95, kk);
            P.y = feet.y + smooth(0.30, 1.15, kk);
            P.z += smooth(0.15, 3.35, kk);
            // CENTRE the look on the captain (was drifting to world x=0, which shoved him
            // hard frame-right beside the foreground barrel and cropped his far arm). Aim
            // mid-chest so the full hat→coat silhouette reads on the hero reveal.
            T.copy(feet); T.x = feet.x; T.y = feet.y + smooth(0.36, 1.6, kk);   // aim higher → drop the tricorne off the top edge (headroom)
            fov = smooth(46, 45, kk); lerp = 0.12; elev = 1;
            // the legs→GLB swap happens exactly on the LEGS boundary, which is also where
            // the model-swap dip peaks (below) — so the model pop is hidden behind darkness.
            pose = smooth(0, 1, (k - 0.5) / 0.35);
        } else if (t < T_LOOKBACK) {
            // C — LOOK BACK: a 3/4 over-the-shoulder as the player turns to the cab they
            // rode in on. Hold the lit doors solid a beat, then they ascend + dissolve.
            if (beat.current !== F7_INTRO_BEATS.LOOK_BACK) { beat.current = F7_INTRO_BEATS.LOOK_BACK; onBeat(beat.current); snap = true; }
            const k = (t - T_REVEAL) / (T_LOOKBACK - T_REVEAL);
            // PULLED BACK + WIDER than before so the whole CAB reads as the elevator the
            // player rode in on (doors + seam + gold frame + lit "7"), not an extreme
            // close-up of a giant floor-number plate. Centre on the doors, not the "7".
            P.set(smooth(3.4, 3.05, k), 4.2, ELEV_W.z + smooth(4.4, 3.9, k));
            // aim LOWER — centre on the door seam/handles so the cab is the subject and the
            // lit "7" rides the upper third (it was dead-centre and led the eye as signage).
            T.set(0.2, smooth(1.85, 1.32, k), ELEV_W.z + 0.3);
            fov = 45; lerp = 0.1; pose = 1; hideSails = 1;
            elev = 1 - smooth(0, 1, Math.max(0, k - 0.42) / 0.32);
        } else if (t < T_LAUGH) {
            // D — LAUGH: low hero angle on his face; fire the laugh once
            if (beat.current !== F7_INTRO_BEATS.LAUGH) { beat.current = F7_INTRO_BEATS.LAUGH; onBeat(beat.current); snap = true; }
            if (!laughed.current) { laughed.current = true; onLaugh(); }
            const lk = (t - T_LOOKBACK) / (T_LAUGH - T_LOOKBACK);
            const d = frontDir(feet, player);
            P.copy(feet).addScaledVector(d, smooth(2.55, 2.25, lk));
            // RAISED from the old extreme-low hero (y+1.12) — that angle threw the boom/
            // furled sail behind him straight across his chest. ~eye-level-ish on a 3/4
            // (like the clean TALK shot) clears the rigging while still reading as a beat.
            // RAISED to ~face height (was y+1.56, an up-the-nose hero that put the thrown-
            // back head behind the tricorne brim — the critic flagged the laughing face as
            // occluded). Near eye-level/slightly-below on a 3/4 keeps the open-mouth laugh
            // readable while still reading as a low-ish hero beat.
            P.y = feet.y + 1.82;
            P.x += 1.0 + Math.sin(t * 0.9) * 0.05; P.y += Math.cos(t * 1.1) * 0.03;   // a touch more height + lateral clears the spar behind his hat
            T.copy(feet); T.x = feet.x + 0.18; T.y = feet.y + 1.92;           // recentre the face (kills the empty left-of-frame sky)
            fov = 38; lerp = 0.12; elev = 0;
            laugh = smooth(0, 1, (t - T_LOOKBACK) / 0.3);                     // throw the head back ON the first "Arr"
        } else if (t < T_END) {
            // E — TALK: he settles out of the laugh into a confident captain's stance and
            // delivers his welcome. NOT a hard cut — the camera eases from the low laugh
            // hero up to a steady eye-level 3/4 medium, with a touch of handheld so it
            // breathes while he talks. The laugh bleeds out as the talk gesture takes over.
            if (beat.current !== F7_INTRO_BEATS.TALK) { beat.current = F7_INTRO_BEATS.TALK; onBeat(beat.current); }
            const tk = Math.min(1, (t - T_LAUGH) / 1.0);
            const tkFull = (t - T_LAUGH) / (T_END - T_LAUGH);      // 0..1 across the whole TALK beat
            const d = frontDir(feet, player);
            // a slow, almost-imperceptible DOLLY-IN across the monologue so the 4-line
            // beat isn't a static hold for ~10s — it tightens on him as the threat builds.
            P.copy(feet).addScaledVector(d, smooth(2.95, 2.4, tkFull));
            P.x += 0.78;                                           // a touch less lateral so he sits closer to centre (was right-of-frame)
            // EYE-LEVEL (was y+1.6, looking up his nose during the whole monologue — the
            // critic's #1 fix: dialogue is where the player stares at the face longest).
            // Sit the lens at the captain's face height for a clean eye-level 3/4 medium.
            P.y = feet.y + 1.98;
            P.x += Math.sin(t * 0.55) * 0.04; P.y += Math.sin(t * 0.72 + 1.0) * 0.03;    // gentle handheld drift
            T.copy(feet); T.x += 0.18; T.y = feet.y + 1.92;        // level on his face, recentred off the right edge
            fov = 37; lerp = 0.07; elev = 0;
            laugh = smooth(1, 0, tk);         // laugh fades out smoothly as he settles into talking
            pose = smooth(0, 1, tk);          // confident akimbo eases in (no arm snap)
            talk = smooth(0, 1, tk);
            if (t > T_LAUGH2) {               // the closing laugh — throw the head back again, stop talking
                const bk = smooth(0, 1, (t - T_LAUGH2) / 0.3);
                laugh = bk; talk = (1 - bk) * smooth(0, 1, tk);
            }
        } else { if (elevFadeRef) elevFadeRef.current = null; if (laughRef) laughRef.current = 0; if (talkRef) talkRef.current = 0; if (dimRef) dimRef.current = 1; onDone(); return; }

        // active dialogue line (during LAUGH + TALK) — report only on change
        let li = -1;
        for (let i = 0; i < LINE_AT.length; i++) if (t >= LINE_AT[i]) li = i;
        if (li !== line.current) { line.current = li; onLine?.(li); }

        // FOOTFALLS — fire a boot clomp on each step of the entry stride (the brain walks
        // the captain ~0.6–3.6s; stride phase = t*7). Keeps the close-up boots audible.
        if (t > 0.55 && t < 3.5) {
            const si = Math.floor((t * 7.0) / Math.PI);
            if (si !== stepIdx.current) { stepIdx.current = si; onStep?.(); }
        }
        // ELEVATOR VANISH — fire once when the cab actually starts dissolving (not at the
        // LOOK_BACK cut), so the dematerialise SFX lands on the visual.
        if (!vanished.current && beat.current === F7_INTRO_BEATS.LOOK_BACK && elev < 0.9) { vanished.current = true; onElevatorVanish?.(); }
        // BOOKEND LAUGH — once the last threat has landed he laughs again ("arr har har")
        // as the button on the scene, just before the fade-out.
        if (!laughed2.current && t > T_LAUGH2) { laughed2.current = true; onLaugh(true); }

        // TRANSITION DIP — a dip-to-dark centred on each hard cut + the LEGS→GLB model
        // swap, so the discontinuity happens behind (near-)black and reads as a clean film
        // cut, not a blink. Wider + to FULL black on the two hard cuts; strong on the swap
        // (which lands at the T_LEGS peak); and a fade-to-black on the END hand-off so the
        // punchline doesn't get yanked straight to gameplay on a hard cut.
        const dip = (b: number, w: number, peak: number) => { const dd = Math.abs(t - b); return dd < w ? (1 - dd / w) * peak : 0; };
        let dim = Math.max(
            dip(T_LEGS, 0.28, 0.92),       // legs→GLB model swap (lands at this peak; deep enough to bury the pop at variable fps)
            dip(T_REVEAL, 0.30, 1.0),      // hard cut into LOOK_BACK
            dip(T_LOOKBACK, 0.30, 1.0),    // hard cut into LAUGH
        );
        if (t > T_END - 0.55) dim = Math.max(dim, smooth(0, 1, (t - (T_END - 0.55)) / 0.55));   // fade out on the hand-off to gameplay

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
