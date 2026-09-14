import { describe, expect, it } from 'vitest';
import { newFlightWeapon, stepFlightWeapon } from '../f12FlightWeapon';

describe('contact-controlled flight gun', () => {
  it('does not shoot without contact, including an interrupted volley', () => {
    const gun = newFlightWeapon();
    gun.remaining = 12;
    for (let i = 0; i < 120; i++) expect(stepFlightWeapon(gun, 1 / 60, false, false)).toBe(0);
    expect(gun.remaining).toBe(12);
    expect(stepFlightWeapon(gun, 1 / 60, true, true)).toBeGreaterThan(0);
    expect(stepFlightWeapon(gun, 1 / 60, false, true)).toBe(0);
  });
  it('banks proportional stationary time and caps the reserve', () => {
    for (const seconds of [1, 2, 4, 12]) {
      const gun = newFlightWeapon();
      for (let i = 0; i < seconds * 60; i++) stepFlightWeapon(gun, 1 / 60, false, false);
      const shots = stepFlightWeapon(gun, 1 / 60, true, true);
      expect(gun.remaining + shots).toBe(Math.min(seconds, 4) * 4);
      expect(gun.charge).toBe(0);
    }
  });
  it('does not bank charge while moving and consumes a volley only once', () => {
    const gun = newFlightWeapon();
    for (let i = 0; i < 600; i++) stepFlightWeapon(gun, 1 / 60, true, true);
    expect(gun.charge).toBe(0);
    expect(gun.remaining).toBe(0);
  });
  it('keeps sustained rate stable across frame rates', () => {
    const totals = [30, 60, 120].map(fps => {
      const gun = newFlightWeapon();
      let shots = 0;
      for (let i = 0; i < fps * 4; i++) shots += stepFlightWeapon(gun, 1 / fps, true, true);
      return shots;
    });
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1);
  });
});
