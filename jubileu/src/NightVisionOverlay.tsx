/**
 * NightVisionOverlay.tsx — tactical night-vision effect + shard scanner HUD.
 *
 * Exports:
 *  <NightVisionFx>   — DOM/CSS phosphor stack (dark overlay, scanlines, grain,
 *                      vignette, chromatic aberration, boot flash, NV ON chip).
 *  <ShardScanner>    — Compact canvas radar, always visible in bottom-right when
 *                      the player owns the rebreather on Floor 2. Shows all 5
 *                      shard positions relative to the player, with a sweep line.
 *  <NightVisionLights> — Three.js green lights mounted inside the canvas.
 *
 * NON-NEGOTIABLES (from MEMORY.md):
 *  - No `<spotLight distance={0}>` while alive.
 *  - No `useFrame` priority != 0 (raf used instead).
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

// ─── NightVisionFx ──────────────────────────────────────────────────────────

interface NightVisionFxProps {
  active: boolean;
}

export const NightVisionFx: React.FC<NightVisionFxProps> = ({ active }) => {
  const [bootKey, setBootKey] = useState(0);
  const prevActive = useRef(false);
  useEffect(() => {
    if (active && !prevActive.current) setBootKey(k => k + 1);
    prevActive.current = active;
  }, [active]);

  return (
    <>
      {/* Layer 1: Mid-green-grey multiply — desaturates the scene before tint.
          Keeping it off near-black so the underlying scene still reads through. */}
      <div
        className="fixed inset-0 z-[18] pointer-events-none transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          backgroundColor: 'rgb(18,42,26)',
          mixBlendMode: 'multiply',
        }}
      />

      {/* Layer 2: Subtle green phosphor tint — hue shift without flooding. */}
      <div
        className="fixed inset-0 z-[19] pointer-events-none transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          background:
            'radial-gradient(ellipse at center, rgba(40,255,120,0.06) 0%, rgba(0,80,30,0.03) 60%, rgba(0,20,10,0.18) 100%)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Layer 2b: CRT scanlines */}
      <div
        className="fixed inset-0 z-[20] pointer-events-none nv-scanlines transition-opacity duration-300"
        style={{ opacity: active ? 0.55 : 0 }}
      />

      {/* Layer 2c: Animated grain (SVG turbulence) */}
      <div
        className="fixed inset-0 z-[20] pointer-events-none nv-grain transition-opacity duration-300"
        style={{ opacity: active ? 0.22 : 0 }}
      />

      {/* Layer 3: Vignette — dark corners, clear center */}
      <div
        className="fixed inset-0 z-[21] pointer-events-none transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          background:
            'radial-gradient(ellipse 50% 62% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.92) 100%)',
        }}
      />

      {/* Layer 3b: Chromatic aberration — cyan left, red-ish right */}
      <div
        className="fixed inset-0 z-[21] pointer-events-none transition-opacity duration-300"
        style={{
          opacity: active ? 0.35 : 0,
          background:
            'linear-gradient(90deg, rgba(0,140,180,0.10) 0%, transparent 12%, transparent 88%, rgba(180,40,40,0.08) 100%)',
          mixBlendMode: 'screen',
        }}
      />

      {/* NV ON chip — top-left */}
      {active && (
        <div
          className="fixed z-[23] pointer-events-none
                     top-[calc(env(safe-area-inset-top,0px)+92px)]
                     left-[calc(env(safe-area-inset-left,0px)+12px)]
                     px-2 py-1 rounded-sm bg-black/70 border border-emerald-400/50
                     text-emerald-300 text-[10px] font-mono tracking-widest
                     shadow-[0_0_12px_rgba(74,222,128,0.45)]"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 align-middle animate-pulse" />
          NV ON
        </div>
      )}

      {/* Boot flash — green burst when goggles power on */}
      {bootKey > 0 && (
        <div
          key={bootKey}
          className="fixed inset-0 z-[24] pointer-events-none animate-nv-boot"
          style={{ background: 'rgba(40,255,120,0.70)', mixBlendMode: 'screen' }}
        />
      )}

      <style>{`
        @keyframes nvBoot {
          0%   { opacity: 1; }
          18%  { opacity: 0.6; }
          35%  { opacity: 0.85; }
          55%  { opacity: 0.15; }
          100% { opacity: 0; }
        }
        .animate-nv-boot { animation: nvBoot 550ms ease-out forwards; }

        .nv-scanlines {
          background-image: repeating-linear-gradient(
            to bottom,
            rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px,
            rgba(0,0,0,0.35) 3px, rgba(0,0,0,0) 4px
          );
          mix-blend-mode: multiply;
          animation: nvScroll 4s linear infinite;
        }
        @keyframes nvScroll {
          0%   { background-position-y: 0; }
          100% { background-position-y: 32px; }
        }

        .nv-grain {
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.15  0 0 0 0 1  0 0 0 0 0.4  0 0 0 0.22 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
          background-size: 220px 220px;
          mix-blend-mode: screen;
          animation: nvGrain 0.6s steps(6) infinite;
        }
        @keyframes nvGrain {
          0%   { transform: translate(0,0); }
          20%  { transform: translate(-6px,4px); }
          40%  { transform: translate(5px,-3px); }
          60%  { transform: translate(-3px,-5px); }
          80%  { transform: translate(4px,3px); }
          100% { transform: translate(0,0); }
        }
      `}</style>
    </>
  );
};

