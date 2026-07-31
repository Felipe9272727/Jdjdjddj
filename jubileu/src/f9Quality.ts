/**
 * f9Quality.ts — FONTE ÚNICA da quality do Andar 9 (P0 mobile).
 *
 * Antes cada arquivo (Floor9Forest/Floor9Fauna) tinha sua cópia local do
 * leitor; agora TODOS leem daqui — a MESMA chave de localStorage que o
 * Settings.tsx/F9PostEffects usam ('jubileu_settings_v1' → .quality), com o
 * MESMO fallback (mobile → 'medium', desktop → 'high').
 *
 * Override de bench: `?q=low|medium|high` na URL força o tier (pro Felipe
 * testar no celular sem abrir o Settings; ignorado fora desses valores).
 *
 * Regras P0 (a tempestade travava o mobile e, sem o composer, o andar ficava
 * escuro demais):
 *  - 'high'  → tudo ligado (composer, névoa, sway pleno, chuva 1200/200).
 *  - ≠'high' → chuva ≤300, splashes ≤48, sway SÓ em aviso/onda e ≤200
 *    plantas, sem névoa de chão nem esporos extras, farol de oferenda SEM
 *    point light (emissive apenas), ≤1 luz nova, e PISO DE BRILHO (o grade
 *    escuro "Rain World" fica só no high — amb/hemi mais fortes, fog menos
 *    negro: floresta legível, Fiapo sempre visível).
 *  - 'low'   → + sem ghost-forest extra, portal simplificado (emissive, sem
 *    partículas), vento desligado.
 */

export type F9Quality = 'low' | 'medium' | 'high';

/** detecção de mobile (mesma heurística do Settings.isMobile). */
export function f9IsMobile(): boolean {
    return typeof navigator !== 'undefined'
        && /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent || '');
}

/** a quality efetiva: override ?q= → localStorage → fallback mobile/desktop. */
export function f9Quality(): F9Quality {
    try {
        if (typeof location !== 'undefined') {
            const q = new URLSearchParams(location.search).get('q');
            if (q === 'low' || q === 'medium' || q === 'high') return q;
        }
    } catch { /* ignora */ }
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('jubileu_settings_v1') : null;
        if (raw) {
            const q = (JSON.parse(raw) as { quality?: string }).quality;
            if (q === 'low' || q === 'medium' || q === 'high') return q;
        }
    } catch { /* ignora */ }
    return f9IsMobile() ? 'medium' : 'high';
}

/** tier "cheio" (visual Rain World completo, com composer)? */
export const f9IsHigh = (q: F9Quality): boolean => q === 'high';

/** tier "leve" (mobile padrão): tudo que ≠high recebe de corte. */
export const f9IsLite = (q: F9Quality): boolean => q !== 'high';

// ── orçamentos por tier (P0) ─────────────────────────────────────────────────
/** gotas de chuva instanciadas: 1200 no high · ≤300 nos demais. */
export const F9_RAIN_N = (q: F9Quality): number => (q === 'high' ? 1200 : 300);
/** anéis de splash: 200 no high · ≤48 nos demais. */
export const F9_SPLASH_N = (q: F9Quality): number => (q === 'high' ? 200 : 48);
/** taxa de spawn de splash/s (casa com o orçamento de slots). */
export const F9_SPLASH_RATE = (q: F9Quality): number => (q === 'high' ? 110 : 36);
/** teto de PLANTAS com sway por frame no tier leve (P0: ≤200, só aviso/onda). */
export const F9_SWAY_BUDGET_LITE = 200;
