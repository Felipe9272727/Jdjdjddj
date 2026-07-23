import { describe, it, expect } from 'vitest';
import { visibleText } from '../npc/llmEngine';

describe('npc/llmEngine.visibleText — o filtro ao vivo dos blocos <think>', () => {
    it('texto comum passa intacto (só apara o início)', () => {
        expect(visibleText('  e aí, beleza?')).toBe('e aí, beleza?');
        expect(visibleText('oi')).toBe('oi');
    });

    it('bloco think FECHADO: mostra o que vem depois do último </think>', () => {
        expect(visibleText('<think>hmm vou pensar</think>  claro que sim!')).toBe('claro que sim!');
    });

    it('bloco think ABERTO (stream no meio do raciocínio): mostra só o que veio antes', () => {
        expect(visibleText('deixa eu ver<think>raciocinando ainda')).toBe('deixa eu ver');
    });

    it('vários blocos: vale o texto DEPOIS do último fechamento', () => {
        expect(visibleText('<think>a</think> meio <think>b</think> fim!')).toBe('fim!');
    });

    it('SÓ think (o bug do "não responde"): sobra vazio — a UI mostra erro, não "…" mudo', () => {
        expect(visibleText('<think>raciocínio comeu todos os tokens')).toBe('');
        expect(visibleText('<think>a</think>')).toBe('');
    });

    it('prefill do enable_thinking=false (bloco vazio semeado pelo WebLLM): some na exibição', () => {
        expect(visibleText('<think>\n\n</think>\n\nresposta de verdade')).toBe('resposta de verdade');
    });
});
