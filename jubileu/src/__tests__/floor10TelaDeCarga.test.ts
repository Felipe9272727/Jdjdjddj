import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { bancadaLigada, linhaDaCarga } from '../npc/floor10TelaDeCarga';
import { DOWNLOAD_STALL_SEC, DOWNLOAD_ZERO } from '../npc/floor10Download';
import {
    Floor10Fila, FILA_VAZIA, definirFilaDoAndar10, filaLinha, floor10Fila,
} from '../npc/floor10Fila';
import {
    composicaoDaFila, falhaEmJogo, nomeEmJogo, pecaDaVontade,
    NOME_EM_JOGO, FALHA_EM_JOGO, type PapelNaFila,
} from '../npc/floor10Composicao';

/**
 * A TELA DE CARGA DO ANDAR 10, DEPOIS DE "PARECE ALGO DEV-ONLY".
 *
 * O que o jogador lia enquanto esperava o Nilo eram quatro linhas, e três eram
 * de bancada: o nome do gguf, os bytes, a taxa e "parado há 31s". Estes testes
 * prendem as duas metades do conserto — que o jogo passou a falar português, e
 * que os números NÃO sumiram, só mudaram de porta.
 */

/**
 * Tudo que denuncia um arquivo de modelo. A lista é grosseira de propósito: um
 * nome de peça novo que escorregue para "SmolLM4" ou "granite-5" cai aqui sem
 * ninguém precisar lembrar de acrescentar o termo.
 */
const CHEIRO_DE_MODELO: readonly RegExp[] = [
    /smollm/i, /granite/i, /qwen/i, /gemma/i, /mpnet/i, /lfm/i, /llama/i,
    /bergamot/i, /onnx/i, /gguf/i, /a400m/i, /\bMoE\b/, /\bQ[2468]_/i,
    // "3B", "7B-A1B", "300M", "135M": o tamanho é ficha técnica igual ao nome.
    /\d+\s*B\b/, /\d+\s*M\b/,
];

function cheiraAModelo(texto: string): RegExp | null {
    return CHEIRO_DE_MODELO.find((r) => r.test(texto)) ?? null;
}

const amostra = (patch: Partial<typeof DOWNLOAD_ZERO>) => ({ ...DOWNLOAD_ZERO, ...patch });

