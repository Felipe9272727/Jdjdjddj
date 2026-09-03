import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFloor10SystemPrompt } from '../npc/floor10Canon';
import {
    esquecerConvivenciaEmMemoria, registrarFalaDoJogador, salvarConvivencia,
} from '../npc/floor10Convivencia';

/**
 * ── A LIGAÇÃO, NÃO AS PEÇAS ──────────────────────────────────────────────
 *
 * `convivencia.test.ts` prova que o registro grava, lê e resiste a lixo. Este
 * prova a única coisa que importa para o jogador: que o Nilo LÊ isso quando vai
 * falar. Um módulo perfeito que ninguém liga no prompt não muda uma vírgula do
 * que ele diz.
 */
function lojaDeMentira(): Storage {
    const dados = new Map<string, string>();
    return {
        get length() { return dados.size; },
        clear: () => dados.clear(),
        getItem: (k: string) => dados.get(k) ?? null,
        key: (i: number) => [...dados.keys()][i] ?? null,
        removeItem: (k: string) => { dados.delete(k); },
        setItem: (k: string, v: string) => { dados.set(k, String(v)); },
    } as Storage;
}

beforeEach(() => {
    vi.stubGlobal('localStorage', lojaDeMentira());
    esquecerConvivenciaEmMemoria();
});
afterEach(() => { vi.unstubAllGlobals(); esquecerConvivenciaEmMemoria(); });

describe('o prompt carrega o que eles já viveram', () => {
    it('no primeiro encontro o prompt não engorda um byte', () => {
        // Cada bloco é relido em TODO turno. Um "esta é a primeira vez" seria
        // prefill pago para dizer ao modelo o que ele já faria sozinho.
        const prompt = buildFloor10SystemPrompt('oi', []);
        expect(prompt).not.toContain('O QUE VOCÊS JÁ VIVERAM');
    });

    it('depois de conversarem antes, o Nilo lê isso', () => {
        salvarConvivencia({
            encontros: 3,
            ultimaFala: Date.now() - 2 * 24 * 3_600_000,
            falasDoJogador: 11,
            ignoradas: 0,
        });
        esquecerConvivenciaEmMemoria();
        const prompt = buildFloor10SystemPrompt('oi', []);
        expect(prompt).toContain('O QUE VOCÊS JÁ VIVERAM');
        expect(prompt).toContain('conversaram 3 vezes');
        expect(prompt).toContain('sumiu por cerca de 2 dias');
    });

    it('a lembrança vem DEPOIS da persona — o prefixo em cache tem de sobreviver', () => {
        // A persona é o prefixo estável de todo prompt. Pôr algo que muda antes
        // dela invalidaria o cache de prefixo a cada fala, e isso já custou 30 s
        // por turno neste projeto (ver JA-TENTADO).
        salvarConvivencia({ encontros: 2, ultimaFala: Date.now(), falasDoJogador: 4, ignoradas: 0 });
        esquecerConvivenciaEmMemoria();
        const prompt = buildFloor10SystemPrompt('oi', []);
        expect(prompt.indexOf('Você é Nilo Azevedo'))
            .toBeLessThan(prompt.indexOf('O QUE VOCÊS JÁ VIVERAM'));
    });

    it('falar faz o encontro contar, e o próximo prompt já sabe', () => {
        expect(buildFloor10SystemPrompt('oi', [])).not.toContain('O QUE VOCÊS JÁ VIVERAM');
        registrarFalaDoJogador();
        expect(buildFloor10SystemPrompt('e aí', [])).toContain('conversaram uma vez');
    });

    it('duas falas na mesma conversa continuam sendo UM encontro', () => {
        const agora = Date.now();
        registrarFalaDoJogador(agora);
        registrarFalaDoJogador(agora + 30_000);
        expect(buildFloor10SystemPrompt('oi', [])).toContain('conversaram uma vez');
    });
});
