/**
 * Entradas rápidas do Andar 8 para o Modo Desenvolvedor.
 *
 * O destino chega explicitamente do menu. Não usamos um flag global: ele podia
 * se perder durante a troca MainMenu -> App e fazia o botão YOURSELF abrir o
 * começo do Andar 8 em vez da quinta memória.
 */
import { f8, f8Bump, f8Reset } from './f8Arquivo';
import { curMem, p8, p8JumpToMemory, p8Reset } from './f8Platformer';

export const F8_BOSS_MEMORY = 4;

/** Prepara uma luta nova do YOURSELF e entra diretamente na quinta memória. */
export function f8StartBoss(): void {
    f8Reset();
    p8Reset();
    f8.phase = 'platformer';
    p8JumpToMemory(F8_BOSS_MEMORY);
    const arenaX = curMem().boss?.arenaX ?? p8.x;
    p8.x = arenaX; p8.y = 0; p8.vx = 0; p8.vy = 0; p8.onGround = true;
    p8.lastGroundX = arenaX; p8.lastGroundY = 0;
    f8Bump();
}
