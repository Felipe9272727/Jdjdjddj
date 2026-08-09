import { describe, expect, it } from 'vitest';
import { resolveBellhopRigPose } from '../BellhopPerformanceAnimator';

describe('rig de alta fluidez do recepcionista', () => {
  it('mantém o balcão em repouso e usa a mão de descanso no idle', () => {
    const idle = resolveBellhopRigPose(1_000, 'idle');
    expect(idle.gestureArmOpacity).toBe(0);
    expect(idle.restArmOpacity).toBe(1);
    expect(idle.mouthOpen).toBe(0);
    expect(Math.abs(idle.bodyY)).toBeLessThanOrEqual(1);
  });

  it('cria mais de cem microposturas distintas num ciclo a 60 fps', () => {
    const frameMs = 1_000 / 60;
    const poses = Array.from({ length: 216 }, (_, frame) => (
      resolveBellhopRigPose(frame * frameMs, 'talk')
    ));
    const uniqueArmAngles = new Set(poses.map((pose) => pose.armDeg.toFixed(3)));
    const largestStep = poses.slice(1).reduce((largest, pose, index) => (
      Math.max(largest, Math.abs(pose.armDeg - poses[index].armDeg))
    ), 0);

    expect(uniqueArmAngles.size).toBeGreaterThan(100);
    expect(largestStep).toBeLessThan(2.5);
  });

  it('tem antecipação, overshoot, acomodação e retorno completo', () => {
    const samples = Array.from({ length: 361 }, (_, index) => (
      resolveBellhopRigPose(index * 10, 'talk')
    ));
    const angles = samples.map((pose) => pose.armDeg);

    expect(Math.max(...angles)).toBeGreaterThanOrEqual(41);
    expect(Math.min(...angles)).toBeLessThan(-4);
    expect(resolveBellhopRigPose(2_250, 'talk').armDeg).toBeCloseTo(0, 0);
    expect(resolveBellhopRigPose(3_590, 'talk').armDeg).toBeGreaterThan(64);
  });

  it('anima boca e piscada como camadas locais, sem alterar o corpo inteiro', () => {
    const talking = resolveBellhopRigPose(900, 'talk');
    const blinkPeak = resolveBellhopRigPose(87.5, 'idle');

    expect(talking.mouthOpen).toBeGreaterThan(0);
    expect(talking.mouthOpen).toBeLessThanOrEqual(1);
    expect(blinkPeak.blink).toBeCloseTo(1, 2);
  });

  it('não força uma piscada toda vez que texto começa ou termina', () => {
    const ambientClock = 2_400;
    const beginning = resolveBellhopRigPose(0, 'talk', ambientClock);
    const middle = resolveBellhopRigPose(1_600, 'talk', ambientClock);
    const idle = resolveBellhopRigPose(0, 'idle', ambientClock);

    expect(beginning.blink).toBe(middle.blink);
    expect(idle.blink).toBe(beginning.blink);
  });
});
