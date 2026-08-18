import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { diagnosticar } from '../npc/floor10Diagnostico';

/**
 * O TRADUTOR DE ERRO — e por que ele não pode fingir certeza.
 *
 * O relato foi "falhou em instalar o rascunhador", sem motivo nenhum na tela.
 * `Failed to fetch` é o mais comum e o menos informativo: o navegador usa a
 * MESMA mensagem para rede caída, CORS recusado, disco cheio no meio do
 * download e aba em segundo plano. São quatro consertos diferentes atrás de
 * três palavras.
 */
describe('diagnosticar', () => {
    it('reconhece o "failed to fetch" nas três formas que os navegadores usam', () => {
        // Chrome, Firefox e Safari dizem coisas diferentes para a MESMA falha.
        // Se a sala só reconhecesse a do Chrome, o iPhone ficaria sem dica.
        for (const cru of [
            'Failed to fetch',
            'TypeError: NetworkError when attempting to fetch resource.',
            'Load failed',
            'net::ERR_CONNECTION_RESET',
        ]) {
            const d = diagnosticar(cru);
            expect(d, `não reconheceu: ${cru}`).not.toBeNull();
            expect(d?.saidas.length).toBeGreaterThan(0);
        }
    });

    it('a cota de disco vem ANTES da rede, porque é a causa mais provável aqui', () => {
        // São 4,2 GB de modelos e o rascunhador entra por último. Uma mensagem
        // que fala de cota não pode cair na regra genérica de rede e mandar a
        // pessoa "tentar de novo com a tela acesa" — ela vai falhar igual.
        const d = diagnosticar('QuotaExceededError: storage quota exceeded');
        expect(d?.resumo).toMatch(/não coube|espaço/i);
        expect(d?.saidas.join(' ')).toMatch(/anônima|apague|espaço/i);
    });

    it('e o navegador sem OPFS não é confundido com rede', () => {
        const d = diagnosticar('este navegador não guarda modelos (sem OPFS)');
        expect(d?.resumo).toMatch(/OPFS|não sabe guardar/i);
    });

    it('a parede de memória tem saída própria', () => {
        for (const cru of ['out of memory', 'Aborted()', 'memory access out of bounds']) {
            expect(diagnosticar(cru)?.resumo, cru).toMatch(/memória/i);
        }
    });

    it('NÃO inventa diagnóstico para o que não reconhece', () => {
        // Um palpite com ar de certeza manda a pessoa consertar a coisa errada,
        // e aí ela perde a tarde. `null` faz a sala mostrar o texto cru, que é
        // pior de ler e melhor de agir.
        expect(diagnosticar('SentencePiece vocabulary error')).toBeNull();
        expect(diagnosticar('algo completamente novo')).toBeNull();
        expect(diagnosticar('')).toBeNull();
        expect(diagnosticar('   ')).toBeNull();
    });
});

describe('a sala mostra o erro, e mostra o texto CRU junto', () => {
    const sala = readFileSync(new URL('../Floor10PipelineSala.tsx', import.meta.url), 'utf8');

    it('o diagnóstico é hipótese; a mensagem é o fato, e os dois aparecem', () => {
        // Se só o diagnóstico aparecesse, um palpite errado apagaria a única
        // pista de verdade — e eu não teria como ajudar pelo relato.
        expect(sala).toContain('diagnosticar(');
        expect(sala).toContain('{st.motivo}');
    });

    it('a fila SEGUE depois de uma falha', () => {
        // Parar tudo porque o rascunhador não desceu esconderia que o tradutor
        // e o juiz desceriam bem — a diferença entre "meu aparelho não aguenta"
        // e "aquele arquivo não veio".
        const i = sala.indexOf('const baixarTudo');
        const corpo = sala.slice(i, sala.indexOf('/** Uma peça só', i));
        expect(corpo).toContain('for (const peca of PECAS)');
        expect(corpo).not.toMatch(/\bbreak;/);
        expect(corpo).not.toMatch(/\breturn;/);
    });

    it('e a barra conta BYTES, não peças', () => {
        // 822 MB de um lado e 51 MB do outro: contar peças faria a barra pular
        // de 25% em 25% e mentir sobre quanto falta.
        expect(sala).toContain('const bytesTotais = PECAS.reduce');
        expect(sala).toContain('bytesFeitos / bytesTotais');
    });
});

describe('os carregadores param de engolir o motivo', () => {
    it('cada peça guarda o próprio último erro', () => {
        // A regra do andar é que uma falha NUNCA emudeça o NPC, então eles
        // devolvem `false`/`null` e mandam o motivo para a caixa-preta. Certo
        // no jogo, inútil para quem está instalando.
        for (const [arquivo, fn] of [
            ['floor10Rascunhador', 'ultimoErroDoRascunhador'],
            ['floor10Tradutor', 'ultimoErroDoTradutor'],
            ['floor10VetorDeTom', 'ultimoErroDoJuiz'],
        ]) {
            const fonte = readFileSync(
                new URL(`../npc/${arquivo}.ts`, import.meta.url), 'utf8',
            );
            expect(fonte, `${arquivo} não expõe ${fn}`).toContain(`export function ${fn}()`);
        }
    });

    it('o rascunhador cobre os QUATRO caminhos de falha, não só o catch', () => {
        // Sem backend, não coube, download parou, e a exceção. Se um deles
        // ficar de fora, a sala mostra "não subiu, e não disse por quê" — que
        // é exatamente o estado de onde este trabalho partiu.
        const fonte = readFileSync(
            new URL('../npc/floor10Rascunhador.ts', import.meta.url), 'utf8',
        );
        const atribuicoes = fonte.match(/ultimoErro = /g) ?? [];
        expect(atribuicoes.length).toBeGreaterThanOrEqual(5);  // 4 falhas + o reset
        expect(fonte).toContain("ultimoErro = '';");           // limpa ao recomeçar
    });
});

describe('o runtime não é o modelo — a regra que a medição obrigou', () => {
    it('separa "o CDN não veio" de "o download de 822 MB cortou"', () => {
        // A primeira versão deste arquivo dizia "a rede cortou no meio do
        // download, são 822 MB numa tacada" para ISTO:
        //
        //   Failed to fetch dynamically imported module:
        //   https://cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1/esm/index.js
        //
        // Que é o RUNTIME (~1 MB) falhando ANTES de qualquer byte de modelo.
        // O conselho "mantenha a tela acesa, ele continua de onde parou" manda
        // consertar a coisa errada: não há o que continuar.
        const d = diagnosticar(
            'Failed to fetch dynamically imported module: '
            + 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1/esm/index.js',
        );
        expect(d?.resumo).toMatch(/motor|código|CDN/i);
        expect(d?.resumo).not.toMatch(/822|no meio do download/i);
        expect(d?.saidas.join(' ')).toMatch(/CDN|~1 MB/);
    });

    it('e o download de modelo continua caindo na regra de rede', () => {
        // A regra do runtime vem primeiro e casa com "Failed to fetch"; ela não
        // pode engolir o caso genérico.
        const d = diagnosticar('TypeError: Failed to fetch');
        expect(d?.resumo).toMatch(/rede cortou/i);
        expect(d?.saidas.join(' ')).toMatch(/822 MB/);
    });
});
