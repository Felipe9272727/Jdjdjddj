import { afterEach, describe, expect, it, vi } from 'vitest';
import { medirModelo, urlsDosShards } from '../npc/floor10ModelStorage';

/**
 * ── O MODELO DA FALA VEM EM DOIS ARQUIVOS ────────────────────────────────
 *
 * Achado abrindo o jogo de verdade (`bancada-navegador/andar-10-real.mjs`), e
 * não por leitura de código: o Nilo recusava falar com
 *
 *     Sem espaço para o granite-4.0-h-tiny 7B-A1B: o navegador só libera
 *     0.44 GB para este site e o modelo precisa de 1.62 GB.
 *
 * 1,62 GB é o PRIMEIRO shard (1,50 GB) vezes a folga de 1,08. O segundo shard,
 * 1,09 GB, não entrava na conta: `probeModelBytes` faz um `HEAD` só.
 *
 * Num aparelho com pouco espaço isso é pior do que parece — o plano diz "cabe",
 * o jogador gasta a rede e o download morre no meio.
 */
const HF = 'https://huggingface.co/Felipe0282829273/granite4-h-tiny-q2k-shards/resolve/main';
const SHARD_1 = `${HF}/granite4-00001-of-00002.gguf`;

afterEach(() => { vi.unstubAllGlobals(); });

function fingirHead(tamanhos: Record<string, number | null>) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        const bytes = tamanhos[url];
        if (bytes === null || bytes === undefined) throw new Error('sem resposta');
        return { headers: { get: () => String(bytes) } } as unknown as Response;
    }));
}

describe('medir um modelo fatiado', () => {
    it('deriva as URLs dos dois shards a partir do primeiro', () => {
        expect(urlsDosShards(SHARD_1)).toEqual([
            `${HF}/granite4-00001-of-00002.gguf`,
            `${HF}/granite4-00002-of-00002.gguf`,
        ]);
    });

    it('um modelo de arquivo único continua sendo uma URL só', () => {
        const url = 'https://exemplo/modelo-Q8_0.gguf';
        expect(urlsDosShards(url)).toEqual([url]);
    });

    it('soma os shards para o espaço e isola o maior para o teto do runtime', async () => {
        fingirHead({
            [`${HF}/granite4-00001-of-00002.gguf`]: 1_497_111_136,
            [`${HF}/granite4-00002-of-00002.gguf`]: 1_088_211_904,
        });
        const m = await medirModelo(SHARD_1);
        expect(m.shards).toBe(2);
        // O que precisa caber no armazenamento: os dois.
        expect(m.total).toBe(2_585_323_040);
        // O que o `ftell()` do HeapFS limita: o maior arquivo, sozinho — e ele
        // cabe nos 2 GB, que é a razão de o modelo ser fatiado.
        expect(m.maiorArquivo).toBe(1_497_111_136);
        expect(m.maiorArquivo!).toBeLessThan(2 ** 31);
    });

    it('a soma dos dois passaria do teto se fosse comparada com ele', async () => {
        // Esta é a armadilha do conserto: trocar `probeModelBytes` por
        // `medirModelo` e passar o TOTAL para `excedeTetoDoGguf` reprovaria o
        // granite por um limite que ele não encosta.
        fingirHead({
            [`${HF}/granite4-00001-of-00002.gguf`]: 1_497_111_136,
            [`${HF}/granite4-00002-of-00002.gguf`]: 1_088_211_904,
        });
        const m = await medirModelo(SHARD_1);
        expect(m.total!).toBeGreaterThan(2 ** 31);
    });

    it('se um shard não responde, o tamanho é desconhecido — não é a soma parcial', async () => {
        // Somar só quem respondeu devolveria 1,50 GB com cara de verdade: o
        // mesmo defeito de antes, com mais passos. `null` deixa o plano tentar.
        fingirHead({
            [`${HF}/granite4-00001-of-00002.gguf`]: 1_497_111_136,
            [`${HF}/granite4-00002-of-00002.gguf`]: null,
        });
        const m = await medirModelo(SHARD_1);
        expect(m.total).toBeNull();
        expect(m.maiorArquivo).toBeNull();
    });
});
