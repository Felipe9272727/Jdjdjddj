import { describe, expect, it } from 'vitest';
import { DIVER_CHAPTERS, DIVER_FILM_SECONDS, DIVER_INTRO_SECONDS, diverBeatAt, nextDiverChapter } from '../Floor2/cinematic';
describe('Floor 2 film choreography', () => {
  it('keeps the introduction outside the dialogue and enters each chapter exactly at the cut', () => {
    expect(diverBeatAt(0)).toBe(-1);
    expect(diverBeatAt(DIVER_INTRO_SECONDS - .001)).toBe(-1);
    DIVER_CHAPTERS.forEach((chapter, index) => {
      expect(diverBeatAt(chapter.start)).toBe(index);
      expect(diverBeatAt(chapter.end - .001)).toBe(index);
    });
  });
  it('advances to the next shot and accepts only after the farewell', () => {
    DIVER_CHAPTERS.forEach((chapter, index) => {
      expect(nextDiverChapter(chapter.start + .2)).toBe(DIVER_CHAPTERS[index + 1]?.start ?? null);
    });
    expect(diverBeatAt(DIVER_FILM_SECONDS)).toBe(4);
    expect(DIVER_CHAPTERS[3].shot).toBe('mascara');
  });
});
