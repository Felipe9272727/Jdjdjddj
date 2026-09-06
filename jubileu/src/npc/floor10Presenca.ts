import type { Floor10Perception } from './floor10Perception';
/** The body may only track coordinates supplied by a visible observation. */
export function jogadorVisivelParaOlhar(p: Pick<Floor10Perception, 'player'>) {
    return p.player?.visible ? p.player.position : null;
}

import type { Floor10MotorPlan } from './floor10MotorCortex';
/** A gesture belongs to the selected plan and starts only at its grounded destination. */
export function gestoChegouAoDestino(pendente: Floor10MotorPlan | null | undefined,
    atual: Floor10MotorPlan | null | undefined, alvo: { x: number; z: number } | null | undefined,
    corpo: { x: number; z: number }): boolean {
    return !!pendente && pendente === atual && !!alvo && Math.hypot(corpo.x-alvo.x, corpo.z-alvo.z) <= 0.42;
}
