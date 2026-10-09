import { useCallback, useEffect, useRef, useState } from 'react';
import { createDiverCutsceneBed, playBeatPunctuation } from './Atmosphere';
import { DIVER_CHAPTERS, DIVER_FILM_SECONDS, DIVER_INTRO_SECONDS, diverBeatAt, nextDiverChapter } from './Floor2/cinematic';
import './Floor2/cinematic.css';
export interface DiverCutsceneProps {
  onAccept: () => void;
  onRefuse: () => void;
  onBeat?: (beatIdx: number) => void;
  audioCtx?: AudioContext | null;
  onFilmActive?: (active: boolean) => void;
}
/** Blender footage, Manim opening, Remotion edit. The original in-world scene
 * takes over if the film is unavailable or stalls. Subtitles remain interactive. */
export const DiverCutscene = (props: DiverCutsceneProps) => {
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef(props); callbacks.current = props;
  const clock = useRef({ time: 0, fallback: false, last: 0, progressAt: 0, videoTime: -1, done: false });
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentBeat = useRef(-1);
  const [beat, setBeat] = useState(-1);
  const [fallback, setFallback] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [exiting, setExiting] = useState(false);
  const enterTime = useCallback((time: number) => {
    clock.current.time = time;
    const next = diverBeatAt(time);
    if (next === currentBeat.current) return;
    const previous = currentBeat.current;
    currentBeat.current = next; setBeat(next);
    // A long browser frame must not swallow the equipment handover callback.
    if (next > previous) {
      for (let i = Math.max(0, previous + 1); i <= next; i++) callbacks.current.onBeat?.(i);
    } else callbacks.current.onBeat?.(next);
    if (next >= 0) playBeatPunctuation(callbacks.current.audioCtx ?? null, next);
  }, []);
  const finish = useCallback((accept: boolean) => {
    if (clock.current.done) return;
    clock.current.done = true; video.current?.pause(); setExiting(true);
    callbacks.current.onFilmActive?.(false);
    exitTimer.current = setTimeout(() => {
      if (accept) callbacks.current.onAccept(); else callbacks.current.onRefuse();
    }, 360);
  }, []);
  const useWorld = useCallback(() => {
    if (clock.current.fallback || clock.current.done) return;
    clock.current.fallback = true; clock.current.last = performance.now();
    video.current?.pause(); setFallback(true);
    callbacks.current.onFilmActive?.(false);
  }, []);
  const advance = useCallback(() => {
    if (clock.current.done || clock.current.time < DIVER_INTRO_SECONDS) return;
    const next = nextDiverChapter(clock.current.time);
    if (next === null) { finish(true); return; }
    if (!clock.current.fallback && video.current) {
      try { video.current.currentTime = next; } catch { useWorld(); }
    }
    clock.current.last = clock.current.progressAt = performance.now(); enterTime(next);
  }, [enterTime, finish, useWorld]);
  useEffect(() => {
    const v = video.current;
    let frame = 0, alive = true;
    const now = performance.now(); clock.current.last = clock.current.progressAt = now;
    const play = () => {
      if (!clock.current.fallback && !clock.current.done) v?.play().catch(() => { if (alive) useWorld(); });
    };
    play();
    const tick = (now: number) => {
      const c = clock.current;
      // A slow 3D fallback frame must leave each caption readable. Media
      // playback still follows its own clock, including chapter seeks.
      const dt = Math.min(.5, Math.max(0, (now - c.last) / 1000)); c.last = now;
      if (!c.done && !document.hidden) {
        if (c.fallback) enterTime(c.time + dt);
        else if (v) {
          if (!v.seeking) enterTime(v.currentTime);
          if (v.currentTime !== c.videoTime) { c.videoTime = v.currentTime; c.progressAt = now; }
          if (now - c.progressAt > (v.readyState < 2 || v.seeking ? 6000 : 3000)) useWorld();
        }
        if (c.time >= DIVER_FILM_SECONDS - .05) finish(true);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const visibility = () => {
      clock.current.last = clock.current.progressAt = performance.now();
      if (document.hidden) v?.pause(); else play();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      alive = false; cancelAnimationFrame(frame); v?.pause();
      document.removeEventListener('visibilitychange', visibility);
      if (exitTimer.current !== null) clearTimeout(exitTimer.current);
      callbacks.current.onFilmActive?.(false);
    };
  }, [enterTime, finish, useWorld]);
  useEffect(() => {
    if (!props.audioCtx) return;
    return createDiverCutsceneBed(props.audioCtx);
  }, [props.audioCtx]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === ' ' || e.key === 'Enter') {
        // Focused buttons keep their native keyboard action, including PULAR.
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault(); if (!e.repeat) advance();
      }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [advance, finish]);
  return <div className={`f2-film ${fallback ? 'f2-film-world' : ''} ${exiting ? 'f2-film-exiting' : ''}`}
    data-beat={beat} data-fallback={fallback} onClick={advance} onPointerDown={e => e.stopPropagation()}>
    <div className="f2-film-picture">
      <video ref={video} src={`${import.meta.env.BASE_URL}floor2-mergulhador.mp4`} muted playsInline preload="auto"
        aria-hidden="true" onPlaying={() => { setPlaying(true); if (!clock.current.fallback && !clock.current.done) callbacks.current.onFilmActive?.(true); }} onError={useWorld} onEnded={() => { enterTime(DIVER_FILM_SECONDS); finish(true); }}
        style={{ opacity: playing && !fallback ? 1 : 0, objectFit: beat < 0 ? 'contain' : undefined }} />
    </div>
    {beat < 0 && (!playing || fallback) && <div className="f2-film-title" aria-hidden="true"><span>ANDAR 02</span><strong>O ABISMO</strong></div>}
    <header className="f2-film-top">
      <span>02 · RESERVATÓRIO</span>
      <button type="button" aria-label="Pular conversa" disabled={exiting}
        onClick={e => { e.stopPropagation(); finish(false); }}>PULAR <span>· ESC</span></button>
    </header>
    <div className="f2-film-caption">
      {beat >= 0 && <>
        <span className="f2-film-speaker">MERGULHADOR</span>
        <p key={beat} aria-live="polite" aria-atomic="true">{DIVER_CHAPTERS[beat].text}</p>
        <button className="f2-film-next" type="button" disabled={exiting}
          onClick={e => { e.stopPropagation(); advance(); }}>
          {beat === DIVER_CHAPTERS.length - 1 ? 'RECEBER EQUIPAMENTO' : 'CONTINUAR'} <span aria-hidden="true">→</span>
        </button>
      </>}
    </div>
  </div>;
};
