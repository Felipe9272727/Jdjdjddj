/**
 * geometry.ts — Pre-computed BufferGeometry objects
 *
 * Created at module load time so they aren't re-created each render.
 * No React dependencies — pure Three.js.
 */

import * as THREE from 'three';
import {
    HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS,
} from './constants';

// ─── Procedural glow texture for sprites (prevents square artifacts) ────
export const GLOW_TEXTURE = (() => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(0.7, 'rgba(255,255,255,0.15)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
})();

// ─── Cave floor with circular hole — ShapeGeometry ────────────────────
export const CAVE_FLOOR_GEO = (() => {
    const shape = new THREE.Shape();
    const size = 30;
    shape.moveTo(-size, -size);
    shape.lineTo( size, -size);
    shape.lineTo( size,  size);
    shape.lineTo(-size,  size);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS, 0, Math.PI * 2, false);
    shape.holes.push(hole);
    const geo = new THREE.ShapeGeometry(shape, 24);
    const positions = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i);
        const dxH = v.x - HOLE_CENTER_X;
        const dyH = v.y - HOLE_CENTER_Z;
        const distToHole = Math.sqrt(dxH * dxH + dyH * dyH);
        const holeFade = Math.min(1, Math.max(0, (distToHole - HOLE_RADIUS) / 2));
        const edgeDist = Math.min(
            Math.abs(v.x - (-size)), Math.abs(v.x - size),
            Math.abs(v.y - (-size)), Math.abs(v.y - size)
        );
        const edgeFade = Math.min(1, edgeDist / 3);
        const fade = holeFade * edgeFade;
        const n = Math.sin(v.x * 0.8 + 2.3) * 0.5
                + Math.sin(v.y * 0.6 + 1.1) * 0.4
                + Math.cos(v.x * 1.2 + v.y * 0.9 + 4.5) * 0.3
                + Math.sin(v.x * 2.1 + v.y * 1.7 + 3.2) * 0.15
                + Math.cos(v.x * 3.5 + v.y * 2.8 + 1.8) * 0.08;
        positions.setZ(i, v.z + n * 0.4 * fade);
    }
    positions.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
})();

// ─── Shared small geometries ─────────────────────────────────────────
export const BUBBLE_GEO  = new THREE.SphereGeometry(1, 6, 5);
export const SHARD_GEO   = new THREE.OctahedronGeometry(0.5, 0);
export const PEBBLE_GEO  = new THREE.IcosahedronGeometry(1, 0);
export const CRYSTAL_GEO = new THREE.OctahedronGeometry(0.35, 0);
export const KELP_GEO    = new THREE.CylinderGeometry(0.06, 0.10, 1, 5, 4);
export const FISH_GEO    = new THREE.ConeGeometry(0.18, 0.55, 4);
export const DEBRIS_GEO  = new THREE.SphereGeometry(1, 3, 2);
export const PLANKTON_GEO = new THREE.SphereGeometry(1, 4, 3);

// ─── Procedural underwater terrain ────────────────────────────────────
export const UW_FLOOR_GEO = (() => {
    const geo = new THREE.PlaneGeometry(80, 80, 150, 150);
    const positions = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i);
        const edgeDist = Math.min(
            Math.abs(v.x - (-40)), Math.abs(v.x - 40),
            Math.abs(v.y - (-40)), Math.abs(v.y - 40)
        );
        const edgeFade = Math.min(1, edgeDist / 8);
        const distFromCenter = Math.sqrt(v.x * v.x + (v.y - 5) * (v.y - 5));
        const centerDip = Math.max(0, 1 - distFromCenter / 12);
        const n1 = Math.sin(v.x * 0.15 + 1.7) * 2.0
                  + Math.sin(v.y * 0.2 + 3.1) * 1.8
                  + Math.sin((v.x + v.y) * 0.1 + 0.8) * 2.5
                  + Math.cos(v.x * 0.35 - v.y * 0.25 + 5.3) * 1.2;
        const n2 = Math.sin(v.x * 0.7 + v.y * 0.55 + 2.2) * 0.8
                  + Math.sin(v.x * 1.4 + v.y * 1.1 + 2.2) * 0.4
                  + Math.cos(v.x * 2.1 - v.y * 1.8 + 4.7) * 0.2;
        const n3 = Math.sin(v.x * 3.2 + v.y * 2.8 + 1.3) * 0.12
                  + Math.cos(v.x * 5.5 + v.y * 4.2 - 0.8) * 0.06;
        const ridge = Math.abs(Math.sin(v.x * 0.4 + 0.5)) * Math.abs(Math.cos(v.y * 0.3 + 2.1)) * 3.0;
        const totalN = n1 + n2 + n3 + ridge;
        const displacement = totalN * edgeFade * (1 - centerDip * 0.6);
        positions.setZ(i, v.z + displacement);
    }
    positions.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
})();
