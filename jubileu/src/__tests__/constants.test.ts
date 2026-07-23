import { describe, it, expect } from 'vitest';
import {
  MAX_LEVEL, SPEED, PR, EZ_START, HOUSE_DOOR_Z, HOUSE_DOOR_X,
  WALKING_URL, IDLE_URL, NPC_WALK_URL, NPC_IDLE_URL, DUSSEKAR_URL, BARNEY_URL,
  COLORS, ASSETS, BARNEY_DIALOGUE, DIALOGUE_TREE,
  LOBBY_W, ELEV_W, HOUSE_EX, HOUSE_IN, HOUSE_DW, L1_BND, ELEV_BLD, DOOR_SEAL,
  hasWalkInElevator,
} from '../constants';

describe('Game constants', () => {
  describe('Player config', () => {
    it('MAX_LEVEL should be positive integer', () => {
      expect(MAX_LEVEL).toBeGreaterThan(0);
      expect(Number.isInteger(MAX_LEVEL)).toBe(true);
    });

    it('SPEED should be positive', () => {
      expect(SPEED).toBeGreaterThan(0);
    });

    it('PR (player radius) should be positive', () => {
      expect(PR).toBeGreaterThan(0);
    });

    it('EZ_START should be negative (elevator entrance z)', () => {
      expect(EZ_START).toBeLessThan(0);
    });

    it('only enables the global walk-in elevator on floors that own one', () => {
      expect([0, 1, 2, 3].map(hasWalkInElevator)).toEqual([true, true, true, true]);
      expect([4, 5, 6, 7, 8, 9, 10].map(hasWalkInElevator)).toEqual([
        false, false, false, false, false, false, false,
      ]);
    });
  });

  describe('Asset URLs', () => {
    // Character/NPC GLBs are now BUNDLED assets (Vite inlines them as data-URIs
    // for the self-contained single-file build), so they resolve to a local
    // asset reference — a "/…glb" path under test, a "data:model/gltf-binary…"
    // URI in the production build — not a remote https URL anymore.
    const glbAssets = { WALKING_URL, IDLE_URL, NPC_WALK_URL, NPC_IDLE_URL, DUSSEKAR_URL };

    for (const [name, url] of Object.entries(glbAssets)) {
      it(`${name} should be a bundled GLB asset reference`, () => {
        expect(typeof url).toBe('string');
        expect(url.length).toBeGreaterThan(10);
        // either a resolved .glb asset path or an inlined glb data-URI
        expect(/\.glb/i.test(url) || /^data:model\/gltf-binary/.test(url)).toBe(true);
      });
    }

    it('BARNEY_URL should be a valid remote URL', () => {
      expect(BARNEY_URL).toMatch(/^https?:\/\/.+/);
      expect(BARNEY_URL.length).toBeGreaterThan(10);
    });
  });

  describe('Colors', () => {
    it('should have all required color keys', () => {
      const required = ['wall', 'wood', 'ceiling', 'metal', 'elevTrim', 'elevFloor', 'grass', 'sky'];
      for (const key of required) {
        expect(COLORS).toHaveProperty(key);
      }
    });

    it('colors should be valid hex', () => {
      for (const [key, val] of Object.entries(COLORS)) {
        expect(val, `${key}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });

  describe('Assets', () => {
    it('should have texture URLs', () => {
      const required = ['noise', 'grass', 'wood', 'lobbyFloor', 'wall'];
      for (const key of required) {
        expect(ASSETS).toHaveProperty(key);
        expect((ASSETS as any)[key]).toMatch(/^https?:\/\/.+/);
      }
    });
  });

  describe('Dialogue trees', () => {
    it('BARNEY_DIALOGUE should have greet node', () => {
      expect(BARNEY_DIALOGUE).toHaveProperty('greet');
      expect(BARNEY_DIALOGUE.greet.text).toBeTruthy();
      expect(BARNEY_DIALOGUE.greet.options.length).toBeGreaterThan(0);
    });

    it('DIALOGUE_TREE should have start node', () => {
      expect(DIALOGUE_TREE).toHaveProperty('start');
      expect(DIALOGUE_TREE.start.text).toBeTruthy();
    });

    it('all dialogue options should reference valid nodes', () => {
      for (const [key, node] of Object.entries(DIALOGUE_TREE)) {
        for (const opt of node.options) {
          if (opt.next !== null) {
            expect(DIALOGUE_TREE, `Node "${key}" option "${opt.text}" references "${opt.next}"`).toHaveProperty(opt.next);
          }
        }
      }
    });

    it('all dialogue nodes should be reachable', () => {
      const reachable = new Set<string>();
      const queue = ['start'];
      while (queue.length > 0) {
        const key = queue.shift()!;
        if (reachable.has(key)) continue;
        reachable.add(key);
        const node = DIALOGUE_TREE[key];
        if (!node) continue;
        for (const opt of node.options) {
          if (opt.next && !reachable.has(opt.next)) queue.push(opt.next);
        }
      }
      // Barney dialogue is separate tree
      const barneyReachable = new Set<string>();
      const bq = ['greet'];
      while (bq.length > 0) {
        const key = bq.shift()!;
        if (barneyReachable.has(key)) continue;
        barneyReachable.add(key);
        const node = BARNEY_DIALOGUE[key];
        if (!node) continue;
        for (const opt of node.options) {
          if (opt.next && !barneyReachable.has(opt.next)) bq.push(opt.next);
        }
      }
      // Check DIALOGUE_TREE (start tree)
      for (const key of Object.keys(DIALOGUE_TREE)) {
        expect(reachable.has(key), `DIALOGUE_TREE node "${key}" should be reachable from start`).toBe(true);
      }
    });
  });

  describe('Wall definitions', () => {
    const allWalls = { LOBBY_W, ELEV_W, HOUSE_EX, HOUSE_IN, L1_BND, ELEV_BLD };

    for (const [name, walls] of Object.entries(allWalls)) {
      it(`${name} should be array of 4-tuples`, () => {
        expect(Array.isArray(walls)).toBe(true);
        for (const wall of walls) {
          expect(wall.length, `${name} wall ${JSON.stringify(wall)}`).toBe(4);
          for (const v of wall) {
            expect(typeof v, `${name} wall ${JSON.stringify(wall)}`).toBe('number');
            expect(Number.isFinite(v), `${name} wall ${JSON.stringify(wall)}`).toBe(true);
          }
        }
      });
    }

    it('DOOR_SEAL should be a 4-tuple', () => {
      expect(DOOR_SEAL.length).toBe(4);
    });
  });
});
