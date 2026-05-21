/**
 * NightVisionOverlay.tsx — tactical radar / night-vision effect.
 *
 * Two pieces:
 *  1. <NightVisionFx> — purely DOM/CSS. Near-black tactical overlay with a
 *     green phosphor grid, expanding radar rings, and a reticle vignette.
 *     The very bright NightVisionLights in the 3D scene punch through the
 *     dark layer as glowing green silhouettes — the "radar" read.
 *  2. <NightVisionLights> — bright green Three.js lights mounted inside the
 *     canvas so all geometry glows and becomes visible through the overlay.
 *
 * NON-NEGOTIABLES (from MEMORY.md):
 *  - No `<spotLight distance={0}>` while alive.
 *  - No `useFrame` priority != 0 (we don't use useFrame here).
 */

import React, { useEffect, useRef, useState } from 'react';

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
      {/* Layer 1: Near-black tactical overlay — suppresses the scene so only
          bright NV-lit surfaces punch through as glowing green silhouettes */}
      <div
        className="fixed inset-0 z-[18] pointer-events-none transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          backgroundColor: 'rgba(0,0,0,0.88)',
          mixBlendMode: 'multiply',
        }}
      />

      {/* Layer 2: Green phosphor base + tactical grid */}
      <div
        className="fixed inset-0 z-[19] pointer-events-none transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          background: [
            'radial-gradient(ellipse at center, rgba(30,255,100,0.14) 0%, rgba(0,120,40,0.06) 55%, rgba(0,40,16,0.28) 100%)',
          ].join(', '),
          backgroundImage: [
            'radial-gradient(ellipse at center, rgba(30,255,100,0.14) 0%, rgba(0,120,40,0.06) 55%, rgba(0,40,16,0.28) 100%)',
            'linear-gradient(rgba(0,255,80,0.050) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(0,255,80,0.050) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: 'auto, 48px 48px, 48px 48px',
          mixBlendMode: 'screen',
        }}
      />

      {/* Layer 3: Tactical reticle vignette — dark edges, clear center */}
      <div
        className="fixed inset-0 z-[20] pointer-events-none transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          background:
            'radial-gradient(ellipse 50% 62% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.90) 100%)',
        }}
      />

      {/* Radar rings — 3 phase-offset expanding circles emanating from center */}
      {active && (
        <div className="fixed inset-0 z-[21] pointer-events-none overflow-hidden">
          <div className="nv-ring nv-ring-1" />
          <div className="nv-ring nv-ring-2" />
          <div className="nv-ring nv-ring-3" />
        </div>
      )}

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

        /* Radar ring base */
        .nv-ring {
          position: absolute;
          width: 80vmax; height: 80vmax;
          left: 50%; top: 50%;
          border-radius: 50%;
          border: 1.5px solid rgba(40, 255, 100, 0.55);
          box-shadow: 0 0 6px rgba(40, 255, 100, 0.25);
          transform: translate(-50%, -50%) scale(0.06);
          opacity: 0;
          animation: nvRadarRing 3.8s ease-out infinite;
        }
        .nv-ring-2 { animation-delay: 1.27s; }
        .nv-ring-3 { animation-delay: 2.53s; }

        @keyframes nvRadarRing {
          0%   { transform: translate(-50%, -50%) scale(0.06); opacity: 0.8; }
          65%  { opacity: 0.18; }
          100% { transform: translate(-50%, -50%) scale(1.1);  opacity: 0;   }
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
      <ambientLight intensity={4.8} color="#50ffaa" />
      <hemisphereLight intensity={2.6} color="#90ffcc" groundColor="#0a2014" />
    </>
  );
};
