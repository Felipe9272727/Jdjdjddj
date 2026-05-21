import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, Component } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, Loader, AdaptiveDpr, PerformanceMonitor } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing';
import { KernelSize, BlendFunction } from 'postprocessing';
import { Vector3, ACESFilmicToneMapping, SRGBColorSpace, type Object3D } from 'three';

// ─── Error Boundary for Canvas ─────────────────────────────────────────────
class CanvasErrorBoundary extends Component<{children: React.ReactNode}, {hasError: boolean, error: string}> {
  state = { hasError: false, error: '' };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error: error.message }; }
  render() {
    if (this.state.hasError) {
      return <div className="absolute inset-0 flex items-center justify-center bg-black"><div className="text-center px-6 max-w-md"><div className="text-amber-400 text-lg font-bold mb-2">The elevator has stopped responding.</div><div className="text-white/60 text-sm font-mono mb-4 break-all">{this.state.error}</div><button onClick={() => window.location.reload()} aria-label="Reload page" className="bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black px-5 py-2.5 rounded-xl font-bold text-sm transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black">Restart</button></div></div>;
    }
    return this.props.children;
  }
}

import { LiminalAudioEngine } from './AudioEngine';
import { MainMenu } from './MainMenu';
import { VisualJoystick, DialogueOverlay } from './UI';
import { DiverCutscene } from './DiverCutscene';
import { ShopOverlay } from './ShopOverlay';
import { Player, FPArmModel } from './Player';
import { ShadowBlob } from './ShadowBlob';
import { useInventory, InventoryHUD } from './InventorySystem';
import { FlashlightLight, FlashlightModel3D } from './FlashlightLight';
import { BeardedDiver, DIVER_POS, DIVER_SCARE_DIST } from './BeardedDiver';
import { NightVisionFx, NightVisionLights } from './NightVisionOverlay';
import { Rebreather3DPutOn } from './Rebreather3DPutOn';
// Diver lines now live as a linear sequence inside DiverCutscene.tsx
import { ElevatorInterior } from './Elevator';
import { LobbyEnvironment, WatchingText } from './LobbyEnv';
import { FlatMapEnvironment, BarneyActor } from './HouseEnv';
import { Floor2Environment, SHARD_POSITIONS } from './Floor2Underwater';
import { BARNEY_URL, BARNEY_CATCH_DIST, DOOR_INTERACT_DIST, NPC_INTERACT_DIST, BED_INTERACT_DIST, ELEVATOR_ZONE_X, ELEVATOR_ZONE_Z } from './constants';
import { useMultiplayer, getPlayerName } from './Multiplayer';
import { RemotePlayer } from './RemotePlayer';
import { useSettings, SettingsMenu, FpsCounter, QUALITY_PROFILES, type QualityProfile } from './Settings';
import { BotSystem, BotHud, ViewportDebug, useBotStore } from './Bot';
import { RobloxChat, BubbleChatFallback } from './ChatSystem';
import { GameEffects, DustParticles, FluorescentFlicker, NightAmbient, EmptyLobbyAmbience } from './PostEffects';
import { CeilingFan, WallClock, playArrivalDing, createElevatorHum, playJumpscareStab, playEquipChime, createCaveAmbience } from './Atmosphere';
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
  profile: QualityProfile;
  collectedShards: Set<number>;
  onCollectShard: (i: number) => void;
  /** Diver state machine phase — drives the BeardedDiver rendering. */
  diverPhase: 'hidden' | 'spawn' | 'idle' | 'handover' | 'fading' | 'done';
  /** Current dialogue beat index (-1 = no dialogue). Used for per-beat
   *  body-language adjustments in BeardedDiver. */
  diverBeatRef: React.MutableRefObject<number>;
  /** True when night vision goggles are equipped and on. Mounts the
   *  ambient/hemisphere boost inside the canvas. */
  nightVisionActive: boolean;
}