// ─── ShardScanner ────────────────────────────────────────────────────────────

// World radius shown across the radar. 60 units covers the whole underwater zone
// while still letting the player read directionality clearly.
const RADAR_RANGE = 60;

export interface ShardScannerProps {
  playerPositionRef: React.MutableRefObject<THREE.Vector3>;
  playerRotationYRef: React.MutableRefObject<number>;
  shardPositions: ReadonlyArray<readonly [number, number, number]>;
  collectedShards: Set<number>;
}

export const ShardScanner: React.FC<ShardScannerProps> = ({
  playerPositionRef,
  playerRotationYRef,
  shardPositions,
  collectedShards,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  // Keep a ref to collectedShards so the raf loop always reads the latest
  // without restarting. Sets are mutated externally; a ref avoids stale closure.
  const collectedRef = useRef(collectedShards);
  useEffect(() => { collectedRef.current = collectedShards; }, [collectedShards]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sizeCss = 130;          // compact — fits the corner without intruding
    canvas.width = Math.floor(sizeCss * dpr);
    canvas.height = Math.floor(sizeCss * dpr);
    canvas.style.width = `${sizeCss}px`;
    canvas.style.height = `${sizeCss}px`;
    ctx.scale(dpr, dpr);

    const R = sizeCss / 2;
    const edgeR = R - 8;
    const startTs = performance.now();

    const draw = () => {
      const t = (performance.now() - startTs) / 1000;
      const pp = playerPositionRef.current;
      const heading = playerRotationYRef.current;
      const collected = collectedRef.current;

      ctx.clearRect(0, 0, sizeCss, sizeCss);

      // ── Background disc ──────────────────────────────────────────────────
      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R - 1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(2, 14, 8, 0.88)';
      ctx.fill();
      ctx.clip();

      // Range rings
      ctx.strokeStyle = 'rgba(40, 220, 100, 0.20)';
      ctx.lineWidth = 0.8;
      for (let r = R / 3; r < R; r += R / 3) {
        ctx.beginPath(); ctx.arc(R, R, r, 0, Math.PI * 2); ctx.stroke();
      }
      // Crosshair lines
      ctx.strokeStyle = 'rgba(40, 220, 100, 0.15)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(R, 0); ctx.lineTo(R, sizeCss);
      ctx.moveTo(0, R); ctx.lineTo(sizeCss, R);
      ctx.stroke();

      // Sweep wedge (clockwise, ~5s/rev — slower than before, easier to read)
      const sweepAng = (t * Math.PI * 2 / 5) % (Math.PI * 2);
      const sweepGrad = ctx.createRadialGradient(R, R, 0, R, R, R);
      sweepGrad.addColorStop(0, 'rgba(80, 255, 140, 0.30)');
      sweepGrad.addColorStop(1, 'rgba(40, 255, 100, 0.00)');
      ctx.beginPath();
      ctx.moveTo(R, R);
      ctx.arc(R, R, R, sweepAng - 0.5, sweepAng);
      ctx.closePath();
      ctx.fillStyle = sweepGrad;
      ctx.fill();

      // Sweep edge line
      ctx.strokeStyle = 'rgba(140, 255, 180, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(R, R);
      ctx.lineTo(R + Math.cos(sweepAng) * (R - 2), R + Math.sin(sweepAng) * (R - 2));
      ctx.stroke();

      // ── Shards ──────────────────────────────────────────────────────────
      const cosH = Math.cos(-heading);
      const sinH = Math.sin(-heading);
      const blink = 0.65 + Math.sin(t * 5.5) * 0.35;

      for (let i = 0; i < shardPositions.length; i++) {
        const s = shardPositions[i];
        const dx = s[0] - pp.x;
        const dz = s[2] - pp.z;
        // Rotate relative to player heading
        const rx = dx * cosH - dz * sinH;
        const ry = dx * sinH + dz * cosH;

        const distNorm = Math.sqrt(rx * rx + ry * ry) / RADAR_RANGE;
        let sx: number, sy: number, atEdge = false;
        if (distNorm > 1) {
          const a = Math.atan2(ry, rx);
          sx = R + Math.cos(a) * edgeR;
          sy = R + Math.sin(a) * edgeR;
          atEdge = true;
        } else {
          sx = R + (rx / RADAR_RANGE) * edgeR;
          sy = R + (ry / RADAR_RANGE) * edgeR;
        }

        if (collected.has(i)) {
          // Collected → tiny dim cross
          ctx.strokeStyle = 'rgba(80, 200, 120, 0.25)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(sx - 2.5, sy - 2.5); ctx.lineTo(sx + 2.5, sy + 2.5);
          ctx.moveTo(sx - 2.5, sy + 2.5); ctx.lineTo(sx + 2.5, sy - 2.5);
          ctx.stroke();
          continue;
        }

        // Uncollected → pulsing cyan diamond
        const dr = atEdge ? 2.5 : 3.5;
        ctx.shadowColor = '#9be8ff';
        ctx.shadowBlur = 6;
        ctx.fillStyle = `rgba(155, 232, 255, ${blink})`;
        ctx.beginPath();
        ctx.moveTo(sx, sy - dr);
        ctx.lineTo(sx + dr, sy);
        ctx.lineTo(sx, sy + dr);
        ctx.lineTo(sx - dr, sy);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Out-of-range: small outward tick
        if (atEdge) {
          const a = Math.atan2(ry, rx);
          ctx.strokeStyle = `rgba(155, 232, 255, ${blink * 0.7})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(a) * 4, sy + Math.sin(a) * 4);
          ctx.lineTo(sx + Math.cos(a) * 7, sy + Math.sin(a) * 7);
          ctx.stroke();
        }
      }

      // ── Player chevron ───────────────────────────────────────────────────
      ctx.fillStyle = 'rgba(160, 255, 190, 0.90)';
      ctx.strokeStyle = 'rgba(40, 255, 100, 0.80)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(R, R - 6);
      ctx.lineTo(R + 4, R + 4);
      ctx.lineTo(R, R + 1);
      ctx.lineTo(R - 4, R + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      // ── Bezel + ticks (drawn outside the clip) ───────────────────────────
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.65)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.stroke();

      ctx.strokeStyle = 'rgba(100, 240, 160, 0.45)';
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const major = i % 2 === 0;
        ctx.beginPath();
        ctx.moveTo(R + Math.cos(a) * (R - (major ? 6 : 3)), R + Math.sin(a) * (R - (major ? 6 : 3)));
        ctx.lineTo(R + Math.cos(a) * (R - 1), R + Math.sin(a) * (R - 1));
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  // Only re-mount the raf loop when refs change identity (never in practice)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerPositionRef, playerRotationYRef, shardPositions]);

  const remaining = shardPositions.length - collectedShards.size;

  return (
    <div
      className="fixed z-[55] pointer-events-none select-none font-mono
                 bottom-[calc(env(safe-area-inset-bottom,0px)+16px)]
                 right-[calc(env(safe-area-inset-right,0px)+16px)]"
      style={{ filter: 'drop-shadow(0 0 12px rgba(74,222,128,0.28))' }}
    >
      {/* Header label */}
      <div className="flex justify-between items-center mb-1 px-0.5
                      text-[9px] text-emerald-400/70 tracking-[0.18em] uppercase">
        <span>SCANNER</span>
        <span className="text-cyan-300/80">{remaining}/{shardPositions.length}</span>
      </div>
      <canvas ref={canvasRef} className="block rounded-full" />
    </div>
  );
};

// ─── NightVisionLights ───────────────────────────────────────────────────────

interface NightVisionLightsProps {
  active: boolean;
}

/**
 * Moderate-intensity green lights mounted inside the canvas when NV is active.
 * Illuminates geometry so it reads through the dark CSS overlay without blowing
 * out the scene.
 */
export const NightVisionLights: React.FC<NightVisionLightsProps> = ({ active }) => {
  if (!active) return null;
  return (
    <>
      <ambientLight intensity={2.2} color="#5affb0" />
      <hemisphereLight intensity={1.0} color="#7affc4" groundColor="#03100a" />
    </>
  );
};
