import React, { useState, useEffect, useRef, useCallback, Suspense, Component } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, Loader } from '@react-three/drei';
import { Vector3, ACESFilmicToneMapping, SRGBColorSpace } from 'three';

// ─── Error Boundary for Canvas ─────────────────────────────────────────────
class CanvasErrorBoundary extends Component<{children: React.ReactNode}, {hasError: boolean, error: string}> {
  state = { hasError: false, error: '' };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error: error.message }; }
  render() {
    if (this.state.hasError) {
      return <div className="absolute inset-0 flex items-center justify-center bg-black"><div className="text-center px-6"><div className="text-amber-400 text-lg font-bold mb-2">Algo deu errado</div><div className="text-white/50 text-sm font-mono mb-4">{this.state.error}</div><button onClick={() => window.location.reload()} aria-label="Recarregar página" className="bg-amber-500 text-black px-4 py-2 rounded-lg font-bold text-sm">Recarregar</button></div></div>;
    }
    return this.props.children;
  }
}

import { LiminalAudioEngine } from './AudioEngine';
import { MainMenu } from './MainMenu';
import { VisualJoystick, DialogueOverlay } from './UI';
import { ShopOverlay } from './ShopOverlay';
import { Player } from './Player';
import { ElevatorInterior } from './Elevator';
import { LobbyEnvironment } from './LobbyEnv';
import { FlatMapEnvironment, BarneyActor } from './HouseEnv';
import { BARNEY_URL, BARNEY_CATCH_DIST, DOOR_INTERACT_DIST, NPC_INTERACT_DIST, BED_INTERACT_DIST, ELEVATOR_ZONE_X, ELEVATOR_ZONE_Z } from './constants';
import { useMultiplayer, getPlayerName } from './Multiplayer';
import { RemotePlayer } from './RemotePlayer';
import { useSettings, SettingsMenu, FpsCounter, QUALITY_PROFILES } from './Settings';
import { BotSystem, BotHud, ViewportDebug, useBotStore } from './Bot';
import { RobloxChat, BubbleChatFallback } from './ChatSystem';
import { GameEffects, DustParticles, FluorescentFlicker, NightAmbient } from './PostEffects';
import { CeilingFan, WallClock, playArrivalDing, createElevatorHum } from './Atmosphere';
import { ElevatorHud, FloorReveal, TopControls, ActionButton, NightBanner, ChaseBanner, SavedOverlay, BarneyDialogue } from './HudComponents';
import { SceneInspector } from './SceneInspector';


const MAX_JOYSTICK_RADIUS = 50;

// ─── Game State Machine ───────────────────────────────────────────────────
type GameState = 'lobby' | 'outdoor' | 'barney_greet' | 'indoor_day' | 'sleep_fade' | 'indoor_night' | 'chase' | 'caught' | 'saved';

interface WorldProps {
  timer: number | null;
  doorsClosed: boolean;
  level: number;
  houseDoorOpen: boolean;
  npcPositionRef: React.MutableRefObject<Vector3>;
  isPaused: boolean;
  playerPositionRef: React.MutableRefObject<Vector3>;
  gameState: GameState;
  barneyRef: React.MutableRefObject<Vector3>;
  barneyTargetRef: React.MutableRefObject<{ x: number; z: number; scale: number }>;
  nightMode: boolean;
  doorOpenAmount: number;
  profile: any;
}

const World = React.memo(({ timer, doorsClosed, level, houseDoorOpen, npcPositionRef, isPaused, playerPositionRef, gameState, barneyRef, barneyTargetRef, nightMode, doorOpenAmount, profile }: WorldProps) => (
  <>
      {/* Lobby main light. In low/medium it's a static pointLight (cheap); in
          high we replace it with FluorescentFlicker which animates intensity
          (1 dynamic light = 1 extra per-fragment cost). */}
      {level === 0 && <LobbyEnvironment npcPositionRef={npcPositionRef} isPaused={isPaused} playerPositionRef={playerPositionRef} />}
      {level === 0 && !profile.atmosphere && (
          <pointLight position={[0, 3.8, 0]} intensity={2.8} distance={22} color="#FFE0B2" decay={2} />
      )}
      {level === 0 && profile.atmosphere && <FluorescentFlicker intensity={2.8} />}
      {/* Atmosphere stack — high only. Adds ceiling-fan pointLights, dust
          particles (transparent alpha-blended spheres), and a wall clock. */}
      {level === 0 && profile.atmosphere && <DustParticles count={20} area={16} />}
      {level === 0 && profile.atmosphere && <CeilingFan x={-5} z={0} speed={0.6} />}
      {level === 0 && profile.atmosphere && <CeilingFan x={5} z={-5} speed={0.8} />}
      {level === 0 && profile.atmosphere && <WallClock x={9.5} z={-7} />}
      {level === 1 && <FlatMapEnvironment houseDoorOpen={houseDoorOpen} nightMode={nightMode} doorOpenAmount={doorOpenAmount} />}
      <ElevatorInterior timer={timer} doorsClosed={doorsClosed} level={level} />
      {level === 1 && <BarneyActor gameState={gameState} barneyRef={barneyRef} barneyTargetRef={barneyTargetRef} playerPosRef={playerPositionRef} houseDoorOpen={houseDoorOpen} />}
      {profile.nightLights && <NightAmbient active={nightMode && level === 1} />}
  </>
));