describe('o nome de jogador de cada peça', () => {
    it('existe para TODOS os papéis, e nenhum vem em branco', () => {
        // Um papel novo sem nome de jogador cairia na tela como `undefined`, e
        // esta é a única barreira entre isso e quem está jogando.
        for (const busca of ['', '?pipeline']) {
            for (const p of composicaoDaFila(busca)) {
                expect(p.nome, `${p.papel} sem nome de jogador`).toBeTruthy();
                expect(p.falha, `${p.papel} sem linha de falha`).toBeTruthy();
                expect(p.label, `${p.papel} perdeu o rótulo técnico`).toBeTruthy();
            }
        }
    });

    it('e NENHUM deles é o nome de um modelo', () => {
        for (const papel of Object.keys(NOME_EM_JOGO) as PapelNaFila[]) {
            const achado = cheiraAModelo(NOME_EM_JOGO[papel]);
            expect(achado, `"${NOME_EM_JOGO[papel]}" (${papel}) parece ficha técnica`)
                .toBeNull();
            expect(cheiraAModelo(FALHA_EM_JOGO[papel]),
                `a falha de ${papel} parece ficha técnica`).toBeNull();
        }
    });

    it('o rótulo TÉCNICO continua existindo — ele é que vai para as bancadas', () => {
        // Nada aqui é "limpar o nome do modelo do código": ele é a única coisa
        // que responde "qual binário produziu este número" no ?velocidade, no
        // ?mente e na caixa-preta. O que mudou foi só quem lê cada um.
        const porPapel = new Map(composicaoDaFila('').map((p) => [p.papel, p]));
        expect(porPapel.get('fala')?.label).toBe('SmolLM3-3B');
        expect(porPapel.get('memoria')?.label).toBe('embeddinggemma-300M');
        expect(porPapel.get('motor')?.label).toBe('Qwen3-0.6B');
        expect(porPapel.get('juiz')?.label).toContain('all-mpnet-base-v2');
        expect(porPapel.get('reflexo')?.label).toContain('SmolLM2-135M');
    });

    it('a fala e o rascunhador dividem o MESMO nome de jogador', () => {
        // Lição herdada da tabela `ROTULO`: do lado de fora é a mesma coisa
        // chegando — aquilo sem o que ele não conversa.
        expect(NOME_EM_JOGO.rascunho).toBe(NOME_EM_JOGO.fala);
    });

    it('trocar o arquivo da vontade troca o `label`, nunca o nome de jogador', () => {
        // `?revisor=llama` baixa outro gguf. Para quem joga continua sendo a
        // mesma vontade própria descendo, e o arquivo por trás nunca foi
        // assunto dele.
        const padrao = pecaDaVontade();
        expect(padrao.nome).toBe(NOME_EM_JOGO.vontade);
        expect(cheiraAModelo(padrao.nome)).toBeNull();
        // O técnico continua vindo do catálogo, e continua sendo ficha técnica.
        expect(padrao.label).toBeTruthy();
    });

    it('quem só tem o id da fila na mão consegue os dois textos', () => {
        expect(nomeEmJogo('memoria')).toBe(NOME_EM_JOGO.memoria);
        expect(falhaEmJogo('reflexo')).toBe(FALHA_EM_JOGO.reflexo);
        // E um id desconhecido não vira `undefined` na tela: a peça some do
        // código antes de sumir da fila de alguém que já estava jogando.
        expect(nomeEmJogo('peca-que-nao-existe')).toBeTruthy();
        expect(falhaEmJogo('peca-que-nao-existe')).toBeTruthy();
        expect(cheiraAModelo(falhaEmJogo('peca-que-nao-existe'))).toBeNull();
    });
});

describe('a linha da fila que o jogador lê', () => {
    const BYTES = {
        fala: 1_915_305_312,
        vontade: 1_246_253_888,
        motor: 639_446_688,
        memoria: 333_590_944,
        reflexo: 139_252_423,
        rascunho: 821_847_360,
        juiz: 110_100_000,
        tradutor: 51_463_255,
    };

    it('nunca mostra nome de modelo, em NENHUMA peça e em NENHUMA das duas filas', () => {
        // O teste percorre a fila inteira, peça por peça, nas duas composições.
        // É a forma direta da reclamação: se em algum ponto da espera a tela
        // escrever "granite-4.0-h-tiny 7B-A1B", ela falha aqui.
        for (const busca of ['', '?pipeline']) {
            floor10Fila.reset();
            definirFilaDoAndar10(BYTES, busca);
            for (const peca of composicaoDaFila(busca)) {
                const estado = floor10Fila.progresso(peca.papel, amostra({
                    bytes: 1, totalBytes: peca.bytes,
                }));
                const linha = filaLinha(estado);
                expect(cheiraAModelo(linha), `"${linha}" mostra o arquivo ao jogador`)
                    .toBeNull();
                expect(linha).toContain(peca.nome);
            }
        }
        floor10Fila.reset();
    });
});

