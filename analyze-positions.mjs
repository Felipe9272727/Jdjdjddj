#!/usr/bin/env node
/**
 * Scene Position Analyzer for The Normal Elevator
 * Parses LobbyEnv.tsx and BuildingBlocks.tsx to calculate exact world-space
 * positions and bounding boxes of every object in the lobby.
 *
 * Run: node analyze-positions.mjs
 */

import { readFileSync } from 'fs';

// ─── Rotation helper ─────────────────────────────────────────────────────
// Rotate point (x, y, z) around Y axis by angle θ
function rotateY(x, y, z, theta) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return [x * c + z * s, y, -x * s + z * c];
}

// ─── Lobby layout constants (from LobbyEnv.tsx) ──────────────────────────
const W = 20, L = 20, H = 4.5;

// ─── All objects from LobbyEnv.tsx ───────────────────────────────────────
const objects = [];

function addObj(name, type, x, z, rot = 0, extra = {}) {
    // Calculate world-space bounding box
    const w = extra.w || 0, h = extra.h || 0, d = extra.d || 0;
    const localMinX = -w / 2, localMaxX = w / 2;
    const localMinZ = -d / 2, localMaxZ = d / 2;
    
    // Transform to world space using rotation
    const corners = [
        rotateY(localMinX, 0, localMinZ, rot),
        rotateY(localMaxX, 0, localMinZ, rot),
        rotateY(localMinX, 0, localMaxZ, rot),
        rotateY(localMaxX, 0, localMaxZ, rot),
    ];
    
    const worldXs = corners.map(c => c[0] + x);
    const worldZs = corners.map(c => c[2] + z);
    
    objects.push({
        name,
        type,
        worldPos: [x, extra.y || 0, z],
        worldRot: rot,
        worldBounds: {
            xMin: Math.min(...worldXs),
            xMax: Math.max(...worldXs),
            yMin: extra.y || 0,
            yMax: (extra.y || 0) + h,
            zMin: Math.min(...worldZs),
            zMax: Math.max(...worldZs),
        },
        ...extra,
    });
}

// ─── Walls ───────────────────────────────────────────────────────────────
addObj('Wall-Front-Z', 'wall', 0, L / 2, 0, { w: W, h: H, d: 0.5 });
addObj('Wall-Left-X', 'wall', -W / 2, 0, 0, { w: 0.5, h: H, d: L });
addObj('Wall-Right-Upper', 'wall', W / 2, -6.25, 0, { w: 0.5, h: H, d: 7.5 });
addObj('Wall-Right-Lower', 'wall', W / 2, 6.25, 0, { w: 0.5, h: H, d: 7.5 });
addObj('Wall-Right-Top', 'wall', W / 2, 0, 0, { w: 0.5, h: 0.7, d: 5, y: 3.8 });
addObj('Wall-Right-Bottom', 'wall', W / 2, 0, 0, { w: 0.5, h: 1.0, d: 5, y: 0 });

// ─── Elevator ────────────────────────────────────────────────────────────
addObj('Elevator', 'structure', 0, -L / 2, 0, { w: 4, h: H, d: 1 });

// ─── Reception Desk (from BuildingBlocks.tsx) ────────────────────────────
// ReceptionDesk at (7, 0, -7.5) with rot=-PI/2
// Desk local geometry:
//   body: pos[0,0.6,0], size[3.5, 1.2, 0.7]
//   counter top: pos[0,1.22,0.05], size[3.7, 0.06, 0.85]
//   front panel: pos[0,0.6,0.36], size[3.3, 1.0, 0.04]
//   gold strip: pos[0,1.15,0.38]
//   lamp base: pos[1.3,1.25,0]
//   monitor: pos[-0.4,1.27,0.1]
//   plant: pos[1.55,1.26,0]

const deskX = 7, deskZ = -7.5, deskRot = -Math.PI / 2;

// Transform local desk coords to world
function deskToWorld(lx, ly, lz) {
    const [wx, wy, wz] = rotateY(lx, ly, lz, deskRot);
    return [wx + deskX, wy, wz + deskZ];
}

// Desk body bounds in world
const deskBodyLocal = { minX: -1.75, maxX: 1.75, minY: 0, maxY: 1.2, minZ: -0.35, maxZ: 0.35 };
const deskBodyCorners = [
    deskToWorld(deskBodyLocal.minX, 0, deskBodyLocal.minZ),
    deskToWorld(deskBodyLocal.maxX, 0, deskBodyLocal.minZ),
    deskToWorld(deskBodyLocal.minX, 0, deskBodyLocal.maxZ),
    deskToWorld(deskBodyLocal.maxX, 0, deskBodyLocal.maxZ),
];

