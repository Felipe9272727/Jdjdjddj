/**
 * Entradas rápidas do Andar 8 para o Modo Desenvolvedor.
 *
 * O destino chega explicitamente do menu. Não usamos um flag global: ele podia
 * se perder durante a troca MainMenu -> App e fazia o botão YOURSELF abrir o
 * começo do Andar 8 em vez da quinta memória.
 */
import { f8, f8Bump, f8Reset } from './f8Arquivo';
import { p8JumpToMemory, p8Reset } from './f8Platformer';

export const F8_BOSS_MEMORY = 4;

/** Prepara uma luta nova do YOURSELF e entra diretamente na quinta memória. */
export function f8StartBoss(): void {
    f8Reset();
    p8Reset();
    f8.phase = 'platformer';
    p8JumpToMemory(F8_BOSS_MEMORY);
    f8Bump();
}
