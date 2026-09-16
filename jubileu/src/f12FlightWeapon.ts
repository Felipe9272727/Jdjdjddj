/**
 * Contact-controlled gun. Waiting banks a short, bounded volley on movement.
 *
 * ── `chargeLimit` CAIU DE 4 s PARA 2,4 s, E ISSO É UM CONSERTO DE PROJETO ────
 *
 * Encher a carga exige ficar PARADO com o dedo na tela. A 4 s, isso pedia quatro
 * segundos de imobilidade no meio de uma salva do chefe — ou seja, pedia
 * exatamente a coisa que mata. Medido com um bot que joga o ciclo certo (fica
 * parado, depois manobra), a carga chegava a 2,45 de 4 e o MÍSSIL NUNCA SAÍA:
 * em 95 s de luta, zero.
 *
 * O prêmio de 100% não pode ser teórico. A 2,4 s ele cabe na folga entre duas
 * aberturas de boca, que é o momento em que o jogador de verdade tem para
 * respirar — e continua custando risco, porque parar continua sendo parar.
 */
export const FLIGHT_WEAPON = { cadence: .16, burstCadence: .045, chargeLimit: 2.4, roundsPerSecond: 4 };

export type FlightWeapon = {
  charge: number;
  remaining: number;
  cooldown: number;
  moving: boolean;
  active: boolean;
  flash: number;
  emitted: number;
  missile: boolean;
  missilesEmitted: number;
};

export function newFlightWeapon(): FlightWeapon {
  return { charge: 0, remaining: 0, cooldown: 0, moving: false, active: false, flash: 0, emitted: 0, missile: false, missilesEmitted: 0 };
}

/** Returns shots to emit this frame. Losing contact always silences the gun. */
export function stepFlightWeapon(gun: FlightWeapon, dt: number, active: boolean, moving: boolean): number {
  dt = Math.max(0, Math.min(dt, .1));
  gun.missile = false;
  gun.flash = Math.max(0, gun.flash - dt * 8);
  if (!moving) gun.charge = Math.min(FLIGHT_WEAPON.chargeLimit, gun.charge + dt);
  if (active && moving && (!gun.moving || !gun.active)) {
    if (gun.charge >= FLIGHT_WEAPON.chargeLimit - 1e-6) { gun.missile = true; gun.missilesEmitted++; }
    gun.remaining = Math.min(FLIGHT_WEAPON.chargeLimit * FLIGHT_WEAPON.roundsPerSecond,
      gun.remaining + Math.floor((gun.charge + 1e-6) * FLIGHT_WEAPON.roundsPerSecond));
    gun.charge = 0;
  }
  if (active && !gun.active) gun.cooldown = 0;
  gun.active = active;
  gun.moving = moving;
  if (!active) {
    gun.cooldown = 0;
    return 0;
  }
  gun.cooldown -= dt;
  let shots = 0;
  while (gun.cooldown <= 0 && shots < 4) {
    shots++;
    if (gun.remaining > 0) {
      gun.remaining--;
      gun.cooldown += FLIGHT_WEAPON.burstCadence;
      gun.flash = 1;
    } else {
      gun.cooldown += FLIGHT_WEAPON.cadence;
      gun.flash = .45;
    }
  }
  gun.emitted += shots;
  return shots;
}