export default function App() {
  const { settings, update: updateSettings } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null);
  const [muted, setMuted] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(4.0);
  const prevPinchDist = useRef<number | null>(null);
  const moveInput = useRef({ x: 0, y: 0 }); const lookInput = useRef({ x: 0, y: 0 });
  const keysRef = useRef({ w: false, a: false, s: false, d: false });
  const sharedPlayerPositionRef = useRef(new Vector3(0, 0, 8));
  const sharedRotationYRef = useRef(0);
  // Camera azimuth (theta) populated by Player every frame; used by the bot to
  // convert world-space targets into camera-relative moveInput.
  const cameraThetaRef = useRef(Math.PI);
  const playerPositionCmdRef = useRef<any>(null);
  const cameraShakeRef = useRef(false);
  const pendingTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const scheduleTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => { pendingTimeoutsRef.current.delete(id); fn(); }, ms);
    pendingTimeoutsRef.current.add(id);
    return id;
  }, []);
  useEffect(() => () => { pendingTimeoutsRef.current.forEach(clearTimeout); pendingTimeoutsRef.current.clear(); }, []);
  const [elevatorTimer, setElevatorTimer] = useState<number | null>(null); const [doorsClosed, setDoorsClosed] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(0); const [overlayOpacity, setOverlayOpacity] = useState(0);
  const [travelPhase, setTravelPhase] = useState('idle');
  const elevatorHumStopRef = useRef<(() => void) | null>(null);
  const [floorReveal, setFloorReveal] = useState(false);
  const [cameraShake, setCameraShake] = useState(false);
  const lastHandledTimerRef = useRef<number | null>(null);
  const [arrivalPulse, setArrivalPulse] = useState(false);

  const [gameState, setGameState] = useState<GameState>('lobby');
  const [barneyDialogueOpen, setBarneyDialogueOpen] = useState(false);
  const [barneyDialogueNode, setBarneyDialogueNode] = useState('greet');
  const [canSleep, setCanSleep] = useState(false);
  const [canSleepNow, setCanSleepNow] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [sleepFadeOpacity, setSleepFadeOpacity] = useState(0);
  const [jumpscare, setJumpscare] = useState(false);
  const [doorOpenAmount, setDoorOpenAmount] = useState(0);
  const [insideElevator, setInsideElevator] = useState(false);
  
  const barneyRef = useRef(new Vector3(0, 0, 0));
  const barneyTargetRef = useRef({ x: 0, z: 6.8, scale: 0 });
  
  const npcPositionRef = useRef(new Vector3(5, 0, 5)); 
  const [canInteractNPC, setCanInteractNPC] = useState(false); 
  const [dialogueOpen, setDialogueOpen] = useState(false); 
  const [dialogueNode, setDialogueNode] = useState('start');
  const [canInteractCashier, setCanInteractCashier] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [houseDoorOpen, setHouseDoorOpen] = useState(false); 
  const [canInteractDoor, setCanInteractDoor] = useState(false); 
  const [doorSoundTrigger, setDoorSoundTrigger] = useState(0);

  const handleElevatorZoneChange = useCallback((inside: boolean) => {
      setInsideElevator(inside);
  }, []);

  useEffect(() => { cameraShakeRef.current = cameraShake; }, [cameraShake]);
  
  useEffect(() => {
      if (currentLevel === 1 && gameState === 'lobby') {
          setGameState('outdoor');
          playerPositionCmdRef.current = { x: 0, y: 0, z: -13 };
      }
      if (currentLevel === 0 && gameState !== 'lobby') {
          setGameState('lobby');
          setNightMode(false);
          setHouseDoorOpen(false);
          setDoorOpenAmount(0);
      }
  }, [currentLevel, gameState]);
  
  useEffect(() => {
      if (gameState !== 'chase') return;
      setNightMode(true);
      const resolved = { current: false };
      let active = true;
      const interval = setInterval(() => {
          if (resolved.current || !active) return;
          const p = sharedPlayerPositionRef.current;
          const b = barneyRef.current;
          const d = Math.sqrt((p.x - b.x) ** 2 + (p.z - b.z) ** 2);
          if (d < BARNEY_CATCH_DIST) {
              resolved.current = true;
              setJumpscare(true);
              setGameState('caught');
              scheduleTimeout(() => {
                  setJumpscare(false);
                  playerPositionCmdRef.current = { x: 0, y: 0, z: -13 };
                  barneyRef.current.set(0, 0, 6.5);
                  barneyTargetRef.current = { x: 0, z: 6.8, scale: 0 };
                  setNightMode(false);
                  setHouseDoorOpen(false);
                  setDoorOpenAmount(0);
                  setGameState('outdoor');
              }, 2000);
          } else if (p.z <= ELEVATOR_ZONE_Z && Math.abs(p.x) <= ELEVATOR_ZONE_X) {
              resolved.current = true;
              setGameState('saved');
              setDoorsClosed(true);
              setDoorSoundTrigger(prev => prev + 1);
              playerPositionCmdRef.current = { x: 0, y: 0, z: -13 };
              scheduleTimeout(() => {
                  setNightMode(false);
                  setHouseDoorOpen(false);
                  setDoorOpenAmount(0);
                  setDoorsClosed(false);
                  setGameState('outdoor');
                  barneyRef.current.set(0, 0, 6.5);
                  barneyTargetRef.current = { x: 0, z: 6.8, scale: 0 };
              }, 2500);
          }
      }, 100);
      return () => { active = false; clearInterval(interval); };
  }, [gameState]);
  
  useEffect(() => {
      if (gameState !== 'indoor_day' || !canSleep) { setCanSleepNow(false); return; }
      const check = setInterval(() => {
          const p = sharedPlayerPositionRef.current;
          const BED_X = -2.5, BED_Z = 12.5;
          const d = Math.sqrt((p.x - BED_X) ** 2 + (p.z - BED_Z) ** 2);
          setCanSleepNow(d < BED_INTERACT_DIST);
      }, 200);
      return () => clearInterval(check);
  }, [gameState, canSleep]);

  const handlePlayerEnterElevator = () => { if (elevatorTimer === null && !doorsClosed) { setElevatorTimer(5); } };
  const handleInteractionUpdate = useCallback((c: boolean) => { setCanInteractDoor(p => p !== c ? c : p); }, []);
  const handleNpcInteractionUpdate = useCallback((c: boolean) => { setCanInteractNPC(p => p !== c ? c : p); }, []);
  const handleCashierInteractionUpdate = useCallback((c: boolean) => { setCanInteractCashier(p => p !== c ? c : p); }, []);
  const handleOpenShop = useCallback(() => { setShopOpen(true); setCanInteractCashier(false); }, []);
  const handleCloseShop = useCallback(() => { setShopOpen(false); }, []);
  const handleOpenDoor = () => {
      if (gameState === 'outdoor') {
          setGameState('barney_greet');
          setBarneyDialogueNode('greet');
          setCanInteractDoor(false);
          setDoorOpenAmount(0.25);
          barneyRef.current.set(0, 0, 6.8);
          barneyTargetRef.current = { x: 0, z: 6.8, scale: 0 };
          scheduleTimeout(() => { setDoorOpenAmount(0.7); barneyTargetRef.current = { x: 0, z: 6.3, scale: 1 }; }, 500);
          scheduleTimeout(() => { setDoorOpenAmount(0.95); barneyTargetRef.current = { x: 0, z: 5.4, scale: 1 }; }, 1100);
          scheduleTimeout(() => { setBarneyDialogueOpen(true); }, 1700);
      } else {
          setHouseDoorOpen(true);
          setDoorOpenAmount(1);
          setCanInteractDoor(false);
      }
  };
  
  const handleBarneyResponse = (next: string) => {
      if (next === 'accept_coffee') {
          setHouseDoorOpen(true);
          setDoorOpenAmount(1);
          setBarneyDialogueOpen(false);
          setBarneyDialogueNode('greet');
          setGameState('indoor_day');
          barneyTargetRef.current = { x: -2, z: 8, scale: 1 };
          scheduleTimeout(() => setCanSleep(true), 1500);
      } else if (next === 'refuse') {
          setBarneyDialogueOpen(false);
          setBarneyDialogueNode('greet');
          setGameState('outdoor');
          setDoorOpenAmount(0);
          setHouseDoorOpen(false);
          barneyTargetRef.current = { x: 0, z: 6.8, scale: 0 };
      } else {
          setBarneyDialogueNode(next);
      }
  };
  
  const handleSleep = () => {
      setCanSleep(false);
      setGameState('sleep_fade');
      setSleepFadeOpacity(1);
      scheduleTimeout(() => {
          setNightMode(true);
          setGameState('indoor_night');
          playerPositionCmdRef.current = { x: 0, y: 0, z: 2 };
          setHouseDoorOpen(false);
          setDoorOpenAmount(0);
          barneyRef.current.set(0, 0, 5.8);
          barneyTargetRef.current = { x: 0, z: 5.8, scale: 1 };
          scheduleTimeout(() => {
              setSleepFadeOpacity(0);
              scheduleTimeout(() => setGameState('chase'), 2000);
          }, 500);
      }, 3000);
  };

  // Multiplayer is now a global setting; the game-start callback below also
  // syncs it (so the menu's MP toggle still wins on the first launch).
  const multiplayerEnabled = settings.multiplayer;
  const setMultiplayerEnabled = useCallback((on: boolean) => updateSettings({ multiplayer: on }), [updateSettings]);
  const [playerAnimState, setPlayerAnimState] = useState<'idle' | 'walking'>('idle');
  const [playerName, setPlayerName] = useState(getPlayerName());
  useEffect(() => {
    if (!multiplayerEnabled) return;
    const id = setInterval(() => {
      const moving = moveInput.current.x !== 0 || moveInput.current.y !== 0;
      setPlayerAnimState(prev => {
        const next = moving ? 'walking' : 'idle';
        return prev === next ? prev : next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [multiplayerEnabled]);
  const { user, otherPlayerIds, otherPlayersDataRef, sendChat, chatMessages } = useMultiplayer(sharedPlayerPositionRef, sharedRotationYRef, playerAnimState, multiplayerEnabled, currentLevel, playerName);

  const handleStartDialogue = () => { setDialogueNode('start'); setDialogueOpen(true); setCanInteractNPC(false); };
  const handleStartGame = (mpEnabled: boolean, name?: string) => {
    if (audioCtx) return;
    setMultiplayerEnabled(mpEnabled);
    if (name) setPlayerName(name);
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    ctx.resume().catch(() => {});
    setAudioCtx(ctx);
    (window as any).__jubileuAudioCtx = ctx;
    setHasStarted(true);
    if (typeof window !== 'undefined' && window.matchMedia("(min-width: 1024px)").matches) {
      const req = document.body.requestPointerLock() as unknown as Promise<void> | undefined;
      if (req && typeof (req as any).catch === 'function') (req as Promise<void>).catch(() => {});
    }
  };

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | undefined;
    if (elevatorTimer !== null && elevatorTimer > 0) {
        timerId = setTimeout(() => { setElevatorTimer((prev) => (prev !== null ? Math.max(prev - 1, 0) : null)); }, 1000);
        if (!doorsClosed) {
            setTravelPhase('waiting');
        } else {
            if (elevatorTimer <= 19) {
                setTravelPhase('traveling');
                setCameraShake(true);
            }
            if (elevatorTimer !== lastHandledTimerRef.current) {
                lastHandledTimerRef.current = elevatorTimer;
                if (elevatorTimer === 19) { setOverlayOpacity(1); }
                if (elevatorTimer === 18) {
                    if (currentLevel === 0) { setCurrentLevel(1); setFloorReveal(true); }
                    else { setCurrentLevel(0); setFloorReveal(true); }
                }
                if (elevatorTimer === 17) { setOverlayOpacity(0); }
                if (elevatorTimer === 15 || elevatorTimer === null) { setFloorReveal(false); }
            }
        }
    } else if (elevatorTimer === 0) {
        if (!doorsClosed) {
            setDoorsClosed(true);
            setElevatorTimer(20);
            setDoorSoundTrigger(prev => prev + 1);
            setTravelPhase('closing');
            lastHandledTimerRef.current = null;
            // Start elevator hum during travel
            if (elevatorHumStopRef.current) elevatorHumStopRef.current();
            elevatorHumStopRef.current = createElevatorHum(audioCtx);
        } else {
            setDoorsClosed(false);
            setElevatorTimer(null);
            setOverlayOpacity(0);
            setTravelPhase('arriving');
            setCameraShake(false);
            setArrivalPulse(true);
            playArrivalDing(audioCtx);
            // Stop elevator hum on arrival
            if (elevatorHumStopRef.current) { elevatorHumStopRef.current(); elevatorHumStopRef.current = null; }
            lastHandledTimerRef.current = null;
            scheduleTimeout(() => { setArrivalPulse(false); setTravelPhase('idle'); }, 1500);
        }
    }
    return () => clearTimeout(timerId);
  }, [elevatorTimer, doorsClosed, currentLevel]);

  useEffect(() => {
    return () => {
      if (elevatorHumStopRef.current) { elevatorHumStopRef.current(); elevatorHumStopRef.current = null; }
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(() => {});
    };
  }, [audioCtx]);

  const [joystickVisual, setJoystickVisual] = useState({ active: false, originX: 0, originY: 0, currentX: 0, currentY: 0 });
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);
  const activePointers = useRef(new Map<number, { type: 'move' | 'look' | 'aux'; startX: number; startY: number; currX: number; currY: number }>());

  useEffect(() => {
    if (!dialogueOpen && !barneyDialogueOpen) return;
    moveInput.current = { x: 0, y: 0 };
    lookInput.current = { x: 0, y: 0 };
    keysRef.current = { w: false, a: false, s: false, d: false };
    activePointers.current.clear();
    prevPinchDist.current = null;
    setJoystickVisual(p => ({ ...p, active: false }));
  }, [dialogueOpen, barneyDialogueOpen]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!hasStarted) return;
    if (isDesktop) { if (document.pointerLockElement !== document.body && !dialogueOpen && !barneyDialogueOpen && !shopOpen) { const req = document.body.requestPointerLock() as unknown as Promise<void> | undefined; if (req && typeof (req as any).catch === 'function') (req as Promise<void>).catch(() => {}); } return; }
    if (dialogueOpen || barneyDialogueOpen || shopOpen) return;
    e.preventDefault(); e.stopPropagation();
    const { pointerId, clientX, clientY } = e; const screenW = window.innerWidth; const screenH = window.innerHeight;
    const isPortrait = screenH > screenW; const zoneLimit = isPortrait ? 0.5 : 0.4;
    if (clientX < screenW * zoneLimit) {
      const hasMove = Array.from(activePointers.current.values()).some(p => p.type === 'move');
      activePointers.current.set(pointerId, { type: hasMove ? 'aux' : 'move', startX: clientX, startY: clientY, currX: clientX, currY: clientY });
      if (!hasMove) { setJoystickVisual({ active: true, originX: clientX, originY: clientY, currentX: 0, currentY: 0 }); moveInput.current = { x: 0, y: 0 }; }
    } else {
      const hasLook = Array.from(activePointers.current.values()).some(p => p.type === 'look');
      activePointers.current.set(pointerId, { type: hasLook ? 'aux' : 'look', startX: clientX, startY: clientY, currX: clientX, currY: clientY });
    }
    if (activePointers.current.size === 2) { prevPinchDist.current = null; }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!hasStarted) return;
    if (isDesktop) {
      if (document.pointerLockElement === document.body && !dialogueOpen && !barneyDialogueOpen && !shopOpen) {
        const sx = settings.sensitivity;
        const sy = settings.sensitivity * (settings.invertY ? -1 : 1);
        lookInput.current.x += e.movementX * sx;
        lookInput.current.y += e.movementY * sy;
      }
      return;
    }
    e.preventDefault(); e.stopPropagation();
    const { pointerId, clientX, clientY } = e; const pointer = activePointers.current.get(pointerId);
    if (pointer) {
      pointer.currX = clientX; pointer.currY = clientY;
      const types = Array.from(activePointers.current.values()).map(p => p.type);
      const isDual = types.includes('move') && types.includes('look');
      const isPinch = activePointers.current.size === 2 && !isDual;
      if (!isPinch) {
          if (pointer.type === 'move') {
            const dx = clientX - pointer.startX; const dy = clientY - pointer.startY;
            const dist = Math.sqrt(dx*dx + dy*dy); const ang = Math.atan2(dy, dx);
            const cap = Math.min(dist, MAX_JOYSTICK_RADIUS);
            const vx = Math.cos(ang)*cap; const vy = Math.sin(ang)*cap;
            let nx = vx/MAX_JOYSTICK_RADIUS; let ny = vy/MAX_JOYSTICK_RADIUS;
            moveInput.current = { x: nx, y: ny };
            setJoystickVisual(prev => ({ ...prev, currentX: nx, currentY: ny }));
          } else if (pointer.type === 'look') {
            const deltaX = clientX - pointer.startX; const deltaY = clientY - pointer.startY;
            const sx = 0.006 * settings.sensitivity;
            const sy = 0.006 * settings.sensitivity * (settings.invertY ? -1 : 1);
            lookInput.current.x += deltaX * sx; lookInput.current.y += deltaY * sy;
            pointer.startX = clientX; pointer.startY = clientY;
          }
      }
      if (isPinch && !dialogueOpen && !barneyDialogueOpen) {
          const pts = Array.from(activePointers.current.values()); const p1 = pts[0]; const p2 = pts[1];
          const dist = Math.sqrt(Math.pow(p1.currX-p2.currX, 2) + Math.pow(p1.currY-p2.currY, 2));
          if (prevPinchDist.current !== null) { const delta = dist - prevPinchDist.current; setZoomLevel(prev => Math.min(Math.max(prev - delta * 0.02, 0), 10)); }
          prevPinchDist.current = dist;
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!hasStarted || isDesktop) return; e.preventDefault();
    const pointer = activePointers.current.get(e.pointerId);
    if (pointer) { if (pointer.type === 'move') { moveInput.current = { x: 0, y: 0 }; setJoystickVisual(p => ({ ...p, active: false })); } activePointers.current.delete(e.pointerId); }
    if (activePointers.current.size < 2) { prevPinchDist.current = null; }
  };

  useEffect(() => {
    if (!isDesktop || !hasStarted) return;
    if (dialogueOpen || barneyDialogueOpen || shopOpen) { document.exitPointerLock(); return; }
    const upd = () => { const k = keysRef.current; let x=0, y=0; if (k.w) y-=1; if (k.s) y+=1; if (k.a) x-=1; if (k.d) x+=1; moveInput.current.x=x; moveInput.current.y=y; };
    const kd = (e: KeyboardEvent) => {
      // ESC toggles settings always — even mid-dialogue, so user has an
      // escape hatch.
      if (e.key === 'Escape') {
        e.preventDefault();
        if (shopOpen) { handleCloseShop(); return; }
        setSettingsOpen((v) => !v);
        return;
      }
      if (dialogueOpen || barneyDialogueOpen || shopOpen) return;
      const k = keysRef.current;
      switch(e.key.toLowerCase()) {
        case 'w': k.w=true; break;
        case 'a': k.a=true; break;
        case 's': k.s=true; break;
        case 'd': k.d=true; break;
        case 'e':
          if (canInteractCashier) handleOpenShop();
          else if (canInteractNPC) handleStartDialogue();
          else if (canInteractDoor && !houseDoorOpen) handleOpenDoor();
          else if (canSleepNow && gameState === 'indoor_day') handleSleep();
          break;
      }
      upd();
    };
    const ku = (e: KeyboardEvent) => {
        const k = keysRef.current;
        switch(e.key.toLowerCase()) { case 'w': k.w=false; break; case 'a': k.a=false; break; case 's': k.s=false; break; case 'd': k.d=false; break; }
        upd();
    };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [isDesktop, hasStarted, dialogueOpen, barneyDialogueOpen, shopOpen, canInteractNPC, canInteractCashier, canInteractDoor, houseDoorOpen, canSleepNow, gameState]);

  // Bot mode: spawns autonomous bot avatars in the lobby that move via
  // steering behaviors. The simulation lives inside <BotSystem> (mounted in
  // the Canvas tree, since useFrame requires Canvas context). The HUD reads
  // its state via the external store (useBotStore).
  const botEnabled = settings.botMode && hasStarted;
  const { info: botInfo } = useBotStore();

  return (
    <div className="w-full h-full relative overflow-hidden select-none" style={{ touchAction: 'none', backgroundColor: '#000' }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onPointerLeave={handlePointerUp} onWheel={(e: React.WheelEvent) => { if (!hasStarted || dialogueOpen || barneyDialogueOpen || shopOpen) return; setZoomLevel(prev => Math.min(Math.max(prev + e.deltaY * 0.01, 0), 10)); }}>
      <LiminalAudioEngine doorTrigger={doorSoundTrigger} audioContext={audioCtx} muted={muted} masterVolume={settings.masterVolume} nightMode={nightMode} gameState={gameState} currentLevel={currentLevel} doorsClosed={doorsClosed} />
      <div className="absolute inset-0 z-30 bg-black pointer-events-none transition-opacity duration-1000 ease-in-out" style={{ opacity: overlayOpacity }} />
      {cameraShake && <div className="absolute inset-0 z-20 pointer-events-none traveling-vignette" />}
      <CanvasErrorBoundary>
      <Canvas
        // NOTE: no `key` here. Re-keying on settings change would unmount/remount
        // the entire scene (and reload every GLB!), which is what was causing the
        // visible "cut/flash" mid-game. dpr is reactive in r3f; antialias change
        // requires a reload (we just accept that — quality is set from menu).
        camera={{ fov: 75, near: 0.1, far: QUALITY_PROFILES[settings.quality].far }}
        dpr={QUALITY_PROFILES[settings.quality].dpr}
        gl={{
          antialias: QUALITY_PROFILES[settings.quality].antialias,
          powerPreference: 'high-performance',
          // ACES Filmic gives the lobby/house lighting more depth without crushing
          // highlights. Combined with sRGB output for correctly-encoded colors.
          toneMapping: ACESFilmicToneMapping,
          outputColorSpace: SRGBColorSpace,
        }}
      >
        <Suspense fallback={<Html center><div className="px-5 py-3 rounded-xl bg-black/90 ring-1 ring-amber-500/30 backdrop-blur-xl text-center"><div className="text-amber-400 text-xs font-medium tracking-[0.3em] uppercase mb-1.5">The Normal Elevator</div><div className="flex items-center justify-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /><div className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-pulse" style={{animationDelay:'0.2s'}} /><div className="w-1.5 h-1.5 rounded-full bg-amber-400/30 animate-pulse" style={{animationDelay:'0.4s'}} /></div></div></Html>}>
            <World timer={elevatorTimer} doorsClosed={doorsClosed} level={currentLevel} houseDoorOpen={houseDoorOpen} npcPositionRef={npcPositionRef} isPaused={dialogueOpen || barneyDialogueOpen || shopOpen} playerPositionRef={sharedPlayerPositionRef} gameState={gameState} barneyRef={barneyRef} barneyTargetRef={barneyTargetRef} nightMode={nightMode} doorOpenAmount={doorOpenAmount} profile={QUALITY_PROFILES[settings.quality]} />
            {/* RemotePlayers receive only id + the multiplayer data ref. Position
                updates flow through the ref + useFrame, so the React tree no
                longer re-renders every 200ms. The id list only changes when a
                player joins or leaves. */}
            {otherPlayerIds.slice(0, QUALITY_PROFILES[settings.quality].remoteLimit).map(id => (
                <RemotePlayer key={id} id={id} dataRef={otherPlayersDataRef} chatBubbles3D={QUALITY_PROFILES[settings.quality].chatBubbles3D} />
            ))}
            <Player active={hasStarted} moveInput={moveInput} lookInput={lookInput} isDesktop={isDesktop} onEnterElevator={handlePlayerEnterElevator} doorsClosed={doorsClosed} currentLevel={currentLevel} onInteractionUpdate={handleInteractionUpdate} onNpcInteractionUpdate={handleNpcInteractionUpdate} onCashierInteractionUpdate={handleCashierInteractionUpdate} houseDoorOpen={houseDoorOpen} zoomLevel={zoomLevel} npcPositionRef={npcPositionRef} dialogueTargetRef={barneyDialogueOpen ? barneyRef : npcPositionRef} dialogueOpen={dialogueOpen || barneyDialogueOpen || shopOpen} sharedPositionRef={sharedPlayerPositionRef} sharedRotationYRef={sharedRotationYRef} cameraThetaRef={cameraThetaRef} cameraShakeRef={cameraShakeRef} positionCmdRef={playerPositionCmdRef} onElevatorZoneChange={handleElevatorZoneChange} />
            {botEnabled && (
                <BotSystem
                    playerPositionRef={sharedPlayerPositionRef}
                    currentLevel={currentLevel}
                    doorsClosed={doorsClosed}
                    houseDoorOpen={houseDoorOpen}
                />
            )}
            <SceneInspector />
        </Suspense>
      </Canvas>
      </CanvasErrorBoundary>
      {hasStarted && QUALITY_PROFILES[settings.quality].overlay && (
          <GameEffects nightMode={nightMode} gameState={gameState} currentLevel={currentLevel} quality={settings.quality} />
      )}
      <Loader />
      {!hasStarted && <MainMenu onPlay={handleStartGame} />}
      
      {/* ─────────────────────────────────────────────────────────────────────
          HUD layer: ONE safe-area boundary. Every element inside positions
          itself relative to this fixed wrapper, so `top-3 right-3` ends up at
          (safe-area-inset-top + 12, safe-area-inset-right + 12). No element
          should re-add env() inline — the wrapper resolves it once.
          ───────────────────────────────────────────────────────────────────── */}
      {hasStarted && <div className="hud-fixed">
        <ElevatorHud currentLevel={currentLevel} elevatorTimer={elevatorTimer} doorsClosed={doorsClosed} arrivalPulse={arrivalPulse} />
      </div>}

      {floorReveal && <FloorReveal level={currentLevel} />}
      
      {hasStarted && (
        <TopControls
          multiplayerEnabled={multiplayerEnabled}
          otherPlayersCount={otherPlayerIds.length}
          onSettingsOpen={() => setSettingsOpen(true)}
          muted={muted}
          onToggleMute={() => setMuted(!muted)}
        />
      )}
      {settings.showFps && hasStarted && <FpsCounter />}
      {botEnabled && <BotHud info={botInfo} />}
      {botEnabled && <ViewportDebug />}

      {/* ─── Roblox-style Chat System ──────────────────────────────────────── */}
      {hasStarted && multiplayerEnabled && (
          <>
              <RobloxChat
                  messages={chatMessages}
                  currentUserId={user?.uid || ''}
                  onSend={sendChat}
                  enabled={multiplayerEnabled && !dialogueOpen && !barneyDialogueOpen && !shopOpen && !settingsOpen}
                  forceClose={settingsOpen}
              />
              <BubbleChatFallback
                  messages={chatMessages}
                  currentUserId={user?.uid || ''}
              />
          </>
      )}

      <SettingsMenu open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {hasStarted && !isDesktop && !dialogueOpen && !barneyDialogueOpen && !shopOpen && ( <VisualJoystick active={joystickVisual.active} x={joystickVisual.currentX} y={joystickVisual.currentY} origin={{ x: joystickVisual.originX, y: joystickVisual.originY }} /> )}
      {/* ─── Bottom-center action buttons ─────────────────────────────────
          ABRIR/FALAR/DORMIR are mutually exclusive by game state, so they
          all share the same bottom anchor. Bottom anchor uses safe-area
          inset + 24px so it clears the iOS home indicator and Android
          gesture bar. Horizontal padding is fluid for narrow screens.
          ───────────────────────────────────────────────────────────────── */}
      {hasStarted && canInteractDoor && !houseDoorOpen && !dialogueOpen && !barneyDialogueOpen && !shopOpen && (
        <ActionButton
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" /></svg>}
          label="ABRIR PORTA"
          colorClasses="bg-gradient-to-r from-amber-400 to-yellow-300"
          ringClasses="bg-white text-black ring-amber-200"
          onClick={handleOpenDoor}
          ariaLabel="Abrir porta"
        />
      )}
      {hasStarted && canInteractCashier && !canInteractNPC && !dialogueOpen && !barneyDialogueOpen && !shopOpen && (
        <ActionButton
          icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3zM7 10v2h2v-2h6v2h2v-2h2v10H5V10h2z"/></svg>}
          label="ABRIR LOJA"
          colorClasses="bg-gradient-to-r from-red-500 via-rose-400 to-red-500"
          ringClasses="bg-gradient-to-b from-rose-200 to-red-300 text-red-900 ring-rose-200"
          onClick={handleOpenShop}
          ariaLabel="Abrir loja do recepcionista"
        />
      )}
      {hasStarted && canInteractNPC && !dialogueOpen && !barneyDialogueOpen && !shopOpen && (
        <ActionButton
          icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>}
          label="FALAR"
          colorClasses="bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400"
          ringClasses="bg-gradient-to-b from-yellow-300 to-amber-400 text-black ring-yellow-200"
          onClick={handleStartDialogue}
          ariaLabel="Falar com NPC"
        />
      )}
      {dialogueOpen && ( <DialogueOverlay nodeKey={dialogueNode} onOptionSelect={(next: string) => setDialogueNode(next)} onClose={() => setDialogueOpen(false)} /> )}
      
      <div className="absolute inset-0 z-[60] bg-black pointer-events-none transition-opacity duration-[2500ms]" style={{ opacity: sleepFadeOpacity }}>
        {sleepFadeOpacity > 0.5 && <div className="absolute inset-0 flex items-center justify-center"><div className="text-white/40 text-2xl font-thin tracking-[0.5em] animate-pulse">zzz...</div></div>}
      </div>
      
      {jumpscare && (
        <div className="absolute inset-0 z-[75] flex items-center justify-center pointer-events-none animate-jumpscare bg-red-950">
          <img src={BARNEY_URL} className="w-full h-full object-contain mix-blend-color-burn" alt="" style={{ filter: 'hue-rotate(-20deg) saturate(1.5) contrast(1.2)' }} />
          <div className="absolute inset-0 bg-red-600/30 mix-blend-overlay" />
        </div>
      )}
      
      {hasStarted && canSleepNow && gameState === 'indoor_day' && !dialogueOpen && !barneyDialogueOpen && !shopOpen && (
        <ActionButton
          icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z"/></svg>}
          label="DORMIR"
          colorClasses="bg-gradient-to-r from-blue-400 to-indigo-400"
          ringClasses="bg-gradient-to-b from-slate-200 to-slate-300 text-slate-900 ring-blue-200"
          onClick={handleSleep}
          ariaLabel="Dormir"
        />
      )}
      
      {/* Status banners */}
      {hasStarted && gameState === 'indoor_night' && <NightBanner elevatorActive={elevatorTimer !== null} />}
      {hasStarted && gameState === 'chase' && <ChaseBanner elevatorActive={elevatorTimer !== null} />}
      {hasStarted && gameState === 'saved' && <SavedOverlay />}
      
      {barneyDialogueOpen && <BarneyDialogue dialogueNode={barneyDialogueNode} onResponse={handleBarneyResponse} />}
      <ShopOverlay open={shopOpen} onClose={handleCloseShop} />
    </div>
  );
}
