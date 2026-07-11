import { describe, expect, it } from 'vitest';
import {
    beamV2, buildCabinV2Geometry, buildDeckStructuresV2, buildDeckV2Geometry,
    buildHullV2Geometry, buildMastsV2Geometry, buildRiggingV2Geometry,
    buildSailsV2Geometry, deckYV2,
} from '../floor7v2/geometry';

describe('Floor 7 rebuild geometry contract', () => {
    it('preserves the playable ship-local coordinate envelope', () => {
        expect(deckYV2(-7)).toBeGreaterThanOrEqual(0);
        expect(deckYV2(8.2)).toBeLessThan(0.35);
        expect(beamV2(-5.2)).toBeGreaterThan(1.8);
        expect(beamV2(0)).toBeGreaterThan(2.1);
        expect(beamV2(7.2)).toBeGreaterThan(0.6);
    });

    it('builds finite, bounded batches for every structural module', () => {
        const batches = [buildHullV2Geometry(), buildDeckV2Geometry(), buildDeckStructuresV2(),
            buildCabinV2Geometry(), buildMastsV2Geometry(), buildSailsV2Geometry(), buildRiggingV2Geometry()];
        try {
            for (const geometry of batches) {
                const position = geometry.getAttribute('position');
                expect(position.count).toBeGreaterThan(2);
                expect(position.count).toBeLessThan(20_000);
                for (let i = 0; i < position.count; i++) {
                    expect(Number.isFinite(position.getX(i))).toBe(true);
                    expect(Number.isFinite(position.getY(i))).toBe(true);
                    expect(Number.isFinite(position.getZ(i))).toBe(true);
                }
                geometry.computeBoundingBox(); expect(geometry.boundingBox).not.toBeNull();
            }
        } finally { batches.forEach((geometry) => geometry.dispose()); }
    });
});
