import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
    julgarTom, semelhanca, FLOOR10_MARGEM_DE_TOM, motivoDoTom,
    FLOOR10_ANCORAS_BOAS, FLOOR10_ANCORAS_RUINS, FLOOR10_PORQUE_RUINS,
} from '../npc/floor10JuizDeTom';

/**
 * A REGRA DO JUIZ DE TOM, testada sem baixar 110 MB de ONNX.
 *
 * O que estes testes protegem é a REGRA — o sinal do desvio, o comportamento
 * sem âncoras, e a margem. O acerto do modelo (5/6 no conjunto cego) está
 * medido em `bancada-navegador/juiz-tom.mjs` e registrado em VELOCIDADE.md;
 * isso é medição, não teste unitário, porque depende do embedder.
 */
const unit = (v: number[]): number[] => {
    const n = Math.hypot(...v);
    return n === 0 ? v : v.map((x) => x / n);
};

describe('julgarTom', () => {
    const boas = [unit([1, 0, 0]), unit([0.9, 0.1, 0])];
    const ruins = [unit([0, 1, 0]), unit([0, 0.9, 0.1])];

    it('frase que se parece com as BOAS não é marcada', () => {
        const r = julgarTom(unit([1, 0.05, 0]), boas, ruins);
        expect(r.desvio).toBeLessThan(0);
        expect(r.foraDoTom).toBe(false);
    });

    it('frase que se parece com as RUINS é marcada', () => {
        const r = julgarTom(unit([0.05, 1, 0]), boas, ruins);
        expect(r.desvio).toBeGreaterThan(0);
        expect(r.foraDoTom).toBe(true);
    });

    it('sem âncoras ele NÃO julga — não julgar é melhor que julgar no escuro', () => {
        // Marcar por engano custa uma chamada de revisor (~11,6 s) por fala. Se
        // o embedder não subiu, o certo é deixar passar e não cobrar o jogador.
        expect(julgarTom(unit([0, 1, 0]), [], ruins).foraDoTom).toBe(false);
        expect(julgarTom(unit([0, 1, 0]), boas, []).foraDoTom).toBe(false);
        expect(julgarTom([], boas, ruins).foraDoTom).toBe(false);
    });

    it('a margem sobe o custo de marcar', () => {
        // Inclinado para as RUINS, mas sem ser extremo: desvio ~0,15. Passa em
        // margem 0 e não passa em 0,5. (Minha primeira versão usava [0.5,0.55]
        // e caía do lado das boas — a segunda âncora boa, [0.9,0.1], puxa a
        // diagonal mais do que a intuição sugere.)
        const emCima = unit([0.5, 0.7, 0]);
        expect(julgarTom(emCima, boas, ruins, 0).foraDoTom).toBe(true);
        expect(julgarTom(emCima, boas, ruins, 0.5).foraDoTom).toBe(false);
    });

    it('a margem padrão é ZERO, e o motivo está medido', () => {
        // Varrida em 0 / 0,02 / 0,05 / 0,10 contra o conjunto cego: 0 dá 5/6
        // com um falso positivo; 0,10 cai para 3/6 sem ganhar precisão. Zero é
        // "empatou, então marca" — o lado certo do erro, porque falso negativo
        // é uma fala fora do personagem na cara do jogador.
        expect(FLOOR10_MARGEM_DE_TOM).toBe(0);
    });
});

describe('semelhanca', () => {
    it('vetores idênticos dão 1, ortogonais dão 0', () => {
        expect(semelhanca(unit([1, 2, 3]), unit([1, 2, 3]))).toBeCloseTo(1, 5);
        expect(semelhanca([1, 0], [0, 1])).toBeCloseTo(0, 5);
    });

    it('tamanhos diferentes ou vazio devolvem 0 em vez de NaN', () => {
        // Um NaN aqui viraria `foraDoTom: false` silencioso — o juiz desligado
        // sem ninguém saber. Melhor devolver 0 explicitamente.
        expect(semelhanca([1, 2], [1, 2, 3])).toBe(0);
        expect(semelhanca([], [])).toBe(0);
    });
});

describe('as âncoras', () => {
    it('há os dois lados, e em número parecido', () => {
        expect(FLOOR10_ANCORAS_BOAS.length).toBeGreaterThanOrEqual(6);
        expect(FLOOR10_ANCORAS_RUINS.length).toBeGreaterThanOrEqual(6);
    });

    it('estão em INGLÊS, que é onde o juiz age', () => {
        // O juiz roda ANTES da tradução, no texto do rascunhador. Âncora em
        // português mediria distância de idioma em vez de distância de tom.
        const pt = /\b(?:você|não|é|está|aqui|elevador)\b/i;
        for (const a of [...FLOOR10_ANCORAS_BOAS, ...FLOOR10_ANCORAS_RUINS]) {
            expect(a).not.toMatch(pt);
        }
    });

    it('as âncoras BOAS são curtas — é a definição operante do personagem', () => {
        // "Seco e curto" não é estilo aqui, é o que separa o Nilo do assistente.
        // Âncora boa comprida ensinaria o juiz a aceitar prolixidade.
        for (const a of FLOOR10_ANCORAS_BOAS) expect(a.length).toBeLessThan(60);
    });

    it('nenhuma âncora aparece nos dois lados', () => {
        const cruz = FLOOR10_ANCORAS_BOAS.filter((b) => FLOOR10_ANCORAS_RUINS.includes(b));
        expect(cruz).toEqual([]);
    });
});

