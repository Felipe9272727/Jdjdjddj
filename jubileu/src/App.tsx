import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, Component } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Loader, AdaptiveDpr, PerformanceMonitor } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Vignette, N8AO, HueSaturation, Sepia, BrightnessContrast, Noise } from '@react-three/postprocessing';
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
import { preloadCartoonAudio, startCartoonMusic, stopCartoonMusic, playCartoonSfx } from './cartoonAudio';
import { getMusicBus, setMusicActive } from './musicDirector';
import { configureFloor3Sfx, clearFloor3Sfx, playFloor3GameOver } from './floor3Sfx';
import { resetHazards, setOnProgress, f3Progress, f3DevilPos, f3Demo } from './f3Hazards';
import { reset as f3Reset, f3PlayerZ, f3PlayerY } from './f3Parkour';
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
import { Floor4Environment, useFloor4Audio, Pixelate3DRamp } from './Floor4';
import Floor4Canvas2D from './Floor4Canvas2D';
import { f4Demo } from './floor4Sfx';
import { f4 } from './f4Lore';
import { Floor7Environment, Floor7Overlay, useFloor7Handle } from './Floor7';
import Floor7IntroCutscene, { F7_DIALOGUE } from './Floor7IntroCutscene';
import Floor7IntroUI from './Floor7IntroUI';
import Floor5Race3D from './Floor5Race3D';
import { configureFloor5RaceSfx, clearFloor5RaceSfx } from './floor5RaceSfx';
import Floor6Suite from './Floor6Suite';
import Floor6Overlay from './Floor6Overlay';
import Floor8Room from './Floor8Room';
import Floor10Base from './Floor10Base';
import { Floor11, Floor11Controls } from './Floor11';
import { AgenteCompanheiro } from './AgenteCompanheiro';
import { reiniciarAgente } from './agente/agenteSessao';
import Floor10Npc from './Floor10Npc';
import Floor10NpcChat from './Floor10NpcChat';
import { useNpcOpen } from './npc/npcStore';
import Floor8Cutscene from './Floor8Cutscene';
import Floor9Forest from './Floor9Forest';
import { Floor9Elevator } from './Floor9Elevator';
import Floor9Overlay from './Floor9Overlay';
import Floor9Cutscene from './Floor9Cutscene';
import { Fiapo } from './Floor9Fauna';
import { f9, f9Reset, f9Subscribe, F9_HOME_SPAWN, f9TriggerWake } from './f9Floresta';
import { f9EcoReset, f9RequestPounce } from './f9Eco';
import Floor8Overlay, { Floor8Ride } from './Floor8Overlay';
import Floor8Image from './Floor8Image';
import Floor8Platformer from './Floor8Platformer';
import { configureFloor6Sfx, clearFloor6Sfx } from './floor6Sfx';
import { configureFloor7Sfx, clearFloor7Sfx, startFloor7Ambient, stopFloor7Ambient, f7CaptainLaugh, f7CutMusicStart, f7CutBeat, f7CutMusicStop, f7BootClomp, f7ElevatorVanish, f7CaptainVoice } from './floor7Sfx';
import { configureFloor9Sfx, clearFloor9Sfx } from './floor9Sfx';
import { f6, f6Reset, f6Subscribe } from './f6Escape';
import { f8, f8Reset, f8Subscribe } from './f8Arquivo';
import { p8Reset } from './f8Platformer';
import { f8StartBoss } from './f8Dev';
import { BARNEY_URL, BARNEY_CATCH_DIST, DOOR_INTERACT_DIST, NPC_INTERACT_DIST, BED_INTERACT_DIST, BED_POS, ELEVATOR_ZONE_X, ELEVATOR_ZONE_Z, wallsForState, FLOOR7_SCALE, hasWalkInElevator } from './constants';
import PhysicsProps, { type CrateSpec } from './PhysicsProps';
import { PhotoModeRig, PhotoModeOverlay, PhotoModeButton, usePhotoMode } from './PhotoMode';
import { useMultiplayer, getPlayerName } from './Multiplayer';
import { RemotePlayer } from './RemotePlayer';
import { useSettings, SettingsMenu, FpsCounter, QUALITY_PROFILES, type QualityProfile } from './Settings';
import { GRADE_F3 } from './floor3Grade';
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

// Ao trocar o Canvas do 10º para `demand`, força um frame já com o painel
// aberto. `never` deixava o drawing buffer sem uma apresentação nova e alguns
// Chromes Android exibiam preto. Dois frames bastam para manter o cenário
// estático visível sem disputar CPU com o LLM.
const Floor10ChatBackdropFrame: React.FC<{ active: boolean }> = ({ active }) => {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (!active) return;
    invalidate();
    const frame = window.requestAnimationFrame(() => invalidate());
    return () => window.cancelAnimationFrame(frame);
  }, [active, invalidate]);
  return null;
};


const MAX_JOYSTICK_RADIUS = 50;

// ─── Game State Machine ───────────────────────────────────────────────────
type GameState = 'lobby' | 'outdoor' | 'barney_greet' | 'indoor_day' | 'sleep_fade' | 'indoor_night' | 'chase' | 'caught' | 'saved';

interface WorldProps {
  timer: number | null;
  doorsClosed: boolean;
  level: number;
  f8InImage?: boolean;
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
  /** During the defeat fall cutscene, hide the live parkour/elevator/hazards so
   *  the cutscene shows its OWN staged "high up the climb" set, not the start. */
  floor3FallActive: boolean;
  /** Floor 6: true once the cab blows — Floor6Suite renders its own DEAD cab
   *  (crooked, enterable), so the global "alive" interior must unmount. */
  f6CabDead: boolean;
}

// A small stack of hotel "luggage" crates in a back corner of the lobby (away
// from the NPC, the shop counter at x≈7, and the elevator mouth at z=-10).
// Rapier (WASM) makes them fall, settle and get shoved when the player walks
// into them — high quality only (see profile.physicsProps).
const LOBBY_CRATES: CrateSpec[] = [
    { hx: 0.4, hy: 0.4, hz: 0.4, x: -6.0, y: 0.4, z: -6.0, color: '#9a753f' },
    { hx: 0.4, hy: 0.4, hz: 0.4, x: -6.85, y: 0.4, z: -6.1, color: '#8a6a3a' },
    { hx: 0.4, hy: 0.4, hz: 0.4, x: -6.0, y: 0.4, z: -6.9, color: '#a87f45' },
    { hx: 0.35, hy: 0.35, hz: 0.35, x: -6.45, y: 1.2, z: -6.45, color: '#7d5f33' },
    { hx: 0.3, hy: 0.3, hz: 0.3, x: -6.1, y: 1.95, z: -6.2, color: '#b5904e' },
    { hx: 0.45, hy: 0.3, hz: 0.45, x: -8.4, y: 0.3, z: -7.2, color: '#6f5530' },
    { hx: 0.35, hy: 0.35, hz: 0.35, x: -8.5, y: 1.0, z: -7.1, color: '#9a753f' },
];
// Sealed lobby perimeter — keeps debris in the room no matter the door state.
const LOBBY_PHYS_WALLS = wallsForState(0, true, false);

