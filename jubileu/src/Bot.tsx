import React, { useEffect, useRef, useState } from 'react';
import { Vector3 } from 'three';

// Public handles the bot needs to drive the game. App passes these in.
export interface BotHandles {
    moveInput: React.MutableRefObject<{ x: number; y: number }>;
    lookInput: React.MutableRefObject<{ x: number; y: number }>;
    sharedPlayerPositionRef: React.MutableRefObject<Vector3>;
    sharedRotationYRef: React.MutableRefObject<number>;
    cameraThetaRef: React.MutableRefObject<number>;
    positionCmdRef: React.MutableRefObject<any>;
    currentLevel: number;
    gameState: string;
    canInteractDoor: boolean;
    canInteractNPC: boolean;
    canSleepNow: boolean;
    barneyDialogueOpen: boolean;
    dialogueOpen: boolean;
    handleOpenDoor: () => void;
    handleStartDialogue: () => void;
    handleBarneyResponse: (next: string) => void;
    handleSleep: () => void;
    setDialogueNode: (n: string) => void;
    setDialogueOpen: (b: boolean) => void;
}

type Routine =
    | { kind: 'idle' }
    | { kind: 'walkTo'; x: number; z: number; arrive: number }
    | { kind: 'wait'; until: number; reason: string }
    | { kind: 'tour' } // grand-tour script
    | { kind: 'circle'; cx: number; cz: number; r: number; t: number };

const ROUTINE_DESC: Record<string, string> = {
    idle: 'parado',
    walkTo: 'andando até alvo',
    wait: 'aguardando',
    tour: 'tour completo',
    circle: 'andando em círculo',
};

declare global {
    interface Window {
        __jubileuBot?: any;
    }
}

