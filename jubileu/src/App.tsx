import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, Component } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Loader, AdaptiveDpr, PerformanceMonitor } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Vignette, N8AO, HueSaturation, Sepia, BrightnessContrast } from '@react-three/postprocessing';
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
import CartoonIntro from './CartoonIntro';
import CartoonIntro3D from './CartoonIntro3D';
import Floor3FallCutscene from './Floor3FallCutscene';
import Floor3Cutscene from './Floor3Cutscene';
import Floor3CutsceneUI from './Floor3CutsceneUI';
import { preloadCartoonAudio, startCartoonMusic, stopCartoonMusic } from './cartoonAudio';
import { getMusicBus, setMusicActive } from './musicDirector';
import { configureFloor3Sfx, clearFloor3Sfx } from './floor3Sfx';
import { configureFloor4Sfx, clearFloor4Sfx } from './floor4Sfx';
import { resetHazards, setOnWin, setOnProgress, f3Progress, f3DevilPos, f3Demo } from './f3Hazards';
import { ShopOverlay } from './ShopOverlay';
import { Player, FPArmModel } from './Player';
import { ShadowBlob } from './ShadowBlob';
import { useInventory, InventoryHUD } from './InventorySystem';
import { FlashlightLight, FlashlightModel3D } from './FlashlightLight';
import { BeardedDiver, DIVER_POS, DIVER_SCARE_DIST } from './BeardedDiver';
import { NightVisionFx, NightVisionLights, ShardScanner } from './NightVisionOverlay';
import { Rebreather3DPutOn } from './Rebreather3DPutOn';
// Diver lines now live as a linear sequence inside DiverCutscene.tsx
import { ElevatorInterior } from './Elevator';
import { LobbyEnvironment, WatchingText } from './LobbyEnv';
import { FlatMapEnvironment, BarneyActor } from './HouseEnv';
import { Floor2Environment, SHARD_POSITIONS } from './Floor2Underwater';
import { Floor3Environment } from './Floor3';
import { Floor4Environment } from './Floor4';
import { BARNEY_URL, BARNEY_CATCH_DIST, DOOR_INTERACT_DIST, NPC_INTERACT_DIST, BED_INTERACT_DIST, ELEVATOR_ZONE_X, ELEVATOR_ZONE_Z } from './constants';
import { useMultiplayer, getPlayerName } from './Multiplayer';
import { RemotePlayer } from './RemotePlayer';
import { useSettings, SettingsMenu, FpsCounter, QUALITY_PROFILES, type QualityProfile } from './Settings';
import { BotSystem, BotHud, ViewportDebug, useBotStore } from './Bot';
import { RobloxChat, BubbleChatFallback } from './ChatSystem';
import { GameEffects, DustParticles, FluorescentFlicker, NightAmbient, EmptyLobbyAmbience } from './PostEffects';
import { CeilingFan, WallClock, playArrivalDing, createElevatorHum, playJumpscareStab, playEquipChime, createCaveAmbience, createMonsterAmbience, createUnderwaterAmbience, playSharkRoar, playDetectionSting, playBubble, createFloor2Music, createChaseMusic, playJumpscareMusic } from './Atmosphere';
import { ElevatorHud, FloorReveal, TopControls, ActionButton, NightBanner, ChaseBanner, SavedOverlay, BarneyDialogue, playHeartbeat } from './HudComponents';
import { SceneInspector } from './SceneInspector';
import { perfGovernor } from './ai/perfGovernor';

// Game-wide adaptive performance probe — samples frame time every frame and
// feeds the shared governor that simulation systems read to scale their cost.
const AdaptivePerfProbe: React.FC = () => {
  useFrame((_, dt) => perfGovernor.tick(dt));
  return null;
};


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
  onPlayerCaught: () => void;
  monsterPositionRef: React.MutableRefObject<Vector3>;
  monsterProximityRef: React.MutableRefObject<number>;
  berserk: boolean;
  cameraShakeRef: React.MutableRefObject<boolean>;
  /** Floor-3 first-person gloves — hidden during the cartoon intro so the
   *  player's own hands only "appear" once the intro hands are gone. */
  floor3Hands: boolean;
  /** Floor-3 first-person gloves — additionally hidden during the defeat fall
   *  cutscene (camera leaves first-person to frame the toppling devil). */
  floor3Gloves: boolean;
}