objects.push({
    name: 'ReceptionDesk',
    type: 'desk',
    worldPos: [deskX, 0, deskZ],
    worldRot: deskRot,
    worldBounds: {
        xMin: Math.min(...deskBodyCorners.map(c => c[0])),
        xMax: Math.max(...deskBodyCorners.map(c => c[0])),
        yMin: 0,
        yMax: 1.25,
        zMin: Math.min(...deskBodyCorners.map(c => c[2])),
        zMax: Math.max(...deskBodyCorners.map(c => c[2])),
    },
    notes: 'Front panel at local Z=0.36, gold strip at local Z=0.38',
});

// Counter top
const counterCorners = [
    deskToWorld(-1.85, 1.19, -0.375),
    deskToWorld(1.85, 1.19, -0.375),
    deskToWorld(-1.85, 1.19, 0.475),
    deskToWorld(1.85, 1.19, 0.475),
];
objects.push({
    name: 'DeskCounterTop',
    type: 'surface',
    worldBounds: {
        xMin: Math.min(...counterCorners.map(c => c[0])),
        xMax: Math.max(...counterCorners.map(c => c[0])),
        yMin: 1.19,
        yMax: 1.25,
        zMin: Math.min(...counterCorners.map(c => c[2])),
        zMax: Math.max(...counterCorners.map(c => c[2])),
    },
});

// ─── Cashier / Stool ─────────────────────────────────────────────────────
// Current code: Cashier at position [7.2, 0, -7.5] with rotation (0, -PI/2, 0)
// The GLB model is ~1.65m tall after normalization
// STOOL_HEIGHT = 0.22
const cashierX = 7.65, cashierZ = -7.5;
const modelHeight = 1.65;
const modelDepth = 0.5; // estimated depth of humanoid model

// Cashier group rotation is -PI/2, model faces... need to figure out
// Model's local +Z after rotation → world -X
// So model "front" (local +Z) faces -X in world (toward lobby center)
// Model "back" (local -Z) faces +X in world (toward wall)

// Model center at (cashierX, stool+feetY, cashierZ)
// Model extends: 
//   +Z local → -X world (front/chest): cashierX - depth/2
//   -Z local → +X world (back): cashierX + depth/2
//   Y: from stool seat to stool+height

objects.push({
    name: 'Cashier (current)',
    type: 'character',
    worldPos: [cashierX, 0.22, cashierZ],
    worldRot: -Math.PI / 2,
    worldBounds: {
        xMin: cashierX - modelDepth / 2,  // front
        xMax: cashierX + modelDepth / 2,  // back
        yMin: 0.22,
        yMax: 0.22 + modelHeight,
        zMin: cashierZ - 0.3,
        zMax: cashierZ + 0.3,
    },
    notes: 'Model origin at center. After -PI/2 rotation, local +Z → world -X',
});

objects.push({
    name: 'Stool (current)',
    type: 'furniture',
    worldPos: [cashierX, 0, cashierZ],
    worldBounds: {
        xMin: 7.7 - 0.32,
        xMax: 7.7 + 0.32,
        yMin: 0,
        yMax: 0.28,
        zMin: cashierZ - 0.32,
        zMax: cashierZ + 0.32,
    },
});

// ─── Print results ───────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║        THE NORMAL ELEVATOR — SCENE POSITION MAP            ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log(`Lobby: ${W}x${L} | Height: ${H} | Walls at X=[${-W/2}, ${W/2}], Z=[${-L/2}, ${L/2}]\n`);

// Sort by X position
objects.sort((a, b) => (a.worldPos?.[0] || 0) - (b.worldPos?.[0] || 0));

for (const obj of objects) {
    const b = obj.worldBounds;
    console.log(`─── ${obj.name} (${obj.type}) ───`);
    console.log(`  Position: [${obj.worldPos?.map(v => v.toFixed(2)).join(', ')}]`);
    if (obj.worldRot !== undefined) console.log(`  Rotation Y: ${(obj.worldRot * 180 / Math.PI).toFixed(1)}°`);
    console.log(`  Bounds:`);
    console.log(`    X: ${b.xMin.toFixed(2)} → ${b.xMax.toFixed(2)} (width: ${(b.xMax - b.xMin).toFixed(2)})`);
    console.log(`    Y: ${b.yMin.toFixed(2)} → ${b.yMax.toFixed(2)} (height: ${(b.yMax - b.yMin).toFixed(2)})`);
    console.log(`    Z: ${b.zMin.toFixed(2)} → ${b.zMax.toFixed(2)} (depth: ${(b.zMax - b.zMin).toFixed(2)})`);
    if (obj.notes) console.log(`  Note: ${obj.notes}`);
    console.log();
}