describe('linhaDaCarga — a resposta de "está andando ou travou?", sem bytes', () => {
    const TRES = [
        { id: 'fala', label: 'SmolLM3-3B', nome: 'a voz dele', bytes: 2_000_000_000 },
        { id: 'vontade', label: 'LFM2.5-1.2B', nome: 'a vontade própria', bytes: 1_000_000_000 },
        { id: 'motor', label: 'Qwen3-0.6B', nome: 'o corpo, de reserva', bytes: 600_000_000 },
    ];
    const nova = () => new Floor10Fila(TRES);

    it('só cala a boca quando não há mais nada a fazer', () => {
        expect(linhaDaCarga(FILA_VAZIA)).toBe('');
        const pronta = nova();
        for (const i of TRES) pronta.concluir(i.id);
        expect(linhaDaCarga(pronta.ocioso())).toBe('');
    });

    it('mas nos 68 s antes do primeiro byte ela NÃO fica muda', () => {
        // Entre o pedido de carga e o primeiro pedaço o wllama abre o cache e
        // o Worker: 68 s medidos, sem um único evento de progresso. Uma linha
        // vazia aí é a tela parecendo congelada logo na entrada.
        expect(linhaDaCarga(nova().ocioso())).toBe('conectando…');
    });

    it('travado, ela DIZ que travou — sem contar os segundos', () => {
        // A lição do `floor10Download` continua de pé: porcentagem sozinha não
        // distingue "acabou de começar" de "parado faz três minutos". O que sai
        // é o "há Ns", que é diagnóstico; o aviso fica.
        const e = nova().progresso('fala', amostra({
            bytes: 5e8, totalBytes: 2e9, stalledSec: DOWNLOAD_STALL_SEC + 19,
        }));
        const linha = linhaDaCarga(e);
        expect(linha).toContain('parado');
        expect(linha).not.toMatch(/\d/);
    });

    it('e um segundo antes do limite ela ainda não acusa nada', () => {
        const e = nova().progresso('fala', amostra({
            bytes: 5e8, totalBytes: 2e9, stalledSec: DOWNLOAD_STALL_SEC - 1, etaSec: 90,
        }));
        expect(linhaDaCarga(e)).not.toContain('parado');
    });

    it('a 100% ela explica a barra cheia que não anda', () => {
        // Depois do último byte o wllama ainda copia ~2 GB para dentro do WASM
        // e não reporta NADA — minutos de tela travada. Este texto é o que
        // sobrou daquele `loadText` que parou de mentir que tinha acabado.
        const fila = nova();
        const e = fila.progresso('fala', amostra({ bytes: 2e9, totalBytes: 2e9 }));
        expect(e.prontos).toContain('fala');
        expect(linhaDaCarga(e)).toContain('abrindo no aparelho');
    });

    it('baixando, ela dá o TEMPO que falta — não os megabytes', () => {
        const e = nova().progresso('fala', amostra({
            bytes: 5e8, totalBytes: 2e9, rate: 21.4e6, etaSec: 180,
        }));
        const linha = linhaDaCarga(e);
        expect(linha).toContain('min');
        expect(linha).not.toMatch(/MB|GB|KB|\/s/);
    });

    it('sem estimativa ainda, ela não inventa nem cala', () => {
        const e = nova().progresso('fala', amostra({ bytes: 1e6, totalBytes: 2e9 }));
        expect(linhaDaCarga(e)).toBe('baixando…');
    });

    it('antes do primeiro byte, "conectando…"', () => {
        const e = nova().progresso('fala', amostra({ bytes: 0, totalBytes: 0 }));
        expect(linhaDaCarga(e)).toBe('conectando…');
    });

    it('e em nenhum estado ela deixa escapar byte, taxa ou nome de arquivo', () => {
        const fila = nova();
        const casos = [
            amostra({ bytes: 0, totalBytes: 0 }),
            amostra({ bytes: 1e6, totalBytes: 2e9 }),
            amostra({ bytes: 5e8, totalBytes: 2e9, rate: 9e6, etaSec: 42 }),
            amostra({ bytes: 5e8, totalBytes: 2e9, stalledSec: 91 }),
            amostra({ bytes: 2e9, totalBytes: 2e9 }),
        ];
        for (const a of casos) {
            const linha = linhaDaCarga(fila.progresso('fala', a));
            expect(linha).not.toMatch(/MB|GB|KB|\/s/);
            expect(cheiraAModelo(linha), `"${linha}" vazou ficha técnica`).toBeNull();
        }
    });
});

