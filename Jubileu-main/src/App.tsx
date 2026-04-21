import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Loader } from '@react-three/drei';
import { Vector3 } from 'three';

import { LiminalAudioEngine } from './AudioEngine';
import { MainMenu } from './MainMenu';
import { VisualJoystick, DialogueOverlay, TypewriterText } from './UI';
import { Player } from './Player';
import { ElevatorInterior } from './Elevator';
import { LobbyEnvironment } from './LobbyEnv';
import { FlatMapEnvironment, BarneyActor } from './HouseEnv';
import { BARNEY_URL, BARNEY_DIALOGUE } from './constants';
import { useMultiplayer } from './Multiplayer';

const MAX_JOYSTICK_RADIUS = 50;

const OtherPlayerMesh = ({ p }: { p: any }) => {
  const meshRef = useRef<any>(null);
  useFrame(({ clock }) => {
    if (meshRef.current) meshRef.current.position.y = Math.sin(clock.elapsedTime * 2.5) * 0.1 + 0.9;
  });
  return (
    <group position={[p.x, p.y, p.z]} rotation={[0, p.ry, 0]}>
      <mesh ref={meshRef}>
        <capsuleGeometry args={[0.3, 1.2]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
      <Html position={[0, 2.2, 0]} center>
        <div className="bg-black/50 text-white px-2 py-1 rounded text-xs font-mono">{p.id.substring(0, 6)}</div>
      </Html>
    </group>
  );
};

const World = ({ timer, doorsClosed, level, houseDoorOpen, npcPositionRef, isPaused, playerPositionRef, gameState, barneyRef, barneyTargetRef, nightMode, doorOpenAmount, otherPlayers }: any) => (
  <>
      {level === 0 && <LobbyEnvironment npcPositionRef={npcPositionRef} isPaused={isPaused} playerPositionRef={playerPositionRef} />}
      {level === 1 && <FlatMapEnvironment houseDoorOpen={houseDoorOpen} nightMode={nightMode} doorOpenAmount={doorOpenAmount} />}
      <ElevatorInterior timer={timer} doorsClosed={doorsClosed} level={level} />
      {level === 1 && <BarneyActor gameState={gameState} barneyRef={barneyRef} barneyTargetRef={barneyTargetRef} playerPosRef={playerPositionRef} houseDoorOpen={houseDoorOpen} />}
      {Object.values(otherPlayers || {}).map((p: any) => (
          <OtherPlayerMesh key={p.id} p={p} />
      ))}
  </>
);

export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [audioCtx, setAudioCtx] = useState<any>(null);
  const [muted, setMuted] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(4.0);
  const prevPinchDist = useRef<any>(null);
  const moveInput = useRef({ x: 0, y: 0 }); const lookInput = useRef({ x: 0, y: 0 });
  const sharedPlayerPositionRef = useRef(new Vector3(0, 0, 8));
  const playerPositionCmdRef = useRef<any>(null);
  const cameraShakeRef = useRef(false);
  const [elevatorTimer, setElevatorTimer] = useState<any>(null); const [doorsClosed, setDoorsClosed] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(0); const [overlayOpacity, setOverlayOpacity] = useState(0);
  const [travelPhase, setTravelPhase] = useState('idle');
  const [floorReveal, setFloorReveal] = useState(false);
  const [cameraShake, setCameraShake] = useState(false);
  const [arrivalPulse, setArrivalPulse] = useState(false);

  const [gameState, setGameState] = useState('lobby');
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
      if (currentLevel === 0 && gameState !== 'lobby') setGameState('lobby');
  }, [currentLevel, gameState]);
  
  useEffect(() => {
      if (gameState !== 'chase') return;
      setNightMode(true);
      const interval = setInterval(() => {
          const p = sharedPlayerPositionRef.current;
          const b = barneyRef.current;
          const d = Math.sqrt((p.x - b.x) ** 2 + (p.z - b.z) ** 2);
          if (d < 1.2) {
              setJumpscare(true);
              setGameState('caught');
              setTimeout(() => {
                  setJumpscare(false);
                  playerPositionCmdRef.current = { x: 0, y: 0, z: -13 };
                  barneyRef.current.set(0, 0, 6.5);
                  barneyTargetRef.current = { x: 0, z: 6.8, scale: 0 };
                  setNightMode(false);
                  setHouseDoorOpen(false);
                  setDoorOpenAmount(0);
                  setGameState('outdoor');
              }, 2000);
          }
          if (p.z <= -10 && Math.abs(p.x) <= 3.1) {
              setGameState('saved');
              setDoorsClosed(true);
              setDoorSoundTrigger(prev => prev + 1);
              playerPositionCmdRef.current = { x: 0, y: 0, z: -13 };
              setTimeout(() => {
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
      return () => clearInterval(interval);
  }, [gameState]);
  
  useEffect(() => {
      if (gameState !== 'indoor_day' || !canSleep) { setCanSleepNow(false); return; }
      const check = setInterval(() => {
          const p = sharedPlayerPositionRef.current;
          const BED_X = -2.5, BED_Z = 12.5;
          const d = Math.sqrt((p.x - BED_X) ** 2 + (p.z - BED_Z) ** 2);
          setCanSleepNow(d < 3.0);
      }, 200);
      return () => clearInterval(check);
  }, [gameState, canSleep]);

  const handlePlayerEnterElevator = () => { if (elevatorTimer === null && !doorsClosed && currentLevel === 0) { setElevatorTimer(5); } };
  const handleInteractionUpdate = useCallback((c: boolean) => { setCanInteractDoor(p => p !== c ? c : p); }, []);
  const handleNpcInteractionUpdate = useCallback((c: boolean) => { setCanInteractNPC(p => p !== c ? c : p); }, []);
  const handleOpenDoor = () => {
      if (gameState === 'outdoor') {
          setGameState('barney_greet');
          setBarneyDialogueNode('greet');
          setCanInteractDoor(false);
          setDoorOpenAmount(0.25);
          barneyRef.current.set(0, 0, 6.8);
          barneyTargetRef.current = { x: 0, z: 6.8, scale: 0 };
          setTimeout(() => { setDoorOpenAmount(0.7); barneyTargetRef.current = { x: 0, z: 6.3, scale: 1 }; }, 500);
          setTimeout(() => { setDoorOpenAmount(0.95); barneyTargetRef.current = { x: 0, z: 5.4, scale: 1 }; }, 1100);
          setTimeout(() => { setBarneyDialogueOpen(true); }, 1700);
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
          setGameState('indoor_day');
          barneyTargetRef.current = { x: -2, z: 8, scale: 1 };
          setTimeout(() => setCanSleep(true), 1500);
      } else if (next === 'refuse') {
          setBarneyDialogueOpen(false);
          setGameState('outdoor');
          setDoorOpenAmount(0);
          barneyTargetRef.current = { x: 0, z: 6.8, scale: 0 };
      } else {
          setBarneyDialogueNode(next);
      }
  };
  
  const handleSleep = () => {
      setCanSleep(false);
      setGameState('sleep_fade');
      setSleepFadeOpacity(1);
      setTimeout(() => {
          setNightMode(true);
          setGameState('indoor_night');
          playerPositionCmdRef.current = { x: 0, y: 0, z: 2 };
          setHouseDoorOpen(false);
          setDoorOpenAmount(0);
          barneyRef.current.set(0, 0, 5.8);
          barneyTargetRef.current = { x: 0, z: 5.8, scale: 1 };
          setTimeout(() => {
              setSleepFadeOpacity(0);
              setTimeout(() => setGameState('chase'), 2000);
          }, 500);
      }, 3000);
  };

  const [multiplayerEnabled, setMultiplayerEnabled] = useState(false);
  const { user, otherPlayers } = useMultiplayer(sharedPlayerPositionRef, useRef(0), moveInput.current.x !== 0 || moveInput.current.y !== 0 ? 'walking' : 'idle', multiplayerEnabled);

  const handleStartDialogue = () => { setDialogueNode('start'); setDialogueOpen(true); setCanInteractNPC(false); };
  const handleStartGame = (mpEnabled: boolean) => { setMultiplayerEnabled(mpEnabled); const AC = window.AudioContext || (window as any).webkitAudioContext; const ctx = new AC(); ctx.resume(); setAudioCtx(ctx); setHasStarted(true); if (typeof window !== 'undefined' && window.matchMedia("(min-width: 1024px)").matches) { document.body.requestPointerLock(); } };

  useEffect(() => {
    let timerId: any;
    if (elevatorTimer !== null && elevatorTimer > 0) {
        timerId = setTimeout(() => { setElevatorTimer((prev: any) => (prev !== null ? prev - 1 : null)); }, 1000);
        if (!doorsClosed) {
            setTravelPhase('waiting');
        } else {
            setTravelPhase('traveling');
            setCameraShake(true);
            if (elevatorTimer === 19) { setOverlayOpacity(1); }
            if (elevatorTimer === 18) { if (currentLevel === 0) { setCurrentLevel(1); setFloorReveal(true); } }
            if (elevatorTimer === 17) { setOverlayOpacity(0); }
            if (elevatorTimer === 15) { setFloorReveal(false); }
        }
    } else if (elevatorTimer === 0) {
        if (!doorsClosed) {
            setDoorsClosed(true); 
            setElevatorTimer(20); 
            setDoorSoundTrigger(prev => prev + 1);
            setTravelPhase('closing');
        } else {
            setDoorsClosed(false); 
            setElevatorTimer(null); 
            setOverlayOpacity(0);
            setTravelPhase('arriving');
            setCameraShake(false);
            setArrivalPulse(true);
            setTimeout(() => { setArrivalPulse(false); setTravelPhase('idle'); }, 1500);
        }
    }
    return () => clearTimeout(timerId);
  }, [elevatorTimer, doorsClosed, currentLevel]);

  useEffect(() => {
    return () => { if (audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(() => {}); };
  }, [audioCtx]);

  const [joystickVisual, setJoystickVisual] = useState({ active: false, originX: 0, originY: 0, currentX: 0, currentY: 0 });
  const isDesktop = typeof window !== 'undefined' && window.matchMedia("(min-width: 1024px)").matches;
  const activePointers = useRef(new Map());

  const handlePointerDown = (e: any) => {
    if (!hasStarted) return;
    if (isDesktop) { if (document.pointerLockElement !== document.body && !dialogueOpen && !barneyDialogueOpen) { document.body.requestPointerLock(); } return; }
    if (dialogueOpen || barneyDialogueOpen) return;
    e.preventDefault(); e.stopPropagation();
    const { pointerId, clientX, clientY } = e; const screenW = window.innerWidth; const screenH = window.innerHeight;
    const isPortrait = screenH > screenW; const zoneLimit = isPortrait ? 0.5 : 0.4;
    if (clientX < screenW * zoneLimit) {
      const hasMove = Array.from(activePointers.current.values()).some((p: any) => p.type === 'move');
      activePointers.current.set(pointerId, { type: hasMove ? 'aux' : 'move', startX: clientX, startY: clientY, currX: clientX, currY: clientY });
      if (!hasMove) { setJoystickVisual({ active: true, originX: clientX, originY: clientY, currentX: 0, currentY: 0 }); moveInput.current = { x: 0, y: 0 }; }
    } else {
      const hasLook = Array.from(activePointers.current.values()).some((p: any) => p.type === 'look');
      activePointers.current.set(pointerId, { type: hasLook ? 'aux' : 'look', startX: clientX, startY: clientY, currX: clientX, currY: clientY });
    }
    if (activePointers.current.size === 2) { prevPinchDist.current = null; }
  };

  const handlePointerMove = (e: any) => {
    if (!hasStarted) return;
    if (isDesktop) { if (document.pointerLockElement === document.body && !dialogueOpen && !barneyDialogueOpen) { lookInput.current.x += e.movementX; lookInput.current.y += e.movementY; } return; }
    e.preventDefault(); e.stopPropagation();
    const { pointerId, clientX, clientY } = e; const pointer = activePointers.current.get(pointerId);
    if (pointer) {
      pointer.currX = clientX; pointer.currY = clientY;
      const types = Array.from(activePointers.current.values()).map((p: any) => p.type);
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
            lookInput.current.x += deltaX * 0.006; lookInput.current.y += deltaY * 0.006;
            pointer.startX = clientX; pointer.startY = clientY;
          }
      }
      if (isPinch && !dialogueOpen && !barneyDialogueOpen) {
          const pts = Array.from(activePointers.current.values()); const p1: any = pts[0]; const p2: any = pts[1];
          const dist = Math.sqrt(Math.pow(p1.currX-p2.currX, 2) + Math.pow(p1.currY-p2.currY, 2));
          if (prevPinchDist.current !== null) { const delta = dist - prevPinchDist.current; setZoomLevel(prev => Math.min(Math.max(prev - delta * 0.02, 0), 10)); }
          prevPinchDist.current = dist;
      }
    }
  };

  const handlePointerUp = (e: any) => {
    if (!hasStarted || isDesktop) return; e.preventDefault();
    const pointer = activePointers.current.get(e.pointerId);
    if (pointer) { if (pointer.type === 'move') { moveInput.current = { x: 0, y: 0 }; setJoystickVisual(p => ({ ...p, active: false })); } activePointers.current.delete(e.pointerId); }
    if (activePointers.current.size < 2) { prevPinchDist.current = null; }
  };

  useEffect(() => {
    if (!isDesktop || !hasStarted) return;
    if (dialogueOpen || barneyDialogueOpen) { document.exitPointerLock(); return; }
    const keys = { w: false, a: false, s: false, d: false };
    const upd = () => { let x=0, y=0; if (keys.w) y-=1; if (keys.s) y+=1; if (keys.a) x-=1; if (keys.d) x+=1; moveInput.current.x=x; moveInput.current.y=y; };
    const kd = (e: any) => {
      if (dialogueOpen || barneyDialogueOpen) return;
      switch(e.key.toLowerCase()) {
        case 'w': keys.w=true; break;
        case 'a': keys.a=true; break;
        case 's': keys.s=true; break;
        case 'd': keys.d=true; break;
        case 'e':
          if (canInteractNPC && !dialogueOpen) handleStartDialogue();
          else if (canInteractDoor && !houseDoorOpen && !dialogueOpen && !barneyDialogueOpen) handleOpenDoor();
          else if (canSleepNow && gameState === 'indoor_day') handleSleep();
          break;
      }
      upd();
    };
    const ku = (e: any) => { switch(e.key.toLowerCase()) { case 'w': keys.w=false; break; case 'a': keys.a=false; break; case 's': keys.s=false; break; case 'd': keys.d=false; break; } upd(); };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [isDesktop, hasStarted, dialogueOpen, barneyDialogueOpen, canInteractNPC, canInteractDoor, houseDoorOpen, canSleepNow, gameState, handleStartDialogue, handleOpenDoor, handleSleep]);

  return (
    <div className="w-full h-full relative overflow-hidden select-none" style={{ touchAction: 'none', backgroundColor: '#000' }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onPointerLeave={handlePointerUp} onWheel={(e: any) => { if (!hasStarted || dialogueOpen || barneyDialogueOpen) return; setZoomLevel(prev => Math.min(Math.max(prev + e.deltaY * 0.01, 0), 10)); }}>
      <LiminalAudioEngine doorTrigger={doorSoundTrigger} audioContext={audioCtx} muted={muted} nightMode={nightMode} />
      <div className="absolute inset-0 z-30 bg-black pointer-events-none transition-opacity duration-1000 ease-in-out" style={{ opacity: overlayOpacity }} />
      {cameraShake && <div className="absolute inset-0 z-20 pointer-events-none traveling-vignette" />}
      <Canvas camera={{ fov: 75, near: 0.1, far: 100 }} dpr={[1, 1.5]}>
        <Suspense fallback={<Html center><div className="text-white font-mono">Loading...</div></Html>}>
            <World timer={elevatorTimer} doorsClosed={doorsClosed} level={currentLevel} houseDoorOpen={houseDoorOpen} npcPositionRef={npcPositionRef} isPaused={dialogueOpen || barneyDialogueOpen} playerPositionRef={sharedPlayerPositionRef} gameState={gameState} barneyRef={barneyRef} barneyTargetRef={barneyTargetRef} nightMode={nightMode} doorOpenAmount={doorOpenAmount} otherPlayers={otherPlayers} />
            <Player active={hasStarted} moveInput={moveInput} lookInput={lookInput} isDesktop={isDesktop} onEnterElevator={handlePlayerEnterElevator} doorsClosed={doorsClosed} currentLevel={currentLevel} onInteractionUpdate={handleInteractionUpdate} onNpcInteractionUpdate={handleNpcInteractionUpdate} houseDoorOpen={houseDoorOpen} zoomLevel={zoomLevel} npcPositionRef={npcPositionRef} dialogueOpen={dialogueOpen} sharedPositionRef={sharedPlayerPositionRef} cameraShakeRef={cameraShakeRef} positionCmdRef={playerPositionCmdRef} onElevatorZoneChange={handleElevatorZoneChange} />
        </Suspense>
      </Canvas>
      <Loader />
      {!hasStarted && <MainMenu onPlay={handleStartGame} />}
      
      {hasStarted && (
        <div className="absolute top-0 left-0 right-0 z-40 pointer-events-none pt-3 px-3 flex justify-center">
          <div className="relative">
            <div className={`absolute -inset-2 rounded-2xl blur-xl transition-opacity duration-500 ${(elevatorTimer !== null && elevatorTimer <= 5) ? 'bg-red-500/40 opacity-100' : arrivalPulse ? 'bg-green-400/50 opacity-100' : 'bg-amber-500/20 opacity-70'}`} />
            <div className="relative bg-gradient-to-b from-black/95 to-black/80 backdrop-blur-xl border border-amber-500/40 rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
              <div className="flex items-stretch divide-x divide-amber-500/20">
                <div className="px-4 py-2.5 flex flex-col items-center justify-center min-w-[85px] relative">
                  <span className="text-amber-500/60 text-[8px] font-mono uppercase tracking-[0.35em] mb-0.5">{currentLevel === 0 ? 'Location' : 'Floor'}</span>
                  {currentLevel === 0 ? (
                    <span className="text-amber-300 text-lg font-black tracking-widest leading-none" style={{ textShadow: '0 0 20px rgba(251,191,36,0.6)' }}>LOBBY</span>
                  ) : (
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-amber-500/50 text-sm font-bold">▲</span>
                      <span className="text-amber-300 text-3xl font-black font-mono leading-none" style={{ textShadow: '0 0 25px rgba(251,191,36,0.7)' }}>{String(currentLevel).padStart(2, '0')}</span>
                    </div>
                  )}
                </div>
                <div className="px-4 py-2.5 flex flex-col items-center justify-center min-w-[115px]">
                  {elevatorTimer !== null ? (
                    <>
                      <span className={`text-[8px] font-mono uppercase tracking-[0.35em] mb-0.5 ${(elevatorTimer <= 5 && !doorsClosed) ? 'text-red-400/80' : doorsClosed ? 'text-blue-400/80' : 'text-amber-400/60'}`}>
                        {doorsClosed ? 'Traveling' : (elevatorTimer <= 5 ? 'Closing!' : 'Departing')}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${(elevatorTimer <= 5 && !doorsClosed) ? 'bg-red-500 animate-ping' : doorsClosed ? 'bg-blue-400' : 'bg-amber-400'}`} />
                        <span className={`text-2xl font-black font-mono leading-none tabular-nums ${(elevatorTimer <= 5 && !doorsClosed) ? 'text-red-300' : 'text-white'}`} style={{ textShadow: '0 0 10px rgba(255,255,255,0.3)' }}>{String(elevatorTimer).padStart(2, '0')}</span>
                        <span className="text-white/40 text-xs font-mono -mb-0.5">s</span>
                      </div>
                    </>
                  ) : arrivalPulse ? (
                    <>
                      <span className="text-green-400/80 text-[8px] font-mono uppercase tracking-[0.35em] mb-0.5">Arrived</span>
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                        <span className="text-green-300 text-lg font-bold leading-none">Ding!</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-amber-400/60 text-[8px] font-mono uppercase tracking-[0.35em] mb-0.5">Status</span>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-400/70 animate-pulse" />
                        <span className="text-amber-100 text-base font-bold tracking-wide leading-none">Ready</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {elevatorTimer !== null && (
                <div className="h-1 bg-black/60 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-1000 ease-linear ${doorsClosed ? 'bg-gradient-to-r from-blue-500 to-cyan-400' : elevatorTimer <= 5 ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-gradient-to-r from-amber-500 to-yellow-400'}`}
                    style={{ width: `${doorsClosed ? ((20 - elevatorTimer) / 20) * 100 : ((5 - elevatorTimer) / 5) * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {floorReveal && (
        <div className="absolute inset-0 z-[45] flex items-center justify-center pointer-events-none">
          <div className="animate-floor-reveal text-center">
            <div className="text-amber-500/70 text-sm font-mono uppercase tracking-[0.6em] mb-4 animate-fade-in">Now Arriving</div>
            <div className="text-white text-8xl font-black tracking-wider" style={{ textShadow: '0 0 60px rgba(251,191,36,0.8), 0 0 30px rgba(255,255,255,0.4)' }}>FLOOR <span className="text-amber-400">{String(currentLevel).padStart(2, '0')}</span></div>
            <div className="h-[2px] w-48 mx-auto mt-6 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
          </div>
        </div>
      )}
      
      {hasStarted && (
        <div className="absolute top-4 right-4 z-50 flex gap-2 pointer-events-auto">
          <button onClick={() => setMuted(!muted)} className="relative group">
            <div className="absolute -inset-1 bg-amber-500/20 rounded-full blur opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative bg-black/70 backdrop-blur-sm border border-white/10 group-hover:border-amber-500/40 p-2.5 rounded-full transition-all group-active:scale-95">
              {muted ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#f87171" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="#fbbf24" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
              )}
            </div>
          </button>
        </div>
      )}
      {hasStarted && !isDesktop && !dialogueOpen && !barneyDialogueOpen && ( <VisualJoystick active={joystickVisual.active} x={joystickVisual.currentX} y={joystickVisual.currentY} origin={{ x: joystickVisual.originX, y: joystickVisual.originY }} /> )}
      {hasStarted && canInteractDoor && !houseDoorOpen && !dialogueOpen && !barneyDialogueOpen && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-50 pointer-events-auto">
          <button onClick={handleOpenDoor} className="group relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-amber-400 to-yellow-300 rounded-full blur-md opacity-70 group-hover:opacity-100 animate-pulse" />
            <div className="relative bg-white text-black px-8 py-3.5 rounded-full font-black tracking-wider shadow-2xl active:scale-95 transition-transform flex items-center gap-2 border-2 border-amber-200">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" /></svg>
              ABRIR PORTA
            </div>
          </button>
        </div>
      )}
      {hasStarted && canInteractNPC && !dialogueOpen && (
        <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 z-50 pointer-events-auto">
          <button onClick={handleStartDialogue} className="group relative">
            <div className="absolute -inset-1.5 bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400 rounded-full blur-md opacity-80 animate-pulse" />
            <div className="relative bg-gradient-to-b from-yellow-300 to-amber-400 text-black px-8 py-3.5 rounded-full font-black tracking-[0.25em] shadow-2xl active:scale-95 transition-transform flex items-center gap-2 border-2 border-yellow-200">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
              FALAR
            </div>
          </button>
        </div>
      )}
      {dialogueOpen && ( <DialogueOverlay nodeKey={dialogueNode} onOptionSelect={(next: string) => setDialogueNode(next)} onClose={() => setDialogueOpen(false)} /> )}
      
      <div className="absolute inset-0 z-[60] bg-black pointer-events-none transition-opacity duration-[2500ms]" style={{ opacity: sleepFadeOpacity }}>
        {sleepFadeOpacity > 0.5 && <div className="absolute inset-0 flex items-center justify-center"><div className="text-white/40 text-2xl font-thin tracking-[0.5em] animate-pulse">zzz...</div></div>}
      </div>
      
      {jumpscare && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center pointer-events-none animate-jumpscare bg-red-950">
          <img src={BARNEY_URL} className="w-full h-full object-contain mix-blend-color-burn" alt="" style={{ filter: 'hue-rotate(-20deg) saturate(1.5) contrast(1.2)' }} />
          <div className="absolute inset-0 bg-red-600/30 mix-blend-overlay" />
        </div>
      )}
      
      {hasStarted && canSleepNow && gameState === 'indoor_day' && !dialogueOpen && !barneyDialogueOpen && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-50 pointer-events-auto">
          <button onClick={handleSleep} className="group relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full blur-md opacity-70 animate-pulse" />
            <div className="relative bg-gradient-to-b from-slate-200 to-slate-300 text-slate-900 px-8 py-3.5 rounded-full font-black tracking-wider shadow-2xl active:scale-95 transition-transform flex items-center gap-2 border-2 border-blue-200">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z"/></svg>
              DORMIR
            </div>
          </button>
        </div>
      )}
      
      {hasStarted && gameState === 'indoor_night' && (
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-40 pointer-events-none">
          <div className="bg-red-950/80 border border-red-500/40 text-red-200 px-4 py-2 rounded-lg font-mono text-sm tracking-wider animate-pulse">Algo não está certo...</div>
        </div>
      )}
      {hasStarted && gameState === 'chase' && (
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-40 pointer-events-none">
          <div className="bg-red-900/90 border-2 border-red-500 text-white px-6 py-3 rounded-lg font-black tracking-widest text-lg animate-pulse shadow-[0_0_30px_rgba(239,68,68,0.5)]">
            ⚠ CORRA PARA O ELEVADOR ⚠
          </div>
        </div>
      )}
      {hasStarted && gameState === 'saved' && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center pointer-events-none bg-black/80">
          <div className="text-center">
            <div className="text-green-400 text-5xl font-black mb-3 animate-fade-in">VOCÊ SOBREVIVEU</div>
            <div className="text-white/60 text-lg font-mono">Por enquanto...</div>
          </div>
        </div>
      )}
      
      {barneyDialogueOpen && BARNEY_DIALOGUE[barneyDialogueNode] && (
        <div className="absolute inset-0 z-[55] flex items-end justify-center pointer-events-auto landscape:items-center landscape:py-4 overflow-y-auto" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)' }}>
          <div className="w-full max-w-2xl mx-4 mb-6 landscape:mb-0 relative animate-barney-dialogue flex-shrink-0">
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/40 via-pink-500/40 to-purple-500/40 rounded-2xl blur-lg barney-glow" />
            <div className="relative bg-[#0d0411]/98 border-2 border-purple-500/50 rounded-xl p-3 sm:p-5 shadow-2xl">
              <div className="flex items-start gap-3 sm:gap-4 flex-col landscape:flex-row sm:flex-row">
                {/* Mobile portrait text-only image or smaller image */}
                <div className="flex items-center gap-3 sm:hidden landscape:hidden w-full border-b border-white/5 pb-2">
                   <div className="w-12 h-12 flex-shrink-0 bg-transparent rounded-none overflow-hidden">
                     <img src={BARNEY_URL} className="w-full h-full object-contain object-top animate-barney-bounce" alt="" />
                   </div>
                   <div className="flex items-center gap-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                     <div className="text-purple-300 text-[11px] font-bold tracking-[0.3em] uppercase">Barney</div>
                   </div>
                </div>

                {/* Desktop and landscape image */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 bg-transparent rounded-none overflow-hidden self-center sm:self-start hidden sm:block landscape:block">
                  <img src={BARNEY_URL} className="w-full h-full object-contain object-top animate-barney-bounce" alt="" />
                </div>
                
                <div className="flex-1 min-w-0 w-full">
                  <div className="hidden sm:flex landscape:flex items-center gap-2 mb-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                    <div className="text-purple-300 text-[11px] font-bold tracking-[0.3em] uppercase">Barney</div>
                  </div>
                  <div className="text-white/95 text-sm sm:text-base leading-relaxed mb-4 font-serif min-h-[3rem] landscape:min-h-0">
                    <TypewriterText text={BARNEY_DIALOGUE[barneyDialogueNode].text} speed={28} />
                  </div>
                  <div className="flex flex-col gap-2 max-h-[40vh] landscape:max-h-[35vh] overflow-y-auto scrollbar-hide pr-1">
                    {BARNEY_DIALOGUE[barneyDialogueNode].options.map((opt: any, i: number) => (
                      <button key={i} onClick={() => handleBarneyResponse(opt.next)} className="group text-left bg-black/50 hover:bg-purple-900/70 border border-purple-500/30 hover:border-purple-400/70 text-white/70 hover:text-white px-3 py-2.5 rounded-lg text-sm sm:text-base transition-all active:scale-[0.98] flex items-center gap-2 flex-shrink-0">
                        <span className="text-purple-400/60 group-hover:text-purple-300 transition-colors">▸</span>
                        <span className="flex-1">{opt.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