// ─── Collision analysis ──────────────────────────────────────────────────
console.log('═══ COLLISION ANALYSIS ═══\n');

const desk = objects.find(o => o.name === 'ReceptionDesk');
const cashier = objects.find(o => o.name === 'Cashier (current)');
const stool = objects.find(o => o.name === 'Stool (current)');

function overlaps(a, b) {
    return a.worldBounds.xMin < b.worldBounds.xMax &&
           a.worldBounds.xMax > b.worldBounds.xMin &&
           a.worldBounds.zMin < b.worldBounds.zMax &&
           a.worldBounds.zMax > b.worldBounds.zMin &&
           a.worldBounds.yMin < b.worldBounds.yMax &&
           a.worldBounds.yMax > b.worldBounds.yMin;
}

if (desk && cashier) {
    const collision = overlaps(desk, cashier);
    console.log(`Cashier vs Desk: ${collision ? '⚠️  OVERLAPPING!' : '✅ No collision'}`);
    console.log(`  Desk X range: ${desk.worldBounds.xMin.toFixed(2)} → ${desk.worldBounds.xMax.toFixed(2)}`);
    console.log(`  Cashier X range: ${cashier.worldBounds.xMin.toFixed(2)} → ${cashier.worldBounds.xMax.toFixed(2)}`);
    
    if (collision) {
        // Suggested fix
        const deskBack = desk.worldBounds.xMax; // 7.35
        const cashierHalfDepth = (cashier.worldBounds.xMax - cashier.worldBounds.xMin) / 2;
        const suggestedX = deskBack + cashierHalfDepth + 0.05; // 5cm gap
        console.log(`\n  💡 Suggested cashier X: ${suggestedX.toFixed(2)} (desk back at ${deskBack.toFixed(2)} + model half-depth ${cashierHalfDepth.toFixed(2)} + 0.05 gap)`);
    }
}

if (desk && stool) {
    const collision = overlaps(desk, stool);
    console.log(`\nStool vs Desk: ${collision ? '⚠️  OVERLAPPING!' : '✅ No collision'}`);
}

// ─── ASCII top-down view ─────────────────────────────────────────────────
console.log('\n═══ TOP-DOWN VIEW (X-Z plane, lobby) ═══\n');

const gridSize = 40;
const cellW = W / gridSize;
const cellH = L / gridSize;
const grid = Array.from({ length: gridSize }, () => Array(gridSize).fill('  '));

function worldToGrid(wx, wz) {
    const gx = Math.floor((wx + W / 2) / cellW);
    const gz = Math.floor((wz + L / 2) / cellH);
    return [Math.max(0, Math.min(gridSize - 1, gx)), Math.max(0, Math.min(gridSize - 1, gz))];
}

function fillBounds(grid, bounds, char) {
    const [x1, z1] = worldToGrid(bounds.xMin, bounds.zMin);
    const [x2, z2] = worldToGrid(bounds.xMax, bounds.zMax);
    for (let x = x1; x <= x2; x++) {
        for (let z = z1; z <= z2; z++) {
            if (grid[z] && grid[z][x] !== undefined) grid[z][x] = char;
        }
    }
}

// Fill walls
for (const obj of objects) {
    if (obj.type === 'wall') fillBounds(grid, obj.worldBounds, '██');
}
fillBounds(grid, desk.worldBounds, '▓▓');

// Mark cashier and stool
if (cashier) fillBounds(grid, cashier.worldBounds, 'CC');
if (stool) fillBounds(grid, stool.worldBounds, 'SS');

// Mark elevator
const elev = objects.find(o => o.name === 'Elevator');
if (elev) fillBounds(grid, elev.worldBounds, 'EL');

// Print grid (Z axis = rows, top = +Z/10, bottom = -Z/-10)
console.log('    ' + Array.from({ length: gridSize }, (_, i) => {
    const x = (i * cellW - W / 2).toFixed(0);
    return x.length === 1 ? ' ' + x : x.slice(-2);
}).join(''));

for (let z = gridSize - 1; z >= 0; z--) {
    const wz = (z * cellH - L / 2).toFixed(0);
    const label = (wz.length === 1 ? ' ' + wz : wz.slice(-2));
    console.log(`${label} | ${grid[z].join('')}`);
}

console.log('\nLegend: ██ = Wall | ▓▓ = Desk | CC = Cashier | SS = Stool | EL = Elevator');
console.log('\nX axis: left(-10) → right(+10) | Z axis: top(+10) → bottom(-10)');
