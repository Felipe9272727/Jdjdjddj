/**
 * Floor 7 arrival cinematic, V2.
 *
 * A short, continuous 11.5s introduction.  It deliberately keeps the real
 * captain visible (legsRef is never enabled) and uses camera movement instead
 * of black-frame edits.  All callbacks are edge-triggered because App uses
 * them for audio and state transitions.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FLOOR7_SCALE } from './constants';

// New semantic names plus aliases retained for older benches/tests.
export const F7_INTRO_BEATS = {
    ARRIVAL: 0,
    CAPTAIN: 1,
    VANISH: 2,
    OBJECTIVE: 3,
    HANDOFF: 4,
    LEGS: 0,
    REVEAL: 1,
    LOOK_BACK: 2,
    LAUGH: 3,
    TALK: 4,
} as const;

export const F7_DIALOGUE = [
    'Chegou tarde, grumete.',
    'O elevador não volta pelo mar.',
    'Pegue o balde e limpe as poças do convés.',
    'Trabalhe direito… e talvez a ilha deixe você partir.',
] as const;

const T_CAPTAIN = 2.20;
const T_VANISH = 4.55;
const T_OBJECTIVE = 6.80;
const T_HANDOFF = 9.90;
const T_END = 11.50;
const LINE_AT = [2.42, 4.76, 7.02, 8.54] as const;
const ELEV_W = new THREE.Vector3(0, 1.15 * FLOOR7_SCALE, 5.2 * FLOOR7_SCALE);

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = clamp01(n); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * ease(t);

interface Props {
    active: boolean;
    captainAnchorRef: React.MutableRefObject<THREE.Vector3>;
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    elevFadeRef?: React.MutableRefObject<number | null>;
    laughRef?: React.MutableRefObject<number>;
    poseRef?: React.MutableRefObject<number>;
    talkRef?: React.MutableRefObject<number>;
    hideSailsRef?: React.MutableRefObject<number>;
    legsRef?: React.MutableRefObject<number>;
    dimRef?: React.MutableRefObject<number>;
    tRef?: React.MutableRefObject<number>;
    onBeat: (beat: number) => void;
    onLine?: (line: number) => void;
    onStep?: () => void;
    onElevatorVanish?: () => void;
    onLaugh: (short?: boolean) => void;
    onDone: () => void;
}

const Floor7IntroCutscene: React.FC<Props> = (props) => {
    const { camera } = useThree();
    const propsRef = useRef(props);
    propsRef.current = props;

    const elapsed = useRef(0);
    const primed = useRef(false);
    const currentBeat = useRef(-1);
    const currentLine = useRef(-2);
    const step = useRef(-1);
    const vanishFired = useRef(false);
    const laughFired = useRef(false);
    const doneFired = useRef(false);
    const camPos = useRef(new THREE.Vector3());
    const camLook = useRef(new THREE.Vector3());
    const targetPos = useRef(new THREE.Vector3());
    const targetLook = useRef(new THREE.Vector3());
    const forward = useRef(new THREE.Vector3());

    const neutralise = (releaseElevator: boolean) => {
        const p = propsRef.current;
        if (p.elevFadeRef) p.elevFadeRef.current = releaseElevator ? null : 1;
        if (p.laughRef) p.laughRef.current = 0;
        if (p.poseRef) p.poseRef.current = 0;
        if (p.talkRef) p.talkRef.current = 0;
        if (p.hideSailsRef) p.hideSailsRef.current = 0;
        if (p.legsRef) p.legsRef.current = 0;
        if (p.dimRef) p.dimRef.current = 0;
    };

    useEffect(() => {
        if (props.active) {
            elapsed.current = 0;
            primed.current = false;
            currentBeat.current = -1;
            currentLine.current = -2;
            step.current = -1;
            vanishFired.current = false;
            laughFired.current = false;
            doneFired.current = false;
            neutralise(false);
        } else {
            elapsed.current = 0;
            primed.current = false;
            neutralise(true);
        }
    }, [props.active]);

    // Refs are imperative scene controls; never leave a stale cutscene pose behind.
    useEffect(() => () => neutralise(true), []);

    const emitBeat = (next: number) => {
        if (currentBeat.current === next) return;
        currentBeat.current = next;
        propsRef.current.onBeat(next);
    };

    useFrame((_state, rawDelta) => {
        const p = propsRef.current;
        if (!p.active || doneFired.current) return;

        if (!primed.current) {
            primed.current = true;
            camPos.current.copy(camera.position);
            camera.getWorldDirection(forward.current);
            camLook.current.copy(camera.position).addScaledVector(forward.current, 4);
            return;
        }

        // A background-tab/asset-decode spike advances at most 250ms.
        const delta = Math.max(0, Math.min(rawDelta, 0.25));
        elapsed.current = Math.min(T_END, elapsed.current + delta);
        const t = elapsed.current;
        if (p.tRef) p.tRef.current = t;

        const feet = p.captainAnchorRef.current;
        const player = p.playerPositionRef.current;
        const P = targetPos.current;
        const L = targetLook.current;
        let fov = 48;
        let response = 8.5;
        let elevator = 1;
        let laugh = 0;
        let pose = 0;
        let talk = 0;
        let hideSails = 0;

        // Direction from captain to player, used to keep shots valid if either
        // spawn point changes later.
        forward.current.copy(player).sub(feet).setY(0);
        if (forward.current.lengthSq() < 0.001) forward.current.set(0, 0, 1);
        forward.current.normalize();

        if (t < T_CAPTAIN) {
            emitBeat(F7_INTRO_BEATS.ARRIVAL);
            const k = ease(t / T_CAPTAIN);
            P.copy(player);
            P.x += mix(0.15, 1.2, k);
            P.y += mix(1.72, 1.92, k);
            P.z += mix(0.25, 1.15, k);
            L.copy(feet); L.y += mix(1.0, 1.76, k);
            fov = mix(54, 45, k);

            if (t > 0.55 && t < 2.05) {
                const nextStep = Math.floor((t - 0.55) / 0.48);
                if (nextStep !== step.current) { step.current = nextStep; p.onStep?.(); }
            }
        } else if (t < T_VANISH) {
            emitBeat(F7_INTRO_BEATS.CAPTAIN);
            const k = ease((t - T_CAPTAIN) / (T_VANISH - T_CAPTAIN));
            P.copy(feet).addScaledVector(forward.current, mix(3.15, 2.65, k));
            P.x += 0.72;
            P.y = feet.y + mix(2.08, 1.94, k);
            L.copy(feet); L.x += 0.12; L.y += 1.82;
            fov = mix(43, 38, k);
            pose = ease((t - T_CAPTAIN) / 0.75);
            talk = ease((t - 2.38) / 0.35);
        } else if (t < T_OBJECTIVE) {
            emitBeat(F7_INTRO_BEATS.VANISH);
            const k = ease((t - T_VANISH) / (T_OBJECTIVE - T_VANISH));
            P.set(mix(3.15, 2.65, k), 3.55, ELEV_W.z + mix(4.5, 3.75, k));
            L.set(0, mix(1.65, 1.35, k), ELEV_W.z + 0.15);
            fov = 47;
            response = 11;
            pose = 1;
            hideSails = 1;
            // Hold long enough to identify the cab, then dissolve in-frame.
            elevator = 1 - ease((k - 0.24) / 0.58);
            if (!vanishFired.current && elevator < 0.94) {
                vanishFired.current = true;
                p.onElevatorVanish?.();
            }
        } else if (t < T_HANDOFF) {
            emitBeat(F7_INTRO_BEATS.OBJECTIVE);
            const k = ease((t - T_OBJECTIVE) / (T_HANDOFF - T_OBJECTIVE));
            // A broad deck composition points the player back toward the job:
            // captain in the near third, bucket/puddles readable in the space.
            P.copy(player);
            P.x += mix(-1.0, -0.25, k);
            P.y += mix(2.25, 1.82, k);
            P.z += mix(3.0, 1.5, k);
            L.copy(player);
            L.x = mix(feet.x, player.x, 0.58);
            L.y = player.y + mix(0.95, 0.28, k);
            L.z -= mix(1.6, 3.0, k);
            fov = mix(50, 57, k);
            pose = 1;
            talk = 1;
            if (!laughFired.current && t > 7.05) {
                laughFired.current = true;
                p.onLaugh(true);
            }
            laugh = laughFired.current ? Math.max(0, 1 - (t - 7.05) / 0.7) : 0;
        } else if (t < T_END) {
            emitBeat(F7_INTRO_BEATS.HANDOFF);
            const k = ease((t - T_HANDOFF) / (T_END - T_HANDOFF));
            P.copy(player);
            P.y += 1.72;
            P.z += mix(1.35, 0.05, k);
            L.copy(player); L.y += mix(0.55, 1.55, k); L.z -= 4;
            fov = mix(52, 58, k);
            pose = 1 - k;
            talk = 1 - k;
            elevator = 0;
        }

        let nextLine = -1;
        for (let i = 0; i < LINE_AT.length; i++) if (t >= LINE_AT[i]) nextLine = i;
        if (nextLine !== currentLine.current) {
            currentLine.current = nextLine;
            p.onLine?.(nextLine);
        }

        // A very light exposure veil softens camera joins. Never a black dip.
        const seam = (at: number, width = 0.16) => {
            const d = Math.abs(t - at);
            return d < width ? (1 - d / width) * 0.10 : 0;
        };
        const dim = Math.min(0.16, Math.max(
            seam(T_CAPTAIN), seam(T_VANISH), seam(T_OBJECTIVE), seam(T_HANDOFF),
            t > T_END - 0.35 ? ease((t - (T_END - 0.35)) / 0.35) * 0.16 : 0,
        ));

        if (p.elevFadeRef) p.elevFadeRef.current = elevator;
        if (p.laughRef) p.laughRef.current = laugh;
        if (p.poseRef) p.poseRef.current = pose;
        if (p.talkRef) p.talkRef.current = talk;
        if (p.hideSailsRef) p.hideSailsRef.current = hideSails;
        if (p.legsRef) p.legsRef.current = 0;
        if (p.dimRef) p.dimRef.current = dim;

        const alpha = 1 - Math.exp(-response * Math.min(delta, 0.05));
        camPos.current.lerp(P, alpha);
        camLook.current.lerp(L, alpha);
        camera.position.copy(camPos.current);
        camera.lookAt(camLook.current);
        const perspective = camera as THREE.PerspectiveCamera;
        perspective.fov += (fov - perspective.fov) * alpha;
        perspective.updateProjectionMatrix();

        if (t >= T_END && !doneFired.current) {
            doneFired.current = true;
            neutralise(true);
            p.onDone();
        }
    });

    return null;
};

export default Floor7IntroCutscene;
