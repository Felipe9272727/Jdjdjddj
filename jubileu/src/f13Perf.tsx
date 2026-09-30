import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, Fragment, Profiler, type ReactNode, type ProfilerOnRenderCallback } from 'react';
export const profiling13 = import.meta.env.DEV && new URLSearchParams(location.search).has('f13perf');
const requestedQuality = profiling13 ? Number(new URLSearchParams(location.search).get('f13quality') ?? 2) : 2;
export const fixedQuality13 = profiling13 ? (Number.isFinite(requestedQuality) ? Math.max(0, Math.min(2, Math.round(requestedQuality))) : 2) : null;
const record: ProfilerOnRenderCallback = (id,phase,actualDuration,baseDuration) => {
    const w=window as any;
    const log=w.__f13React ?? (w.__f13React=[]);
    if(log.length<6000)log.push({id,phase,actualDuration,baseDuration,at:performance.now()});
};
export function Floor13Profile({children}:{children:ReactNode}) {
    return profiling13 ? <Profiler id="world" onRender={record}>{children}</Profiler> : <Fragment>{children}</Fragment>;
}

// ── PAINEL DE DESEMPENHO (?f13fps, também em produção) ────────────────────────
// Para medir no celular de verdade: qps, tempo de JS por quadro (useFrame +
// render), chamadas de desenho, triângulos e densidade. Lido a cada 500 ms.
export const painelFps13 = typeof location !== 'undefined' && new URLSearchParams(location.search).has('f13fps');
export const medidas13 = { qps: 0, jsMs: 0, calls: 0, tri: 0, dpr: 0, w: 0, h: 0 };
/** Dentro do Canvas: mede. Prioridade -1000 abre o quadro, +1000 fecha depois do render. */
export function MedidorFps13() {
    const gl = useThree((s) => s.gl);
    const t0 = useRef(0), n = useRef(0), soma = useRef(0), janela = useRef(performance.now());
    useEffect(() => { gl.info.autoReset = false; return () => { gl.info.autoReset = true; }; }, [gl]);
    useFrame(() => { t0.current = performance.now(); }, -1000);
    useFrame(() => {
        const agora = performance.now();
        soma.current += agora - t0.current; n.current++;
        if (agora - janela.current > 500) {
            const d = (agora - janela.current) / 1000;
            medidas13.qps = n.current / d; medidas13.jsMs = soma.current / n.current;
            medidas13.calls = gl.info.render.calls / n.current; medidas13.tri = gl.info.render.triangles / n.current;
            medidas13.dpr = gl.getPixelRatio(); medidas13.w = gl.domElement.width; medidas13.h = gl.domElement.height;
            n.current = 0; soma.current = 0; janela.current = agora; gl.info.reset();
        }
    }, 1000);
    return null;
}
/** Fora do Canvas: o painel. */
export function PainelFps13({ nivel }: { nivel: number }) {
    const [, bump] = useState(0);
    useEffect(() => { const id = window.setInterval(() => bump((x) => x + 1), 500); return () => window.clearInterval(id); }, []);
    const m = medidas13;
    return <div style={{ position: 'absolute', left: 6, bottom: 6, zIndex: 50, pointerEvents: 'none', font: '11px monospace', color: '#0f0', background: 'rgba(0,0,0,.7)', padding: '4px 6px', borderRadius: 4, lineHeight: 1.35 }}>
        {m.qps.toFixed(0)} qps · JS {m.jsMs.toFixed(1)} ms<br />
        {m.calls.toFixed(0)} chamadas · {(m.tri / 1000).toFixed(0)}k tri<br />
        nível {nivel} · dpr {m.dpr.toFixed(2)} · {m.w}×{m.h}
    </div>;
}
