/**
 * RebreatherPutOnOverlay.tsx — one-shot cinematic when the diver hands you
 * the rebreather + NV gear.
 *
 * ~1.7s. Pure DOM/CSS — does not touch the canvas.
 *
 * Beats:
 *  0.00-0.20: screen fades to slight darken + saturation drop (player "looks at gear")
 *  0.20-0.55: two hand silhouettes rise from bottom holding a mask
 *  0.55-0.95: mask lifts toward the camera, shrinks/expands into a frame
 *             that hugs the screen edges
 *  0.95-1.40: mask settles. Subtle "clack" highlight on the bottom edge.
 *  1.40-1.70: overlay fades out, leaving the player with the small NV chip
 *             (rendered by NightVisionFx separately).
 *
 * Calls `onDone` when finished. The parent uses this to clear the flag.
 */

import React, { useEffect, useState } from 'react';

interface RebreatherPutOnOverlayProps {
  active: boolean;
  onDone: () => void;
}

export const RebreatherPutOnOverlay: React.FC<RebreatherPutOnOverlayProps> = ({
  active,
  onDone,
}) => {
  // Reset animation when active flips true (re-trigger)
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (active) {
      setKey(k => k + 1);
      const t = window.setTimeout(() => {
        onDone();
      }, 1700);
      return () => window.clearTimeout(t);
    }
  }, [active, onDone]);

  if (!active) return null;

  return (
    <div
      key={key}
      className="fixed inset-0 z-[95] pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {/* Stage 1: subtle full-screen darken + saturation drop ─────────────── */}
      <div className="absolute inset-0 animate-rb-darken"
        style={{ background: 'rgba(0,0,0,0.0)' }} />

      {/* Stage 2: hand silhouettes rising from the bottom ────────────────── */}
      <svg
        className="absolute inset-0 w-full h-full animate-rb-hands"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMax slice"
      >
        {/* Left hand */}
        <g fill="#C99A78" stroke="#7a5a3a" strokeWidth="0.4">
          <path d="M 28 130 L 28 75 Q 32 70 38 72 L 42 76 L 42 130 Z" />
          {/* Thumb */}
          <path d="M 42 80 Q 48 78 50 82 L 48 88 L 42 86 Z" />
        </g>
        {/* Right hand */}
        <g fill="#C99A78" stroke="#7a5a3a" strokeWidth="0.4">
          <path d="M 72 130 L 72 75 Q 68 70 62 72 L 58 76 L 58 130 Z" />
          <path d="M 58 80 Q 52 78 50 82 L 52 88 L 58 86 Z" />
        </g>
      </svg>

      {/* Stage 3: the mask itself — rises with the hands, then expands into a frame */}
      <div className="absolute inset-0 flex items-end justify-center animate-rb-mask">
        <svg
          viewBox="0 0 200 120"
          className="w-[68%] max-w-[640px] h-auto"
          preserveAspectRatio="xMidYMid meet"
          style={{ filter: 'drop-shadow(0 6px 18px rgba(0,30,50,0.85))' }}
        >
          {/* Mask frame */}
          <ellipse cx="100" cy="60" rx="86" ry="50" fill="#0E7490" stroke="#155E75" strokeWidth="3" />
          {/* Inner cushion */}
          <ellipse cx="100" cy="62" rx="78" ry="44" fill="#0a4a5a" />
          {/* Glass */}
          <ellipse cx="100" cy="58" rx="64" ry="34" fill="#67E8F9" opacity="0.85" />
          <ellipse cx="100" cy="58" rx="64" ry="34" fill="url(#glassGrad)" />
          {/* Glass highlights */}
          <ellipse cx="70" cy="50" rx="14" ry="6" fill="#FFFFFF" opacity="0.55" />
          <ellipse cx="130" cy="68" rx="8" ry="3" fill="#FFFFFF" opacity="0.30" />
          {/* Nose pocket */}
          <path d="M 86 100 Q 100 116 114 100 L 110 96 Q 100 104 90 96 Z" fill="#155E75" />
          {/* NV goggles clipped on top */}
          <g transform="translate(0, -6)">
            <rect x="64" y="6" width="32" height="22" rx="4" fill="#0E7490" stroke="#155E75" strokeWidth="2" />
            <rect x="104" y="6" width="32" height="22" rx="4" fill="#0E7490" stroke="#155E75" strokeWidth="2" />
            <circle cx="80" cy="17" r="7" fill="#0a3a2a" />
            <circle cx="120" cy="17" r="7" fill="#0a3a2a" />
            <circle cx="80" cy="17" r="4" fill="#10B981" opacity="0.9" />
            <circle cx="120" cy="17" r="4" fill="#10B981" opacity="0.9" />
            <circle cx="80" cy="17" r="1.5" fill="#FFFFFF" />
            <circle cx="120" cy="17" r="1.5" fill="#FFFFFF" />
          </g>
          <defs>
            <linearGradient id="glassGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.0)" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Stage 4: "mask hugs screen" — radial frame that closes in.
          A black mask with a clear hole in the middle. The hole shrinks
          to feel like the mask is being pressed onto the face. */}
      <div
        className="absolute inset-0 animate-rb-frame"
        style={{
          background:
            'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,12,18,0.92) 100%)',
        }}
      />

      {/* Final flash — quick white click on the edge to sell the "snap on" moment */}
      <div className="absolute inset-x-0 bottom-[40%] h-1 animate-rb-flash"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%)',
        }}
      />

      <style>{`
        @keyframes rbDarken {
          0%    { background: rgba(0,0,0,0); }
          20%   { background: rgba(0,8,14,0.42); }
          80%   { background: rgba(0,8,14,0.34); }
          100%  { background: rgba(0,8,14,0); }
        }
        .animate-rb-darken { animation: rbDarken 1.7s ease-out forwards; }

        @keyframes rbHands {
          0%    { opacity: 0; transform: translateY(40%); }
          20%   { opacity: 0.7; transform: translateY(20%); }
          55%   { opacity: 0.85; transform: translateY(0%); }
          80%   { opacity: 0.4; transform: translateY(-12%); }
          100%  { opacity: 0; transform: translateY(-30%); }
        }
        .animate-rb-hands { animation: rbHands 1.5s cubic-bezier(0.16,1,0.3,1) forwards; }

        @keyframes rbMask {
          0%    { opacity: 0; transform: translateY(80%) scale(0.55); }
          25%   { opacity: 1; transform: translateY(20%) scale(0.65); }
          55%   { opacity: 1; transform: translateY(-10%) scale(0.85); }
          80%   { opacity: 1; transform: translateY(-22%) scale(1.4); }
          92%   { opacity: 0.5; transform: translateY(-25%) scale(2.0); }
          100%  { opacity: 0; transform: translateY(-25%) scale(2.4); }
        }
        .animate-rb-mask { animation: rbMask 1.6s cubic-bezier(0.16,1,0.3,1) forwards; }

        @keyframes rbFrame {
          0%, 70%  { opacity: 0; }
          85%      { opacity: 1; }
          100%     { opacity: 0; }
        }
        .animate-rb-frame { animation: rbFrame 1.7s ease-out forwards; }

        @keyframes rbFlash {
          0%, 60%   { opacity: 0; transform: scaleX(0.3); }
          78%       { opacity: 1; transform: scaleX(1.1); }
          92%       { opacity: 0.7; transform: scaleX(1.0); }
          100%      { opacity: 0; transform: scaleX(0.8); }
        }
        .animate-rb-flash { animation: rbFlash 1.7s ease-out forwards; }
      `}</style>
    </div>
  );
};