describe('bancadaLigada — quem ainda vê os números', () => {
    afterEach(() => {
        delete (globalThis as { __f10Bancada?: boolean }).__f10Bancada;
    });

    it('o jogo comum não vê', () => {
        expect(bancadaLigada('')).toBe(false);
        expect(bancadaLigada('?f10')).toBe(false);
        // `?pipeline=jogo` liga o pipeline DENTRO do jogo de verdade: continua
        // sendo alguém jogando, não alguém medindo.
        expect(bancadaLigada('?pipeline=jogo')).toBe(false);
    });

    it('as quatro bancadas veem', () => {
        expect(bancadaLigada('?bancada')).toBe(true);
        expect(bancadaLigada('?mente=smol')).toBe(true);
        expect(bancadaLigada('?comparacao')).toBe(true);
        expect(bancadaLigada('?velocidade=gemma')).toBe(true);
        expect(bancadaLigada('?foo=1&bancada=1')).toBe(true);
    });

    it('e um prefixo parecido NÃO vale', () => {
        expect(bancadaLigada('?comparacaox')).toBe(false);
        expect(bancadaLigada('?mentira')).toBe(false);
    });

    it('a escotilha do /barras.html funciona sem query string', () => {
        // `barras-dev.tsx` monta o painel DE VERDADE para conferir a tela sem
        // baixar 4,2 GB, e a pergunta dela é literalmente "o parado há Ns muda
        // a cor certa?". Sem isto, ela passaria a ver a tela do jogador.
        expect(bancadaLigada('')).toBe(false);
        (globalThis as { __f10Bancada?: boolean }).__f10Bancada = true;
        expect(bancadaLigada('')).toBe(true);
    });
});

describe('a TELA do jogo, conferida no arquivo', () => {
    // Não há DOM nesta suíte (o ambiente é `node`), e montar um só para isto
    // custaria mais do que prende. O padrão de ler o arquivo já é usado na
    // suíte do pipeline pelo mesmo motivo.
    const tela = readFileSync(new URL('../Floor10NpcChat.tsx', import.meta.url), 'utf8');

    it('os bytes e o nome do arquivo ficam atrás da bandeira de bancada', () => {
        expect(tela).toContain('const mostrarNumeros = bancadaLigada();');
        expect(tela).toContain('numeros={mostrarNumeros}');
        // `downloadLine` é a linha "1.2 GB de 4.4 GB · 21,4 MB/s"; `detalhe`
        // é o `loadText`, que carrega o nome do modelo. Os dois só existem
        // dentro do bloco `{numeros && (`.
        const guarda = tela.indexOf('{numeros && (');
        expect(guarda).toBeGreaterThan(-1);
        expect(tela.indexOf('downloadLine(amostra)')).toBeGreaterThan(guarda);
        expect(tela.indexOf('{detalhe ?')).toBeGreaterThan(guarda);
    });

    it('a ficha técnica do cabeçalho também', () => {
        // "Nilo Azevedo · Hóspede do 10º · SmolLM3-3B · CPU×4" era a primeira
        // linha do painel.
        expect(tela).toContain('mostrarNumeros && st.modelLabel');
    });

    it('a falha continua na tela, e agora em português de jogador', () => {
        // NÃO NEGOCIÁVEL: engolir falha já fez a barra pular 1,32 GB que nunca
        // chegaram. O `map` sobre `falhados` continua lá, sem condição nenhuma
        // além de existir falha.
        expect(tela).toContain('fila.falhados.map(');
        expect(tela).toContain('falhaEmJogo(f.id)');
        // E o motivo técnico continua alcançável, do lado, na bancada.
        expect(tela).toContain('mostrarNumeros && f.motivo');
    });

    it('a barra do jogo lê a linha de jogo das duas vezes que aparece', () => {
        // São duas: a flutuante (chat fechado) e a do painel. A flutuante já
        // ficou para trás uma vez, quando cada cérebro tinha o seu código.
        const usos = tela.match(/linhaDeJogo=\{linhaDaCarga\(/g) ?? [];
        expect(usos).toHaveLength(2);
    });

    it('e a cota do navegador só mostra gigabytes quando NÃO cabe', () => {
        // Enquanto cabe, "8,3 GB livre · precisa de 4,4 GB" é ficha de bancada.
        // Quando não cabe, a conta é a resposta inteira — e é acionável.
        expect(tela).toContain('const espacoEmJogo = espacoFalta');
        expect(tela).toContain('{mostrarNumeros && espacoLinha && (');
    });
});
