import { describe, it, expect } from 'vitest';
import { QUALITY_PROFILES } from '../Settings';

describe('Settings', () => {
  describe('QUALITY_PROFILES', () => {
    it('should have low, medium, high profiles', () => {
      expect(QUALITY_PROFILES).toHaveProperty('low');
      expect(QUALITY_PROFILES).toHaveProperty('medium');
      expect(QUALITY_PROFILES).toHaveProperty('high');
    });

    it('dpr should be increasing with quality', () => {
      expect(QUALITY_PROFILES.low.dpr[1]).toBeLessThanOrEqual(QUALITY_PROFILES.medium.dpr[1]);
      expect(QUALITY_PROFILES.medium.dpr[1]).toBeLessThanOrEqual(QUALITY_PROFILES.high.dpr[1]);
    });

    it('far should be increasing with quality', () => {
      expect(QUALITY_PROFILES.low.far).toBeLessThanOrEqual(QUALITY_PROFILES.medium.far);
      expect(QUALITY_PROFILES.medium.far).toBeLessThanOrEqual(QUALITY_PROFILES.high.far);
    });

    it('dpr[0] should be 1 for all profiles', () => {
      for (const [key, profile] of Object.entries(QUALITY_PROFILES)) {
        expect(profile.dpr[0], `${key}`).toBe(1);
      }
    });

    it('dpr[1] should be > 0', () => {
      for (const [key, profile] of Object.entries(QUALITY_PROFILES)) {
        expect(profile.dpr[1], `${key}`).toBeGreaterThan(0);
      }
    });
  });
});
