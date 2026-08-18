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

describe('o "eternamente" — prazos e o campo de progresso', () => {
    const rasc = readFileSync(
        new URL('../npc/floor10Rascunhador.ts', import.meta.url), 'utf8',
    );

    it('TODA etapa sem cão de guarda ganhou prazo', () => {
        // Relato: "fica nisso eternamente", barra em 0 MB. O download em si já
        // tinha vigia (`baixarSemSubir` desiste por inatividade); o buraco eram
        // as etapas em volta. Um `import()` que não resolve NÃO rejeita — fica
        // pendente para sempre — e a fila é sequencial, então uma etapa
        // pendurada segura todas as seguintes.
        for (const etapa of [
            'o CDN do motor (jsdelivr)',
            'a abertura do modelo',
            'a sonda de armazenamento',
            'a estimativa de disco',
        ]) {
            expect(rasc, `sem prazo: ${etapa}`).toContain(etapa);
        }
        // Nenhum `import(WLLAMA_ESM)` pode estar nu.
        const nus = rasc.match(/await \(?import\(\/\* @vite-ignore \*\/ WLLAMA_ESM/g) ?? [];
        expect(nus, 'ainda há import() sem prazo').toHaveLength(0);
    });

    it('e o prazo DIZ qual etapa estourou', () => {
        // "deu timeout" não separa CDN barrado de aparelho lento. São consertos
        // diferentes, e o nome da etapa é o que decide.
        // O template mora em `floor10Carga` desde que o helper saiu de dentro
        // do rascunhador — que foi justamente o que deixou o tradutor sem
        // prazo e o download infinito voltar em outra peça.
        const carga = readFileSync(
            new URL('../npc/floor10Carga.ts', import.meta.url), 'utf8',
        );
        expect(carga).toMatch(/não respondeu em \$\{Math\.round\(ms \/ 1000\)\}s/);
        const d = diagnosticar('o CDN do motor (jsdelivr) não respondeu em 45s');
        expect(d?.resumo).toMatch(/prazo/i);
        expect(d?.saidas.join(' ')).toMatch(/jsdelivr|bloqueadores/i);
    });

    it('o progresso vai para `loadDownload`, que é o campo que a barra lê', () => {
        // O defeito dos "0 MB de 2.23 GB" eternos: o rascunhador publicava em
        // `floor10Fila` e em `loadText`, mas NUNCA em `loadDownload` — que é
        // exatamente o que a sala desenha. O progresso existia; só não chegava
        // a quem desenha.
        const i = rasc.indexOf('const baixou = await baixarSemSubir');
        const corpo = rasc.slice(i, i + 1200);
        expect(corpo).toContain('loadDownload: amostra');
        expect(corpo).toContain('floor10Fila.progresso(FILA_RASCUNHO, amostra)');
    });

    it('a sala separa "baixando" de "rodando" — um botão não pode mentir', () => {
        // Na foto de tela do dono do jogo a fila baixava e o botão de RODAR
        // dizia "rodando…", porque os dois liam o mesmo `ocupado`.
        const sala = readFileSync(
            new URL('../Floor10PipelineSala.tsx', import.meta.url), 'utf8',
        );
        expect(sala).toContain('const [baixando, setBaixando]');
        expect(sala).toContain('const [ocupado, setOcupado]');
        // E a fila mostra sinal de vida: sem velocidade nem "parado há Ns",
        // travado e lento são indistinguíveis.
        expect(sala).toMatch(/parado há/);
    });
});

describe('"Model file not found" — o erro que enganava de duas formas', () => {
    it('é reconhecido, e NÃO é lido como 404 do servidor', () => {
        // A mensagem é do wllama e parece do HuggingFace. Não é: a URL responde
        // 200 com 821.847.360 bytes, conferido por HEAD com Origin de outro
        // site. Ela quer dizer "não achei no CACHE".
        const d = diagnosticar(
            'Model file not found: https://huggingface.co/bartowski/'
            + 'granite-3.1-1b-a400m-instruct-GGUF/resolve/main/'
            + 'granite-3.1-1b-a400m-instruct-Q4_K_M.gguf',
        );
        expect(d).not.toBeNull();
        expect(d?.resumo).toMatch(/cache|incompleto/i);
        expect(d?.resumo).toMatch(/não é 404/i);
    });

    it('e vem ANTES da regra de rede, que casaria por engano', () => {
        // A URL na mensagem contém "huggingface.co"; se a regra do CDN viesse
        // primeiro, ela diria "o CDN não veio" — e o conserto (trocar de rede)
        // seria o errado, porque o problema está no disco do aparelho.
        const d = diagnosticar('Model file not found: https://cdn.jsdelivr.net/x.gguf');
        expect(d?.resumo).toMatch(/cache/i);
    });
});

describe('o carregador confere o cache em vez de confiar nele', () => {
    const rasc = readFileSync(
        new URL('../npc/floor10Rascunhador.ts', import.meta.url), 'utf8',
    );

    it('confere ANTES e DEPOIS do download', () => {
        // O `download` do wllama volta na hora quando a chave já existe, SEM
        // olhar o tamanho — então "resolveu" não significa "os 822 MB estão
        // lá". Sem a conferência de depois, `baixarRascunhador` devolvia `true`
        // e quem estourava era o `loadModelFromUrl`, com uma mensagem que não
        // aponta para o cache.
        const i = rasc.indexOf('export async function baixarRascunhador');
        const resto = rasc.slice(i + 1);
        const fim = resto.search(/\n(?:export )?(?:async )?(?:function|const) /);
        const corpo = rasc.slice(i, fim >= 0 ? i + 1 + fim : undefined);
        expect(corpo).toContain('const antes = await conferirCache(cache)');
        expect(corpo).toContain('const depois = await conferirCache(cache)');
        expect(corpo).toContain('await limparDoCache(cache)');
    });

    it('e compara TAMANHO, que é o que o download não olha', () => {
        expect(rasc).toContain('meu.size === esperado');
        expect(rasc).toContain('meu.size === FLOOR10_RASCUNHADOR_MODEL.bytes');
    });

    it('conferir nunca pode barrar o download', () => {
        // Se a API de cache mudar ou `list()` falhar, a conferência devolve
        // 'ok' e sai da frente. Uma verificação que vira bloqueio é pior que a
        // ausência dela.
        const i = rasc.indexOf('async function conferirCache');
        const corpo = rasc.slice(i, rasc.indexOf('async function limparDoCache'));
        expect(corpo).toMatch(/return 'ok';\s*\/\/ sem API/);
        expect(corpo).toMatch(/catch \{[\s\S]*return 'ok';/);
    });
});

describe('TODA peça tem prazo — a lição que eu aprendi tarde', () => {
    // Eu pus prazos no rascunhador e o download voltou a ser infinito NO
    // TRADUTOR. Mesma doença, outro órgão, e o buraco foi criado por mim: o
    // helper `comPrazo` morava dentro do rascunhador, e um utilitário guardado
    // dentro de um cliente é um utilitário que os outros clientes não acham.
    //
    // Ele mudou para `floor10Carga`. Este teste existe para a próxima peça não
    // repetir a história: se alguém acrescentar um `import()` de CDN sem prazo,
    // ele reprova.
    const arquivos = ['floor10Rascunhador', 'floor10Tradutor', 'floor10VetorDeTom'] as const;

    it('o helper mora num lugar comum, não dentro de um cliente', () => {
        const carga = readFileSync(
            new URL('../npc/floor10Carga.ts', import.meta.url), 'utf8',
        );
        expect(carga).toContain('export function comPrazo');
        for (const prazo of ['PRAZO_RUNTIME_MS', 'PRAZO_CARGA_MS', 'PRAZO_REDE_MS']) {
            expect(carga).toContain(`export const ${prazo}`);
        }
    });

    it('nenhuma peça faz `await import()` de CDN sem prazo', () => {
        for (const nome of arquivos) {
            const fonte = readFileSync(
                new URL(`../npc/${nome}.ts`, import.meta.url), 'utf8',
            );
            // `await import(...)` direto é o padrão que pendura para sempre:
            // um `import()` que não resolve NÃO rejeita.
            const nus = fonte.match(/await\s+\(?\s*import\(/g) ?? [];
            expect(nus, `${nome} tem import() sem comPrazo`).toHaveLength(0);
            expect(fonte, `${nome} não importa comPrazo`).toContain('comPrazo');
        }
    });

    it('e cada uma diz QUAL etapa dela estourou', () => {
        // "deu timeout" não separa CDN barrado de disco cheio. O nome da etapa
        // é o que decide o conserto, então cada chamada carrega o seu.
        const etapas: Record<string, string[]> = {
            floor10Rascunhador: ['o CDN do motor (jsdelivr)', 'a abertura do modelo'],
            floor10Tradutor: ['o runtime do tradutor', 'o par en→pt do tradutor'],
            floor10VetorDeTom: ['o CDN do juiz (jsdelivr)', 'o download do juiz de tom'],
        };
        for (const [nome, esperadas] of Object.entries(etapas)) {
            const fonte = readFileSync(
                new URL(`../npc/${nome}.ts`, import.meta.url), 'utf8',
            );
            for (const e of esperadas) {
                expect(fonte, `${nome} não nomeia "${e}"`).toContain(e);
            }
        }
    });

    it('e nenhuma memoiza a FALHA — senão o "de novo" não tenta nada', () => {
        // `??=` guarda a promessa, inclusive a que resolveu `null`. O tradutor
        // fazia isso: depois de falhar, o botão devolvia `null` na hora e a
        // única saída era recarregar a página — o oposto do que os prazos vêm
        // resolver. O juiz já zerava os dele.
        const trad = readFileSync(
            new URL('../npc/floor10Tradutor.ts', import.meta.url), 'utf8',
        );
        const i = trad.indexOf('export function prepararTradutor');
        const corpo = trad.slice(i, trad.indexOf('export function esquecerTradutor'));
        expect(corpo).toMatch(/catch[\s\S]*tradutorPromise = null;/);

        const juiz = readFileSync(
            new URL('../npc/floor10VetorDeTom.ts', import.meta.url), 'utf8',
        );
        expect(juiz).toMatch(/catch[\s\S]*extratorPromise = null;/);
    });
});