export const useBot = (enabled: boolean, h: BotHandles) => {
    const routineRef = useRef<Routine>({ kind: 'idle' });
    const [hudInfo, setHudInfo] = useState<{ routine: string; status: string; log: string[] }>({
        routine: 'idle',
        status: 'desligado',
        log: [],
    });
    const logRef = useRef<string[]>([]);
    const lastTickRef = useRef(0);
    const tourStepRef = useRef(0);

    const log = (msg: string) => {
        const line = `${new Date().toLocaleTimeString()} ${msg}`;
        logRef.current = [line, ...logRef.current].slice(0, 8);
        setHudInfo((s) => ({ ...s, log: logRef.current }));
        // eslint-disable-next-line no-console
        console.log('[bot]', msg);
    };

    const setRoutine = (r: Routine) => {
        routineRef.current = r;
        setHudInfo((s) => ({ ...s, routine: ROUTINE_DESC[r.kind] || r.kind }));
        log(`rotina → ${r.kind}`);
    };

    // Drive moveInput so the player walks toward (tx, tz). Returns true on arrive.
    //
    // Player.tsx maps moveInput in CAMERA frame (not character frame):
    //   fwd    = -moveInput.y
    //   strafe =  moveInput.x
    //   cd  = ( sin(theta), 0, cos(theta) )           // camera "forward"
    //   rd  = ( sin(theta - π/2), 0, cos(theta - π/2) )  // camera "right"
    //   mv  = -fwd*cd - strafe*rd  (then * SPEED * dt)
    // Solving mv = (vx, vz) for (fwd, strafe):
    //   strafe =  vx*cos(θ) - vz*sin(θ)
    //   fwd    = -vx*sin(θ) - vz*cos(θ)
    //   moveInput = (strafe, -fwd) = (vx*cosθ - vz*sinθ,  vx*sinθ + vz*cosθ)
    const stepWalkTo = (tx: number, tz: number, arriveDist = 0.5): boolean => {
        const p = h.sharedPlayerPositionRef.current;
        const dx = tx - p.x, dz = tz - p.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < arriveDist) {
            h.moveInput.current.x = 0;
            h.moveInput.current.y = 0;
            return true;
        }
        const len = Math.max(1e-3, d);
        const vx = dx / len, vz = dz / len;
        const theta = h.cameraThetaRef.current;
        const c = Math.cos(theta), s = Math.sin(theta);
        const mx = vx * c - vz * s;
        const my = vx * s + vz * c;
        h.moveInput.current.x = Math.max(-1, Math.min(1, mx));
        h.moveInput.current.y = Math.max(-1, Math.min(1, my));
        return false;
    };

    // Tour state machine — exercises every major flow once.
    const runTourStep = (now: number) => {
        const step = tourStepRef.current;
        const p = h.sharedPlayerPositionRef.current;
        switch (step) {
            case 0:
                log('tour: indo ao NPC do lobby');
                tourStepRef.current = 1;
                break;
            case 1: {
                if (stepWalkTo(5, 5, 1.2)) { tourStepRef.current = 2; log('tour: chegou ao NPC'); }
                break;
            }
            case 2:
                if (h.canInteractNPC) { h.handleStartDialogue(); tourStepRef.current = 3; }
                break;
            case 3:
                if (h.dialogueOpen) {
                    setTimeout(() => h.setDialogueOpen(false), 1500);
                    tourStepRef.current = 4;
                }
                break;
            case 4:
                if (!h.dialogueOpen) {
                    log('tour: indo ao elevador');
                    tourStepRef.current = 5;
                }
                break;
            case 5:
                if (stepWalkTo(0, -11, 0.8)) { tourStepRef.current = 6; log('tour: dentro do elevador'); }
                break;
            case 6:
                // Wait for level transition.
                if (h.currentLevel === 1) { tourStepRef.current = 7; log('tour: chegou no andar 1'); }
                break;
            case 7:
                if (stepWalkTo(0, 5, 1.5)) { tourStepRef.current = 8; log('tour: na porta'); }
                break;
            case 8:
                if (h.canInteractDoor) { h.handleOpenDoor(); tourStepRef.current = 9; }
                break;
            case 9:
                if (h.barneyDialogueOpen) {
                    setTimeout(() => h.handleBarneyResponse('accept_coffee'), 2000);
                    tourStepRef.current = 10;
                }
                break;
            case 10:
                if (h.gameState === 'indoor_day') { tourStepRef.current = 11; log('tour: dentro de casa'); }
                break;
            case 11:
                if (stepWalkTo(-2.5, 12.5, 0.6)) { tourStepRef.current = 12; log('tour: na cama'); }
                break;
            case 12:
                if (h.canSleepNow) { h.handleSleep(); tourStepRef.current = 13; }
                break;
            case 13:
                if (h.gameState === 'chase') { tourStepRef.current = 14; log('tour: chase iniciada — fugindo'); }
                break;
            case 14:
                if (stepWalkTo(0, -11, 0.6)) { tourStepRef.current = 15; }
                break;
            case 15:
                log('tour: completo');
                setRoutine({ kind: 'idle' });
                tourStepRef.current = 0;
                break;
        }
    };

    // Tick at ~30Hz to drive the bot independently of useFrame.
    useEffect(() => {
        if (!enabled) {
            // Stop driving inputs and reset.
            h.moveInput.current.x = 0;
            h.moveInput.current.y = 0;
            setHudInfo((s) => ({ ...s, status: 'desligado' }));
            return;
        }
        setHudInfo((s) => ({ ...s, status: 'ativo' }));
        let raf = 0;
        let timeoutId: any = null;
        const tick = () => {
            const now = performance.now();
            if (now - lastTickRef.current >= 33) {
                lastTickRef.current = now;
                const r = routineRef.current;
                if (r.kind === 'walkTo') {
                    const arrived = stepWalkTo(r.x, r.z, r.arrive);
                    if (arrived) { setRoutine({ kind: 'idle' }); log(`alvo (${r.x.toFixed(1)}, ${r.z.toFixed(1)}) atingido`); }
                } else if (r.kind === 'circle') {
                    const t = (r.t = r.t + 0.033);
                    const tx = r.cx + Math.cos(t * 0.5) * r.r;
                    const tz = r.cz + Math.sin(t * 0.5) * r.r;
                    stepWalkTo(tx, tz, 0.1);
                } else if (r.kind === 'wait') {
                    if (now >= r.until) { setRoutine({ kind: 'idle' }); log(`espera ${r.reason} terminou`); }
                } else if (r.kind === 'tour') {
                    runTourStep(now);
                } else {
                    h.moveInput.current.x = 0;
                    h.moveInput.current.y = 0;
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        // Programmatic API on window.__jubileuBot. Open devtools and call
        // window.__jubileuBot.walk(0, -10) etc. Useful for hand-driving when
        // Claude (or any tester) needs to issue commands without the HUD.
        const api = {
            get state() {
                const p = h.sharedPlayerPositionRef.current;
                return {
                    routine: routineRef.current,
                    pos: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) },
                    ry: +h.sharedRotationYRef.current.toFixed(3),
                    currentLevel: h.currentLevel,
                    gameState: h.gameState,
                };
            },
            stop: () => setRoutine({ kind: 'idle' }),
            walk: (x: number, z: number, arrive = 0.5) => setRoutine({ kind: 'walkTo', x, z, arrive }),
            circle: (cx = 0, cz = 0, r = 4) => setRoutine({ kind: 'circle', cx, cz, r, t: 0 }),
            tour: () => { tourStepRef.current = 0; setRoutine({ kind: 'tour' }); },
            jumpTo: (x: number, y: number, z: number) => { h.positionCmdRef.current = { x, y, z }; log(`teleport (${x},${y},${z})`); },
            interact: () => {
                if (h.canInteractDoor) { h.handleOpenDoor(); log('interagiu: porta'); return; }
                if (h.canInteractNPC) { h.handleStartDialogue(); log('interagiu: NPC'); return; }
                if (h.canSleepNow) { h.handleSleep(); log('interagiu: dormir'); return; }
                log('nada para interagir');
            },
            sayBarney: (next: string) => h.handleBarneyResponse(next),
            log: (m: string) => log(m),
            help: () => {
                // eslint-disable-next-line no-console
                console.log(`%cjubileu bot api%c
walk(x, z, arrive?) — anda até (x,z)
circle(cx?, cz?, r?) — anda em círculo
tour() — executa o tour completo
jumpTo(x, y, z) — teleporta o player
interact() — abre porta / fala NPC / dorme se possível
sayBarney(next) — escolhe opção do diálogo do Barney
stop() — para tudo
state — getter da posição/estado
`, 'background:#fbbf24;color:#000;padding:2px 6px;border-radius:3px', '');
            },
        };
        window.__jubileuBot = api;
        log('bot ativo — window.__jubileuBot.help() no console');

        return () => {
            cancelAnimationFrame(raf);
            if (timeoutId) clearTimeout(timeoutId);
            h.moveInput.current.x = 0;
            h.moveInput.current.y = 0;
            delete window.__jubileuBot;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, h.currentLevel, h.gameState, h.canInteractDoor, h.canInteractNPC, h.canSleepNow, h.dialogueOpen, h.barneyDialogueOpen]);

    return hudInfo;
};

export const BotHud = ({ info }: { info: { routine: string; status: string; log: string[] } }) => {
    return (
        <div
            className="absolute z-[55] pointer-events-none w-[240px] max-w-[calc(100vw-24px)] bg-black/70 ring-1 ring-fuchsia-500/40 rounded-lg backdrop-blur-sm px-3 py-2 text-[10px] font-mono text-fuchsia-200 shadow-[0_4px_24px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.04)]"
            style={{
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
                left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
            }}
        >
            <div className="flex items-center justify-between mb-1">
                <span className="font-bold tracking-widest uppercase text-fuchsia-300">BOT</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] ${info.status === 'ativo' ? 'bg-green-500/30 text-green-200 ring-1 ring-green-500/40' : 'bg-gray-500/30 text-gray-300 ring-1 ring-gray-500/40'}`}>
                    {info.status}
                </span>
            </div>
            <div className="text-fuchsia-100/90 mb-1 truncate">rotina: {info.routine}</div>
            <div className="border-t border-fuchsia-500/20 mt-1 pt-1 max-h-[80px] overflow-hidden">
                {info.log.map((l, i) => (
                    <div key={i} className="text-[9px] text-fuchsia-200/70 truncate">{l}</div>
                ))}
            </div>
        </div>
    );
};