// ── O MOTIVO, QUE SEMPRE EXISTIU E ERA JOGADO FORA ────────────────────────
//
// O `desvio` é `max(ruins) − max(boas)`, e todo `max` tem um argmax: qual
// âncora ruim venceu. Esse nome saía junto com o lixo, a um passo do revisor —
// que, sem ele, conserta 2 de 6 em vez de 4 de 6 (medido com o LFM2.5 de
// produção, régua conferindo o cânone inteiro).
describe('o juiz devolve DE QUAL âncora ruim a frase chegou perto', () => {
    const unit = (v: number[]) => {
        const n = Math.hypot(...v);
        return v.map((x) => x / n);
    };
    // Três eixos: uma boa, e duas ruins distinguíveis.
    const boas = [unit([1, 0, 0])];
    const ruins = [unit([0, 1, 0]), unit([0, 0, 1])];

    it('aponta a segunda quando a frase se parece com a segunda', () => {
        expect(julgarTom(unit([0, 0.1, 1]), boas, ruins).ancoraRuim).toBe(1);
    });

    it('e a primeira quando é a primeira', () => {
        expect(julgarTom(unit([0, 1, 0.1]), boas, ruins).ancoraRuim).toBe(0);
    });

    it('sem âncoras, devolve -1 e motivo VAZIO — não inventa', () => {
        // Motivo inventado é pior que motivo nenhum: manda o revisor consertar
        // o que não está quebrado. Vazio faz o enunciado voltar ao antigo.
        const v = julgarTom(unit([0, 1, 0]), [], ruins);
        expect(v.ancoraRuim).toBe(-1);
        expect(motivoDoTom(v)).toBe('');
    });

    it('o motivo entra no molde "it sounds like …", que é o medido', () => {
        const v = julgarTom(unit([0, 1, 0]), boas, ruins);
        expect(motivoDoTom(v).startsWith('it sounds like ')).toBe(true);
    });
});

describe('as duas listas de âncoras ruins andam juntas', () => {
    it('há um motivo para CADA âncora, e na mesma ordem', () => {
        // ── O RISCO QUE ESTE TESTE COBRE ─────────────────────────────────
        //
        // São dois vetores paralelos ligados por índice. Acrescentar uma
        // âncora e esquecer o motivo não quebra compilação, não quebra teste
        // nenhum e não aparece na tela: o revisor só recebe `undefined` virando
        // motivo vazio, silenciosamente, e volta a consertar 2 de 6. É o tipo
        // de regressão que só apareceria numa medição meses depois.
        expect(FLOOR10_PORQUE_RUINS).toHaveLength(FLOOR10_ANCORAS_RUINS.length);
        for (const [i, porque] of FLOOR10_PORQUE_RUINS.entries()) {
            expect(porque.trim(), `âncora ${i} sem motivo`).not.toBe('');
        }
    });

    it('e nenhum motivo começa com maiúscula ou termina em ponto solto', () => {
        // Eles são FRAGMENTOS: entram depois de "it sounds like ". Um motivo
        // escrito como frase inteira sai como "it sounds like A hotel clerk…".
        for (const porque of FLOOR10_PORQUE_RUINS) {
            expect(porque[0]).toBe(porque[0].toLowerCase());
        }
    });
});

// ── A SONDA DO CAMINHO ONNX+WEBGPU ────────────────────────────────────────
//
// Pergunta do dono do jogo: "talvez o caminho não seja com o llama, e sim com
// outra arquitetura (tipo o onnx), procure novas arquiteturas". A intuição é
// boa e tem apoio nos números desta sessão: o juiz roda em ONNX e é a peça mais
// rápida do pipeline, enquanto tudo que é caro roda em llama.cpp/wasm.
//
// O que muda de verdade não é o modelo, é o BACKEND: o WebGPU do wllama é
// experimental e já quebrou duas vezes neste aparelho; o do onnxruntime-web é
// outra implementação, muito mais rodada.
//
// `?gpu=onnx` liga isso no JUIZ — a cobaia mais barata que existe aqui.
describe('`?gpu=onnx` — testar WebGPU onde não custa nada', () => {
    const fonte = readFileSync(new URL('../npc/floor10VetorDeTom.ts', import.meta.url), 'utf8');

    it('só liga quando pedido E quando o aparelho tem adaptador', () => {
        expect(fonte).toContain("get('gpu') === 'onnx'");
        expect(fonte).toContain("'gpu' in navigator");
    });

    it('e CAI PARA A CPU quando a GPU falha, em vez de sumir', () => {
        // ── A REGRA QUE ISTO PROTEGE ─────────────────────────────────────
        //
        // Um juiz que não sobe faz o rascunho passar SEM revisão nenhuma — e
        // aí o pipeline inteiro perde a etapa que decide se vale remendar.
        // A GPU deste andar já custou duas falas perdidas; ela não vai custar
        // o juiz também.
        const bloco = fonte.slice(fonte.indexOf('if (querGpu)'), fonte.indexOf("'o download do juiz de tom'"));
        expect(bloco).toContain('catch');
        expect(bloco).toContain("anotar('juiz:webgpu'");
        // O caminho da CPU vem DEPOIS do try/catch, fora dele — se estivesse
        // dentro, uma falha de GPU levaria o juiz junto.
        expect(fonte.indexOf('return await comPrazo(abrir()'))
            .toBeGreaterThan(fonte.indexOf('if (querGpu)'));
    });

    it('e o resultado vai para a caixa-preta nos DOIS casos', () => {
        // Sem isto, "funcionou?" viraria impressão. Com isto, é um registro.
        const bloco = fonte.slice(fonte.indexOf('if (querGpu)'), fonte.indexOf("'o download do juiz de tom'"));
        expect((bloco.match(/anotar\('juiz:webgpu'/g) ?? []).length).toBe(2);
    });
});
