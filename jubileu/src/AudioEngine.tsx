import React, { useState, useEffect, useRef } from 'react';

export const LiminalAudioEngine = ({ doorTrigger, audioContext, muted, nightMode, gameState, currentLevel = 0, doorsClosed = false, masterVolume = 1 }: any) => {
  const lobbyGainRef = useRef<any>(null);
  const elevatorGainRef = useRef<any>(null);
  const masterGainRef = useRef<any>(null);
  const lobbyReadyRef = useRef(false);
  const sourceRef = useRef<any>(null);
  const elevatorSourceRef = useRef<any>(null);
  const elevatorBufferRef = useRef<any>(null);
  const barneySourceRef = useRef<any>(null);
  const barneyBufferRef = useRef<any>(null);
  const barneyGainRef = useRef<any>(null);
  const barneyFilterRef = useRef<any>(null);
  const crossfadeRef = useRef({ active: false, startTime: 0, duration: 3.0, from: 'lobby', to: 'elevator' });
  const tracksRef = useRef({
      lobby: { active: true, volume: 1.0, nextNoteTime: 0, beatCount: 0 },
      elevator: { active: false, volume: 0.0, nextNoteTime: 0, beatCount: 0 }
  });
  const distortModeRef = useRef(false);
  const schedulerTimerRef = useRef<any>(null);

  useEffect(() => { distortModeRef.current = !!nightMode; }, [nightMode]);

  const setupReverb = (ctx: AudioContext, destination: AudioNode) => {
      const convolver = ctx.createConvolver();
      const length = ctx.sampleRate * 1.5;
      const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let i = 0; i < length; i++) {
          const n = i / length;
          const env = Math.pow(1 - n, 3.0);
          impulse.getChannelData(0)[i] = (Math.random() * 2 - 1) * env;
          impulse.getChannelData(1)[i] = (Math.random() * 2 - 1) * env;
      }
      convolver.buffer = impulse;
      const wetGain = ctx.createGain(); wetGain.gain.value = 0.08;
      const dryGain = ctx.createGain(); dryGain.gain.value = 1.0; 
      const input = ctx.createGain();
      input.connect(convolver); convolver.connect(wetGain); input.connect(dryGain);
      wetGain.connect(destination); dryGain.connect(destination);
      return input;
  };

  const playDoorCloseSound = (ctx: AudioContext, dest: AudioNode) => {
      const t = ctx.currentTime;
      const dingOsc = ctx.createOscillator(); dingOsc.frequency.setValueAtTime(784, t);
      const dingGain = ctx.createGain(); dingGain.gain.setValueAtTime(0.1, t); dingGain.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
      dingOsc.connect(dingGain); dingGain.connect(dest); dingOsc.start(t); dingOsc.stop(t + 2.0);
      const motorOsc = ctx.createOscillator(); motorOsc.type = 'sawtooth'; motorOsc.frequency.setValueAtTime(50, t + 0.2); motorOsc.frequency.linearRampToValueAtTime(40, t + 1.2);
      const motorGain = ctx.createGain(); motorGain.gain.setValueAtTime(0, t + 0.2); motorGain.gain.linearRampToValueAtTime(0.05, t + 0.3); motorGain.gain.linearRampToValueAtTime(0, t + 1.2);
      const motorFilter = ctx.createBiquadFilter(); motorFilter.type = 'lowpass'; motorFilter.frequency.value = 200;
      motorOsc.connect(motorFilter); motorFilter.connect(motorGain); motorGain.connect(dest); motorOsc.start(t + 0.2); motorOsc.stop(t + 1.2);
      const thudOsc = ctx.createOscillator(); thudOsc.type = 'sine'; thudOsc.frequency.setValueAtTime(60, t + 1.1); thudOsc.frequency.exponentialRampToValueAtTime(20, t + 1.3);
      const thudGain = ctx.createGain(); thudGain.gain.setValueAtTime(0, t + 1.1); thudGain.gain.linearRampToValueAtTime(0.2, t + 1.15); thudGain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      thudOsc.connect(thudGain); thudGain.connect(dest); thudOsc.start(t + 1.1); thudOsc.stop(t + 1.4);
  };
  
  useEffect(() => {
      if (masterGainRef.current && audioContext) {
          const target = muted ? 0 : Math.max(0, Math.min(1, masterVolume));
          masterGainRef.current.gain.setTargetAtTime(target, audioContext.currentTime, 0.1);
      }
  }, [muted, audioContext, masterVolume]);

  useEffect(() => {
     if (doorTrigger > 0 && audioContext && masterGainRef.current) {
         playDoorCloseSound(audioContext, masterGainRef.current);
         const now = audioContext.currentTime;
         crossfadeRef.current = { active: true, startTime: now, duration: 3.0, from: 'lobby', to: 'elevator' };
         tracksRef.current.elevator.active = true; tracksRef.current.elevator.volume = 0; tracksRef.current.elevator.nextNoteTime = now; tracksRef.current.elevator.beatCount = 0;
     }
  }, [doorTrigger, audioContext]);

  // Stop elevator transition music when the player arrives at a destination
  // (doors open after having been closed). Drives off `doorsClosed` so it
  // works in BOTH directions:
  //   lobby -> Barney floor: elevator stops, Barney theme takes over
  //   Barney floor -> lobby: elevator stops, lobby music crossfades back in
  // Setting elevator.volume=0 lets the scheduler's setTargetAtTime ramp the
  // gain down (~150ms); active=false after 300ms tears down the buffer source
  // via the existing path (scheduler).
  useEffect(() => {
     if (!audioContext) return;
     if (doorsClosed) return; // doors closed means we're either at start or in transit — keep elevator music
     if (!tracksRef.current.elevator.active) return;
     tracksRef.current.elevator.volume = 0;
     // Coming back to the lobby — bring lobby music back too.
     if (currentLevel === 0) {
         tracksRef.current.lobby.active = true;
         tracksRef.current.lobby.volume = 1.0;
     }
     const t = setTimeout(() => {
         tracksRef.current.elevator.active = false;
     }, 300);
     return () => clearTimeout(t);
  }, [doorsClosed, currentLevel, audioContext]);

  const schedulerRef = useRef<any>(null);
  schedulerRef.current = () => {
      const ctx = audioContext; if (!ctx) return;
      const now = ctx.currentTime;

      if (crossfadeRef.current.active) {
           const { startTime, duration, from, to } = crossfadeRef.current;
           const elapsed = now - startTime;
           if (elapsed >= duration) { tracksRef.current[from as keyof typeof tracksRef.current].active = false; tracksRef.current[from as keyof typeof tracksRef.current].volume = 0; tracksRef.current[to as keyof typeof tracksRef.current].volume = 1; crossfadeRef.current.active = false; }
           else { const t = elapsed / duration; tracksRef.current[from as keyof typeof tracksRef.current].volume = 1 - t; tracksRef.current[to as keyof typeof tracksRef.current].volume = t; }
      }
      if (lobbyGainRef.current) lobbyGainRef.current.gain.setTargetAtTime(tracksRef.current.lobby.volume, now, 0.05);
      if (elevatorGainRef.current) elevatorGainRef.current.gain.setTargetAtTime(tracksRef.current.elevator.volume, now, 0.05);
      
      const elevatorTrack = tracksRef.current.elevator;
      // Barney theme is the ambient music for the whole Barney floor (level 1):
      // outdoor + barney_greet + indoor_day + indoor_night + chase + caught + saved.
      // Distortion is gated separately on nightMode (only during the chase
      // sequence), so the early states still hear the clean theme.
      const barneyFloor = currentLevel === 1;
      if (barneyGainRef.current) {
          barneyGainRef.current.gain.setTargetAtTime(barneyFloor ? 0.7 : 0, now, 0.3);
      }
      
      // Elevator transition music — plays during normal elevator rides
      if (elevatorTrack.active && !elevatorSourceRef.current && elevatorBufferRef.current && elevatorGainRef.current) {
          const src = ctx.createBufferSource();
          src.buffer = elevatorBufferRef.current;
          src.loop = true;
          src.connect(elevatorGainRef.current);
          src.start(0);
          elevatorSourceRef.current = src;
      }
      if (!elevatorTrack.active && elevatorSourceRef.current) {
          try { elevatorSourceRef.current.stop(); } catch(e) {}
          try { elevatorSourceRef.current.disconnect(); } catch(e) {}
          elevatorSourceRef.current = null;
      }

      // Barney theme — starts on Barney's floor
      if (barneyFloor && !barneySourceRef.current && barneyBufferRef.current && barneyGainRef.current && barneyFilterRef.current) {
          const src = ctx.createBufferSource();
          src.buffer = barneyBufferRef.current;
          src.loop = true;
          src.connect(barneyFilterRef.current);
          src.start(0);
          barneySourceRef.current = src;
      }
      
      if (barneySourceRef.current && barneyFilterRef.current) {
          const distorted = distortModeRef.current;
          const targetRate = distorted ? 0.65 : 1.0;
          try { barneySourceRef.current.playbackRate.setTargetAtTime(targetRate, now, 0.5); } catch(e) {}
          try { if (barneySourceRef.current.detune) barneySourceRef.current.detune.setTargetAtTime(distorted ? -300 : 0, now, 0.5); } catch(e) {}
          try { barneyFilterRef.current.frequency.setTargetAtTime(distorted ? 1200 : 20000, now, 0.3); } catch(e) {}
          try { barneyFilterRef.current.Q.setTargetAtTime(distorted ? 3 : 1, now, 0.3); } catch(e) {}
      }
      
      if (!barneyFloor && barneySourceRef.current && barneyGainRef.current && barneyGainRef.current.gain.value < 0.01) {
          try { barneySourceRef.current.stop(); } catch(e) {}
          try { barneySourceRef.current.disconnect(); } catch(e) {}
          barneySourceRef.current = null;
      }
  };

  useEffect(() => {
      if (!audioContext) return;
      const ctx = audioContext;
      const compressor = ctx.createDynamicsCompressor(); compressor.threshold.value = -12; compressor.ratio.value = 4;
      const makeupGain = ctx.createGain(); makeupGain.gain.value = 2.5; 
      compressor.connect(makeupGain); makeupGain.connect(ctx.destination);
      const reverbInput = setupReverb(ctx, compressor);
      masterGainRef.current = reverbInput;
      const lobbyGain = ctx.createGain(); lobbyGain.gain.value = 1.0; lobbyGain.connect(reverbInput); lobbyGainRef.current = lobbyGain;
      const elevatorGain = ctx.createGain(); elevatorGain.gain.value = 0; elevatorGain.connect(reverbInput); elevatorGainRef.current = elevatorGain;
      
      const barneyGain = ctx.createGain(); barneyGain.gain.value = 0; 
      const barneyFilter = ctx.createBiquadFilter(); 
      barneyFilter.type = 'lowpass'; 
      barneyFilter.frequency.value = 20000;
      barneyFilter.Q.value = 1;
      barneyFilter.connect(barneyGain);
      barneyGain.connect(reverbInput);
      barneyGainRef.current = barneyGain;
      barneyFilterRef.current = barneyFilter;

      let isMounted = true;
      
      if (!sourceRef.current) {
          fetch('https://raw.githubusercontent.com/Felipe9272727/M-sica-pro-meu-jogo/main/Lobby%20Time(MP3_160K).mp3')
              .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
              .then(b => ctx.decodeAudioData(b))
              .then(audioBuf => {
                  if (!isMounted || sourceRef.current) return;
                  const source = ctx.createBufferSource(); source.buffer = audioBuf; source.loop = true; source.connect(lobbyGain); source.start(0); sourceRef.current = source; lobbyReadyRef.current = true;
              })
              .catch(e => { console.warn("[Audio] Lobby music load failed (silent fallback):", e.message); });
      }
      
      // Barney theme: load on mount so it's ready when the chase starts.
      // The ~2MB file loads in background while the player is in the lobby.
      // Try repo first (same host as other tracks, CORS-friendly), fallback to archive.org
      const BARNEY_URLS = [
          'https://raw.githubusercontent.com/Felipe9272727/Jdjdjddj/main/Barney%20Theme%20Song.mp3',
          'https://archive.org/download/barneysgreatesthits/Barney%20Theme%20Song.mp3'
      ];
      const fetchWithFallback = async (urls: string[]): Promise<ArrayBuffer> => {
          for (const url of urls) {
              try {
                  const r = await fetch(url);
                  if (r.ok) return await r.arrayBuffer();
              } catch (e) { /* try next */ }
          }
          throw new Error(`All URLs failed for ${urls[0]}`);
      };
      if (!barneyBufferRef.current) {
          fetchWithFallback(BARNEY_URLS)
              .then(b => ctx.decodeAudioData(b))
              .then(audioBuf => {
                  if (!isMounted) return;
                  barneyBufferRef.current = audioBuf;
              })
              .catch(e => console.warn("[Audio] Barney theme load failed:", e.message));
      }

      // Elevator transition music — "Local Forecast" by Kevin MacLeod (CC BY 4.0)
      const ELEVATOR_MUSIC_URL = 'https://raw.githubusercontent.com/Felipe9272727/Jdjdjddj/main/Local%20Forecast%20-%20Elevator.mp3';
      if (!elevatorBufferRef.current) {
          fetch(ELEVATOR_MUSIC_URL)
              .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
              .then(b => ctx.decodeAudioData(b))
              .then(audioBuf => {
                  if (!isMounted) return;
                  elevatorBufferRef.current = audioBuf;
              })
              .catch(e => console.warn("[Audio] Elevator music load failed:", e.message));
      }

      schedulerTimerRef.current = setInterval(() => {
          if (schedulerRef.current) schedulerRef.current();
      }, 100);
      return () => {
          isMounted = false;
          if (schedulerTimerRef.current) clearInterval(schedulerTimerRef.current);
          if (sourceRef.current) { try { sourceRef.current.stop(); } catch(e) {} try { sourceRef.current.disconnect(); } catch(e) {} sourceRef.current = null; }
          if (elevatorSourceRef.current) { try { elevatorSourceRef.current.stop(); } catch(e) {} try { elevatorSourceRef.current.disconnect(); } catch(e) {} elevatorSourceRef.current = null; }
          if (barneySourceRef.current) { try { barneySourceRef.current.stop(); } catch(e) {} try { barneySourceRef.current.disconnect(); } catch(e) {} barneySourceRef.current = null; }
          try { lobbyGain.disconnect(); } catch(e) {}
          try { elevatorGain.disconnect(); } catch(e) {}
          try { barneyGain.disconnect(); } catch(e) {}
          try { barneyFilter.disconnect(); } catch(e) {}
          try { reverbInput.disconnect(); } catch(e) {}
          try { compressor.disconnect(); } catch(e) {}
          try { makeupGain.disconnect(); } catch(e) {}
          masterGainRef.current = null;
          lobbyGainRef.current = null;
          elevatorGainRef.current = null;
          barneyGainRef.current = null;
          barneyFilterRef.current = null;
      };
  }, [audioContext]);
  return null;
};
