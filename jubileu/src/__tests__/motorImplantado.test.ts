import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * ── O MOTOR IMPLANTADO É INSUBSTITUÍVEL ATÉ SEGUNDA ORDEM ───────────────
 *
 * `public/wllama-relaxed/` roda o granite **3× mais rápido** que qualquer
 * build que eu consiga produzir — inclusive o binário OFICIAL do wllama.
 * Medido em bancada ociosa, três repetições, 4 fios:
 *
 *     implantado ........ Qwen denso 8,81–9,00 tok/s · granite 4,64–4,88
 *     CDN oficial ....... Qwen denso 6,82           · granite 1,59
 *     rebuild de junho .. Qwen denso 6,65           · granite 1,59
 *     rebuild de 23/ago . Qwen denso 6,78           · granite 1,58
 *
 * E o aparelho do dono do jogo concorda: 3,96 tok/s com este binário, 2,20
 * quando um rebuild meu entrou no lugar. Foi uma regressão de verdade, sentida
 * por ele antes de eu perceber.
 *
 * Este teste existe porque eu JÁ sobrescrevi este arquivo uma vez, publicando
 * rebuilds como `?motor=q2k` e `?motor=base` sem nunca ter medido nenhum dos
 * dois contra o que estava no ar. Enquanto a receita dele não for reproduzida
 * (tarefa 19), trocar estes bytes é perder velocidade — e a perda só aparece
 * no aparelho, dias depois.
 *
 * Se este teste falhar, a pergunta certa NÃO é "atualizo a soma?". É: o
 * substituto foi medido contra o `agosto` em `bancada-navegador/q2k-ab.mjs`,
 * no granite, e ganhou?
 */
const SOMA_WASM = 'f7993f3245a5a8b4232f96fcc3ce596d';
const SOMA_JS = 'e2449f2d6d60f5afb825bbb5719196be';

const md5 = (caminho: string) =>
    createHash('md5').update(readFileSync(new URL(caminho, import.meta.url))).digest('hex');

describe('o motor implantado não pode ser trocado sem medição', () => {
    it('o wasm é exatamente o que foi medido rápido', () => {
        expect(md5('../../public/wllama-relaxed/wasm/wllama.wasm')).toBe(SOMA_WASM);
    });

    it('o index.js casa com o wasm', () => {
        // A cola do emscripten é versionada com o binário: trocar um só dos
        // dois aborta o módulo em tempo de carga, sem erro que se entenda.
        expect(md5('../../public/wllama-relaxed/index.js')).toBe(SOMA_JS);
    });

    it('nenhum outro motor foi publicado sem passar por aqui', () => {
        // `?motor=` só pode apontar para caminhos que existem e que foram
        // medidos. Hoje é um só.
        const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
        // Só os caminhos da MESMA ORIGEM: a chave `?wllama=` escreve na mesma
        // variável, mas monta URL de CDN e é governada por outro teste.
        const alvos = [...html.matchAll(/__wllamaCdn\s*=\s*'([^']+)'/g)]
            .map((m) => m[1])
            .filter((v) => v.startsWith('/'));
        expect(alvos).toEqual(['/wllama-relaxed']);
        expect(statSync(new URL('../../public/wllama-relaxed/wasm/wllama.wasm', import.meta.url)).size)
            .toBe(7_649_319);
    });
});
