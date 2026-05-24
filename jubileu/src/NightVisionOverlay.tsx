/**
 * NightVisionOverlay.tsx — tactical night-vision effect with shard minimap.
 *
 * Two pieces:
 *  1. <NightVisionFx> — DOM/CSS phosphor stack + canvas radar minimap.
 *     The minimap polls player & shard positions via raf (no React re-render
 *     per frame); when NV is inactive the raf loop is parked.
 *  2. <NightVisionLights> — bright green Three.js lights mounted inside the
 *     canvas so geometry glows and silhouettes punch through the dark CSS.
 *
 * NON-NEGOTIABLES (from MEMORY.md):
 *  - No `<spotLight distance={0}>` while alive.
 *  - No `useFrame` priority != 0 (raf used instead).
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface NightVisionFxProps {
  active: boolean;
  // Optional minimap data. When omitted, only the visual overlay renders
  // (e.g. Floor 1 doesn't have shards). Floor 2 wires all four.
  playerPositionRef?: React.MutableRefObject<THREE.Vector3>;
  playerRotationYRef?: React.MutableRefObject<number>;
  shardPositions?: ReadonlyArray<readonly [number, number, number]>;
  collectedShards?: Set<number>;
}

// World units shown across the radar (one edge = RADAR_RANGE units). Floor 2
// underwater zone spans roughly ±25 on x/z, so 60 covers the player's
// useful read while keeping distant shards visibly grouped at the edge.
const RADAR_RANGE = 60;

export const NightVisionFx: React.FC<NightVisionFxProps> = ({
  active,
  playerPositionRef,
  playerRotationYRef,
  shardPositions,
  collectedShards,
}) => {
  const [bootKey, setBootKey] = useState(0);
  const prevActive = useRef(false);
  useEffect(() => {
    if (active && !prevActive.current) setBootKey(k => k + 1);
    prevActive.current = active;
  }, [active]);

  // ── Minimap radar — canvas painted via raf while NV is on ──────────────
  const radarRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!active || !radarRef.current || !playerPositionRef || !shardPositions) return;
    const canvas = radarRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Render at 2x for crisp display on retina; CSS size handles layout.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sizeCss = 196;
    canvas.width = Math.floor(sizeCss * dpr);
    canvas.height = Math.floor(sizeCss * dpr);
    canvas.style.width = `${sizeCss}px`;
    canvas.style.height = `${sizeCss}px`;
    ctx.scale(dpr, dpr);

    const R = sizeCss / 2;          // radius in css px
    const startTs = performance.now();

    const draw = () => {
      const now = performance.now();
      const t = (now - startTs) / 1000;
      const pp = playerPositionRef.current;
      const heading = playerRotationYRef?.current ?? 0;

      ctx.clearRect(0, 0, sizeCss, sizeCss);

      // Background disc (dark phosphor)
      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R - 1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(2, 18, 8, 0.92)';
      ctx.fill();
      ctx.clip();

      // Crosshatch grid (rotates with player heading so it feels alive)
      ctx.strokeStyle = 'rgba(40, 255, 100, 0.10)';
      ctx.lineWidth = 1;
      const grid = 18;
      const off = ((t * 4) % grid);
      for (let x = -grid + off; x < sizeCss + grid; x += grid) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, sizeCss); ctx.stroke();
      }
      for (let y = -grid + off; y < sizeCss + grid; y += grid) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(sizeCss, y); ctx.stroke();
      }

      // Concentric range rings
      ctx.strokeStyle = 'rgba(40, 255, 100, 0.28)';
      ctx.lineWidth = 1;
      for (let r = R / 3; r < R; r += R / 3) {
        ctx.beginPath(); ctx.arc(R, R, r, 0, Math.PI * 2); ctx.stroke();
      }
      // Crosshair
      ctx.strokeStyle = 'rgba(40, 255, 100, 0.22)';
      ctx.beginPath(); ctx.moveTo(R, 0); ctx.lineTo(R, sizeCss);
      ctx.moveTo(0, R); ctx.lineTo(sizeCss, R); ctx.stroke();

      // Sweep wedge — classic radar arm. Sweeps clockwise, ~4s/rev.
      const sweepAng = (t * Math.PI / 2) % (Math.PI * 2);
      const sweepGrad = ctx.createRadialGradient(R, R, 0, R, R, R);
      sweepGrad.addColorStop(0, 'rgba(120, 255, 160, 0.45)');
      sweepGrad.addColorStop(1, 'rgba(40, 255, 100, 0.0)');
      ctx.beginPath();
      ctx.moveTo(R, R);
      ctx.arc(R, R, R, sweepAng - 0.55, sweepAng);
      ctx.closePath();
      ctx.fillStyle = sweepGrad;
      ctx.fill();
      // Bright sweep edge
      ctx.strokeStyle = 'rgba(160, 255, 200, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(R, R);
      ctx.lineTo(R + Math.cos(sweepAng) * R, R + Math.sin(sweepAng) * R);
      ctx.stroke();

      // Shards — relative to player, rotated by -heading so forward = up
      const cos = Math.cos(-heading);
      const sin = Math.sin(-heading);
      const blink = 0.7 + Math.sin(t * 6) * 0.3;
      for (let i = 0; i < shardPositions.length; i++) {
        const collected = collectedShards?.has(i);
        const s = shardPositions[i];
        const dx = s[0] - pp.x;
        const dz = s[2] - pp.z;
        // Rotate around the player so the radar is player-relative.
        let rx = dx * cos - dz * sin;
        let ry = dx * sin + dz * cos;
        // Normalize to radar disc; clamp to edge with an arrow if out of range.
        const distNorm = Math.sqrt(rx * rx + ry * ry) / RADAR_RANGE;
        const edgeR = R - 10;
        let px: number, py: number, atEdge = false;
        if (distNorm > 1) {
          const ang = Math.atan2(ry, rx);
          px = R + Math.cos(ang) * edgeR;
          py = R + Math.sin(ang) * edgeR;
          atEdge = true;
        } else {
          px = R + (rx / RADAR_RANGE) * edgeR;
          py = R + (ry / RADAR_RANGE) * edgeR;
        }

        if (collected) {
          // Small dim cross — "collected" marker
          ctx.strokeStyle = 'rgba(120, 255, 160, 0.28)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px - 3, py - 3); ctx.lineTo(px + 3, py + 3);
          ctx.moveTo(px - 3, py + 3); ctx.lineTo(px + 3, py - 3);
          ctx.stroke();
          continue;
        }

        // Uncollected — pulsing cyan diamond (matches shard color)
        const dotR = atEdge ? 3 : 4;
        ctx.shadowColor = '#9be8ff';
        ctx.shadowBlur = 8;
        ctx.fillStyle = `rgba(155, 232, 255, ${blink})`;
        ctx.beginPath();
        ctx.moveTo(px, py - dotR);
        ctx.lineTo(px + dotR, py);
        ctx.lineTo(px, py + dotR);
        ctx.lineTo(px - dotR, py);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        if (atEdge) {
          // Direction arrowhead points outward to indicate out-of-range
          const ang = Math.atan2(ry, rx);
          ctx.strokeStyle = `rgba(155, 232, 255, ${blink * 0.8})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(px + Math.cos(ang) * 5, py + Math.sin(ang) * 5);
          ctx.lineTo(px + Math.cos(ang) * 9, py + Math.sin(ang) * 9);
          ctx.stroke();
        }
      }

      // Player chevron (always centered, facing up — radar is player-relative)
      ctx.fillStyle = 'rgba(180, 255, 200, 0.95)';
      ctx.strokeStyle = 'rgba(40, 255, 100, 0.95)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(R, R - 7);
      ctx.lineTo(R + 5, R + 5);
      ctx.lineTo(R, R + 2);
      ctx.lineTo(R - 5, R + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      // Outer bezel ring (drawn outside the clip)
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.stroke();
      // Cardinal ticks
      ctx.strokeStyle = 'rgba(120, 255, 160, 0.55)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const major = i % 3 === 0;
        const r0 = R - (major ? 8 : 4);
        const r1 = R - 1;
        ctx.beginPath();
        ctx.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0);
        ctx.lineTo(R + Math.cos(a) * r1, R + Math.sin(a) * r1);
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active, playerPositionRef, playerRotationYRef, shardPositions, collectedShards]);

  const hasMinimap = !!(active && playerPositionRef && shardPositions);
  const remainingShards = shardPositions && collectedShards
    ? shardPositions.length - collectedShards.size
    : 0;

  return (
    <>
      {/* Layer 1: Cooler dark overlay — desaturates the scene before tint
          rather than blacking it out (multiply with mid-grey instead of near-
          black, so the underlying scene still reads through). */}
      <div
        className="fixed inset-0 z-[18] pointer-events-none transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          backgroundColor: 'rgb(18,42,26)',
          mixBlendMode: 'multiply',
        }}
      />

      {/* Layer 2: Green phosphor tint — subtle, not a flood. Keeps the scene's
          structure visible while shifting the hue toward NV green. */}
      <div
        className="fixed inset-0 z-[19] pointer-events-none transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          background:
            'radial-gradient(ellipse at center, rgba(40,255,120,0.06) 0%, rgba(0,80,30,0.03) 60%, rgba(0,20,10,0.18) 100%)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Layer 2b: Scanlines — fine horizontal striping like a CRT phosphor tube */}
      <div
        className="fixed inset-0 z-[20] pointer-events-none nv-scanlines transition-opacity duration-300"
        style={{ opacity: active ? 0.55 : 0 }}
      />

      {/* Layer 2c: Animated grain (SVG turbulence) */}
      <div
        className="fixed inset-0 z-[20] pointer-events-none nv-grain transition-opacity duration-300"
        style={{ opacity: active ? 0.22 : 0 }}
      />

      {/* Layer 3: Tactical reticle vignette — dark edges, clear center */}
      <div
        className="fixed inset-0 z-[21] pointer-events-none transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          background:
            'radial-gradient(ellipse 50% 62% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.92) 100%)',
        }}
      />

      {/* Layer 3b: Chromatic aberration tint — subtle cyan/red fringes at sides */}
      <div
        className="fixed inset-0 z-[21] pointer-events-none transition-opacity duration-300"
        style={{
          opacity: active ? 0.35 : 0,
          background:
            'linear-gradient(90deg, rgba(0,140,180,0.10) 0%, transparent 12%, transparent 88%, rgba(180,40,40,0.08) 100%)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Top-left HUD chip */}
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

      {/* Bottom-right minimap radar */}
      {hasMinimap && (
        <div
          className="fixed z-[23] pointer-events-none font-mono text-emerald-300
                     bottom-[calc(env(safe-area-inset-bottom,0px)+16px)]
                     right-[calc(env(safe-area-inset-right,0px)+16px)]"
          style={{ filter: 'drop-shadow(0 0 18px rgba(74,222,128,0.32))' }}
        >
          <canvas ref={radarRef} className="block" />
          {/* Range / signal label below the radar */}
          <div className="mt-1 flex justify-between text-[9px] tracking-widest opacity-80 px-1">
            <span>R {RADAR_RANGE}m</span>
            <span>{remainingShards}/{shardPositions?.length ?? 0}</span>
          </div>
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

        /* CRT scanlines — pure CSS, no DOM cost */
        .nv-scanlines {
          background-image: repeating-linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0) 0px,
            rgba(0, 0, 0, 0) 2px,
            rgba(0, 0, 0, 0.35) 3px,
            rgba(0, 0, 0, 0) 4px
          );
          mix-blend-mode: multiply;
          animation: nvScroll 4s linear infinite;
        }
        @keyframes nvScroll {
          0%   { background-position-y: 0; }
          100% { background-position-y: 32px; }
        }

        /* Subtle animated grain — SVG turbulence as data-uri */
        .nv-grain {
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.15  0 0 0 0 1  0 0 0 0 0.4  0 0 0 0.22 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
          background-size: 220px 220px;
          mix-blend-mode: screen;
          animation: nvGrain 0.6s steps(6) infinite;
        }
        @keyframes nvGrain {
          0%   { transform: translate(0, 0); }
          20%  { transform: translate(-6px, 4px); }
          40%  { transform: translate(5px, -3px); }
          60%  { transform: translate(-3px, -5px); }
          80%  { transform: translate(4px, 3px); }
          100% { transform: translate(0, 0); }
        }
      `}</style>
    </>
  );
};

interface NightVisionLightsProps {
  active: boolean;
}

/**
 * Very bright green lights mounted inside the canvas when NV is active.
 * High intensity makes all geometry glow strongly — the dark CSS overlay
 * then suppresses everything except those bright spots, creating the
 * radar/tactical silhouette effect.
 */
export const NightVisionLights: React.FC<NightVisionLightsProps> = ({ active }) => {
  if (!active) return null;
  return (
    <>
      {/* Moderate intensity so the scene is readable but not blown out — the
          CSS overlay tints what's already lit instead of inventing brightness. */}
      <ambientLight intensity={2.2} color="#5affb0" />
      <hemisphereLight intensity={1.0} color="#7affc4" groundColor="#03100a" />
    </>
  );
};
