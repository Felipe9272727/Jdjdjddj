import { describe, it, expect } from 'vitest';
import { resolveCollision, COLLISION_RADIUS } from '../physics';

describe('resolveCollision', () => {
  // Basic collision with a single wall
  it('should push player out of a wall segment', () => {
    // Wall from (0,0) to (10,0) — horizontal line at z=0
    const walls = [[0, 0, 10, 0]];
    // Player at (5, 0.3) — overlapping the wall
    const [x, z] = resolveCollision(5, 0.3, 0.5, walls);
    expect(z).toBeGreaterThanOrEqual(0.5); // pushed out
  });

  it('should not move player already outside walls', () => {
    const walls = [[0, 0, 10, 0]];
    const [x, z] = resolveCollision(5, 2.0, 0.5, walls);
    expect(x).toBeCloseTo(5, 1);
    expect(z).toBeCloseTo(2.0, 1);
  });

  it('should handle corner collision (two perpendicular walls)', () => {
    // L-shaped corner
    const walls = [
      [0, 0, 10, 0],  // horizontal
      [0, 0, 0, 10],  // vertical
    ];
    // Player in the corner
    const [x, z] = resolveCollision(0.2, 0.2, 0.5, walls);
    // Should be pushed away from both walls
    const dist = Math.sqrt(x * x + z * z);
    expect(dist).toBeGreaterThanOrEqual(0.4);
  });

  it('should handle empty walls array', () => {
    const [x, z] = resolveCollision(5, 5, 0.5, []);
    expect(x).toBe(5);
    expect(z).toBe(5);
  });

  it('should handle zero-length wall segment', () => {
    const walls = [[5, 5, 5, 5]]; // degenerate
    const [x, z] = resolveCollision(5, 5, 0.5, walls);
    expect(x).toBe(5);
    expect(z).toBe(5);
  });

  it('should handle player exactly on wall endpoint', () => {
    const walls = [[0, 0, 10, 0]];
    const [x, z] = resolveCollision(0, 0.1, 0.5, walls);
    expect(z).toBeGreaterThanOrEqual(0.5);
  });

  it('should handle diagonal wall', () => {
    const walls = [[0, 0, 10, 10]]; // diagonal
    const [x, z] = resolveCollision(5, 5, 0.5, walls);
    // Should be pushed off the diagonal
    const dist = Math.abs(x - z) / Math.sqrt(2);
    expect(dist).toBeGreaterThanOrEqual(0.3);
  });

  it('should respect collision radius', () => {
    const walls = [[0, 0, 10, 0]];
    const r1 = resolveCollision(5, 0.3, 0.5, walls);
    const r2 = resolveCollision(5, 0.3, 1.0, walls);
    // Bigger radius should push further
    expect(r2[1]).toBeGreaterThan(r1[1]);
  });
});

describe('COLLISION_RADIUS', () => {
  it('should be a positive number', () => {
    expect(COLLISION_RADIUS).toBeGreaterThan(0);
  });
});
