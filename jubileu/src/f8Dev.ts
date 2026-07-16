/**
 * Entradas rápidas do Andar 8 para o Modo Desenvolvedor.
 *
 * O flag fica separado da cena para o menu não precisar conhecer detalhes do
 * motor. Ele é consumido uma única vez pelo App ao iniciar o andar.
 */
import { f8, f8Bump, f8Reset } from './f8Arquivo';
import { p8JumpToMemory, p8Reset } from './f8Platformer';

export const F8_BOSS_MEMORY = 4;

export const f8Dev = {
    boss: false,
};

/** Retorna true quando consumiu o atalho e preparou a luta do YOURSELF. */
export function f8ApplyBossSkip(): boolean {
    if (!f8Dev.boss) return false;
    f8Dev.boss = false;
    f8Reset();
    p8Reset();
    f8.phase = 'platformer';
    p8JumpToMemory(F8_BOSS_MEMORY);
    f8Bump();
    return true;
}