const World = React.memo(({ timer, doorsClosed, level, houseDoorOpen, npcPositionRef, isPaused, playerPositionRef, gameState, barneyRef, barneyTargetRef, nightMode, doorOpenAmount, profile, collectedShards, onCollectShard, diverPhase, diverBeatRef, nightVisionActive, onPlayerCaught, monsterPositionRef, monsterProximityRef, berserk, cameraShakeRef, floor3Hands, floor3Gloves }: WorldProps) => (
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
      {level === 3 && <Floor3Environment hands={floor3Hands} gloves={floor3Gloves} />}
      {level === 4 && <Floor4Environment />}
      {level === 2 && (
        <Suspense fallback={null}>
          <Floor2Environment
            playerPositionRef={playerPositionRef}
            collectedShards={collectedShards}
            onCollectShard={onCollectShard}
            onPlayerCaught={onPlayerCaught}
            reflective={profile.atmosphere}
            monsterPositionRef={monsterPositionRef}
            monsterProximityRef={monsterProximityRef}
            berserk={berserk}
            cameraShakeRef={cameraShakeRef}
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
  // Master audio bus (the AudioEngine's muteable/volume-controlled input).
  // The Floor-3 cartoon ragtime + SFX route through this so they sit inside the
  // mix (obeying mute + the volume slider) instead of straight to the speakers.
  const cartoonBusRef = useRef<AudioNode | null>(null);
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
  // Swim sprint (held button) + stamina (written by Player each frame).
  const sprintHeldRef = useRef(false);
  const staminaRef = useRef(1);
  const jumpRef = useRef(false);
  const [inWater, setInWater] = useState(false);
  const [staminaPct, setStaminaPct] = useState(1);
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
  const [fishJumpscareKey, setFishJumpscareKey] = useState(0);
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
  const inventoryRef = useRef(inventory);
  useEffect(() => { inventoryRef.current = inventory; }, [inventory]);
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
  const [diveBlackActive, setDiveBlackActive] = useState(false);
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

  // Underwater ambience — muffled pressure bed that fades in with dive depth.
  // Created while on Floor 2; submersion is driven from the proximity poll.
  const underwaterAmbienceRef = useRef<ReturnType<typeof createUnderwaterAmbience> | null>(null);
  useEffect(() => {
    if (currentLevel === 2 && audioCtx && !muted) {
      if (!underwaterAmbienceRef.current) {
        underwaterAmbienceRef.current = createUnderwaterAmbience(audioCtx);
      }
    } else if (underwaterAmbienceRef.current) {
      underwaterAmbienceRef.current.stop();
      underwaterAmbienceRef.current = null;
    }
    return () => {
      if (underwaterAmbienceRef.current) {
        underwaterAmbienceRef.current.stop();
        underwaterAmbienceRef.current = null;
      }
    };
  }, [currentLevel, audioCtx, muted]);

  // ── Monster presence system ────────────────────────────────────────────
  // monsterPositionRef  — written by MonsterFish every frame (world XYZ)
  // monsterProximityRef — written by MonsterFish every frame (0=far, 1=on top)
  // monsterAmbienceRef  — the live audio handle returned by createMonsterAmbience
  // monsterDarkness     — React state (0..0.45) drives the DOM proximity overlay
  const monsterPositionRef  = useRef(new Vector3(-22, -20, -22));
  const monsterProximityRef = useRef(0);
  const monsterAmbienceRef  = useRef<ReturnType<typeof createMonsterAmbience> | null>(null);
  const [monsterDarkness, setMonsterDarkness] = useState(0);
  const [berserk, setBerserk] = useState(false);
  const [devoured, setDevoured] = useState(false); // brief death-ritual overlay
  const [teleportCutscene, setTeleportCutscene] = useState(false); // all-shards win → Floor 3
  const [cartoonIntro, setCartoonIntro] = useState(false);         // Floor 3 "turns cartoon" intro
  const [cartoonStage, setCartoonStage] = useState(0);             // choreography stage (driven by the 3D intro)
  const [cartoonCutscene, setCartoonCutscene] = useState(false);   // meet-the-Diabrete dialogue (after the intro)
  const [cutsceneLine, setCutsceneLine] = useState(0);             // active Diabrete script line
  const cutsceneTargetRef = useRef(new Vector3(0.9, 0, -9.2));     // camera look-at (devil's feet) during the cutscene
  const [brushCount, setBrushCount] = useState(0);                 // paintbrushes stolen (HUD, win at 3)
  const [cartoonFall, setCartoonFall] = useState(false);           // cinematic camera-lock on the devil's defeat fall
  const [fallBegging, setFallBegging] = useState(false);           // devil is pleading — show the save/stomp choice
  const [fallChoice, setFallChoice] = useState<'none' | 'save' | 'stomp'>('none');

  // Start/stop monster ambience with Floor 2
  useEffect(() => {
    if (currentLevel === 2 && audioCtx && !muted) {
      if (!monsterAmbienceRef.current) {
        monsterAmbienceRef.current = createMonsterAmbience(audioCtx);
      }
    } else {
      if (monsterAmbienceRef.current) {
        monsterAmbienceRef.current.stop();
        monsterAmbienceRef.current = null;
      }
      setMonsterDarkness(0);
    }
  }, [currentLevel, audioCtx, muted]);

  // Desktop: hold Shift to swim faster (mirrors the on-screen button).
  useEffect(() => {
    if (currentLevel !== 2) return;
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') sprintHeldRef.current = true; };
    const up   = (e: KeyboardEvent) => { if (e.key === 'Shift') sprintHeldRef.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      sprintHeldRef.current = false;
    };
  }, [currentLevel]);

  // Floor 2 background score — haunted aquarium underscore. Swells with the
  // shark's drama (proximity) via the poll below.
  const floor2MusicRef = useRef<ReturnType<typeof createFloor2Music> | null>(null);
  useEffect(() => {
    if (currentLevel === 2 && audioCtx && !muted) {
      if (!floor2MusicRef.current) floor2MusicRef.current = createFloor2Music(audioCtx, getMusicBus('floor2', 60) ?? undefined);
      setMusicActive('floor2', true);
    } else if (floor2MusicRef.current) {
      floor2MusicRef.current.stop();
      floor2MusicRef.current = null;
      setMusicActive('floor2', false);
    }
    return () => {
      if (floor2MusicRef.current) { floor2MusicRef.current.stop(); floor2MusicRef.current = null; setMusicActive('floor2', false); }
    };
  }, [currentLevel, audioCtx, muted]);

  // Chase music — driving ostinato during the Barney chase, intensity rising
  // as he closes the gap (barneyDistRef). Started/stopped by game state.
  const chaseMusicRef = useRef<ReturnType<typeof createChaseMusic> | null>(null);
  useEffect(() => {
    const inChase = gameState === 'chase';
    if (inChase && audioCtx && !muted) {
      if (!chaseMusicRef.current) chaseMusicRef.current = createChaseMusic(audioCtx, getMusicBus('chase', 100) ?? undefined);
      setMusicActive('chase', true);
      const id = setInterval(() => {
        // Closer Barney → hotter music (≈8m away = calm, ≈1.5m = frantic).
        const d = barneyDistRef.current;
        const intensity = Math.max(0, Math.min(1, (8 - d) / 6.5));
        chaseMusicRef.current?.setIntensity(intensity);
      }, 150);
      return () => {
        clearInterval(id);
        if (chaseMusicRef.current) { chaseMusicRef.current.stop(); chaseMusicRef.current = null; }
        setMusicActive('chase', false);
      };
    } else if (chaseMusicRef.current) {
      chaseMusicRef.current.stop();
      chaseMusicRef.current = null;
      setMusicActive('chase', false);
    }
  }, [gameState, audioCtx, muted]);

  // Poll proximity ref every 80ms → update audio gain + DOM darkness + heartbeat
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (currentLevel !== 2) {
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
      sprintHeldRef.current = false;
      setInWater(false);
      return;
    }
    let prevProx = 0;
    let bubbleAccum = 0;
    let prevX = sharedPlayerPositionRef.current.x;
    let prevZ = sharedPlayerPositionRef.current.z;
    const id = setInterval(() => {
      const p = monsterProximityRef.current;
      monsterAmbienceRef.current?.setProximity(p);
      floor2MusicRef.current?.setIntensity(p);
      setMonsterDarkness(p * p * 0.45);
      // Depth-driven underwater ambience: fade in over the first ~5 units below
      // the swim threshold (-2.7). Up in the cave → silent.
      const pos = sharedPlayerPositionRef.current;
      const y = pos.y;
      const submersion = Math.max(0, Math.min(1, (-2.7 - y) / 5));
      underwaterAmbienceRef.current?.setSubmersion(submersion);

      // Swim UI — show the sprint button + stamina bar only while submerged.
      setInWater(y < -2.7);
      setStaminaPct(staminaRef.current);

      // Detection sting — rising edge as the predator locks on (spotted!).
      if (p >= 0.55 && prevProx < 0.55 && !muted) playDetectionSting(audioCtx);
      prevProx = p;

      // Swim bubbles — occasional, while actually moving underwater.
      const dx = pos.x - prevX, dz = pos.z - prevZ;
      const moving = (dx * dx + dz * dz) > 0.0009;   // ~3cm per 80ms tick
      prevX = pos.x; prevZ = pos.z;
      if (submersion > 0.2 && moving && !muted) {
        bubbleAccum += 1;
        if (bubbleAccum > 14 && Math.random() < 0.35) { // ~once per >1.2s of swimming
          bubbleAccum = 0;
          playBubble(audioCtx);
        }
      }
    }, 80);

    // Heartbeat — recursive timeout that accelerates with proximity
    const scheduleHeart = () => {
      const p = monsterProximityRef.current;
      if (p < 0.15) { heartbeatTimerRef.current = setTimeout(scheduleHeart, 900); return; }
      const speed = 1.0 + p * 1.8;
      playHeartbeat(speed);
      heartbeatTimerRef.current = setTimeout(scheduleHeart, Math.round(750 - p * 420));
    };
    scheduleHeart();

    return () => {
      clearInterval(id);
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
    };
  }, [currentLevel, audioCtx, muted]);

  // Called when the 3D put-on cinematic finishes.
  // Diver turns away → brief goggle-equip blink → player returns to elevator.
  const handleRebreather3DDone = useCallback(() => {
    setRebreather3DActive(false);
    inventoryAddItem('rebreather');
    inventoryAddItem('nightVision');
    playEquipChime(audioCtx);
    setDiverPhase('fading');
    scheduleTimeout(() => setDiverPhase('done'), 2200);
    // Brief black blink for goggle equip, then place player near elevator.
    setDiveBlackKey(k => k + 1);
    setDiveBlackActive(true);
    scheduleTimeout(() => {
      playerPositionCmdRef.current = { x: 0, y: 0, z: -8 };
    }, 300);
    scheduleTimeout(() => setDiveBlackActive(false), 750);
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

  // Win condition: all 5 shards → ride the elevator up to Floor 3.
  // Mirrors the saved→Floor 2 transition (a REAL 20-second elevator trip)
  // instead of an ad-hoc teleport, so the player rides the cabin and steps
  // out into Floor 3 just like every other floor change.
  const winTriggeredRef = useRef(false);
  useEffect(() => {
    if (currentLevel !== 2 || collectedShards.size < 5 || winTriggeredRef.current) return;
    winTriggeredRef.current = true;
    // 1. Triumphant chime + flash while we yank the diver up into the cabin.
    setTeleportCutscene(true);
    if (audioCtx && !muted) { playEquipChime(audioCtx); playArrivalDing(audioCtx); }
    // 2. Pull the diver from the deep straight into the elevator cabin (z=-13,
    //    facing the doors at +z), then start a full elevator ride to Floor 3 —
    //    same machinery as saved→2: close doors, timer=20, dest=3. At timer
    //    18 the world swaps to Floor 3; at timer 0 the doors open.
    scheduleTimeout(() => {
      playerPositionCmdRef.current = { x: 0, y: 0, z: -13, theta: Math.PI };
      setTeleportCutscene(false);
      setDoorsClosed(true);
      setDoorSoundTrigger((prev) => prev + 1);
      setNextElevatorDestination(3);
      setElevatorTimer(20);
      setTravelPhase('closing');
      if (elevatorHumStopRef.current) elevatorHumStopRef.current();
      elevatorHumStopRef.current = createElevatorHum(audioCtx);
    }, 1100);
  }, [collectedShards.size, currentLevel, scheduleTimeout, audioCtx, muted]);

  // Leaving Floor 2 → clear win latch, berserk and shards so a future dive
  // starts fresh (and a full inventory doesn't instantly re-trigger the win).
  useEffect(() => {
    if (currentLevel !== 2) {
      setBerserk(false);
      winTriggeredRef.current = false;
      setCollectedShards(new Set());
    }
  }, [currentLevel]);

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

  // Floor 3 arrival: drop the player inside the elevator cabin (z=-13, same as
  // levels 1 & 2) so they step out onto the START platform, instead of keeping
  // the Floor-2 spot which is behind the parkour (→ void fall + random
  // respawn). theta=π faces the doors / parkour at +z. Keyed only on
  // currentLevel so a later gameState change can't re-teleport mid-climb.
  // Drop the player inside the elevator cabin (z=-13, facing the parkour) the
  // moment Floor 3 becomes the current level — which, on a real ride, is
  // mid-travel (timer 18) while the doors are still closed, exactly like the
  // Floor-2 arrival teleport. Keyed only on currentLevel so a later state
  // change can't re-teleport mid-climb.
  useEffect(() => {
      if (currentLevel === 3) {
          playerPositionCmdRef.current = { x: 0, y: 0, z: -13, theta: Math.PI };
      }
  }, [currentLevel]);

  // Floor 3 INTRO + ragtime — fire only on actual ARRIVAL (doors open), NOT
  // when currentLevel flips to 3 mid-ride. On a Floor 2 → 3 trip, currentLevel
  // becomes 3 at timer 18 but the doors don't open until timer 0 (~17s later);
  // firing on the level flip played the whole intro during the ride and let the
  // ragtime hijack the elevator music. Gating on `!doorsClosed` waits for the
  // doors. (Creator-Mode jumps set doorsClosed=false, so they fire immediately.)
  useEffect(() => {
      if (currentLevel === 3 && !doorsClosed) {
          if (audioCtx) {
              // Point the 1930s footstep/jump SFX at the master bus (obeys mute).
              configureFloor3Sfx(audioCtx, cartoonBusRef.current);
              preloadCartoonAudio(audioCtx).then(() => {
                  // Through the director's ragtime group bus so it can't overlap
                  // any other music (and the director mutes everything else).
                  startCartoonMusic(audioCtx, { gain: 0.4, loop: true, destination: getMusicBus('ragtime', 70) ?? cartoonBusRef.current ?? undefined });
                  setMusicActive('ragtime', true);
              });
          }
          // Fresh sabotage loop each arrival (jumps/obstacles/brushes/devil).
          resetHazards();
          setBrushCount(0);
          setCartoonFall(false);
          setFallBegging(false);
          setFallChoice('none');
          if (f3Demo.fall) {
              // Creator preview: skip the intro/meet-cutscene, let the rival mount
              // and reach its lead, then trigger the defeat fall cutscene so it can
              // be watched on demand.
              f3Demo.fall = false;
              setCartoonStage(5);
              setCartoonIntro(false);
              setCartoonCutscene(false);
              scheduleTimeout(() => {
                  f3Progress.fell = true;
                  f3Progress.fellAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                  setCartoonFall(true);
              }, 1600);
          } else {
              setCartoonStage(0);
              setCartoonIntro(true);
          }
      } else if (currentLevel !== 3) {
          // Left Floor 3 → stop the ragtime bed + detach the SFX. (Don't tear
          // down merely because the doors closed for the ride OUT — that's
          // handled by leaving the level; tearing down on doorsClosed would also
          // wrongly fire during the arrival ride IN.)
          stopCartoonMusic(0.5);
          setMusicActive('ragtime', false);
          clearFloor3Sfx();
          setCartoonIntro(false);
          setCartoonCutscene(false);
          setCartoonFall(false);
          setFallBegging(false);
          setFallChoice('none');
      }
  }, [currentLevel, audioCtx, doorsClosed]);

  // ── Floor 4 (foundation, theme TBD) — reserve its audio bus + SFX so the
  // theme can plug straight in, and keep lobby/engine music off this floor.
  useEffect(() => {
      if (currentLevel === 4) {
          configureFloor4Sfx(audioCtx, cartoonBusRef.current);
          // Reserve the exclusive music group now; no track yet (TODO: theme music).
          getMusicBus('floor4', 65);
          setMusicActive('floor4', true);
      } else {
          setMusicActive('floor4', false);
          clearFloor4Sfx();
      }
  }, [currentLevel, audioCtx]);
  
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
              if (!muted) { playJumpscareStab(audioCtx); playJumpscareMusic(audioCtx); }
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
    if (currentLevel === 2 || currentLevel === 3) {
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
        playerPositionCmdRef.current = { x: 0, y: 0, z: -13 };
        setDoorsClosed(false);
        inventoryAddItem('rebreather');
        inventoryAddItem('nightVision');
      } else if (startLevel === 3) {
        // Floor 3 (parkour). The currentLevel===3 effect handles the spawn
        // position, the cartoon intro and the ragtime music.
        setGameState('outdoor');
        setNightMode(false);
        setHouseDoorOpen(false);
        setDoorOpenAmount(0);
        setDoorsClosed(false);
      } else if (startLevel === 4) {
        // Floor 4 (WIP base plate). Flat walking; spawn near the elevator.
        setGameState('outdoor');
        setNightMode(false);
        setHouseDoorOpen(false);
        setDoorOpenAmount(0);
        setDoorsClosed(false);
        playerPositionCmdRef.current = { x: 0, y: 0, z: -6, theta: Math.PI };
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

  // ── Floor 3 cleared — the Diabrete fell into the void (3 brushes stolen).
  // Flash, yank the player into the cabin, then ride UP to Floor 4.
  const advanceToFloor4AfterWin = useCallback(() => {
    setCartoonFall(false);                       // end the fall camera-lock; flash takes over
    setFallBegging(false); setFallChoice('none');
    setTeleportCutscene(true);
    if (audioCtx && !muted) { playEquipChime(audioCtx); playArrivalDing(audioCtx); }
    scheduleTimeout(() => {
      playerPositionCmdRef.current = { x: 0, y: 0, z: -13, theta: Math.PI };
      setTeleportCutscene(false);
      setDoorsClosed(true);
      setDoorSoundTrigger((prev) => prev + 1);
      setNextElevatorDestination(4);            // beat the devil → up to Floor 4
      setElevatorTimer(20);
      setTravelPhase('closing');
      if (elevatorHumStopRef.current) elevatorHumStopRef.current();
      elevatorHumStopRef.current = createElevatorHum(audioCtx);
    }, 1400);
  }, [audioCtx, muted, scheduleTimeout]);

  // ── Player SAVED the devil → betrayal: he shoves the player into the abyss.
  // Fade, drop them back at the Floor 3 landing and reset the climb to retry.
  const handleBetrayal = useCallback(() => {
    setTeleportCutscene(true);
    if (audioCtx && !muted) playArrivalDing(audioCtx);
    scheduleTimeout(() => {
      f3Progress.fell = false;
      resetHazards();
      setBrushCount(0);
      setCartoonFall(false);
      setFallBegging(false);
      setFallChoice('none');
      playerPositionCmdRef.current = { x: 0, y: 0, z: -13, theta: Math.PI };
      setTeleportCutscene(false);
    }, 1100);
  }, [audioCtx, muted, scheduleTimeout]);

  // Branch the defeat cutscene's outcome: stomp → Floor 4, save → betrayal.
  const handleFallOutcome = useCallback((outcome: 'save' | 'stomp') => {
    setFallBegging(false);
    if (outcome === 'stomp') advanceToFloor4AfterWin();
    else handleBetrayal();
  }, [advanceToFloor4AfterWin, handleBetrayal]);

  // Arm the sabotage-loop callbacks while on Floor 3 (re-armed each entry; the
  // win callback is one-shot — fireWin nulls it after the devil falls).
  useEffect(() => {
    if (currentLevel !== 3) return;
    setOnProgress(() => { setBrushCount(f3Progress.brushes); if (f3Progress.fell) setCartoonFall(true); });
    setOnWin(() => advanceToFloor4AfterWin());
    return () => { setOnProgress(null); setOnWin(null); };
  }, [currentLevel, advanceToFloor4AfterWin]);

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
          if (prevPinchDist.current !== null && currentLevel !== 2 && currentLevel !== 3) { const delta = dist - prevPinchDist.current; setZoomLevel(prev => Math.min(Math.max(prev - delta * 0.02, 0), 10)); }
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
        case 'f': if (inventoryRef.current.flashlight.owned) handleToggleFlashlight(); break;
        case 'n': if (inventoryRef.current.nightVision.owned) toggleNightVision(); break;
        case ' ': if (currentLevel === 3) { jumpRef.current = true; e.preventDefault(); } break;
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
    <div className="w-full h-full relative overflow-hidden select-none" style={{ touchAction: 'none', backgroundColor: '#000' }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onPointerLeave={handlePointerUp} onWheel={(e: React.WheelEvent) => { if (!hasStarted || dialogueOpen || barneyDialogueOpen || shopOpen || currentLevel === 2 || currentLevel === 3) return; setZoomLevel(prev => Math.min(Math.max(prev + e.deltaY * 0.01, 0), 10)); }}>
      <LiminalAudioEngine doorTrigger={doorSoundTrigger} audioContext={audioCtx} muted={muted || shopOpen} masterVolume={settings.masterVolume} nightMode={nightMode} gameState={gameState} currentLevel={currentLevel} doorsClosed={doorsClosed} busRef={cartoonBusRef} />
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
        <AdaptivePerfProbe />
        <Suspense fallback={<Html center><div className="px-5 py-3 rounded-xl bg-black/90 ring-1 ring-amber-500/30 backdrop-blur-xl text-center"><div className="text-amber-400 text-xs font-medium tracking-[0.3em] uppercase mb-1.5">The Normal Elevator</div><div className="flex items-center justify-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /><div className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-pulse" style={{animationDelay:'0.2s'}} /><div className="w-1.5 h-1.5 rounded-full bg-amber-400/30 animate-pulse" style={{animationDelay:'0.4s'}} /></div></div></Html>}>
            <World timer={elevatorTimer} doorsClosed={doorsClosed} level={currentLevel} houseDoorOpen={houseDoorOpen} npcPositionRef={npcPositionRef} isPaused={dialogueOpen || barneyDialogueOpen || shopOpen || diverDialogueOpen || cartoonCutscene || cartoonFall} playerPositionRef={sharedPlayerPositionRef} gameState={gameState} barneyRef={barneyRef} barneyTargetRef={barneyTargetRef} nightMode={nightMode} doorOpenAmount={doorOpenAmount} profile={QUALITY_PROFILES[settings.quality]} collectedShards={collectedShards} onCollectShard={handleCollectShard} diverPhase={diverPhase} diverBeatRef={diverBeatRef} nightVisionActive={inventory.nightVision.owned && inventory.nightVision.active} monsterPositionRef={monsterPositionRef} monsterProximityRef={monsterProximityRef} berserk={berserk} cameraShakeRef={cameraShakeRef} floor3Hands={!cartoonIntro && !cartoonCutscene} floor3Gloves={!cartoonIntro && !cartoonCutscene && !cartoonFall} onPlayerCaught={() => {
                setFishJumpscareKey(k => k + 1);
                setDevoured(true);
                playJumpscareStab(audioCtx);
                playSharkRoar(audioCtx);
                playJumpscareMusic(audioCtx);
                if (monsterAmbienceRef.current) {
                  monsterAmbienceRef.current.stop();
                  monsterAmbienceRef.current = null;
                }
                setMonsterDarkness(0);
                scheduleTimeout(() => {
                  setDevoured(false);
                  setFishJumpscareKey(0);
                  setGameState('caught');
                  setCollectedShards(new Set());
                  playerPositionCmdRef.current = { x: 0, y: 0, z: -5 };
                  setCurrentLevel(0);
                  setFloorReveal(true);
                  setPendingPostDeathDialogue(true);
                }, 2800);
              }} />
            {/* RemotePlayers receive only id + the multiplayer data ref. Position
                updates flow through the ref + useFrame, so the React tree no
                longer re-renders every 200ms. The id list only changes when a
                player joins or leaves. */}
            {visibleRemotePlayerIds.map(id => (
                <RemotePlayer key={id} id={id} dataRef={otherPlayersDataRef} chatBubbles3D={QUALITY_PROFILES[settings.quality].chatBubbles3D} />
            ))}
            <Player active={hasStarted} moveInput={moveInput} lookInput={lookInput} isDesktop={isDesktop} onEnterElevator={handlePlayerEnterElevator} doorsClosed={doorsClosed} currentLevel={currentLevel} onInteractionUpdate={handleInteractionUpdate} onNpcInteractionUpdate={handleNpcInteractionUpdate} onCashierInteractionUpdate={handleCashierInteractionUpdate} houseDoorOpen={houseDoorOpen} zoomLevel={zoomLevel} npcPositionRef={npcPositionRef} dialogueTargetRef={cartoonFall ? f3DevilPos : (cartoonCutscene ? cutsceneTargetRef : ((diverDialogueOpen || diverPhase === 'fading') ? diverPositionRef : (barneyDialogueOpen ? barneyRef : npcPositionRef)))} dialogueOpen={dialogueOpen || barneyDialogueOpen || shopOpen || diverDialogueOpen || rebreather3DActive || diverPhase === 'fading' || diveBlackActive || cartoonCutscene || cartoonFall} sharedPositionRef={sharedPlayerPositionRef} sharedRotationYRef={sharedRotationYRef} cameraThetaRef={cameraThetaRef} cameraShakeRef={cameraShakeRef} diverBeatRef={diverBeatRef} positionCmdRef={playerPositionCmdRef} onElevatorZoneChange={handleElevatorZoneChange} pickupTrigger={pickupTrigger} pickupItem={pickupItem} armExtended={inventory.flashlight.owned && inventory.flashlight.active} onRightHandAnchor={handleRightHandAnchor} sprintHeldRef={sprintHeldRef} staminaRef={staminaRef} jumpRef={jumpRef} />
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
            {/* Floor 3 "turns cartoon" intro — 3D iris wipe + rubber-hose gloves
                doing "puck… puck!", pinned to the camera. Drives the DOM title's
                stage and self-dismisses (or on tap-to-skip). */}
            {cartoonIntro && currentLevel === 3 && (
                <CartoonIntro3D
                    audioCtx={audioCtx}
                    busRef={cartoonBusRef}
                    onStage={setCartoonStage}
                    onDone={() => { setCartoonIntro(false); setCutsceneLine(0); setCartoonCutscene(true); }}
                />
            )}
            {/* Meet-the-Diabrete dialogue — the rival performs in 3D while the
                camera (dialogue-locked) frames him; dashes off when finished. */}
            {cartoonCutscene && currentLevel === 3 && (
                <Floor3Cutscene
                    targetRef={cutsceneTargetRef}
                    onLine={setCutsceneLine}
                    onDone={() => setCartoonCutscene(false)}
                />
            )}
            {/* Defeat cutscene — own cinematic camera + staging (trip → ledge
                grab → the player stomps his hand → plunge). Rendered after
                <Player> so its camera writes win. */}
            {cartoonFall && currentLevel === 3 && (
                <Floor3FallCutscene
                    choice={fallChoice}
                    onBeg={() => setFallBegging(true)}
                    onDone={handleFallOutcome}
                />
            )}
            <SceneInspector />
        </Suspense>
        {/* Post-processing — expanded for underwater immersion.
            High quality: Bloom + ChromaticAberration + Vignette when submerged.
            The ChromaticAberration simulates light dispersion through water,
            and the Vignette deepens the claustrophobic underwater feel.
            Medium/low: no postprocessing pass at all. */}
        {hasStarted && (settings.quality === 'high' || currentLevel === 3) && (
            <EffectComposer multisampling={0} enableNormalPass={false}>
                {/* N8AO — screen-space ambient occlusion (Floor 3 only). Tuned
                    conservatively: tight screen-space radius + low intensity +
                    high-quality denoise so it adds contact shadows in corners
                    without the full-surface grain / dark halo the aggressive
                    settings produced. Runs on the depth buffer so it works with
                    the custom toon ShaderMaterial. */}
                {currentLevel === 3 && settings.quality === 'high' && (
                    <N8AO
                        screenSpaceRadius
                        aoRadius={16}
                        distanceFalloff={0.5}
                        intensity={1.4}
                        quality="performance"
                        halfRes
                        color="#0a0e1a"
                    />
                )}
                {/* Bloom — moderate on Floor 2. Threshold kept high so only
                    truly bright emissive crystals + water surface bloom;
                    low enough to avoid washing the whole cave cyan.
                    High quality only — on medium/low the Floor-3 composer runs
                    just the cheap grayscale pass below. */}
                {settings.quality === 'high' && (
                <Bloom
                    intensity={currentLevel === 2 ? 0.45 : currentLevel === 3 ? 0.22 : 0.35}
                    luminanceThreshold={currentLevel === 2 ? 0.72 : currentLevel === 3 ? 0.95 : 0.95}
                    luminanceSmoothing={currentLevel === 2 ? 0.25 : currentLevel === 3 ? 0.20 : 0.2}
                    mipmapBlur
                    kernelSize={currentLevel === 2 ? KernelSize.SMALL : KernelSize.MEDIUM}
                />
                )}
                {/* Chromatic aberration — heavier underwater (light dispersion
                    through liquid). Floor 3 (Portal 2 sci-fi) uses none. */}
                {settings.quality === 'high' && (
                <ChromaticAberration
                    blendFunction={BlendFunction.NORMAL}
                    offset={currentLevel === 2 ? [0.0035, 0.0035] as unknown as Vector3 : [0, 0] as unknown as Vector3}
                    radialModulation={false}
                    modulationOffset={0.0}
                />
                )}
                {/* Vignette — deep cave on Floor 2, subtle sci-fi on Floor 3. */}
                {settings.quality === 'high' && (
                <Vignette
                    eskil={false}
                    offset={currentLevel === 2 ? 0.32 : currentLevel === 3 ? 0.32 : 0.2}
                    darkness={currentLevel === 2 ? 0.78 : currentLevel === 3 ? 0.28 : 0.3}
                />
                )}
                {/* Floor 3 — warm sepia "old cartoon film" grade for the
                    rubber-hose look (Cuphead reference). Desaturate most of the
                    way, then tint warm via Sepia and push contrast for the inky
                    print feel. Runs at EVERY quality level (the grade is core
                    art direction, not an optional polish pass). */}
                {currentLevel === 3 && (
                    <HueSaturation saturation={-0.6} />
                )}
                {currentLevel === 3 && (
                    <Sepia intensity={0.62} />
                )}
                {currentLevel === 3 && (
                    <BrightnessContrast brightness={0.02} contrast={0.18} />
                )}
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

      {/* Monster proximity darkness — vignette that deepens as the predator
          approaches. Canvas↔DOM bridge via monsterProximityRef (written by
          MonsterFish every frame, polled every 80ms here). z-25 sits above
          the canvas but below all HUD elements so it doesn't obscure UI. */}
      {hasStarted && currentLevel === 2 && monsterDarkness > 0.01 && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            zIndex: 25,
            background: `radial-gradient(ellipse at center, transparent 25%, rgba(0,4,2,${monsterDarkness.toFixed(3)}) 100%)`,
            transition: 'opacity 0.6s ease',
          }}
        />
      )}

      {/* Night-vision DOM overlay — green tint + scanlines + binocular vignette.
          Sits above the canvas (z-18..23) and below the menus. Disappears
          when the player toggles NV off. */}
      {hasStarted && (
        <>
        <NightVisionFx active={inventory.nightVision.owned && inventory.nightVision.active} />
        {/* Shard scanner — only visible when night vision is active */}
        {currentLevel === 2 && inventory.rebreather.owned && inventory.nightVision.owned && inventory.nightVision.active && (
          <ShardScanner
            playerPositionRef={sharedPlayerPositionRef}
            playerRotationYRef={sharedRotationYRef}
            shardPositions={SHARD_POSITIONS}
            collectedShards={collectedShards}
            monsterPositionRef={monsterPositionRef}
          />
        )}
        </>
      )}

      {/* Splash overlay — pure CSS, fires on swim-threshold crossings.
          Brief radial flash + a few short streaks for the impact moment. */}
      {hasStarted && currentLevel === 2 && splashKey > 0 && (
        <div
          key={`splash-${splashKey}`}
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

      
      {/* Diver spawn jumpscare flash — cyan punch synced to the burst.
          Quick blow-out then fast decay so it reads as an impact, not a fade. */}
      {diverSpawnFlashKey > 0 && (
        <div
          key={`diverspawn-${diverSpawnFlashKey}`}
          className="fixed inset-0 z-[77] pointer-events-none"
        >
          <div
            className="dvspawn-flash w-full h-full"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(180,255,250,0.95) 0%, rgba(110,230,255,0.6) 35%, rgba(40,140,180,0.2) 65%, rgba(0,0,0,0) 85%)',
            }}
          />
          <style>{`
            @keyframes dvSpawnFlash {
              0%   { opacity: 0; transform: scale(1.15); }
              8%   { opacity: 1; transform: scale(1.0); }
              28%  { opacity: 0.45; }
              100% { opacity: 0; transform: scale(1.08); }
            }
            .dvspawn-flash { animation: dvSpawnFlash 420ms cubic-bezier(0.2,0.9,0.3,1) forwards; }
          `}</style>
        </div>
      )}

      {/* Fish monster jumpscare — the 3D shark rushes the camera and IS the
          scare. This overlay only adds the cinematic impact: a red flash, a
          chromatic tear, a closing vignette and a fade-to-black, all with a
          CLEAR CENTRE so the real 3D shark maw shows through. */}
      {fishJumpscareKey > 0 && (
        <div key={`fishjs-${fishJumpscareKey}`} className="fixed inset-0 z-[96] pointer-events-none overflow-hidden">
          <style>{`
            @keyframes jsImpact { 0%{opacity:0} 6%{opacity:1} 30%{opacity:.4} 100%{opacity:0} }
            @keyframes jsVign   { 0%{opacity:.15} 100%{opacity:1} }
            @keyframes jsBlk    { 0%{opacity:0} 60%{opacity:0} 100%{opacity:1} }
            @keyframes jsShake3 { 0%,100%{transform:translate(0,0)} 12%{transform:translate(-10px,7px)} 24%{transform:translate(9px,-8px)} 38%{transform:translate(-7px,10px)} 52%{transform:translate(11px,-5px)} 66%{transform:translate(-6px,7px)} 80%{transform:translate(7px,-6px)} }
            @keyframes jsAberrR { 0%{transform:translate(0,0)} 12%{transform:translate(8px,-4px)} 30%{transform:translate(-5px,3px)} 100%{transform:translate(0,0)} }
            @keyframes jsAberrB { 0%{transform:translate(0,0)} 12%{transform:translate(-8px,4px)} 30%{transform:translate(5px,-3px)} 100%{transform:translate(0,0)} }
            .js-wrap   { animation: jsShake3 700ms cubic-bezier(.2,.8,.3,1) forwards; }
            .js-impact { animation: jsImpact 700ms ease-out forwards; }
            .js-vign   { animation: jsVign 900ms ease-in forwards; }
            .js-blk    { animation: jsBlk 2800ms ease-in forwards; }
            .js-ar     { animation: jsAberrR 600ms ease-out forwards; mix-blend-mode:screen; }
            .js-ab     { animation: jsAberrB 600ms ease-out forwards; mix-blend-mode:screen; }
          `}</style>
          <div className="js-wrap absolute inset-0">
            {/* Chromatic tear — sells the bite impact */}
            <div className="js-ar absolute inset-0 opacity-40" style={{ background:'radial-gradient(ellipse at center,rgba(255,0,0,0.45) 0%,transparent 65%)' }} />
            <div className="js-ab absolute inset-0 opacity-30" style={{ background:'radial-gradient(ellipse at center,rgba(0,80,255,0.4) 0%,transparent 65%)' }} />
            {/* Blood impact flash — centre stays clear so the 3D maw shows */}
            <div className="js-impact absolute inset-0" style={{ background:'radial-gradient(ellipse at center,transparent 30%,rgba(130,0,0,0.55) 62%,#180000 100%)' }} />
            {/* Vignette crushing in from the edges */}
            <div className="js-vign absolute inset-0" style={{ background:'radial-gradient(ellipse at center,transparent 32%,rgba(0,0,0,0.85) 80%,#000 100%)' }} />
            {/* Final fade to black */}
            <div className="js-blk absolute inset-0 bg-black" />
          </div>

          {/* DEVORADO text */}
          {devoured && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
              <style>{`
                @keyframes devoradoIn {
                  0%   { opacity:0; letter-spacing:0.8em; }
                  20%  { opacity:1; letter-spacing:0.35em; }
                  75%  { opacity:1; }
                  100% { opacity:0; }
                }
                .devorado-text { animation: devoradoIn 2400ms ease-in-out forwards; animation-delay: 900ms; opacity:0; }
              `}</style>
              <div className="devorado-text text-center select-none">
                <div style={{ color:'#cc1100', fontFamily:'monospace', fontWeight:'900', fontSize:'clamp(1.8rem,6vw,3.5rem)', letterSpacing:'0.35em', textShadow:'0 0 40px rgba(220,0,0,0.9), 0 0 80px rgba(200,0,0,0.4)' }}>
                  DEVORADO
                </div>
                <div style={{ color:'rgba(180,40,30,0.7)', fontFamily:'monospace', fontSize:'clamp(0.7rem,2vw,1rem)', letterSpacing:'0.5em', marginTop:'0.75em' }}>
                  pelas profundezas
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* All 5 shards collected — berserk warning banner */}
      {hasStarted && currentLevel === 2 && berserk && (
        <div className="fixed top-[calc(env(safe-area-inset-top,0px)+80px)] left-1/2 -translate-x-1/2 z-[40] pointer-events-none px-3 max-w-[calc(100%-1.5rem)]">
          <style>{`
            @keyframes berserkPulse { 0%,100%{opacity:0.85;transform:scale(1)} 50%{opacity:1;transform:scale(1.03)} }
            .berserk-banner { animation: berserkPulse 0.6s ease-in-out infinite; }
          `}</style>
          <div className="berserk-banner bg-red-950/95 ring-2 ring-red-500 text-red-200 px-4 py-2 rounded-lg font-black tracking-widest text-xs sm:text-sm shadow-[0_0_30px_rgba(239,68,68,0.6)] text-center">
            ⚠ ELE SENTIU — CORRA PARA O ELEVADOR ⚠
          </div>
        </div>
      )}

      {/* Dive-into-well — cinematic descent (2200ms total). Player is
          teleported underwater at 800ms while the screen is fully black.
          Layers: rushing speed streaks → iris tunnel closes → black hold
          → blue water-flood on impact → reveal of the underwater scene. */}
      {diveBlackActive && (
        <div
          key={`diveblack-${diveBlackKey}`}
          className="fixed inset-0 z-[95] pointer-events-none"
          style={{ background: '#000', animation: 'equipBlink 700ms ease-in-out forwards' }}
        >
          <style>{`
            @keyframes equipBlink {
              0%   { opacity: 0; }
              32%  { opacity: 1; }
              62%  { opacity: 1; }
              100% { opacity: 0; }
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
          audioCtx={audioCtx}
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

      {/* Floor 3 cartoon intro — the wobbly title card. The cream iris wipe,
          rubber-hose gloves and SFX render in 3D inside the Canvas
          (CartoonIntro3D); this DOM layer just shows the title, in lock-step
          via cartoonStage. The intro can't be skipped — it plays out and
          dismisses itself (CartoonIntro3D's onDone). */}
      {cartoonIntro && (
        <CartoonIntro stage={cartoonStage} />
      )}
      {cartoonCutscene && (
        <Floor3CutsceneUI line={cutsceneLine} />
      )}
      {/* Diabrete defeat — cinematic letterbox while the camera locks on his fall */}
      {cartoonFall && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 86, pointerEvents: 'none' }}>
          <style>{`@keyframes f3fall-bars{from{transform:scaleY(0)}to{transform:scaleY(1)}}
            @keyframes f3fall-ko{0%{transform:scale(0) rotate(-14deg);opacity:0}60%{transform:scale(1.2) rotate(6deg);opacity:1}100%{transform:scale(1) rotate(-3deg);opacity:1}}`}</style>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '12%', background: '#0a0712', transformOrigin: 'top', animation: 'f3fall-bars .4s ease-out both' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '12%', background: '#0a0712', transformOrigin: 'bottom', animation: 'f3fall-bars .4s ease-out both' }} />
        </div>
      )}
      {/* Diabrete's plea + the player's choice: SALVAR (→ betrayal) or PISAR (→ Floor 4) */}
      {cartoonFall && fallBegging && fallChoice === 'none' && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: '15%', zIndex: 88,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
          fontFamily: "'Luckiest Guy', system-ui, sans-serif", pointerEvents: 'none' }}>
          {/* speech bubble */}
          <div style={{ maxWidth: 'min(80vw, 520px)', background: '#f6efe0', color: '#140c08',
            border: '4px solid #140c08', borderRadius: 20, padding: '12px 22px',
            fontSize: 'min(4vw,24px)', lineHeight: 1.18, textAlign: 'center',
            boxShadow: '0 6px 0 #140c08', transform: 'rotate(-1deg)',
            animation: 'f3fall-ko .35s cubic-bezier(.2,1.5,.4,1) both' }}>
            E-ei… amigão! Me dá a mão, vai! Eu te dou um atalho pro topo… QUALQUER coisa!
          </div>
          {/* choice buttons */}
          <div style={{ display: 'flex', gap: 16, pointerEvents: 'auto' }}>
            <button onClick={() => { setFallChoice('save'); setFallBegging(false); }}
              style={{ fontFamily: 'inherit', fontSize: 'min(4.4vw,24px)', letterSpacing: '.04em',
                color: '#fff', background: 'linear-gradient(#3a9d5a,#2b7d45)', border: '4px solid #140c08',
                borderRadius: 16, padding: '10px 22px', cursor: 'pointer', boxShadow: '0 5px 0 #140c08',
                WebkitTextStroke: '1px #140c08', paintOrder: 'stroke' }}>
              🤝 SALVAR
            </button>
            <button onClick={() => { setFallChoice('stomp'); setFallBegging(false); }}
              style={{ fontFamily: 'inherit', fontSize: 'min(4.4vw,24px)', letterSpacing: '.04em',
                color: '#fff', background: 'linear-gradient(#c0392b,#9b2418)', border: '4px solid #140c08',
                borderRadius: 16, padding: '10px 22px', cursor: 'pointer', boxShadow: '0 5px 0 #140c08',
                WebkitTextStroke: '1px #140c08', paintOrder: 'stroke' }}>
              👟 PISAR NA MÃO
            </button>
          </div>
        </div>
      )}
      {/* Floor 3 paintbrush counter — steal 3 to send the Diabrete into the void */}
      {currentLevel === 3 && hasStarted && !cartoonIntro && !cartoonCutscene && (
        <div style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 70,
          pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 10,
          fontFamily: "'Luckiest Guy', system-ui, sans-serif" }}>
          <div style={{ background: '#f6efe0', border: '4px solid #140c08', borderRadius: 16,
            padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 10,
            boxShadow: '0 5px 0 #140c08', transform: 'rotate(-1.5deg)' }}>
            <span style={{ fontSize: 22, color: '#140c08', letterSpacing: '.04em' }}>PINCÉIS</span>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ fontSize: 26, filter: i < brushCount ? 'none' : 'grayscale(1) opacity(0.35)',
                transform: i < brushCount ? 'scale(1.15) rotate(-8deg)' : 'none', transition: 'all .2s' }}>🖌️</span>
            ))}
          </div>
        </div>
      )}
      {teleportCutscene && (
        <div className="absolute inset-0 z-[90] pointer-events-none overflow-hidden">
          <style>{`
            @keyframes tpFlash  { 0%{opacity:0} 12%{opacity:.9} 100%{opacity:0} }
            @keyframes tpRings  { 0%{transform:scale(.2);opacity:0} 20%{opacity:.8} 100%{transform:scale(2.4);opacity:0} }
            @keyframes tpText   { 0%{opacity:0;transform:translateY(14px) scale(.96)} 18%{opacity:1;transform:translateY(0) scale(1)} 80%{opacity:1} 100%{opacity:0} }
            @keyframes tpScan   { 0%{transform:translateY(-100%)} 100%{transform:translateY(100%)} }
          `}</style>
          {/* Cyan bloom flash */}
          <div className="absolute inset-0" style={{ animation: 'tpFlash 2600ms ease-out forwards', background: 'radial-gradient(ellipse at center, rgba(54,224,255,0.65) 0%, rgba(10,30,50,0.4) 45%, rgba(2,4,10,0.85) 100%)' }} />
          {/* Expanding teleport rings */}
          {[0, 1, 2].map((i) => (
            <div key={i} className="absolute left-1/2 top-1/2 rounded-full border-2"
              style={{ width: 240, height: 240, marginLeft: -120, marginTop: -120, borderColor: 'rgba(120,240,255,0.7)', animation: `tpRings 2200ms ease-out ${i * 0.35}s forwards` }} />
          ))}
          {/* Scanline sweep */}
          <div className="absolute inset-0 opacity-30" style={{ animation: 'tpScan 1300ms linear', background: 'linear-gradient(transparent, rgba(120,240,255,0.5), transparent)', height: '40%' }} />
          {/* Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center" style={{ animation: 'tpText 2600ms ease-out forwards' }}>
            <div className="text-cyan-100 font-extrabold tracking-[0.35em] text-3xl md:text-5xl" style={{ textShadow: '0 0 22px #36e0ff, 0 0 48px #36e0ff' }}>FRAGMENTOS COLETADOS</div>
            <div className="mt-3 text-cyan-300 font-semibold tracking-[0.5em] text-lg md:text-2xl" style={{ textShadow: '0 0 16px #36e0ff' }}>TELEPORTANDO AO ELEVADOR…</div>
          </div>
        </div>
      )}

      {/* Swim sprint button + stamina bar — only while submerged on Floor 2. */}
      {hasStarted && currentLevel === 2 && inWater && (
        <div className="fixed z-[45] right-[calc(env(safe-area-inset-right,0px)+18px)] bottom-[calc(env(safe-area-inset-bottom,0px)+118px)] flex flex-col items-center gap-2 select-none">
          {/* Stamina bar */}
          <div className="w-24 h-2.5 rounded-full bg-black/55 ring-1 ring-cyan-300/30 overflow-hidden backdrop-blur-sm">
            <div
              className="h-full rounded-full transition-[width] duration-100"
              style={{
                width: `${Math.max(0, Math.min(1, staminaPct)) * 100}%`,
                background: staminaPct < 0.25
                  ? 'linear-gradient(90deg,#ff5a3c,#ff8c42)'
                  : 'linear-gradient(90deg,#36e0ff,#7af0ff)',
                boxShadow: '0 0 10px rgba(60,220,255,0.6)',
              }}
            />
          </div>
          {/* Hold-to-sprint button */}
          <button
            aria-label="Nadar rápido"
            className="w-16 h-16 rounded-full flex items-center justify-center font-black text-[10px] tracking-widest text-cyan-50 ring-2 ring-cyan-300/50 shadow-[0_0_24px_rgba(54,224,255,0.45)] active:scale-95 transition-transform touch-none"
            style={{
              background: staminaPct <= 0.02
                ? 'radial-gradient(circle at 50% 35%, #355, #122)'
                : 'radial-gradient(circle at 50% 35%, #1d7fa8, #0a2b3c)',
              opacity: staminaPct <= 0.02 ? 0.55 : 1,
            }}
            onPointerDown={(e) => { e.stopPropagation(); sprintHeldRef.current = true; }}
            onPointerUp={(e) => { e.stopPropagation(); sprintHeldRef.current = false; }}
            onPointerLeave={() => { sprintHeldRef.current = false; }}
            onPointerCancel={() => { sprintHeldRef.current = false; }}
          >
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 13c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1v2c-1.5 0-1.5-1-3-1s-1.5 1-3 1-1.5-1-3-1-1.5 1-3 1-1.5-1-3-1-1.5 1-3 1v-2z"/>
              <circle cx="16" cy="6.5" r="2"/>
              <path d="M5 9l5-1 4 2 3-1 1.4 1.4-3.6 1.6-4-2-5 1z"/>
            </svg>
          </button>
        </div>
      )}

      {/* Jump button — Floor 3 only, mobile only. Desktop uses Space. */}
      {hasStarted && currentLevel === 3 && !isDesktop && (
        <button
          aria-label="Pular"
          className="font-toon fixed z-[45] right-[calc(env(safe-area-inset-right,0px)+16px)] bottom-[calc(env(safe-area-inset-bottom,0px)+20px)] w-24 h-24 rounded-full flex flex-col items-center justify-center select-none touch-none active:scale-90 active:translate-y-1 transition-transform"
          style={{
            // Retro rubber-hose call-to-action — bold red disc with a thick ink
            // ring and a 3D base shadow, matching the Floor-3 cartoon theme.
            background: 'radial-gradient(circle at 50% 30%, #ff6a4d, #c0271a)',
            boxShadow: '0 7px 0 #7a1610, 0 0 0 4px #241a10, 0 10px 18px rgba(0,0,0,0.45)',
            border: '3px solid #241a10',
          }}
          onPointerDown={(e) => { e.stopPropagation(); jumpRef.current = true; }}
        >
          <svg viewBox="0 0 24 24" className="w-9 h-9" fill="#fff5e6" stroke="#241a10" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20V6M5 13l7-7 7 7" />
          </svg>
          <span style={{ color: '#fff5e6', fontSize: 13, letterSpacing: 1.5, textShadow: '2px 2px 0 #241a10' }}>PULAR</span>
        </button>
      )}

      {barneyDialogueOpen && <BarneyDialogue dialogueNode={barneyDialogueNode} onResponse={handleBarneyResponse} />}
      <ShopOverlay open={shopOpen} onClose={handleCloseShop} initialScene={shopInitialScene} onBuyItem={handleBuyItem} />
    </div>
  );
}
