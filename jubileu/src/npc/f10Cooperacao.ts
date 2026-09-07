import { PRISON_REACH, type F10PrisonState } from './f10Prison';
type Ponto = { x: number; z: number };
export const conviteDoNilo: { tipo: 'aparelho' | 'saida' | null } = { tipo: null };
export function pedirCooperacao(tipo: 'aparelho' | 'saida'): void { conviteDoNilo.tipo = tipo; }
export function cancelarCooperacao(): void { conviteDoNilo.tipo = null; }
/** An invitation supplies an observable task, never the hidden solution of a puzzle. */
export function aparelhoComplementar(state: F10PrisonState, player: Ponto | null): string | null {
    if (!player) return null;
    for (const lock of state.locks) {
        if (lock.solved) continue;
        for (let i=0;i<2;i++) {
            const d=state.devices[lock.devices[i]];
            if (d && Math.hypot(player.x-d.x,player.z-d.z)<=PRISON_REACH) return lock.devices[1-i];
        }
    }
    return null;
}
export function alvoDaCooperacao(state:F10PrisonState,player:Ponto|null):Ponto|null {
    if (conviteDoNilo.tipo==='saida') {
        if (state.doorOpen) return {x:-0.8,z:-12.6};
        cancelarCooperacao();return null;
    }
    if (conviteDoNilo.tipo!=='aparelho') return null;
    const id=aparelhoComplementar(state,player);
    if (!id) { cancelarCooperacao();return null; }
    const d=state.devices[id];return {x:d.x,z:d.z};
}
export function dentroDoRetorno(p:Ponto|null):boolean {
    return !!p && Math.abs(p.x)<2.5 && p.z<=-10.6 && p.z>=-16;
}
export function podemSairJuntos(state:F10PrisonState,player:Ponto|null,nilo:Ponto|null):boolean {
    return state.doorOpen && dentroDoRetorno(player) && dentroDoRetorno(nilo);
}
/** Session ending: the guest who boarded is visible in the lobby after the return. */
export const retornoDaSala = { concluido: false };
