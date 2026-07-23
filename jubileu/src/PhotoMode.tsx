// ─── Photo Mode (GPU path tracer) ───────────────────────────────────────────
//
// A non-realtime "cinematic still": freeze the game, then progressively
// PATH-TRACE the current view with three-gpu-pathtracer (real ray-traced GI,
// soft shadows, reflections) over a few seconds, and let the player save the
// PNG. This is the only place actual ray tracing is viable here — gameplay
// stays on the realtime WebGL raster path; this only runs on an explicit press.
//
// Hard rules baked in:
//  • Fully inert until activated — zero cost during normal play.
//  • Everything wrapped in try/catch with a graceful "not supported on this
//    GPU" fallback, so a device that can't path-trace never breaks the game.
//  • On close it disposes the tracer and hands rendering back to R3F.
//
// Path tracing needs WebGL2 + float render targets; it converges best on PBR
// materials, so the activator is gated to the photographic floors (lobby,
// house, hotel suite) by the caller.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Imported eagerly (the build is one inlined chunk anyway). The heavy WASM-free
// GPU work only happens once setScene() runs, which is gated behind activation.
import { WebGLPathTracer } from 'three-gpu-pathtracer';

export interface PhotoProgress {
    active: boolean;
    samples: number;
    total: number;
    failed: boolean;
    done: boolean;
}

export const PHOTO_TOTAL_SAMPLES = 220; // converges to a clean still in a few seconds on a real GPU

/**
 * Lives INSIDE the <Canvas>. While `active`, it takes over rendering (useFrame
 * priority 1) and accumulates path-traced samples of the frozen scene. Reports
 * progress up via callbacks. Never throws past its own try/catch.
 */
export const PhotoModeRig: React.FC<{
    active: boolean;
    onSample: (samples: number) => void;
    onFailed: () => void;
}> = ({ active, onSample, onFailed }) => {
    const gl = useThree((s) => s.gl);
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);
    const tracerRef = useRef<WebGLPathTracer | null>(null);
    const builtRef = useRef(false);
    const failedRef = useRef(false);

    // Build / tear down the tracer on the active edge.
    useEffect(() => {
        if (!active) return;
        builtRef.current = false;
        failedRef.current = false;
        let cancelled = false;
        try {
            const tracer = new WebGLPathTracer(gl);
            tracer.tiles.set(3, 3);      // split the frame so a sample never stalls the tab
            tracer.bounces = 5;
            tracer.filterGlossyFactor = 0.5;
            tracer.renderScale = 1;
            // setSceneAsync builds the BVH off the main work where possible.
            const built = tracer.setSceneAsync(scene, camera);
            Promise.resolve(built)
                .then(() => { if (!cancelled) { tracerRef.current = tracer; builtRef.current = true; } })
                .catch((e) => { console.warn('[PhotoMode] setScene failed:', e); failedRef.current = true; onFailed(); });
        } catch (e) {
            console.warn('[PhotoMode] init failed:', e);
            failedRef.current = true;
            onFailed();
        }
        return () => {
            cancelled = true;
            try { tracerRef.current?.dispose(); } catch { /* ignore */ }
            tracerRef.current = null;
            builtRef.current = false;
        };
    }, [active, gl, scene, camera, onFailed]);

    // Render path-traced samples. priority 1 ⇒ R3F yields the render to us.
    useFrame(() => {
        if (!active || failedRef.current) return;
        const tracer = tracerRef.current;
        if (!tracer || !builtRef.current) return;
        try {
            if (tracer.samples < PHOTO_TOTAL_SAMPLES) {
                tracer.renderSample();
                onSample(Math.floor(tracer.samples));
            }
        } catch (e) {
            console.warn('[PhotoMode] renderSample failed:', e);
            failedRef.current = true;
            onFailed();
        }
    }, active ? 1 : 0);

    return null;
};

