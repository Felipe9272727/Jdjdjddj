import { Fragment, Profiler, type ReactNode, type ProfilerOnRenderCallback } from 'react';
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