const World = React.memo(({ timer, doorsClosed, level, houseDoorOpen, npcPositionRef, isPaused, playerPositionRef, gameState, barneyRef, barneyTargetRef, nightMode, doorOpenAmount, profile, collectedShards, onCollectShard, diverPhase, diverBeatRef, nightVisionActive }: WorldProps) => (
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
      {level === 2 && (
        <Suspense fallback={null}>
          <Floor2Environment
            playerPositionRef={playerPositionRef}
            collectedShards={collectedShards}
            onCollectShard={onCollectShard}
            reflective={profile.atmosphere}
          />
        </Suspense>
      )}
      {/* Bearded hotel-concierge diver — only spawns on Floor 2. State
          machine driven by App.tsx (hidden → spawn → idle → handover →
          fading → done). The 'done' phase is treated like 'hidden': the
          component still mounts but doesn't render. */}
      {level === 2 && diverPhase !== 'done' && (
        <BeardedDiver
          state={diverPhase}
          playerPositionRef={playerPositionRef}
          dialogueBeatRef={diverBeatRef}
        />
      )}
      <ElevatorInterior timer={timer} doorsClosed={doorsClosed} level={level} />
      {level === 1 && <BarneyActor gameState={gameState} barneyRef={barneyRef} barneyTargetRef={barneyTargetRef} playerPosRef={playerPositionRef} houseDoorOpen={houseDoorOpen} />}
      {profile.nightLights && <NightAmbient active={nightMode && level === 1} />}
      {/* Night-vision boost. Only mounts when active — adds bright green
          ambient + hemisphere fills so the player can actually see the cave. */}
      <NightVisionLights active={nightVisionActive} />
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
  // Current Barney→player distance, updated every 200ms during chase.
  const barneyDistRef = useRef<number>(12);
  // Stable ref pointing to the diver's world position (Floor 2). The
  // dialogue camera focus uses it during the diver conversation.
  // Camera focus target — Player.tsx adds +1.75 for camera y and +1.35 for
  // look-at y, so this ref needs to be at the diver's FEET (y=0). Pointing
  // it at chest height made the camera aim above the diver's head, which
  // is why he looked so small on screen.
  const diverPositionRef = useRef(new Vector3(DIVER_POS[0], DIVER_POS[1], DIVER_POS[2]));
  
  const npcPositionRef = useRef(new Vector3(5, 0, 5)); 
  const [canInteractNPC, setCanInteractNPC] = useState(false); 
  const [dialogueOpen, setDialogueOpen] = useState(false); 
  const [dialogueNode, setDialogueNode] = useState('start');
  const [canInteractCashier, setCanInteractCashier] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);

  // ─── Inventory + pickup animation ─────────────────────────────────────
  const { inventory, addItem: inventoryAddItem, toggleFlashlight, toggleNightVision, useCookie: consumeCookie, hasAnyItem } = useInventory();
  const [pickupTrigger, setPickupTrigger] = useState(0);
  const [pickupItem, setPickupItem] = useState<'flashlight' | 'cookie' | null>(null);

  // ─── Bearded diver state machine (Floor 2) ─────────────────────────────
  // Flow:
  //   hidden  → spawn  → idle    → handover → fading → done
  //
  // hidden:    diver invisible, parent watches player proximity.
  // spawn:     JUMPSCARE — camera shake, audio stab, diver pop. ~450ms.
  // idle:      diver breathing, faces player, dialogue overlay is open.
  // handover:  player chose EQUIP. Diver presents the mask, 3D put-on
  //            cinematic plays in parallel. Items get added when it's done.
  // fading:    diver fades out, despawns. After ~900ms → done.
  // done:      no further work; if the player ever revisits without
  //            having the gear, it stays done (inventory persists).
  type DiverPhase = 'hidden' | 'spawn' | 'idle' | 'handover' | 'fading' | 'done';
  const [diverPhase, setDiverPhase] = useState<DiverPhase>('hidden');
  const [diverDialogueOpen, setDiverDialogueOpen] = useState(false);
  const [rebreather3DActive, setRebreather3DActive] = useState(false);
  const lastSpawnTimeRef = useRef<number>(0);
  const diverBeatRef = useRef<number>(-1);

  // Reset everything when the player leaves Floor 2.
  useEffect(() => {
    if (currentLevel !== 2) {
      setDiverPhase('hidden');
      setDiverDialogueOpen(false);
      setRebreather3DActive(false);
    }
  }, [currentLevel]);

  // If the player already has the rebreather, skip the diver entirely.
  useEffect(() => {
    if (inventory.rebreather.owned && diverPhase !== 'done' && diverPhase !== 'fading') {
      setDiverPhase('done');
    }
  }, [inventory.rebreather.owned, diverPhase]);

  // ── Proximity check + JUMPSCARE trigger ──────────────────────────────
  // Runs at 100ms while on Floor 2 with the diver still hidden. When the
  // player crosses DIVER_SCARE_DIST, fire the scare.
  useEffect(() => {
    if (currentLevel !== 2 || diverPhase !== 'hidden' || inventory.rebreather.owned) return;
    if (doorsClosed) return;
    const id = setInterval(() => {
      const p = sharedPlayerPositionRef.current;
      const dx = p.x - DIVER_POS[0];
      const dz = p.z - DIVER_POS[2];
      const dist2 = dx * dx + dz * dz;
      if (dist2 < DIVER_SCARE_DIST * DIVER_SCARE_DIST) {
        // JUMPSCARE — kick the diver state machine + side effects.
        clearInterval(id);
        lastSpawnTimeRef.current = performance.now();
        setDiverPhase('spawn');
        setCameraShake(true);
        setDiverSpawnFlashKey(k => k + 1);
        playJumpscareStab(audioCtx);
        // ~500ms shake then settle
        scheduleTimeout(() => setCameraShake(false), 500);
        // Pop finishes (~450ms) → idle pose. Hold a beat so the player
        // registers the scare, THEN slide the cutscene letterbox in.
        scheduleTimeout(() => {
          diverBeatRef.current = -1;
          setDiverPhase('idle');
        }, 500);
        scheduleTimeout(() => setDiverDialogueOpen(true), 780);
      }
    }, 100);
    return () => clearInterval(id);
  }, [currentLevel, diverPhase, inventory.rebreather.owned, doorsClosed, audioCtx, scheduleTimeout]);

  // Cutscene → accept = player takes the gear, refuse = diver walks away.
  // Handover is already triggered at beat 3 via handleCutsceneBeat so the
  // mask extends while the diver says "Toma". On accept we just close the
  // dialogue and fire the pickup animation.
  const handleCutsceneAccept = useCallback(() => {
    setDiverDialogueOpen(false);
    // handover state was set by handleCutsceneBeat at beat 3 — don't reset it.
    setRebreather3DActive(true);
  }, []);
  const handleCutsceneRefuse = useCallback(() => {
    setDiverDialogueOpen(false);
    setDiverPhase('fading');
    // Match BeardedDiver's FADE_DURATION (3.5s walk-away).
    scheduleTimeout(() => setDiverPhase('done'), 3600);
  }, [scheduleTimeout]);
  // Sync 3D diver state with specific dialogue beats for choreography.
  // Beat 3 = "Toma — encaixa direitinho na cara." → diver extends the mask.
  const handleCutsceneBeat = useCallback((beatIdx: number) => {
    diverBeatRef.current = beatIdx;
    if (beatIdx === 3) setDiverPhase('handover');
  }, []);

  // Splash overlay — fires once when the player transitions across the
  // SWIM_THRESHOLD (entering OR leaving the water). Pure DOM/CSS, ~600ms.
  const [splashKey, setSplashKey] = useState(0);
  const wasUnderwaterRef = useRef(false);
  // Dive-into-well cinematic: black-screen fade → teleport underwater.
  const [diveBlackKey, setDiveBlackKey] = useState(0);
  // Diver spawn jumpscare — DOM cyan flash punch when he bursts from the floor.
  const [diverSpawnFlashKey, setDiverSpawnFlashKey] = useState(0);
  useEffect(() => {
    if (currentLevel !== 2) { wasUnderwaterRef.current = false; return; }
    const SWIM_Y = -2.7;  // mirrors SWIM_THRESHOLD_Y in Floor2/constants
    const id = setInterval(() => {
      const isUnder = sharedPlayerPositionRef.current.y < SWIM_Y;
      if (isUnder !== wasUnderwaterRef.current) {
        wasUnderwaterRef.current = isUnder;
        setSplashKey(k => k + 1);
      }
    }, 80);
    return () => clearInterval(id);
  }, [currentLevel]);

  // Cave ambience — slow rumble + drips. Mounted while the player is on
  // Floor 2 and audio is unmuted. Stopped cleanly on exit.
  const caveAmbienceStopRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (currentLevel === 2 && audioCtx && !muted) {
      if (!caveAmbienceStopRef.current) {
        caveAmbienceStopRef.current = createCaveAmbience(audioCtx);
      }
    } else {
      if (caveAmbienceStopRef.current) {
        caveAmbienceStopRef.current();
        caveAmbienceStopRef.current = null;
      }
    }
    return () => {
      if (caveAmbienceStopRef.current) {
        caveAmbienceStopRef.current();
        caveAmbienceStopRef.current = null;
      }
    };
  }, [currentLevel, audioCtx, muted]);

  // Called when the 3D put-on cinematic finishes.
  // Sequence: equip chime → diver turns away → black screen → player
  // teleports to just inside the water → splash → underwater.
  const handleRebreather3DDone = useCallback(() => {
    setRebreather3DActive(false);
    inventoryAddItem('rebreather');
    inventoryAddItem('nightVision');
    playEquipChime(audioCtx);
    // Diver just turns his back — no walking away.
    setDiverPhase('fading');
    scheduleTimeout(() => setDiverPhase('done'), 2200);
    // Trigger the dive black-screen. The CSS animation is:
    //   0-0.7s  fade to black, 0.7-1.1s hold, 1.1-2.2s fade back.
    // At 800ms (while fully black) teleport player into the well.
    setDiveBlackKey(k => k + 1);
    scheduleTimeout(() => {
      // Well centre: HOLE_CENTER_X=0, HOLE_CENTER_Z=5, drop to -3.5
      playerPositionCmdRef.current = { x: 0, y: -3.5, z: 5 };
      setSplashKey(k => k + 1);
    }, 800);
  }, [audioCtx, inventoryAddItem, scheduleTimeout]);

  // ─── Floor 2 shards ───────────────────────────────────────────────────
  // Local set of collected shard indices. Survives the player walking back
  // and forth across the level, resets only on full game reset (caught/
  // saved triggers a reset path elsewhere). 5 total shards.
  const [collectedShards, setCollectedShards] = useState<Set<number>>(new Set());
  const handleCollectShard = useCallback((i: number) => {
    setCollectedShards((s) => {
      if (s.has(i)) return s;          // already collected — avoid set churn
      const next = new Set(s);
      next.add(i);
      return next;
    });
  }, []);
  // Trigger the pickup animation, tagging which item is being held. The
  // Avatar reads pickupItem to pick a different bone pose (flashlight =
  // arm extends forward; cookie = elbow folds toward the mouth).
  const triggerPickup = useCallback((item: 'flashlight' | 'cookie') => {
    setPickupItem(item);
    setPickupTrigger((n) => n + 1);
  }, []);
  // Ref to an Object3D anchor inside the player's RightHand bone. The
  // 3rd-person flashlight reads its matrixWorld each frame → perfect
  // position + rotation, including pickup-arm rotation.
  const rightHandAnchorRef = useRef<Object3D | null>(null);
  const handleRightHandAnchor = useCallback((a: Object3D | null) => { rightHandAnchorRef.current = a; }, []);
  const handleBuyItem = useCallback((itemId: 'flashlight' | 'cookie') => {
    inventoryAddItem(itemId);
    triggerPickup(itemId);
  }, [inventoryAddItem, triggerPickup]);
  const handleToggleFlashlight = useCallback(() => {
    // Trigger pickup animation only when EQUIPPING (turning on), not stowing.
    if (inventory.flashlight.owned && !inventory.flashlight.active) triggerPickup('flashlight');
    toggleFlashlight();
  }, [inventory.flashlight.owned, inventory.flashlight.active, toggleFlashlight, triggerPickup]);
  const handleUseCookie = useCallback((): boolean => {
    if (inventory.cookie.count > 0) triggerPickup('cookie');
    return consumeCookie();
  }, [inventory.cookie.count, consumeCookie, triggerPickup]);

  // Initial scene when the shop opens. 'main' for normal use; 'post_death'
  // is set automatically when the player gets caught by Barney and is
  // dropped back at the lobby — the recepcionista pulls them aside.
  const [shopInitialScene, setShopInitialScene] = useState<string>('main');
  // Set to true when caught — drives the auto-open of the shop with
  // post_death once the player arrives back at the lobby.
  // Set to true when caught — drives the auto-open of the shop with
  // post_death once the player arrives back at the lobby.
  const [pendingPostDeathDialogue, setPendingPostDeathDialogue] = useState(false);
  // When the elevator travel sequence reaches its destination beat
  // (timer===18), this overrides the default lobby⇄Barney toggle. Used by
  // saved → level 2: we want the survivor to ride a real 20-second trip up
  // to floor 2 instead of being instantly teleported.
  const [nextElevatorDestination, setNextElevatorDestination] = useState<number | null>(null);
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
      if (currentLevel === 2 && gameState !== 'outdoor') {
          // Level 2 reuses the 'outdoor' game state (no special chase/sleep
          // logic for now — it's a flat placeholder floor).
          setGameState('outdoor');
          setNightMode(false);
          setHouseDoorOpen(false);
          setDoorOpenAmount(0);
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
          barneyDistRef.current = d;
          if (d < BARNEY_CATCH_DIST) {
              // CAUGHT — Barney got the player. Jumpscare, then drop them
              // back at a FIXED spot in the lobby (centro, fora do elevador)
              // so the recepcionista can open `post_death` immediately.
              // No 20s travel here — the jumpscare IS the transition.
              resolved.current = true;
              setJumpscare(true);
              setGameState('caught');
              scheduleTimeout(() => {
                  setJumpscare(false);
                  // Spawn point inside the lobby, facing the reception desk.
                  // x=0 centers the player; z=-5 puts them well outside the
                  // elevator zone (which sits at z<=-10), so the elevator
                  // trigger doesn't fire on respawn.
                  playerPositionCmdRef.current = { x: 0, y: 0, z: -5 };
                  barneyRef.current.set(0, 0, 6.5);
                  barneyTargetRef.current = { x: 0, z: 6.8, scale: 0 };
                  setNightMode(false);
                  setHouseDoorOpen(false);
                  setDoorOpenAmount(0);
                  setPendingPostDeathDialogue(true);
                  setCurrentLevel(0);
                  setFloorReveal(true);
              }, 2000);
          } else if (p.z <= ELEVATOR_ZONE_Z && Math.abs(p.x) <= ELEVATOR_ZONE_X) {
              // SAVED — player made it inside the elevator before Barney.
              // Don't teleport them straight to level 2; trigger a real
              // 20-second elevator trip up to floor 2 so they have time
              // to walk around the cabin, hear the elevator music, etc.
              resolved.current = true;
              setGameState('saved');
              setDoorsClosed(true);
              setDoorSoundTrigger(prev => prev + 1);
              playerPositionCmdRef.current = { x: 0, y: 0, z: -13 };
              // Reset chase props but KEEP doorsClosed=true so the existing
              // elevator-timer effect treats this as in-transit. timer=20
              // starts the travel phase; at timer===18 the world swaps to
              // currentLevel=nextElevatorDestination=2; at timer===0 the
              // doors open and the player steps out into level 2.
              setNextElevatorDestination(2);
              setElevatorTimer(20);
              setTravelPhase('closing');
              if (elevatorHumStopRef.current) elevatorHumStopRef.current();
              elevatorHumStopRef.current = createElevatorHum(audioCtx);
              scheduleTimeout(() => {
                  setNightMode(false);
                  setHouseDoorOpen(false);
                  setDoorOpenAmount(0);
                  barneyRef.current.set(0, 0, 6.5);
                  barneyTargetRef.current = { x: 0, z: 6.8, scale: 0 };
              }, 800);
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

  // Stabilize the enter-elevator handler. The previous version had
  // [elevatorTimer, doorsClosed] in its deps, so the callback identity
  // changed every second during a ride — which forced <Player/> to
  // re-render once per tick. Reading the latest values via a ref keeps
  // the function ref stable across renders.
  const elevatorStateRef = useRef({ elevatorTimer, doorsClosed });
  elevatorStateRef.current = { elevatorTimer, doorsClosed };
  const handlePlayerEnterElevator = useCallback(() => {
    const { elevatorTimer: t, doorsClosed: d } = elevatorStateRef.current;
    if (t === null && !d) setElevatorTimer(5);
  }, []);
  const handleInteractionUpdate = useCallback((c: boolean) => { setCanInteractDoor(p => p !== c ? c : p); }, []);
  const handleNpcInteractionUpdate = useCallback((c: boolean) => { setCanInteractNPC(p => p !== c ? c : p); }, []);
  const handleCashierInteractionUpdate = useCallback((c: boolean) => { setCanInteractCashier(p => p !== c ? c : p); }, []);
  const handleOpenShop = useCallback(() => { setShopInitialScene('main'); setShopOpen(true); setCanInteractCashier(false); }, []);
  const handleCloseShop = useCallback(() => { setShopOpen(false); setShopInitialScene('main'); }, []);

  // Post-death dialogue trigger: after the elevator brings the player back
  // to the lobby, wait for the doors to fully reopen, then auto-open the
  // shop with the recepcionista's enigmatic post-death scene.
  useEffect(() => {
    if (!pendingPostDeathDialogue) return;
    if (currentLevel !== 0) return;
    if (doorsClosed) return; // wait for the lobby doors to open
    const t = setTimeout(() => {
      setShopInitialScene('post_death');
      setShopOpen(true);
      setPendingPostDeathDialogue(false);
    }, 1200);
    return () => clearTimeout(t);
  }, [pendingPostDeathDialogue, currentLevel, doorsClosed]);
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

  // Floor 2 forces first-person view: the underwater void only reads right
  // in FP, and 3rd-person camera would clip through the rocks. Pin zoom to
  // 0 (which Player.tsx interprets as first-person) whenever the player is
  // on level 2; restore the previous zoom when they leave.
  const savedZoomRef = useRef<number | null>(null);
  useEffect(() => {
    if (currentLevel === 2) {
      if (savedZoomRef.current === null) savedZoomRef.current = zoomLevel;
      setZoomLevel(0);
    } else if (savedZoomRef.current !== null) {
      setZoomLevel(savedZoomRef.current);
      savedZoomRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLevel]);
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
  const { user, otherPlayerIds, otherPlayersDataRef, sendChat, chatMessages, connectionStatus } = useMultiplayer(sharedPlayerPositionRef, sharedRotationYRef, playerAnimState, multiplayerEnabled, currentLevel, playerName);

  const handleStartDialogue = () => { setDialogueNode('start'); setDialogueOpen(true); setCanInteractNPC(false); };
  // ─── CREATOR MODE ───
  // handleStartGame now accepts an optional 3rd arg `startLevel`.
  // When provided (via Creator Mode), the game starts directly on that floor,
  // skipping the normal lobby → elevator → floor progression.
  // If omitted, the game starts normally at level 0 (lobby).
  // ─── CREATOR MODE ───
  const handleStartGame = (mpEnabled: boolean, name?: string, startLevel?: number) => {
    if (audioCtx) return;
    setMultiplayerEnabled(mpEnabled);
    if (name) setPlayerName(name);
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    ctx.resume().catch(() => {});
    setAudioCtx(ctx);
    (window as any).__jubileuAudioCtx = ctx;
    setHasStarted(true);
    // ─── CREATOR MODE: jump to selected floor ───
    if (startLevel !== undefined && startLevel !== 0) {
      setCurrentLevel(startLevel);
      // Set appropriate game state for the chosen floor
      if (startLevel === 1) {
        setGameState('outdoor');
        setHouseDoorOpen(false);
        setDoorOpenAmount(0);
      } else if (startLevel === 2) {
        setGameState('outdoor');
        setNightMode(false);
        setHouseDoorOpen(false);
        setDoorOpenAmount(0);
        // Spawn the player just outside the elevator doors facing the cave.
        // The default ref position (0,0,8) puts them at the opposite end of
        // the cave with the elevator (and bearded diver) BEHIND them — easy
        // to miss. This teleport mirrors the natural-flow elevator exit.
        playerPositionCmdRef.current = { x: 0, y: 0, z: -13 };
        setDoorsClosed(false);
      }
    }
    // ─── CREATOR MODE: end jump ───
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
                    if (nextElevatorDestination !== null) {
                        // Override (e.g. saved → level 2). Consume it.
                        setCurrentLevel(nextElevatorDestination);
                        setNextElevatorDestination(null);
                    } else if (currentLevel === 0) {
                        setCurrentLevel(1);
                    } else {
                        // Default toggle: any non-lobby floor goes back to
                        // the lobby on a normal elevator press.
                        setCurrentLevel(0);
                    }
                    setFloorReveal(true);
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
  }, [elevatorTimer, doorsClosed, currentLevel, nextElevatorDestination]);

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
  }, [dialogueOpen, barneyDialogueOpen, diverDialogueOpen]);

  useEffect(() => {
    if (!dialogueOpen && !barneyDialogueOpen && !diverDialogueOpen) return;
    if (elevatorTimer !== null && elevatorTimer > 0 && !doorsClosed) {
      setElevatorTimer(null);
      setTravelPhase('idle');
    }
  }, [dialogueOpen, barneyDialogueOpen, diverDialogueOpen]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!hasStarted) return;
    if (isDesktop) { if (document.pointerLockElement !== document.body && !dialogueOpen && !barneyDialogueOpen && !shopOpen && !diverDialogueOpen) { const req = document.body.requestPointerLock() as unknown as Promise<void> | undefined; if (req && typeof (req as any).catch === 'function') (req as Promise<void>).catch(() => {}); } return; }
    if (dialogueOpen || barneyDialogueOpen || shopOpen || diverDialogueOpen) return;
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
      if (document.pointerLockElement === document.body && !dialogueOpen && !barneyDialogueOpen && !shopOpen && !diverDialogueOpen) {
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
          // Floor 2 locks the camera in 1st person — ignore pinch zoom there.
          if (prevPinchDist.current !== null && currentLevel !== 2) { const delta = dist - prevPinchDist.current; setZoomLevel(prev => Math.min(Math.max(prev - delta * 0.02, 0), 10)); }
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
    if (dialogueOpen || barneyDialogueOpen || shopOpen || diverDialogueOpen) { document.exitPointerLock(); return; }
    const upd = () => { const k = keysRef.current; let x=0, y=0; if (k.w) y-=1; if (k.s) y+=1; if (k.a) x-=1; if (k.d) x+=1; moveInput.current.x=x; moveInput.current.y=y; };
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (shopOpen) { handleCloseShop(); return; }
        setSettingsOpen((v) => !v);
        return;
      }
      if (dialogueOpen || barneyDialogueOpen || shopOpen || diverDialogueOpen) return;
      const k = keysRef.current;
      switch(e.key.toLowerCase()) {
        case 'w': k.w=true; break;
        case 'a': k.a=true; break;
        case 's': k.s=true; break;
        case 'd': k.d=true; break;
        case 'f': if (inventory.flashlight.owned) handleToggleFlashlight(); break;
        case 'n': if (inventory.nightVision.owned) toggleNightVision(); break;
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
  }, [isDesktop, hasStarted, dialogueOpen, barneyDialogueOpen, shopOpen, diverDialogueOpen, canInteractNPC, canInteractCashier, canInteractDoor, houseDoorOpen, canSleepNow, gameState]);

  // Memoize the sliced remote player id list to avoid re-creating on every render.
  const visibleRemotePlayerIds = useMemo(
    () => otherPlayerIds.slice(0, QUALITY_PROFILES[settings.quality].remoteLimit),
    [otherPlayerIds, settings.quality]
  );

  // Bot mode: spawns autonomous bot avatars in the lobby that move via
  // steering behaviors. The simulation lives inside <BotSystem> (mounted in
  // the Canvas tree, since useFrame requires Canvas context). The HUD reads
  // its state via the external store (useBotStore).
  const botEnabled = settings.botMode && hasStarted;
  const { info: botInfo } = useBotStore();

  return (
    <div className="w-full h-full relative overflow-hidden select-none" style={{ touchAction: 'none', backgroundColor: '#000' }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onPointerLeave={handlePointerUp} onWheel={(e: React.WheelEvent) => { if (!hasStarted || dialogueOpen || barneyDialogueOpen || shopOpen || currentLevel === 2) return; setZoomLevel(prev => Math.min(Math.max(prev + e.deltaY * 0.01, 0), 10)); }}>
      <LiminalAudioEngine doorTrigger={doorSoundTrigger} audioContext={audioCtx} muted={muted || shopOpen} masterVolume={settings.masterVolume} nightMode={nightMode} gameState={gameState} currentLevel={currentLevel} doorsClosed={doorsClosed} />
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
        {/* PerformanceMonitor watches the frame rate. When it sees sustained
            slowdowns it calls onDecline → we drop dpr a notch. AdaptiveDpr
            wires that up to the renderer automatically. Keeps the game
            playable on weaker phones without us having to detect anything. */}
        <PerformanceMonitor
          onDecline={() => { if (typeof window !== 'undefined') (window as any).__lowPerf = true; }}
          onIncline={() => { if (typeof window !== 'undefined') (window as any).__lowPerf = false; }}
          flipflops={3}
        />
        <AdaptiveDpr pixelated />
        <Suspense fallback={<Html center><div className="px-5 py-3 rounded-xl bg-black/90 ring-1 ring-amber-500/30 backdrop-blur-xl text-center"><div className="text-amber-400 text-xs font-medium tracking-[0.3em] uppercase mb-1.5">The Normal Elevator</div><div className="flex items-center justify-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /><div className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-pulse" style={{animationDelay:'0.2s'}} /><div className="w-1.5 h-1.5 rounded-full bg-amber-400/30 animate-pulse" style={{animationDelay:'0.4s'}} /></div></div></Html>}>
            <World timer={elevatorTimer} doorsClosed={doorsClosed} level={currentLevel} houseDoorOpen={houseDoorOpen} npcPositionRef={npcPositionRef} isPaused={dialogueOpen || barneyDialogueOpen || shopOpen || diverDialogueOpen} playerPositionRef={sharedPlayerPositionRef} gameState={gameState} barneyRef={barneyRef} barneyTargetRef={barneyTargetRef} nightMode={nightMode} doorOpenAmount={doorOpenAmount} profile={QUALITY_PROFILES[settings.quality]} collectedShards={collectedShards} onCollectShard={handleCollectShard} diverPhase={diverPhase} diverBeatRef={diverBeatRef} nightVisionActive={inventory.nightVision.owned && inventory.nightVision.active} />
            {/* RemotePlayers receive only id + the multiplayer data ref. Position
                updates flow through the ref + useFrame, so the React tree no
                longer re-renders every 200ms. The id list only changes when a
                player joins or leaves. */}
            {visibleRemotePlayerIds.map(id => (
                <RemotePlayer key={id} id={id} dataRef={otherPlayersDataRef} chatBubbles3D={QUALITY_PROFILES[settings.quality].chatBubbles3D} />
            ))}
            <Player active={hasStarted} moveInput={moveInput} lookInput={lookInput} isDesktop={isDesktop} onEnterElevator={handlePlayerEnterElevator} doorsClosed={doorsClosed} currentLevel={currentLevel} onInteractionUpdate={handleInteractionUpdate} onNpcInteractionUpdate={handleNpcInteractionUpdate} onCashierInteractionUpdate={handleCashierInteractionUpdate} houseDoorOpen={houseDoorOpen} zoomLevel={zoomLevel} npcPositionRef={npcPositionRef} dialogueTargetRef={(diverDialogueOpen || diverPhase === 'fading') ? diverPositionRef : (barneyDialogueOpen ? barneyRef : npcPositionRef)} dialogueOpen={dialogueOpen || barneyDialogueOpen || shopOpen || diverDialogueOpen || rebreather3DActive || diverPhase === 'fading' || diveBlackKey > 0} sharedPositionRef={sharedPlayerPositionRef} sharedRotationYRef={sharedRotationYRef} cameraThetaRef={cameraThetaRef} cameraShakeRef={cameraShakeRef} diverBeatRef={diverBeatRef} positionCmdRef={playerPositionCmdRef} onElevatorZoneChange={handleElevatorZoneChange} pickupTrigger={pickupTrigger} pickupItem={pickupItem} armExtended={inventory.flashlight.owned && inventory.flashlight.active} onRightHandAnchor={handleRightHandAnchor} />
            {hasStarted && inventory.flashlight.owned && (
                <>
                  <FlashlightLight
                    playerPositionRef={sharedPlayerPositionRef}
                    cameraThetaRef={cameraThetaRef}
                    active={inventory.flashlight.active}
                    owned={inventory.flashlight.owned}
                  />
                  <FlashlightModel3D
                    playerPositionRef={sharedPlayerPositionRef}
                    cameraThetaRef={cameraThetaRef}
                    playerRotationYRef={sharedRotationYRef}
                    rightHandAnchorRef={rightHandAnchorRef}
                    active={inventory.flashlight.active}
                    owned={inventory.flashlight.owned}
                    zoomLevel={zoomLevel}
                  />
                </>
            )}
            {hasStarted && zoomLevel >= 0.5 && (
                <ShadowBlob positionRef={sharedPlayerPositionRef} radius={0.55} opacity={0.5} />
            )}
            {hasStarted && (
                <FPArmModel
                  zoomLevel={zoomLevel}
                  armExtended={inventory.flashlight.owned && inventory.flashlight.active}
                  pickupTrigger={pickupTrigger}
                  pickupItem={pickupItem}
                  active={hasStarted}
                  flashlightActive={inventory.flashlight.active}
                  flashlightOwned={inventory.flashlight.owned}
                />
            )}
            {/* Rebreather 3D put-on cinematic — viewmodel-style, attaches
                to the camera each frame. Fires once when the player
                accepts the diver's offer. */}
            {hasStarted && (
                <Rebreather3DPutOn
                  active={rebreather3DActive}
                  onDone={handleRebreather3DDone}
                />
            )}
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
        {/* Post-processing — expanded for underwater immersion.
            High quality: Bloom + ChromaticAberration + Vignette when submerged.
            The ChromaticAberration simulates light dispersion through water,
            and the Vignette deepens the claustrophobic underwater feel.
            Medium/low: no postprocessing pass at all. */}
        {hasStarted && settings.quality === 'high' && (
            <EffectComposer multisampling={0} enableNormalPass={false}>
                {/* Bloom — Floor 2 needs harder bloom for the bioluminescent
                    crystals + emissive caustics to truly pop. Lower threshold
                    + higher intensity in the cave; subtle elsewhere. */}
                <Bloom
                    intensity={currentLevel === 2 ? 0.85 : 0.35}
                    luminanceThreshold={currentLevel === 2 ? 0.55 : 0.95}
                    luminanceSmoothing={currentLevel === 2 ? 0.35 : 0.2}
                    mipmapBlur
                    kernelSize={currentLevel === 2 ? KernelSize.LARGE : KernelSize.MEDIUM}
                />
                {/* Chromatic aberration — heavier underwater (light dispersion
                    through liquid). 4x bigger offset on Floor 2 sells the
                    "looking through water + a glass mask" feel. */}
                <ChromaticAberration
                    blendFunction={BlendFunction.NORMAL}
                    offset={currentLevel === 2 ? [0.0035, 0.0035] as unknown as Vector3 : [0, 0] as unknown as Vector3}
                    radialModulation={false}
                    modulationOffset={0.0}
                />
                {/* Vignette — deeper darkness around the edges in the cave for
                    a claustrophobic / isolation feel. */}
                <Vignette
                    eskil={false}
                    offset={currentLevel === 2 ? 0.32 : 0.2}
                    darkness={currentLevel === 2 ? 0.78 : 0.3}
                />
            </EffectComposer>
        )}
      </Canvas>
      </CanvasErrorBoundary>
      {hasStarted && QUALITY_PROFILES[settings.quality].overlay && (
          <GameEffects nightMode={nightMode} gameState={gameState} currentLevel={currentLevel} quality={settings.quality} dangerRef={barneyDistRef} />
      )}
      {/* Empty lobby atmospheric touches — thuds, flickers, wall text */}
      {hasStarted && currentLevel === 0 && gameState === 'lobby' && (
          <EmptyLobbyAmbience playerCount={otherPlayerIds.length} />
      )}
      {/* Easter egg: "Someone is watching" — random creepy text in corner */}
      {hasStarted && currentLevel === 0 && gameState === 'lobby' && (
          <WatchingText />
      )}
      <Loader />
      {!hasStarted && <MainMenu onPlay={handleStartGame} />}
      {hasStarted && (
        <InventoryHUD
          inventory={inventory}
          onToggleFlashlight={handleToggleFlashlight}
          onToggleNightVision={toggleNightVision}
          onUseCookie={handleUseCookie}
          hasAnyItem={hasAnyItem}
        />
      )}

      {/* Night-vision DOM overlay — green tint + scanlines + binocular vignette.
          Sits above the canvas (z-18..23) and below the menus. Disappears
          when the player toggles NV off. */}
      {hasStarted && (
        <NightVisionFx active={inventory.nightVision.owned && inventory.nightVision.active} />
      )}

      {/* Splash overlay — pure CSS, fires on swim-threshold crossings.
          Brief radial flash + a few short streaks for the impact moment. */}
      {hasStarted && currentLevel === 2 && splashKey > 0 && (
        <div
          key={splashKey}
          className="fixed inset-0 z-[28] pointer-events-none animate-splash-flash"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(120,220,255,0.55) 0%, rgba(80,180,230,0.25) 30%, rgba(20,60,90,0.10) 60%, rgba(0,0,0,0) 80%)',
          }}
        >
          <style>{`
            @keyframes splashFlash {
              0%   { opacity: 0; transform: scale(0.85); }
              15%  { opacity: 1; transform: scale(1.0); }
              50%  { opacity: 0.55; }
              100% { opacity: 0; transform: scale(1.15); }
            }
            .animate-splash-flash { animation: splashFlash 700ms ease-out forwards; }
          `}</style>
        </div>
      )}

      
      {/* Diver spawn jumpscare flash — two-layer radial punch:
          1. Fast white-cyan blow-out (impact punch)
          2. Slower concentric ring that expands outward (shockwave ripple)
          Both layer together for a cinematic "presence arrives" feel. */}
      {diverSpawnFlashKey > 0 && (
        <div
          key={diverSpawnFlashKey}
          className="fixed inset-0 z-[77] pointer-events-none"
        >
          {/* Impact punch — radial burst from centre */}
          <div
            className="dvspawn-flash w-full h-full"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(200,255,252,0.98) 0%, rgba(100,230,255,0.65) 30%, rgba(34,140,180,0.25) 58%, rgba(0,0,0,0) 80%)',
            }}
          />
          {/* Shockwave ring — expands outward after the initial punch */}
          <div className="dvspawn-ring w-full h-full" />
          {/* Edge vignette squeeze — dark periphery slams inward then releases */}
          <div className="dvspawn-vignette w-full h-full" />
          <style>{`
            @keyframes dvSpawnFlash {
              0%   { opacity: 0; transform: scale(1.18); }
              7%   { opacity: 1;  transform: scale(1.0); }
              22%  { opacity: 0.55; }
              100% { opacity: 0; transform: scale(1.06); }
            }
            .dvspawn-flash { animation: dvSpawnFlash 500ms cubic-bezier(0.15,0.85,0.25,1) forwards; }

            @keyframes dvSpawnRing {
              0%   { opacity: 0;    transform: scale(0.3); }
              15%  { opacity: 0.6;  transform: scale(0.7); }
              60%  { opacity: 0.15; transform: scale(1.4); }
              100% { opacity: 0;    transform: scale(1.9); }
            }
            .dvspawn-ring {
              position: absolute; inset: 0;
              border-radius: 50%;
              border: 3px solid rgba(34, 211, 238, 0.8);
              box-shadow: 0 0 40px rgba(34, 211, 238, 0.5), inset 0 0 40px rgba(34, 211, 238, 0.2);
              animation: dvSpawnRing 700ms cubic-bezier(0.1,0.7,0.3,1) 40ms forwards;
              transform-origin: center center;
            }

            @keyframes dvSpawnVignette {
              0%   { opacity: 0; }
              10%  { opacity: 1; box-shadow: inset 0 0 120px 60px rgba(0,0,0,0.9); }
              35%  { opacity: 0.6; box-shadow: inset 0 0 80px 30px rgba(0,0,0,0.5); }
              100% { opacity: 0; box-shadow: inset 0 0 0px 0px rgba(0,0,0,0); }
            }
            .dvspawn-vignette {
              position: absolute; inset: 0;
              animation: dvSpawnVignette 600ms ease-out forwards;
            }
          `}</style>
        </div>
      )}

      {/* Dive-into-well — cinematic descent (2200ms total). Player is
          teleported underwater at 800ms while the screen is fully black.
          Layers: rushing speed streaks → iris tunnel closes → black hold
          → blue water-flood on impact → reveal of the underwater scene. */}
      {diveBlackKey > 0 && (
        <div
          key={diveBlackKey}
          className="fixed inset-0 z-[95] pointer-events-none overflow-hidden"
        >
          {/* Rushing downward speed streaks — the fall */}
          <div className="dive-streaks" />
          {/* Iris tunnel — the well mouth shrinking above as you drop */}
          <div className="dive-iris" />
          {/* Black core hold */}
          <div className="dive-core" />
          {/* Water-flood — blue wash as you break the surface */}
          <div className="dive-water" />
          <style>{`
            .dive-streaks, .dive-iris, .dive-core, .dive-water {
              position: absolute; inset: -20%;
              pointer-events: none; will-change: opacity, transform;
            }
            .dive-streaks {
              background: repeating-linear-gradient(
                to bottom,
                transparent 0px, transparent 38px,
                rgba(160,215,245,0.18) 40px, transparent 45px);
              animation: diveStreaks 2200ms cubic-bezier(0.4,0,0.7,1) forwards;
            }
            @keyframes diveStreaks {
              0%   { opacity: 0; transform: translateY(-25%) scaleY(2.2); }
              14%  { opacity: 0.85; }
              42%  { opacity: 0.45; transform: translateY(55%) scaleY(2.8); }
              58%  { opacity: 0; }
              100% { opacity: 0; }
            }
            .dive-iris {
              background: radial-gradient(circle at 50% 42%,
                transparent 0%, transparent 36%, #000 72%);
              animation: diveIris 2200ms cubic-bezier(0.55,0,0.85,0.5) forwards;
            }
            @keyframes diveIris {
              0%   { transform: scale(3.4); opacity: 0; }
              10%  { opacity: 1; }
              44%  { transform: scale(0.16); opacity: 1; }
              56%  { transform: scale(0.04); opacity: 1; }
              100% { transform: scale(0.04); opacity: 0; }
            }
            .dive-core {
              background: #000;
              animation: diveCore 2200ms ease-in-out forwards;
            }
            @keyframes diveCore {
              0%   { opacity: 0; }
              30%  { opacity: 1; }
              60%  { opacity: 1; }
              100% { opacity: 0; }
            }
            .dive-water {
              background: radial-gradient(ellipse at 50% 38%,
                rgba(50,140,190,0) 0%, rgba(22,86,138,0.88) 66%,
                rgba(8,42,72,0.96) 100%);
              animation: diveWater 2200ms ease-out forwards;
            }
            @keyframes diveWater {
              0%   { opacity: 0; transform: scale(1.3); }
              54%  { opacity: 0; transform: scale(1.3); }
              66%  { opacity: 1; transform: scale(1.0); }
              100% { opacity: 0; transform: scale(0.95); }
            }
          `}</style>
        </div>
      )}

      {/* First-person crosshair — tiny center dot. Only when in FP view
          AND no dialogue/shop blocking it. Pure CSS, no canvas draw. */}
      {hasStarted && zoomLevel < 0.5 && !dialogueOpen && !barneyDialogueOpen && !shopOpen && (
        <div className="fixed left-1/2 top-1/2 z-[60] pointer-events-none"
             style={{ transform: 'translate(-50%, -50%)' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-white/55 ring-1 ring-black/40"
               style={{ boxShadow: '0 0 4px rgba(0,0,0,0.7)' }} />
        </div>
      )}

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
          connectionStatus={connectionStatus}
          onSettingsOpen={() => setSettingsOpen(true)}
          muted={muted || shopOpen}
          onToggleMute={() => setMuted(!muted)}
        />
      )}
      {settings.showFps && hasStarted && !diverDialogueOpen && <FpsCounter />}

      {/* Floor 2 "cold" overlay — radial cyan tint at the edges, blue
          color cast in the middle. Sells underwater + cold without
          touching the renderer. Pure DOM, pointer-none. */}
      {hasStarted && currentLevel === 2 && (
        <div
          className="fixed inset-0 z-[8] pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(0,40,80,0.0) 35%, rgba(0,30,60,0.35) 70%, rgba(0,20,40,0.65) 100%)',
            mixBlendMode: 'multiply',
          }}
        />
      )}

      {/* Floor 2 shard counter — top-center HUD chip. Cyan to match the
          shards. Pops in/out only on level 2. Includes a small "All shards
          collected" celebratory state once you grab the 5th. */}
      {hasStarted && currentLevel === 2 && !diverDialogueOpen && (
        <div className="fixed top-[calc(env(safe-area-inset-top,0px)+88px)] left-1/2 -translate-x-1/2 z-[55]
                        bg-black/60 backdrop-blur-md border border-cyan-400/40 rounded-md
                        px-3 py-1.5 font-mono text-cyan-200 text-sm
                        shadow-[0_0_20px_rgba(90,216,255,0.25)] pointer-events-none select-none
                        flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" className="text-cyan-300">
            <polygon points="12,3 22,12 12,21 2,12" fill="currentColor" opacity="0.9" />
          </svg>
          <span className="tabular-nums">
            {collectedShards.size === 5 ? (
              <span className="text-cyan-100 font-bold">5 / 5 — TODOS COLETADOS</span>
            ) : (
              <>shards <span className="text-cyan-100 font-bold">{collectedShards.size} / 5</span></>
            )}
          </span>
        </div>
      )}
      {botEnabled && <BotHud info={botInfo} />}
      {botEnabled && <ViewportDebug />}

      {/* ─── Roblox-style Chat System ──────────────────────────────────────── */}
      {hasStarted && multiplayerEnabled && !diverDialogueOpen && (
          <>
              <RobloxChat
                  messages={chatMessages}
                  currentUserId={user?.uid || ''}
                  onSend={sendChat}
                  enabled={multiplayerEnabled && !dialogueOpen && !barneyDialogueOpen && !shopOpen && !settingsOpen && !diverDialogueOpen}
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

      {/* Bearded diver dialogue — purpose-built overlay, see DiverDialogue.tsx */}
      {diverDialogueOpen && (
        <DiverCutscene
          onAccept={handleCutsceneAccept}
          onRefuse={handleCutsceneRefuse}
          onBeat={handleCutsceneBeat}
        />
      )}
      
      <div className="absolute inset-0 z-[60] bg-black pointer-events-none transition-opacity duration-[2500ms]" style={{ opacity: sleepFadeOpacity }}>
        {sleepFadeOpacity > 0.5 && <div className="absolute inset-0 flex items-center justify-center"><div className="text-white/40 text-2xl font-thin tracking-[0.5em] animate-pulse">zzz...</div></div>}
      </div>
      
      {jumpscare && (
        <>
          {/* White pop flash — fires immediately on mount, fades in 280ms */}
          <div className="absolute inset-0 z-[76] pointer-events-none animate-jumpscare-flash bg-white" />
          <div className="absolute inset-0 z-[75] flex items-center justify-center pointer-events-none animate-jumpscare bg-red-950">
            <img src={BARNEY_URL} className="w-full h-full object-contain mix-blend-color-burn" alt="" style={{ filter: 'hue-rotate(-20deg) saturate(1.8) contrast(1.3)' }} />
            <div className="absolute inset-0 bg-red-600/40 mix-blend-overlay" />
          </div>
        </>
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
      {hasStarted && gameState === 'chase' && <ChaseBanner elevatorActive={elevatorTimer !== null} barneyDistRef={barneyDistRef} />}
      {hasStarted && gameState === 'saved' && <SavedOverlay />}
      
      {barneyDialogueOpen && <BarneyDialogue dialogueNode={barneyDialogueNode} onResponse={handleBarneyResponse} />}
      <ShopOverlay open={shopOpen} onClose={handleCloseShop} initialScene={shopInitialScene} onBuyItem={handleBuyItem} />
    </div>
  );
}
