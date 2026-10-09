import timing from './cinematic.json';
export const DIVER_FILM = timing;
export const DIVER_INTRO_SECONDS = timing.introFrames / timing.fps;
let frame = timing.introFrames;
export const DIVER_CHAPTERS = timing.beats.map(beat => {
  const start = frame / timing.fps;
  frame += beat.frames;
  return { ...beat, start, end: frame / timing.fps };
});
export const DIVER_FILM_SECONDS = frame / timing.fps;
/** Half-open chapters: seeking to a boundary enters the new shot. */
export function diverBeatAt(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < DIVER_INTRO_SECONDS) return -1;
  const index = DIVER_CHAPTERS.findIndex(beat => seconds < beat.end);
  return index < 0 ? DIVER_CHAPTERS.length - 1 : index;
}
export function nextDiverChapter(seconds: number): number | null {
  const beat = diverBeatAt(seconds);
  if (beat < 0) return DIVER_INTRO_SECONDS;
  return DIVER_CHAPTERS[beat + 1]?.start ?? null;
}
