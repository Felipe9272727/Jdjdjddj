import { nascerTiro, nascerMissilCarregado, danoDoTiro, MISSEL_CARREGADO } from '../f12Boss';
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

describe('full-charge missile', () => {
  it('launches exactly once on movement and never without contact', () => {
    const gun = newFlightWeapon();
    for (let i = 0; i < 300; i++) {
      stepFlightWeapon(gun, 1 / 60, false, false);
      expect(gun.missile).toBe(false);
    }
    stepFlightWeapon(gun, 1 / 60, true, true);
    expect(gun.missile).toBe(true);
    expect(gun.missilesEmitted).toBe(1);
    for (let i = 0; i < 100; i++) {
      stepFlightWeapon(gun, 1 / 60, true, true);
      expect(gun.missile).toBe(false);
    }
    expect(gun.missilesEmitted).toBe(1);
  });
  it('keeps partial charges as ordinary volleys', () => {
    const gun = newFlightWeapon();
    for (let i = 0; i < 120; i++) stepFlightWeapon(gun, 1 / 60, false, false);
    stepFlightWeapon(gun, 1 / 60, true, true);
    expect(gun.remaining).toBeGreaterThan(0);
    expect(gun.missile).toBe(false);
    expect(gun.missilesEmitted).toBe(0);
  });
  it('uses a centered projectile with eight times the regular damage', () => {
    const rocket = nascerMissilCarregado(2, 4);
    expect(rocket.tipo).toBe('tiro');
    expect(rocket.carregado).toBe(true);
    expect(rocket.x).toBe(2);
    expect(rocket.vz).toBe(-MISSEL_CARREGADO.velocidade);
    expect(danoDoTiro(rocket)).toBe(danoDoTiro(nascerTiro(2, 4, 'jogador')) * 8);
    expect(danoDoTiro(nascerTiro(2, 4, 'irmao'))).toBe(.6);
  });
});