/**
 * DOM overlay (OUTSIDE the Canvas): progress bar, Save PNG, Close. Reads the
 * shared canvas for the PNG so it captures exactly what the tracer rendered.
 */
export const PhotoModeOverlay: React.FC<{
    progress: PhotoProgress;
    onClose: () => void;
}> = ({ progress, onClose }) => {
    const save = useCallback(() => {
        try {
            const canvas = document.querySelector('canvas');
            if (!canvas) return;
            const url = (canvas as HTMLCanvasElement).toDataURL('image/png');
            const a = document.createElement('a');
            a.href = url;
            a.download = `normal-elevator-photo-${Date.now()}.png`;
            a.click();
        } catch (e) {
            console.warn('[PhotoMode] save failed:', e);
        }
    }, []);

    if (!progress.active) return null;
    const pct = Math.min(100, Math.round((progress.samples / progress.total) * 100));

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 70, pointerEvents: 'none', fontFamily: '"Source Sans 3","Segoe UI",sans-serif' }}>
            {/* cinematic letterbox */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '8vh', background: 'rgba(0,0,0,0.92)' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '8vh', background: 'rgba(0,0,0,0.92)' }} />

            {/* top label */}
            <div style={{ position: 'absolute', top: 'calc(8vh + 12px)', left: 0, right: 0, textAlign: 'center', color: '#ffe7b3', letterSpacing: '0.3em', fontSize: 12, textShadow: '0 1px 3px #000' }}>
                {progress.failed ? 'PHOTO MODE INDISPONÍVEL NESTE DISPOSITIVO'
                    : progress.done ? 'FOTO PRONTA'
                    : 'REVELANDO… RAY TRACING'}
            </div>

            {/* control bar */}
            <div style={{ position: 'absolute', bottom: 'calc(8vh + 14px)', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, pointerEvents: 'auto' }}>
                {!progress.failed && (
                    <div style={{ width: 240, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.15)', overflow: 'hidden', boxShadow: '0 1px 4px #000' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#f0b35a,#ffe7b3)', transition: 'width 0.2s linear' }} />
                    </div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                    {progress.done && !progress.failed && (
                        <button onClick={save} style={btn('#3a2a12', '#ffe7b3')}>Salvar PNG</button>
                    )}
                    <button onClick={onClose} style={btn('#1a1a1a', '#ddd')}>Fechar</button>
                </div>
            </div>
        </div>
    );
};

const btn = (bg: string, fg: string): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.25)',
    background: bg, color: fg, fontSize: 13, letterSpacing: '0.08em', cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
});

/**
 * Small floating activator button. Caller decides when to render it (e.g. only
 * on photographic floors, and not during cutscenes).
 */
export const PhotoModeButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button
        onClick={onClick}
        aria-label="Modo Foto (ray tracing)"
        title="Modo Foto — ray tracing"
        style={{
            position: 'absolute', bottom: 18, right: 18, zIndex: 40,
            width: 46, height: 46, borderRadius: 12,
            background: 'rgba(20,16,10,0.7)', border: '1px solid rgba(240,179,90,0.5)',
            color: '#ffe7b3', fontSize: 20, cursor: 'pointer', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
        }}
    >📷</button>
);

/** State hook the caller wires to both the rig (in Canvas) and overlay (DOM). */
export const usePhotoMode = () => {
    const [progress, setProgress] = useState<PhotoProgress>({ active: false, samples: 0, total: PHOTO_TOTAL_SAMPLES, failed: false, done: false });
    const open = useCallback(() => setProgress({ active: true, samples: 0, total: PHOTO_TOTAL_SAMPLES, failed: false, done: false }), []);
    const close = useCallback(() => setProgress((p) => ({ ...p, active: false })), []);
    const onSample = useCallback((s: number) => setProgress((p) => p.active ? { ...p, samples: s, done: s >= p.total } : p), []);
    const onFailed = useCallback(() => setProgress((p) => ({ ...p, failed: true, done: true })), []);
    return { progress, open, close, onSample, onFailed };
};