const World = React.memo(({ timer, doorsClosed, level, houseDoorOpen, npcPositionRef, isPaused, playerPositionRef, gameState, barneyRef, barneyTargetRef, nightMode, doorOpenAmount, profile, collectedShards, onCollectShard, diverPhase, diverBeatRef, nightVisionActive, onPlayerCaught, monsterPositionRef, monsterProximityRef, berserk, cameraShakeRef, floor3Hands, floor3Gloves, floor3FallActive, f6CabDead, f8InImage }: WorldProps) => (
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
      {/* Rapier (WASM) dynamic debris — high quality only. Purely cosmetic
          physics; the player can kick the crates around. */}
      {level === 0 && profile.physicsProps && (
          <PhysicsProps playerPositionRef={playerPositionRef} groundY={0} crates={LOBBY_CRATES} walls={LOBBY_PHYS_WALLS} paused={isPaused} />
      )}
      {level === 1 && <FlatMapEnvironment houseDoorOpen={houseDoorOpen} nightMode={nightMode} doorOpenAmount={doorOpenAmount} />}
      {level === 3 && <Floor3Environment hands={floor3Hands} gloves={floor3Gloves} fallActive={floor3FallActive} />}
      {level === 4 && <Floor4Environment />}
      {/* Floor 6 — a Suíte 612: "O Hóspede que Sabia Demais" (escape room) */}
      {level === 6 && <Floor6Suite playerPositionRef={playerPositionRef} profile={profile} />}
      {/* Andar 8 — a sala de interrogatório do Arquivista (→ platformer de tricô) */}
      {level === 8 && !f8InImage && <Floor8Room playerPositionRef={playerPositionRef} />}
      {level === 9 && <Floor9Forest playerPositionRef={playerPositionRef} />}
      {/* Andar 10 — PLACEHOLDER: base plana, esperando virar um andar */}
      {level === 10 && <Floor10Base />}
      {level === 11 && <Floor11 />}
      {/* NPC com LLM real (SmolLM3 quantizado no browser) — corpo procedural v1 */}
      {level === 10 && <Floor10Npc playerPositionRef={playerPositionRef} />}
      {/* the old baseplate is the FLOOR 7 TEMPLATE now — Creator Mode only */}
      {/* Andar 7 (navio pirata) is mounted as a Canvas sibling below — it needs
          the Floor7 WASM handle ref that this memoized World doesn't carry. */}
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
      {!(level === 6 && f6CabDead) && level !== 7 && level !== 9 && <ElevatorInterior timer={timer} doorsClosed={doorsClosed} level={level} />}
      {/* Andar 9 (O Viveiro): o elevador é o cab enferrujado/coberto de vinhas
          (GLB modelado no Blender), não o <ElevatorInterior> genérico. */}
      {level === 9 && <Floor9Elevator />}
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
  const photo = usePhotoMode(); // GPU path-tracer "photo mode" (off until the camera button)
  const floor7Handle = useFloor7Handle(); // Andar 7 (pirate ship) — bridge to the WASM brain
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null);
  // Master audio bus (the AudioEngine's muteable/volume-controlled input).
  // The Floor-3 cartoon ragtime + SFX route through this so they sit inside the
  // mix (obeying mute + the volume slider) instead of straight to the speakers.
  const cartoonBusRef = useRef<AudioNode | null>(null);
  const [muted, setMuted] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0); // first-person only (third person removed permanently)
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
  // Creator variants are prepared synchronously inside handleStartGame. Keep
  // the pending variant across the currentLevel render so the normal Floor 8
  // arrival effect does not immediately erase a direct YOURSELF jump.
  const floor8StartVariantRef = useRef<string | null>(null);
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
  const captainAnchorRef = useRef(new Vector3(0, 0, 0));           // Floor7 captain feet (dialogue-camera look-at)
  const f7ElevFadeRef = useRef<number | null>(null);              // intro cutscene drives the elevator dematerialisation (null = brain)
  const f7LaughRef = useRef(0);
  const f7PoseRef = useRef(0);
  const f7HideSailsRef = useRef(0);                                   // intro cutscene LAUGH-beat strength → captain laugh pose
  const f7LegsRef = useRef(0);                                        // intro LEGS close-up → swap the GLB for the rigid primitive legs
  const f7TalkRef = useRef(0);                                        // intro TALK beat → captain speaking gesture
  const f7DimRef = useRef(0);                                         // intro transition dip (UI darkens to mask hard cuts)
  const [captainGreeting, setCaptainGreeting] = useState(false);   // captain is delivering the quest → lock the camera on him
  const [f7Boarded, setF7Boarded] = useState(false);               // player boarded the returned cab → riding home
  const [f7Intro, setF7Intro] = useState(false);                   // captain arrival cutscene running
  const [f7IntroBeat, setF7IntroBeat] = useState(0);               // active cutscene beat (UI/SFX)
  const [f7IntroLine, setF7IntroLine] = useState(-1);              // active cutscene dialogue line
  // play the captain-arrival cutscene the first time the player lands on Andar 7
  useEffect(() => {
    if (hasStarted && currentLevel === 7) {
      setF7Intro(true); setF7IntroBeat(0); setF7IntroLine(-1);
      // SAFETY backstop only: the cutscene ends itself at T_END (~9.5s) via onDone.
      // This timer just guarantees control returns if a hard stall ever swallowed
      // that. It is WALL-clock while the cutscene's own clock is FRAME-based (it
      // stretches at low fps), so the budget must clear the worst realistic playback
      // time — 60s covers everything down to ~3fps, so it never clips a normal run
      // and only fires on a genuine freeze. (The player can also skip at any time.)
      const safety = setTimeout(() => setF7Intro(false), 60000);
      return () => clearTimeout(safety);
    }
    setF7Intro(false);
  }, [hasStarted, currentLevel]);
  // BRIDGE the intro→greet hand-off: captainGreeting is set in a deferred effect off the
  // WASM GREET state, so for ~1 render after f7Intro ends neither flag is set and the FP
  // hand/brush flashes into frame before the greet camera locks on. Keep "settling" true
  // for a beat after the intro so the hand stays hidden across that gap.
  const [f7Settling, setF7Settling] = useState(false);
  const f7IntroPrev = useRef(false);
  useEffect(() => {
    let id: ReturnType<typeof setTimeout> | undefined;
    if (f7IntroPrev.current && !f7Intro && currentLevel === 7) {
      setF7Settling(true);
      id = setTimeout(() => setF7Settling(false), 1800);
    }
    f7IntroPrev.current = f7Intro;
    return () => { if (id) clearTimeout(id); };
  }, [f7Intro, currentLevel]);
  // End the intro SYNCHRONOUSLY raising the settling bridge in the SAME React batch, so
  // there's never a render where both f7Intro and f7Settling are false (the effect above
  // reacts one render late — that single frame was the FP hand still flashing in). Use
  // this at every place the cutscene ends (natural onDone + manual skip).
  const endF7Intro = useCallback(() => { setF7Settling(true); setF7Intro(false); }, []);
  // Andar 7 FINALE — the WASM latched `boarded`: the player stepped into the
  // rematerialised cab and pressed E. "Máquina não esquece": teleport into the
  // global elevator interior and take the standard 20s ride UP to Floor 8 —
  // o interrogatório do Arquivista espera o escolhido.
  const handleF7Board = useCallback(() => {
    setF7Boarded(true);
    setDoorsClosed(true);
    setDoorSoundTrigger(prev => prev + 1);
    playerPositionCmdRef.current = { x: 0, y: 0, z: -13 };
    setNextElevatorDestination(8);
    setElevatorTimer(20);
    setTravelPhase('closing');
    if (elevatorHumStopRef.current) elevatorHumStopRef.current();
    elevatorHumStopRef.current = createElevatorHum(audioCtx);
  }, [audioCtx]);
  useEffect(() => { if (currentLevel !== 7) setF7Boarded(false); }, [currentLevel]);
  // CUTSCENE SCORE: start the building music bed while the intro runs, fade it on end.
  useEffect(() => {
    if (!f7Intro || !audioCtx) return;
    f7CutMusicStart();
    return () => f7CutMusicStop();
  }, [f7Intro, audioCtx]);
  // per-beat stinger + bed modulation (REVEAL hero stab, LOOK_BACK eerie, LAUGH menace,
  // TALK heartbeat pulse). Driven off the beat state the cutscene reports.
  useEffect(() => { if (f7Intro && audioCtx) f7CutBeat(f7IntroBeat); }, [f7IntroBeat, f7Intro, audioCtx]);
  // the captain's VOICE — gruff gibberish per spoken line (line 0 is covered by the laugh).
  useEffect(() => {
    if (f7Intro && audioCtx && f7IntroLine >= 1 && f7IntroLine < F7_DIALOGUE.length) f7CaptainVoice(F7_DIALOGUE[f7IntroLine]);
  }, [f7IntroLine, f7Intro, audioCtx]);
  const [brushCount, setBrushCount] = useState(0);                 // paintbrushes stolen (HUD, win at 3)
  const [cartoonFall, setCartoonFall] = useState(false);           // cinematic camera-lock on the devil's defeat fall
  const [fallBegging, setFallBegging] = useState(false);           // devil is pleading — show the save/stomp choice
  const [fallChoice, setFallChoice] = useState<'none' | 'save' | 'stomp'>('none');
  const [fallGameOver, setFallGameOver] = useState(false);         // SAVE branch → he betrays you → brief "back to start" card
  // The devil's last-ditch conversation; the SALVAR/PISAR choice only appears
  // once it reaches the final line.
  const FALL_DIALOGUE: { s: 'diabrete' | 'player'; t: string }[] = [
    { s: 'diabrete', t: 'E-EI! Não vai embora não! Me ajuda aqui, pelo amor!' },
    { s: 'player',   t: '…por que eu ajudaria? Você me sabotou a fase inteira.' },
    { s: 'diabrete', t: 'Aaah, aquilo? A gente tava só BRINCANDO, amigão! Sem ressentimentos!' },
    { s: 'player',   t: 'Você jogou espinhos em mim. Várias vezes.' },
    { s: 'diabrete', t: 'Detalhes! Olha — eu tenho família! Quatro diabretinhos famintos!' },
    { s: 'player',   t: 'Você apareceu do nada faz cinco minutos.' },
    { s: 'diabrete', t: 'T-tá, menti. MAS… me deixar cair vai pesar na sua consciência PRA SEMPRE…' },
    { s: 'diabrete', t: 'Então… o que vai ser? Me salva… ou pisa na minha mãozinha?' },
  ];
  const [fallLine, setFallLine] = useState(0);
  const fallChoiceReady = fallLine >= FALL_DIALOGUE.length - 1;
  useEffect(() => {
    if (!fallBegging) { setFallLine(0); return; }
    if (fallLine >= FALL_DIALOGUE.length - 1) return;     // reached the choice — hold
    const dur = FALL_DIALOGUE[fallLine].s === 'player' ? 2500 : 3200;
    const id = setTimeout(() => setFallLine((i) => i + 1), dur);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallBegging, fallLine]);

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

  // Floor 6 (Suíte 612): true while any escape-room UI is up (examine card,
  // keypad, crank, the guest's dialogue) — freezes the Player and drops
  // pointer lock, same contract as the shop/dialogue overlays.
  const [f6UiOpen, setF6UiOpen] = useState(false);
  const handleF6UiOpenChange = useCallback((open: boolean) => setF6UiOpen(open), []);
  // Andar 10: painel de conversa do NPC (LLM) aberto → congela o player e solta
  // o pointer lock, mesmo contrato dos overlays acima. Seletor enxuto (só o bool).
  const npcChatOpen = useNpcOpen();
  // Andar 8 (interrogatório): true enquanto a caixa de diálogo está na tela —
  // congela o Player e solta o pointer lock, mesmo contrato do Floor 6.
  const [f8UiOpen, setF8UiOpen] = useState(false);
  const handleF8UiOpenChange = useCallback((open: boolean) => setF8UiOpen(open), []);
  // Andar 8 FINALE — o Arquivista te JOGA: você acorda dentro do elevador em
  // trânsito. O painel marca "9" — e agora o 9 EXISTE: o Viveiro. As portas
  // abrem e não há chão; a queda pela copa é a chegada.
  const handleF8Thrown = useCallback(() => {
    setDoorsClosed(true);
    setDoorSoundTrigger(prev => prev + 1);
    playerPositionCmdRef.current = { x: 0, y: 0, z: -13 };
    setNextElevatorDestination(9);
    setElevatorTimer(20);
    setTravelPhase('closing');
    if (elevatorHumStopRef.current) elevatorHumStopRef.current();
    elevatorHumStopRef.current = createElevatorHum(audioCtx);
  }, [audioCtx]);
  // Andar 9 FINALE (V4) — a Raiz desabrochou, o player entrou na luz e o
  // cartão teaser manda "Voltar ao elevador". MESMO fluxo do finale do 8
  // (handleF8Thrown), só que a viagem é de VOLTA pro saguão (0): o 9 não tem
  // elevador navegável — a entrada foi pela copa, a saída é pela Raiz. Não
  // existe flag de andar completo no App (convenção conferida), então é só
  // o retorno.
  const handleF9Complete = useCallback(() => {
    setDoorsClosed(true);
    setDoorSoundTrigger(prev => prev + 1);
    playerPositionCmdRef.current = { x: 0, y: 0, z: -13 };
    setNextElevatorDestination(0);
    setElevatorTimer(20);
    setTravelPhase('closing');
    if (elevatorHumStopRef.current) elevatorHumStopRef.current();
    elevatorHumStopRef.current = createElevatorHum(audioCtx);
  }, [audioCtx]);
  // Floor 6 FINALE — the guest stepped aside and the player pressed T inside
  // the repaired cab. "Máquina não esquece: ele te deve uma descida" — o
  // Aurélio manda o player pro ANDAR 7 (o navio). O beat de embarque/portas
  // fechando já aconteceu no cab (f6BoardElevator + os 1.7s do overlay), então
  // aqui a gente entrega o convés direto — MESMO caminho da entrada que o
  // Andar 7 já suporta (o creator-jump). A cutscene do capitão faz o reveal e,
  // no beat LOOK_BACK, mostra o elevador se desmaterializando atrás de você —
  // exatamente o "o mar não devolve ninguém". Sem a viagem de 20s visível,
  // que no 7 não teria cabine pra mostrar (o convés não tem interior).
  const handleF6Leave = useCallback(() => {
    setGameState('outdoor');
    setNightMode(false);
    setHouseDoorOpen(false);
    setDoorOpenAmount(0);
    setDoorsClosed(false);
    setZoomLevel(0);
    setCurrentLevel(7);
    playerPositionCmdRef.current = { x: 0.75 * FLOOR7_SCALE, y: 0, z: 4.3 * FLOOR7_SCALE, theta: Math.PI };
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
          setFallGameOver(false);
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
          setFallGameOver(false);
      }
  }, [currentLevel, audioCtx, doorsClosed]);

  // ── Floor 4 audio lifecycle lives in the Floor4 module (self-contained app).
  useFloor4Audio(currentLevel === 4, audioCtx, cartoonBusRef);
  // Floors 4/5 are overlays: lock the 3D camera to first person beneath them —
  // both transitions begin in FP (Floor 5 then pulls out to its own 3rd person).
  useEffect(() => { if (currentLevel === 4 || currentLevel === 5 || currentLevel === 6) setZoomLevel(0); }, [currentLevel]);
  // ── Floor 5 audio: point the race SFX at the master bus while up there.
  useEffect(() => {
    if (currentLevel !== 5 || !audioCtx) return;
    configureFloor5RaceSfx(audioCtx, cartoonBusRef.current);
    return () => clearFloor5RaceSfx();
  }, [currentLevel, audioCtx]);
  // ── Floor 6 audio + fresh escape-room state on every arrival.
  useEffect(() => {
    if (currentLevel !== 6) return;
    f6Reset();
  }, [currentLevel]);
  // ── Andar 8 — estado fresco do interrogatório a cada chegada. (Numa viagem
  // real de elevador o player desembarca na cabine z=-13 e caminha até a mesa;
  // o creator jump já posiciona em z=-8.2.)
  useEffect(() => {
    if (currentLevel !== 8) return;
    const creatorVariant = floor8StartVariantRef.current;
    floor8StartVariantRef.current = null;
    if (creatorVariant === 'floor8Boss') return;
    f8Reset(); p8Reset();
  }, [currentLevel]);
  // ── Andar 9 — O VIVEIRO: ecossistema + queda frescos a cada chegada, e o
  // player nasce no ar sobre a clareira de pouso (a cutscene da queda dirige).
  useEffect(() => {
    if (currentLevel !== 9) return;
    f9Reset(); f9EcoReset();
    playerPositionCmdRef.current = { x: 0, y: 0, z: -1.5 };
  }, [currentLevel]);
  // M20/M21 SPAWN FIXO: quando a onda (ou o vulto) apaga o player, ele SEMPRE
  // acorda na TOCA-CASA (F9_HOME_SPAWN) — não mais no oco mais próximo (que
  // variava). É aqui que o respawn REALMENTE acontece no jogo: via
  // playerPositionCmdRef, que o <Player> obedece (setar sharedPlayerPositionRef
  // direto não cola — o Player sobrescreve todo frame). f9TriggerWake dispara a
  // animação de DESPERTAR (a câmera brota do chão na toca).
  const f9PrevPhaseRef = useRef(f9.phase);
  useEffect(() => f9Subscribe(() => {
    if (f9.phase === 'explorar' && f9PrevPhaseRef.current === 'apagando') {
      playerPositionCmdRef.current = { x: F9_HOME_SPAWN[0], y: 0, z: F9_HOME_SPAWN[1], theta: 0 };
      f9TriggerWake();
    }
    f9PrevPhaseRef.current = f9.phase;
  }), []);
  // Mirrors f6.phase into React so World can swap the live cab for the dead
  // one the moment the panel blows (f6 itself mutates outside React).
  const [f6CabDead, setF6CabDead] = useState(false);
  useEffect(() => f6Subscribe(() => {
    setF6CabDead((prev) => {
      const dead = f6.phase !== 'arrive';
      return prev !== dead ? dead : prev;
    });
  }), []);
  // Mirrors f8.phase: quando o player está DENTRO da imagem (corredor/porta21/
  // platformer/vitória) o overlay 2.5D opaco cobre a tela — então desmontamos a
  // sala 3D do interrogatório atrás dele pra não renderizar dois mundos à toa.
  const [f8InImage, setF8InImage] = useState(false);
  useEffect(() => f8Subscribe(() => {
    setF8InImage((prev) => {
      const inImg = f8.phase === 'corredor20' || f8.phase === 'porta21'
        || f8.phase === 'platformer' || f8.phase === 'memoriaRecuperada';
      return prev !== inImg ? inImg : prev;
    });
  }), []);
  useEffect(() => {
    if (currentLevel !== 6 || !audioCtx) return;
    configureFloor6Sfx(audioCtx, cartoonBusRef.current);
    return () => clearFloor6Sfx();
  }, [currentLevel, audioCtx]);

  useEffect(() => {
    if (currentLevel !== 7 || !audioCtx) return;
    configureFloor7Sfx(audioCtx, cartoonBusRef.current);
    if (!muted) startFloor7Ambient();
    return () => { stopFloor7Ambient(); clearFloor7Sfx(); };
  }, [currentLevel, audioCtx, muted]);

  // ── Andar 9 — O VIVEIRO: a floresta ganha voz ao entrar no andar e cala ao
  // sair. Mesmo contrato do floor6Sfx: configure com o bus cartoon na entrada,
  // clear no cleanup — sem o clear os loops (cama/chuva/vento da queda)
  // vazariam por cima do hum do elevador na troca de andar.
  useEffect(() => {
    if (currentLevel !== 9 || !audioCtx) return;
    configureFloor9Sfx(audioCtx, cartoonBusRef.current);
    return () => clearFloor9Sfx();
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
          const d = Math.sqrt((p.x - BED_POS.x) ** 2 + (p.z - BED_POS.z) ** 2);
          setCanSleepNow(d < BED_INTERACT_DIST);
      }, 200);
      return () => clearInterval(check);
  }, [gameState, canSleep]);

  // Stabilize the enter-elevator handler. The previous version had
  // [elevatorTimer, doorsClosed] in its deps, so the callback identity
  // changed every second during a ride — which forced <Player/> to
  // re-render once per tick. Reading the latest values via a ref keeps
  // the function ref stable across renders.
  const elevatorStateRef = useRef({ elevatorTimer, doorsClosed, currentLevel });
  elevatorStateRef.current = { elevatorTimer, doorsClosed, currentLevel };
  const handlePlayerEnterElevator = useCallback(() => {
    const { elevatorTimer: t, doorsClosed: d, currentLevel: lv } = elevatorStateRef.current;
    // Floors 4+ own their exits. In particular, the Viveiro's main path crosses
    // the lobby cab's old z coordinate; an ever-growing blacklist let this bug
    // return whenever a new floor shipped. Keep an allow-list here as defense
    // in depth even though Player suppresses the spatial trigger there too.
    if (!hasWalkInElevator(lv)) return;
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
  // handleStartGame accepts an optional floor and an explicit Creator variant.
  // When provided (via Creator Mode), the game starts directly on that floor,
  // skipping the normal lobby → elevator → floor progression.
  // If omitted, the game starts normally at level 0 (lobby).
  // ─── CREATOR MODE ───
  const handleStartGame = (mpEnabled: boolean, name?: string, startLevel?: number, startVariant?: string) => {
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
      if (startLevel === 8) floor8StartVariantRef.current = startVariant ?? null;
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
        if (f4Demo.ride) {
          // Creator "Transição → 2D": the FULL 20s elevator ride — start inside
          // the lobby's elevator with the doors shut; at T-10s the 3D pixelates,
          // at T0 the doors open into the 2D floor. (Mirrors the post-Floor-3
          // win flow in advanceToFloor4AfterWin.)
          f4Demo.ride = false;
          setCurrentLevel(0);
          setGameState('lobby');
          setNightMode(false);
          playerPositionCmdRef.current = { x: 0, y: 0, z: -13, theta: Math.PI };
          setDoorsClosed(true);
          setDoorSoundTrigger(prev => prev + 1);
          setNextElevatorDestination(4);
          setZoomLevel(0);                      // 1st person for the whole ride
          setElevatorTimer(20);
          setTravelPhase('closing');
          if (elevatorHumStopRef.current) elevatorHumStopRef.current();
          elevatorHumStopRef.current = createElevatorHum(ctx);
        } else {
          // Floor 4 (2D) instant jump: doors already open → the 2D overlay
          // mounts straight away (with its own pixel-resolve entry).
          setGameState('outdoor');
          setNightMode(false);
          setHouseDoorOpen(false);
          setDoorOpenAmount(0);
          setDoorsClosed(false);
          playerPositionCmdRef.current = { x: 0, y: 0, z: -6, theta: Math.PI };
        }
      } else if (startLevel === 5) {
        // Andar 5 — A CORRIDA: doors open → the N64 overlay mounts with its
        // own 1st→3rd-person intro (ding, TROCO-64, the pitch).
        setGameState('outdoor');
        setNightMode(false);
        setHouseDoorOpen(false);
        setDoorOpenAmount(0);
        setDoorsClosed(false);
        setZoomLevel(0);
        playerPositionCmdRef.current = { x: 0, y: 0, z: -6, theta: Math.PI };
      } else if (startLevel === 6) {
        // Andar 6 — a Suíte 612 (escape room). First person, fresh state,
        // spawn just outside the doors so the BANG beat fires on the walk-in.
        f6Reset();
        setGameState('outdoor');
        setNightMode(false);
        setHouseDoorOpen(false);
        setDoorOpenAmount(0);
        setDoorsClosed(false);
        setZoomLevel(0);
        playerPositionCmdRef.current = { x: 0, y: 0, z: -8.6, theta: Math.PI };
      } else if (startLevel === 7) {
        // Andar 7 — o navio pirata. Player nasce no convés em frente ao elevador
        // (que então se desmaterializa); o capitão vem da proa dar a missão.
        // Spawn deslocado pro LADO do mastro do traquete (que fica em ship-local
        // (0, 4)): em x=0 o jogador nascia com o rosto a ~0.4m do mastro — a tela
        // inteira virava uma "parede de tábuas". Em x=0.75 a vista desce limpa
        // pelo convés até o capitão.
        setGameState('outdoor');
        setNightMode(false);
        setHouseDoorOpen(false);
        setDoorOpenAmount(0);
        setDoorsClosed(false);
        playerPositionCmdRef.current = { x: 0.75 * FLOOR7_SCALE, y: 0, z: 4.3 * FLOOR7_SCALE, theta: Math.PI };
      } else if (startLevel === 8) {
        // Andar 8 — a sala de interrogatório do Arquivista. 1ª pessoa, estado
        // fresco, spawn logo à frente do vão pra caminhar até a mesa.
        // O destino do Modo Desenvolvedor atravessa o fluxo como dado explícito.
        // Isso torna YOURSELF determinístico e mantém o Andar 8 normal intacto.
        if (startVariant === 'floor8Boss') f8StartBoss();
        else { f8Reset(); p8Reset(); }
        setGameState('outdoor');
        setNightMode(false);
        setHouseDoorOpen(false);
        setDoorOpenAmount(0);
        setDoorsClosed(false);
        setZoomLevel(0);
        playerPositionCmdRef.current = { x: 0, y: 0, z: -8.2, theta: Math.PI };
      } else if (startLevel === 9) {
        // Andar 9 — O VIVEIRO: ecossistema fresco + a queda pela copa.
        f9Reset(); f9EcoReset();
        setGameState('outdoor');
        setNightMode(false);
        setHouseDoorOpen(false);
        setDoorOpenAmount(0);
        setDoorsClosed(false);
        setZoomLevel(0);
        playerPositionCmdRef.current = { x: 0, y: 0, z: -1.5, theta: Math.PI };
      } else if (startLevel === 10 || startLevel === 11) {
        if (startLevel === 11) reiniciarAgente();
        // Andar 10 — PLACEHOLDER (base plana). 1ª pessoa, spawn na frente das
        // portas do elevador, olhando pro salão vazio. Vira andar de verdade depois.
        setGameState('outdoor');
        setNightMode(false);
        setHouseDoorOpen(false);
        setDoorOpenAmount(0);
        setDoorsClosed(false);
        setZoomLevel(0);
        playerPositionCmdRef.current = { x: 0, y: 0, z: -6, theta: Math.PI };
      }
    }
    // ─── CREATOR MODE: end jump ───
    if (typeof window !== 'undefined' && window.matchMedia("(min-width: 1024px)").matches) {
      const req = document.body.requestPointerLock() as unknown as Promise<void> | undefined;
      if (req && typeof (req as any).catch === 'function') (req as Promise<void>).catch(() => {});
    }
  };

  // DEBUG/playtest hook: window.__startFloor(7) jumps straight onto a floor
  // (used by the offline playtest harness + the critic to actually play). Inert
  // unless something calls it.
  useEffect(() => {
    const w = window as unknown as { __startFloor?: (n: number) => void; __startFloor8Boss?: () => void; __playerPos?: () => [number, number, number] };
    w.__startFloor = (n: number) => handleStartGame(false, 'Tester', n);
    w.__startFloor8Boss = () => handleStartGame(false, 'Tester', 8, 'floor8Boss');
    w.__playerPos = () => [sharedPlayerPositionRef.current.x, sharedPlayerPositionRef.current.y, sharedPlayerPositionRef.current.z];
    // Teleporte de teste: usado pela sonda da prisão do Andar 10 para pôr o
    // jogador numa placa sem precisar dirigir o personagem por 14 metros.
    (w as unknown as { __f10teleport?: (x: number, z: number) => void }).__f10teleport =
      (x: number, z: number) => {
        playerPositionCmdRef.current = { x, y: sharedPlayerPositionRef.current.y, z };
      };
  });

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
    // Cartoon victory fanfare — the long-orphaned tada clip finally gets played.
    if (audioCtx && !muted) {
      playCartoonSfx(audioCtx, 'tada', { gain: 0.8, destination: cartoonBusRef.current ?? undefined });
      playArrivalDing(audioCtx);
    }
    scheduleTimeout(() => {
      playerPositionCmdRef.current = { x: 0, y: 0, z: -13, theta: Math.PI };
      setTeleportCutscene(false);
      setDoorsClosed(true);
      setDoorSoundTrigger((prev) => prev + 1);
      setNextElevatorDestination(4);            // beat the devil → up to Floor 4
      setZoomLevel(0);                          // the whole ride/transition is 1st person
      setElevatorTimer(20);
      setTravelPhase('closing');
      if (elevatorHumStopRef.current) elevatorHumStopRef.current();
      elevatorHumStopRef.current = createElevatorHum(audioCtx);
    }, 1400);
  }, [audioCtx, muted, scheduleTimeout]);

  // ── Leave the 2D Floor 4 (confirmed at its elevator). The hotel only goes
  // UP from here (Felipe: "pós o floor 4 não é pro player descer"): the
  // elevator always rides to Floor 5 — A CORRIDA, where TROCO-64 has been
  // waiting 412 days.
  const handleFloor4Exit = useCallback(() => {
    setGameState('outdoor');
    setNightMode(false);
    playerPositionCmdRef.current = { x: 0, y: 0, z: -13, theta: Math.PI };
    setDoorsClosed(true);
    setDoorSoundTrigger(prev => prev + 1);
    setNextElevatorDestination(5);
    setZoomLevel(0);
    setElevatorTimer(20);
    setTravelPhase('closing');
    if (elevatorHumStopRef.current) elevatorHumStopRef.current();
    elevatorHumStopRef.current = createElevatorHum(audioCtx);
  }, [audioCtx]);

  // ── Leave Floor 5 (the podium's ELEVADOR button): still going UP — the
  // ride continues to Floor 6, the fresh baseplate waiting to become a floor.
  const handleFloor5RaceExit = useCallback(() => {
    setGameState('outdoor');
    setNightMode(false);
    playerPositionCmdRef.current = { x: 0, y: 0, z: -13, theta: Math.PI };
    setDoorsClosed(true);
    setDoorSoundTrigger(prev => prev + 1);
    setNextElevatorDestination(6);
    setZoomLevel(0);
    setElevatorTimer(20);
    setTravelPhase('closing');
    if (elevatorHumStopRef.current) elevatorHumStopRef.current();
    elevatorHumStopRef.current = createElevatorHum(audioCtx);
  }, [audioCtx]);

  // ── Player SAVED the devil → BETRAYAL: he shoves the player off the ledge.
  // Instead of a full Game Over to the lobby (too punishing for the "nice"
  // choice), the player tumbles back to the START of Floor 3 and re-climbs —
  // no intro/meet cutscene replay, just a quick "you fell for it" sting.
  const respawnFloor3FromStart = useCallback(() => {
    setFallGameOver(true);            // brief "he tricked you → back to the start" card
    // 1930s cartoon "wah-wah" sad-trombone — you got played.
    if (!muted) playFloor3GameOver();
    scheduleTimeout(() => {
      f3Progress.fell = false;
      // Rebuild the climb from the very first platform (deterministic seed) and
      // drop the player back on the elevator landing — the start of the course.
      f3Reset();
      resetHazards();
      setBrushCount(0);
      f3PlayerZ.current = -8; f3PlayerY.current = 0;
      // theta = π olha para +Z, que é o sentido da escadaria — o mesmo da
      // chegada. Estava 0, que é olhar para DENTRO do elevador: quem levava o
      // empurrão do Diabrete renascia de costas para a subida.
      playerPositionCmdRef.current = { x: 0, y: 0, z: -8, theta: Math.PI };
      setCartoonFall(false);
      setFallBegging(false);
      setFallChoice('none');
      setCartoonIntro(false);         // NO intro/meet cutscene replay on respawn
      setCartoonCutscene(false);
      setFallGameOver(false);
    }, 2200);
  }, [muted, scheduleTimeout]);

  // Branch the defeat cutscene's outcome: stomp → Floor 4, save → betrayed,
  // shoved, and dropped back at the start of Floor 3.
  const handleFallOutcome = useCallback((outcome: 'save' | 'stomp') => {
    setFallBegging(false);
    if (outcome === 'stomp') advanceToFloor4AfterWin();
    else respawnFloor3FromStart();
  }, [advanceToFloor4AfterWin, respawnFloor3FromStart]);

  // Arm the sabotage-loop HUD callback while on Floor 3 (re-armed each entry).
  // The 3rd brush sets `fell`, which fires this and opens the defeat cutscene;
  // the cutscene's outcome (stomp→Floor 4, save→betrayed→restart) is the single path
  // that advances the floor — there's no separate win callback to double-fire.
  useEffect(() => {
    if (currentLevel !== 3) return;
    setOnProgress(() => { setBrushCount(f3Progress.brushes); if (f3Progress.fell) setCartoonFall(true); });
    return () => { setOnProgress(null); };
  }, [currentLevel]);

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
    if (!dialogueOpen && !barneyDialogueOpen && !f6UiOpen && !f8UiOpen && !npcChatOpen) return;
    moveInput.current = { x: 0, y: 0 };
    lookInput.current = { x: 0, y: 0 };
    keysRef.current = { w: false, a: false, s: false, d: false };
    activePointers.current.clear();
    prevPinchDist.current = null;
    setJoystickVisual(p => ({ ...p, active: false }));
  }, [dialogueOpen, barneyDialogueOpen, diverDialogueOpen, f6UiOpen, f8UiOpen, npcChatOpen]);

  useEffect(() => {
    if (!dialogueOpen && !barneyDialogueOpen && !diverDialogueOpen) return;
    if (elevatorTimer !== null && elevatorTimer > 0 && !doorsClosed) {
      setElevatorTimer(null);
      setTravelPhase('idle');
    }
  }, [dialogueOpen, barneyDialogueOpen, diverDialogueOpen]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!hasStarted) return;
    if (isDesktop) { if (document.pointerLockElement !== document.body && !dialogueOpen && !barneyDialogueOpen && !shopOpen && !diverDialogueOpen && !f6UiOpen && !f8UiOpen && !npcChatOpen) { const req = document.body.requestPointerLock() as unknown as Promise<void> | undefined; if (req && typeof (req as any).catch === 'function') (req as Promise<void>).catch(() => {}); } return; }
    if (dialogueOpen || barneyDialogueOpen || shopOpen || diverDialogueOpen || f6UiOpen || f8UiOpen || npcChatOpen) return;
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
          // Floors 2/3/4 (and the ride up to 4) lock the camera in 1st person — ignore pinch zoom there.
          /* pinch-zoom disabled — first-person only (third person removed permanently) */
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
    if (dialogueOpen || barneyDialogueOpen || shopOpen || diverDialogueOpen || f6UiOpen || f8UiOpen || npcChatOpen) { document.exitPointerLock(); return; }
    const upd = () => { const k = keysRef.current; let x=0, y=0; if (k.w) y-=1; if (k.s) y+=1; if (k.a) x-=1; if (k.d) x+=1; moveInput.current.x=x; moveInput.current.y=y; };
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (shopOpen) { handleCloseShop(); return; }
        setSettingsOpen((v) => !v);
        return;
      }
      if (dialogueOpen || barneyDialogueOpen || shopOpen || diverDialogueOpen || f6UiOpen || f8UiOpen || npcChatOpen) return;
      const k = keysRef.current;
      switch(e.key.toLowerCase()) {
        case 'w': k.w=true; break;
        case 'a': k.a=true; break;
        case 's': k.s=true; break;
        case 'd': k.d=true; break;
        case 'f': if (inventoryRef.current.flashlight.owned) handleToggleFlashlight(); break;
        case 'n': if (inventoryRef.current.nightVision.owned) toggleNightVision(); break;
        case ' ':
          if (currentLevel === 3 || currentLevel === 11) { jumpRef.current = true; e.preventDefault(); }
          else if (currentLevel === 9 && f9.phase === 'explorar') { f9RequestPounce(); e.preventDefault(); } // M20: o BOTE
          break;
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
  }, [isDesktop, hasStarted, currentLevel, dialogueOpen, barneyDialogueOpen, shopOpen, diverDialogueOpen, canInteractNPC, canInteractCashier, canInteractDoor, houseDoorOpen, canSleepNow, gameState]);

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
    <div className="w-full h-full relative overflow-hidden select-none" style={{ touchAction: 'none', backgroundColor: '#000' }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onPointerLeave={handlePointerUp} onWheel={() => { /* scroll-zoom disabled — first-person only (third person removed permanently) */ }}>
      <LiminalAudioEngine doorTrigger={doorSoundTrigger} audioContext={audioCtx} muted={muted || shopOpen} masterVolume={settings.masterVolume} nightMode={nightMode} gameState={gameState} currentLevel={currentLevel} doorsClosed={doorsClosed} busRef={cartoonBusRef} />
      <div className="absolute inset-0 z-30 bg-black pointer-events-none transition-opacity duration-1000 ease-in-out" style={{ opacity: overlayOpacity }} />
      {cameraShake && <div className="absolute inset-0 z-20 pointer-events-none traveling-vignette" />}
      <CanvasErrorBoundary>
      <Canvas
        // O Andar 8 abre um segundo Canvas ortográfico para corredor/memórias.
        // Manter o mundo FPS animando por trás dobrava o custo (Player, braços,
        // multiplayer e efeitos continuavam em useFrame embora invisíveis).
        // O Andar 8 fica totalmente coberto e pode usar `never`. No chat do 10º
        // o cenário precisa continuar visível: `demand` desenha sob demanda,
        // preservando o fundo sem manter 60 FPS competindo com o LLM.
        frameloop={f8InImage ? 'never' : ((currentLevel === 10 && npcChatOpen) ? 'demand' : 'always')}
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
        <Floor10ChatBackdropFrame active={currentLevel === 10 && npcChatOpen} />
        {/* PerformanceMonitor watches the frame rate. When it sees sustained
            slowdowns it calls onDecline → we drop dpr a notch. AdaptiveDpr
            wires that up to the renderer automatically. Keeps the game
            playable on weaker phones without us having to detect anything. */}
        <PerformanceMonitor
          onDecline={() => { if (typeof window !== 'undefined') (window as any).__lowPerf = true; }}
          onIncline={() => { if (typeof window !== 'undefined') (window as any).__lowPerf = false; }}
          flipflops={3}
        />
        {/* Riding up to Floor 4, the last 10s of the 20s trip gradually collapse
            the 3D render into 2D pixels (Pixelate3DRamp). It REPLACES AdaptiveDpr
            while active so the two never fight over the dpr; when the doors open
            (doorsClosed flips) AdaptiveDpr remounts and restores it. */}
        {(currentLevel === 4 && doorsClosed && elevatorTimer !== null && elevatorTimer <= 10)
          ? <Pixelate3DRamp timer={elevatorTimer} />
          : <AdaptiveDpr pixelated />}
        <AdaptivePerfProbe />
        <Suspense fallback={<Html center><div className="px-5 py-3 rounded-xl bg-black/90 ring-1 ring-amber-500/30 backdrop-blur-xl text-center"><div className="text-amber-400 text-xs font-medium tracking-[0.3em] uppercase mb-1.5">The Normal Elevator</div><div className="flex items-center justify-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /><div className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-pulse" style={{animationDelay:'0.2s'}} /><div className="w-1.5 h-1.5 rounded-full bg-amber-400/30 animate-pulse" style={{animationDelay:'0.4s'}} /></div></div></Html>}>
            <World timer={elevatorTimer} doorsClosed={doorsClosed} level={currentLevel} houseDoorOpen={houseDoorOpen} npcPositionRef={npcPositionRef} isPaused={dialogueOpen || barneyDialogueOpen || shopOpen || diverDialogueOpen || cartoonCutscene || cartoonFall} playerPositionRef={sharedPlayerPositionRef} gameState={gameState} barneyRef={barneyRef} barneyTargetRef={barneyTargetRef} nightMode={nightMode} doorOpenAmount={doorOpenAmount} profile={QUALITY_PROFILES[settings.quality]} collectedShards={collectedShards} onCollectShard={handleCollectShard} diverPhase={diverPhase} diverBeatRef={diverBeatRef} nightVisionActive={inventory.nightVision.owned && inventory.nightVision.active} monsterPositionRef={monsterPositionRef} monsterProximityRef={monsterProximityRef} berserk={berserk} cameraShakeRef={cameraShakeRef} floor3Hands={!cartoonIntro && !cartoonCutscene} floor3Gloves={!cartoonIntro && !cartoonCutscene && !cartoonFall} floor3FallActive={cartoonFall} f6CabDead={f6CabDead} f8InImage={f8InImage} onPlayerCaught={() => {
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
            {/* Andar 7 — the pirate ship, 100% driven by the WASM (C + assembly)
                brain. Mounted here (not in World) so it gets the Floor7 handle. */}
            {currentLevel === 7 && <Floor7Environment playerPositionRef={sharedPlayerPositionRef} handleRef={floor7Handle} captainAnchorRef={captainAnchorRef} introElevFadeRef={f7ElevFadeRef} introLaughRef={f7LaughRef} introPoseRef={f7PoseRef} introTalkRef={f7TalkRef} introHideSailsRef={f7HideSailsRef} introLegsRef={f7LegsRef} />}
            {/* Andar 7 finale: once the player boards the returned cab, mount the
                global elevator interior around them for the ride home (the World
                memo suppresses it on level 7 for the "elevator is gone" gag). */}
            {currentLevel === 7 && f7Boarded && <ElevatorInterior timer={elevatorTimer} doorsClosed={doorsClosed} level={currentLevel} />}
            {/* RemotePlayers receive only id + the multiplayer data ref. Position
                updates flow through the ref + useFrame, so the React tree no
                longer re-renders every 200ms. The id list only changes when a
                player joins or leaves. */}
            {visibleRemotePlayerIds.map(id => (
                <RemotePlayer key={id} id={id} dataRef={otherPlayersDataRef} chatBubbles3D={QUALITY_PROFILES[settings.quality].chatBubbles3D} />
            ))}
            {hasStarted && <AgenteCompanheiro level={currentLevel} doorsClosed={doorsClosed} houseDoorOpen={houseDoorOpen} paused={settingsOpen || dialogueOpen || barneyDialogueOpen || shopOpen || diverDialogueOpen || cartoonCutscene || cartoonFall || f6UiOpen || f8UiOpen || npcChatOpen} playerPositionRef={sharedPlayerPositionRef} />}
            <Player active={hasStarted && !photo.progress.active} moveInput={moveInput} lookInput={lookInput} isDesktop={isDesktop} onEnterElevator={handlePlayerEnterElevator} doorsClosed={doorsClosed} currentLevel={currentLevel} onInteractionUpdate={handleInteractionUpdate} onNpcInteractionUpdate={handleNpcInteractionUpdate} onCashierInteractionUpdate={handleCashierInteractionUpdate} houseDoorOpen={houseDoorOpen} zoomLevel={zoomLevel} npcPositionRef={npcPositionRef} dialogueTargetRef={(currentLevel === 7 && captainGreeting) ? captainAnchorRef : (cartoonFall ? f3DevilPos : (cartoonCutscene ? cutsceneTargetRef : ((diverDialogueOpen || diverPhase === 'fading') ? diverPositionRef : (barneyDialogueOpen ? barneyRef : npcPositionRef))))} dialogueTallNpc={currentLevel === 7 && captainGreeting} dialogueOpen={dialogueOpen || barneyDialogueOpen || shopOpen || diverDialogueOpen || rebreather3DActive || diverPhase === 'fading' || diveBlackActive || cartoonCutscene || cartoonFall || f6UiOpen || f8UiOpen || npcChatOpen || (currentLevel === 7 && (captainGreeting || f7Intro))} sharedPositionRef={sharedPlayerPositionRef} sharedRotationYRef={sharedRotationYRef} cameraThetaRef={cameraThetaRef} cameraShakeRef={cameraShakeRef} diverBeatRef={diverBeatRef} positionCmdRef={playerPositionCmdRef} onElevatorZoneChange={handleElevatorZoneChange} pickupTrigger={pickupTrigger} pickupItem={pickupItem} armExtended={inventory.flashlight.owned && inventory.flashlight.active} onRightHandAnchor={handleRightHandAnchor} sprintHeldRef={sprintHeldRef} staminaRef={staminaRef} jumpRef={jumpRef} />
            {/* Andar 8: direção de câmera do interrogatório/despertar/arremesso —
                montada DEPOIS do <Player> pra sobrescrever a câmera por frame. */}
            {hasStarted && currentLevel === 8 && (
                <Floor8Cutscene playerPositionRef={sharedPlayerPositionRef} />
            )}
            {/* Andar 9: o FIAPO (player-bicho, 3ª pessoa) + a QUEDA pela copa.
                Ordem importa: Fiapo depois do Player (rouba a câmera), cutscene
                por último (a queda ganha de todo mundo). */}
            {hasStarted && currentLevel === 9 && (
                <Fiapo playerPositionRef={sharedPlayerPositionRef} cameraThetaRef={cameraThetaRef} />
            )}
            {hasStarted && currentLevel === 9 && <Floor9Cutscene />}
            {/* Andar 7 captain-arrival cutscene — mounted AFTER <Player> so its
                priority-0 useFrame overwrites the player camera while it runs. */}
            {currentLevel === 7 && f7Intro && (
                <Floor7IntroCutscene
                    active={f7Intro}
                    captainAnchorRef={captainAnchorRef}
                    playerPositionRef={sharedPlayerPositionRef}
                    elevFadeRef={f7ElevFadeRef}
                    laughRef={f7LaughRef}
                    poseRef={f7PoseRef}
                    talkRef={f7TalkRef}
                    hideSailsRef={f7HideSailsRef}
                    legsRef={f7LegsRef}
                    dimRef={f7DimRef}
                    onBeat={setF7IntroBeat}
                    onLine={setF7IntroLine}
                    onStep={f7BootClomp}
                    onElevatorVanish={f7ElevatorVanish}
                    onLaugh={f7CaptainLaugh}
                    onDone={endF7Intro}
                />
            )}
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
                  currentLevel={currentLevel}
                  armExtended={inventory.flashlight.owned && inventory.flashlight.active}
                  pickupTrigger={pickupTrigger}
                  pickupItem={pickupItem}
                  active={hasStarted}
                  flashlightActive={inventory.flashlight.active}
                  flashlightOwned={inventory.flashlight.owned}
                  cutsceneActive={(currentLevel === 7 && (f7Intro || captainGreeting || f7Settling)) || cartoonCutscene || cartoonFall || rebreather3DActive || diverPhase === 'fading'}
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
                    onDone={() => {
                        // O cartão de título não trava o andador: quem segura
                        // para a frente durante a íris sai da cabine e vai
                        // parar lá na escadaria, e aí a câmera de diálogo
                        // enquadra o Diabrete DE COSTAS, por trás dele. Em vez
                        // de mexer no input (que mexeria no pointer lock), a
                        // cutscene começa sempre do lugar de onde ela foi
                        // encenada — o mesmo teleporte da chegada.
                        playerPositionCmdRef.current = { x: 0, y: 0, z: -13, theta: Math.PI };
                        setCartoonIntro(false); setCutsceneLine(0); setCartoonCutscene(true);
                    }}
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
        {/* Photo mode takes over the render loop, so the raster post stack is
            disabled while it accumulates samples. */}
        {/* o andar 9 tem composer próprio (F9PostEffects) — sem duplicar aqui */}
        {hasStarted && !photo.progress.active && currentLevel !== 9 && (settings.quality === 'high' || currentLevel === 3 || currentLevel === 7) && (
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
                {(settings.quality === 'high' || currentLevel === 7) && (
                <Bloom
                    intensity={currentLevel === 2 ? 0.45 : currentLevel === 3 ? 0.22 : currentLevel === 7 ? 0.38 : 0.35}
                    luminanceThreshold={currentLevel === 2 ? 0.72 : currentLevel === 7 ? 0.85 : 0.95}
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
                {/* O Andar 3 tem vinheta própria logo abaixo, em TODA
                    qualidade — ela é parte do grade de película, não polimento
                    opcional. Aqui ele fica de fora para não somarem duas. */}
                {settings.quality === 'high' && currentLevel !== 3 && (
                <Vignette
                    eskil={false}
                    offset={currentLevel === 2 ? 0.32 : 0.2}
                    darkness={currentLevel === 2 ? 0.78 : 0.3}
                />
                )}
                {/* ── ANDAR 3: A CÓPIA DE 1930 ──────────────────────────────
                    Dessatura quase tudo, tinge de sépia e ENTINTA: o andar
                    inteiro é desenhado com contorno preto, e num grade lavado
                    o preto vira cinza e a direção de arte inteira se perde.
                    Medido olhando (bancada `olhar-o-andar-3.mjs`): com
                    contraste 0,18 e brilho +0,02 a cena saía estourada e as
                    linhas de tinta sumiam no creme.

                    E o que faltava para virar PELÍCULA e não só "foto velha"
                    era o grão. Ele é o efeito mais barato da pilha e o que mais
                    entrega — por isso roda em toda qualidade, junto com o
                    grade, e não só no `high`. `GRADE_F3` fica aqui em cima
                    justamente para o dono do jogo poder mexer num número. */}
                {currentLevel === 3 && <HueSaturation saturation={GRADE_F3.saturacao} />}
                {currentLevel === 3 && <Sepia intensity={GRADE_F3.sepia} />}
                {currentLevel === 3 && (
                    <BrightnessContrast brightness={GRADE_F3.brilho} contrast={GRADE_F3.contraste} />
                )}
                {currentLevel === 3 && (
                    <Noise opacity={GRADE_F3.grao} premultiply />
                )}
                {currentLevel === 3 && (
                    <Vignette eskil={false} offset={GRADE_F3.vinhetaInicio} darkness={GRADE_F3.vinheta} />
                )}
            </EffectComposer>
        )}
        {/* Photo mode — path-traces the frozen view when active (inert otherwise). */}
        <PhotoModeRig active={photo.progress.active} onSample={photo.onSample} onFailed={photo.onFailed} />
      </Canvas>
      </CanvasErrorBoundary>
      {hasStarted && QUALITY_PROFILES[settings.quality].overlay && (
          <GameEffects nightMode={nightMode} gameState={gameState} currentLevel={currentLevel} quality={settings.quality} dangerRef={barneyDistRef} />
      )}
      {/* Photo mode (GPU path tracer) — activator + overlay. Offered on the
          photographic PBR floors (lobby, house, hotel suite) only; the toon /
          underwater / 2D floors don't path-trace cleanly. */}
      {hasStarted && !photo.progress.active && !doorsClosed && [0, 1, 6].includes(currentLevel) && (
          <PhotoModeButton onClick={photo.open} />
      )}
      <PhotoModeOverlay progress={photo.progress} onClose={photo.close} />
      {/* Andar 7 (pirate ship) — captain dialogue + cleaning HUD + interact button */}
      {hasStarted && currentLevel === 7 && !f7Intro && !f7Boarded && <Floor7Overlay handleRef={floor7Handle} onGreeting={setCaptainGreeting} onBoard={handleF7Board} />}
      {hasStarted && currentLevel === 7 && f7Intro && <Floor7IntroUI beat={f7IntroBeat} line={f7IntroLine} dimRef={f7DimRef} onSkip={endF7Intro} />}
      {/* Empty lobby atmospheric touches — thuds, flickers, wall text */}
      {hasStarted && currentLevel === 0 && gameState === 'lobby' && (
          <EmptyLobbyAmbience playerCount={otherPlayerIds.length} />
      )}
      {/* Easter egg: "Someone is watching" — random creepy text in corner */}
      {hasStarted && currentLevel === 0 && gameState === 'lobby' && (
          <WatchingText />
      )}
      {/* The 2.5D Floor 8 owns its own opaque loading/cinematic surface. The
          global drei loader also tracks unrelated hotel textures and could sit
          over the YOURSELF reveal while one of those remote files timed out. */}
      {!f8InImage && <Loader />}
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
      {/* Diabrete's conversation + (at the end) the choice: SALVAR (→ betrayed,
          shoved, back to the start of Floor 3) or PISAR (→ Floor 4) */}
      {cartoonFall && fallBegging && fallChoice === 'none' && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: '12%', zIndex: 88,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          fontFamily: "'Luckiest Guy', system-ui, sans-serif", pointerEvents: 'none' }}>
          {/* speaker name tab */}
          <div key={'tab' + fallLine} style={{ alignSelf: 'center', transform: 'rotate(-2deg)',
            background: FALL_DIALOGUE[fallLine].s === 'diabrete' ? '#c0271a' : '#2b6fb0', color: '#fff',
            WebkitTextStroke: '2px #140c08', paintOrder: 'stroke', padding: '2px 16px',
            fontSize: 'min(3.4vw,20px)', letterSpacing: '.06em', borderRadius: 8,
            boxShadow: '0 3px 0 #140c08', marginBottom: -10, zIndex: 1 }}>
            {FALL_DIALOGUE[fallLine].s === 'diabrete' ? 'O DIABRETE' : 'VOCÊ'}
          </div>
          {/* speech bubble — the conversation line */}
          <div key={fallLine} style={{ maxWidth: 'min(84vw, 560px)', background: '#f6efe0', color: '#140c08',
            border: '4px solid #140c08', borderRadius: 20, padding: '14px 24px',
            fontSize: 'min(4vw,24px)', lineHeight: 1.18, textAlign: 'center',
            boxShadow: '0 6px 0 #140c08', transform: 'rotate(-1deg)',
            animation: 'f3fall-ko .35s cubic-bezier(.2,1.5,.4,1) both' }}>
            {FALL_DIALOGUE[fallLine].t}
          </div>
          {/* choice buttons — only once the conversation reaches its end */}
          {fallChoiceReady && (
          <div style={{ display: 'flex', gap: 16, pointerEvents: 'auto', marginTop: 6,
            animation: 'f3fall-ko .35s cubic-bezier(.2,1.5,.4,1) both' }}>
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
          )}
        </div>
      )}
      {/* FLOOR 4 — the real 2D side-scroller, its own orthographic canvas over
          the 3D game (Felipe: Floor 4 is literally 2D). Walk left into the
          elevator to ride back down. */}
      {/* 3D→2D ride: cinematic black bars close in while the world pixelates
          (mounted one tick early at height 0 so the CSS transition can run). */}
      {currentLevel === 4 && doorsClosed && elevatorTimer !== null && elevatorTimer <= 11 && (
        <>
          <div className="absolute left-0 right-0 top-0 z-30 bg-black pointer-events-none"
            style={{ height: `${((10 - Math.min(elevatorTimer, 10)) / 10) * 11}vh`, transition: 'height 1.15s linear' }} />
          <div className="absolute left-0 right-0 bottom-0 z-30 bg-black pointer-events-none"
            style={{ height: `${((10 - Math.min(elevatorTimer, 10)) / 10) * 11}vh`, transition: 'height 1.15s linear' }} />
        </>
      )}
      {/* Floor 4 (2D) mounts only when the elevator DOORS OPEN — the player rides
          the full 20s inside the 3D elevator (the 3D side pixelates from T-10s),
          then arrives inside the 2D elevator, whose doors slide open. */}
      {currentLevel === 4 && !doorsClosed && <Floor4Canvas2D onExit={handleFloor4Exit} />}
      {currentLevel === 5 && !doorsClosed && <Floor5Race3D onExit={handleFloor5RaceExit} />}
      {hasStarted && currentLevel === 6 && !doorsClosed && (
        <Floor6Overlay playerPositionRef={sharedPlayerPositionRef} onUiOpenChange={handleF6UiOpenChange} onLeave={handleF6Leave} />
      )}
      {/* Andar 8 — o interrogatório do Arquivista (caixa de diálogo) */}
      {hasStarted && currentLevel === 8 && !doorsClosed && (
        <Floor8Overlay onUiOpenChange={handleF8UiOpenChange} onLeave={handleF8Thrown} />
      )}
      {hasStarted && currentLevel === 9 && (
        <Floor9Overlay onUiOpenChange={handleF8UiOpenChange} playerPositionRef={sharedPlayerPositionRef} cameraThetaRef={cameraThetaRef} onComplete={handleF9Complete} />
      )}
      {/* Andar 8 — a volta: acorda no elevador "subindo pro 9", com o fio vermelho
          (self-gate na fase leave; fica de pé durante o doorsClosed do trânsito) */}
      {hasStarted && currentLevel === 8 && <Floor8Ride />}
      {/* Andar 8 — DENTRO da imagem: o corredor de 20 portas + a porta 21
          (self-gate por fase; cobre a tela durante corredor20/porta21/platformer) */}
      {hasStarted && currentLevel === 8 && <Floor8Image />}
      {/* Andar 8 — DENTRO da porta 21: o platformer 2.5D de tricô (self-gate por fase) */}
      {hasStarted && currentLevel === 8 && <Floor8Platformer />}
      {hasStarted && currentLevel === 11 && <Floor11Controls />}
      {/* Andar 10 — UI de conversa com o NPC (LLM). Overlay DOM fora do Canvas. */}
      {hasStarted && currentLevel === 10 && <Floor10NpcChat />}

      {/* BETRAYED — the devil shoved you off; you tumble back to the start */}
      {fallGameOver && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 95, background: '#0a0712',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18,
          fontFamily: "'Luckiest Guy', system-ui, sans-serif", pointerEvents: 'none',
          animation: 'f3go-in .5s ease-out both' }}>
          <style>{`@keyframes f3go-in{from{opacity:0}to{opacity:1}}
            @keyframes f3go-pop{0%{transform:scale(0) rotate(-8deg)}65%{transform:scale(1.15) rotate(3deg)}100%{transform:scale(1) rotate(-2deg)}}`}</style>
          <div style={{ fontSize: 'min(15vw,110px)', color: '#c0271a', WebkitTextStroke: 'min(1vw,7px) #f6efe0',
            paintOrder: 'stroke', letterSpacing: '.04em', animation: 'f3go-pop .5s cubic-bezier(.2,1.5,.4,1) both' }}>
            ENGANADO!
          </div>
          <div style={{ fontSize: 'min(4.6vw,26px)', color: '#f6efe0', letterSpacing: '.06em', textAlign: 'center', padding: '0 24px' }}>
            Você caiu na conversa do Diabrete… e lá pro começo da escadaria.
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

      {/* M20: BOTE button — Andar 9, mobile, durante o explorar. É o botão que
          FALTAVA pra caçar (o player não tinha como pegar presa). Desktop: Espaço. */}
      {hasStarted && currentLevel === 9 && !isDesktop && f9.phase === 'explorar' && (
        <button
          aria-label="Dar o bote"
          className="fixed z-[45] right-[calc(env(safe-area-inset-right,0px)+18px)] bottom-[calc(env(safe-area-inset-bottom,0px)+26px)] w-24 h-24 rounded-full flex flex-col items-center justify-center select-none touch-none active:scale-90 transition-transform"
          style={{
            background: 'radial-gradient(circle at 50% 32%, #e8917a, #8a3020)',
            boxShadow: '0 6px 0 #4a1a12, 0 0 0 4px #241410, 0 10px 20px rgba(0,0,0,0.5)',
            border: '3px solid #241410',
          }}
          onPointerDown={(e) => { e.stopPropagation(); f9RequestPounce(); }}
        >
          <svg viewBox="0 0 24 24" className="w-9 h-9" fill="#fff2e8" stroke="#241410" strokeWidth={1.5} strokeLinejoin="round">
            {/* uma pata com garras (o bote) */}
            <path d="M12 3c1 0 1.6 1 1.6 2.4S13 8 12 8s-1.6-1.2-1.6-2.6S11 3 12 3zM6.5 5.2c.9.3 1.2 1.5.8 2.8s-1.4 2-2.3 1.7-1.2-1.5-.8-2.8 1.4-2 2.3-1.7zM17.5 5.2c.9-.3 1.9.4 2.3 1.7s0 2.5-.8 2.8-1.9-.4-2.3-1.7 0-2.5.8-2.8zM12 9.5c3 0 5.2 2 5.2 4.3 0 2-1.6 3.2-3.4 3.2-.8 0-1.2-.3-1.8-.3s-1 .3-1.8.3c-1.8 0-3.4-1.2-3.4-3.2C6.8 11.5 9 9.5 12 9.5z" />
          </svg>
          <span style={{ color: '#fff2e8', fontSize: 12, letterSpacing: 1.5, textShadow: '1.5px 1.5px 0 #241410' }}>BOTE</span>
        </button>
      )}

      {/* Jump button — Floor 3 only, mobile only. Desktop uses Space. */}
      {hasStarted && (currentLevel === 3 || currentLevel === 11) && !isDesktop && (
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
