import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Central game state machine.
 * Manages: lobby → outdoor → barney_greet → indoor_day → sleep → indoor_night → chase → caught/saved
 */
export function useGameState() {
  const [gameState, setGameState] = useState('lobby');
  const [currentLevel, setCurrentLevel] = useState(0);
  const [elevatorTimer, setElevatorTimer] = useState<any>(null);
  const [doorsClosed, setDoorsClosed] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [houseDoorOpen, setHouseDoorOpen] = useState(false);
  const [doorOpenAmount, setDoorOpenAmount] = useState(0);
  const [overlayOpacity, setOverlayOpacity] = useState(0);
  const [travelPhase, setTravelPhase] = useState('idle');
  const [floorReveal, setFloorReveal] = useState(false);
  const [cameraShake, setCameraShake] = useState(false);
  const [arrivalPulse, setArrivalPulse] = useState(false);
  const [insideElevator, setInsideElevator] = useState(false);

  // Barney state
  const [barneyDialogueOpen, setBarneyDialogueOpen] = useState(false);
  const [barneyDialogueNode, setBarneyDialogueNode] = useState('greet');
  const barneyRef = useRef<any>(null);
  const barneyTargetRef = useRef({ x: 0, z: 6.8, scale: 0 });

  // Sleep state
  const [canSleep, setCanSleep] = useState(false);
  const [canSleepNow, setCanSleepNow] = useState(false);
  const [sleepFadeOpacity, setSleepFadeOpacity] = useState(0);
  const [jumpscare, setJumpscare] = useState(false);

  const lastHandledTimerRef = useRef<number | null>(null);
  const scheduleTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    return id;
  }, []);

  return {
    // State
    gameState, setGameState,
    currentLevel, setCurrentLevel,
    elevatorTimer, setElevatorTimer,
    doorsClosed, setDoorsClosed,
    nightMode, setNightMode,
    houseDoorOpen, setHouseDoorOpen,
    doorOpenAmount, setDoorOpenAmount,
    overlayOpacity, setOverlayOpacity,
    travelPhase, setTravelPhase,
    floorReveal, setFloorReveal,
    cameraShake, setCameraShake,
    arrivalPulse, setArrivalPulse,
    insideElevator, setInsideElevator,
    // Barney
    barneyDialogueOpen, setBarneyDialogueOpen,
    barneyDialogueNode, setBarneyDialogueNode,
    barneyRef,
    barneyTargetRef,
    // Sleep
    canSleep, setCanSleep,
    canSleepNow, setCanSleepNow,
    sleepFadeOpacity, setSleepFadeOpacity,
    jumpscare, setJumpscare,
    // Refs
    lastHandledTimerRef,
    scheduleTimeout,
  };
}
