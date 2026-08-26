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

    it('NÃO acusa cota de disco por causa de prosa NOSSA', () => {
        // Isto aconteceu: uma mensagem minha continha a palavra "cota" (eu tinha
        // chutado a causa dentro do texto do erro) e esta regra repetiu o chute
        // com ar de certeza, num aparelho com 10 GB livres. O dono do jogo:
        // "esse erro está errado, pois eu tenho 10 gbs de espaço".
        //
        // A regra passou a casar só com o que o NAVEGADOR emite.
        const d = diagnosticar('baixado; não localizei no cache, vou tentar abrir mesmo assim…');
        expect(d?.resumo).not.toMatch(/não coube|espaço suficiente/i);
        expect(d?.resumo).toMatch(/não achou|conferência/i);
        // E ela diz que é observação, não causa.
        expect(d?.saidas.join(' ')).toMatch(/não uma causa|pode estar errada/i);
    });

    it('e o cache quebrado explica o mecanismo MEDIDO, sem decretar cota', () => {
        const d = diagnosticar('Model file not found: https://huggingface.co/x.gguf');
        expect(d?.saidas.join(' ')).toMatch(/APAGA o registro da origem/);
        // "cota" só pode aparecer como último recurso, e condicionada.
        expect(d?.saidas.join(' ')).not.toMatch(/é cota de disco —/);
    });

    it('NÃO inventa diagnóstico para o que não reconhece', () => {
        // Um palpite com ar de certeza manda a pessoa consertar a coisa errada,
        // e aí ela perde a tarde. `null` faz a sala mostrar o texto cru, que é
        // pior de ler e melhor de agir.
        // `SentencePiece vocabulary error` SAIU desta lista: ele passou a ser
        // reconhecido, e com razão — é o sintoma de entregar gzip ao Bergamot,
        // que é exatamente o defeito medido depois. Um exemplo de "não
        // reconhecido" precisa ser algo que de fato não sabemos.
        expect(diagnosticar('WebGPU adapter request failed')).toBeNull();
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

    it('e a VONTADE também: o catch dela escreve na tela, não só na caixa-preta', () => {
        // O rascunhador ganhou esta cobertura e a vontade não, e o buraco
        // apareceu inteiro no aparelho do dono do jogo: o gguf do revisor
        // apontava para uma URL ainda não publicada, o `download` do wllama
        // levantou um 404, e a sala do ?pipeline mostrou "não subiu, e não
        // disse por quê". A caixa-preta tinha o motivo o tempo todo.
        //
        // A sala lê `npc.deliberationLoadText` como motivo da peça, então é
        // NELE que o catch precisa escrever — anotar sozinho não chega na tela.
        const fonte = readFileSync(
            new URL('../npc/floor10SmallBrain.ts', import.meta.url), 'utf8',
        );
        const catchDaVontade = fonte.slice(fonte.indexOf("anotar('vontade:download-falhou'"));
        expect(catchDaVontade.slice(0, 900)).toContain('deliberationLoadText');
    });

    it('e um 404 é dito como 404, porque tentar de novo não resolve', () => {
        // Falha de rede e arquivo inexistente pedem coisas opostas de quem
        // está instalando: uma pede paciência, a outra pede um arquivo. A tela
        // que trata as duas igual manda o jogador repetir um download que nunca
        // vai completar.
        const fonte = readFileSync(
            new URL('../npc/floor10SmallBrain.ts', import.meta.url), 'utf8',
        );
        expect(fonte).toMatch(/404\\b\|not found/i);
        expect(fonte).toContain('Tentar de novo não resolve.');
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

describe('a conferência de cache vale para TODOS os carregadores', () => {
    // ── E DEIXAR ELA DENTRO DE UM DELES FOI O ERRO ───────────────────────
    //
    // Ela nasceu dentro do rascunhador. O defeito que ela conserta é do wllama,
    // então valia para todos — e a vontade, que não a tinha, quebrou igual:
    //
    //   "eu estava baixando o lsfm, aí no fim, eu saí sem querer do chrome, e
    //    deu erro, aí eu cliquei pra baixar dnv, e foi INSTANTÂNEO, mas faltava
    //    até que um tempo antes de instalar"
    //
    // Instantâneo porque o `download` do wllama volta na hora quando a chave já
    // existe, sem conferir o tamanho. Consertar num carregador só foi consertar
    // metade.
    const compartilhado = readFileSync(
        new URL('../npc/floor10CacheDeModelos.ts', import.meta.url), 'utf8',
    );

    it('mora num módulo próprio, e não dentro de um cliente', () => {
        expect(compartilhado).toContain('export async function conferirCacheDeModelo');
        expect(compartilhado).toContain('export async function limparModeloDoCache');
    });

    it('e OS DOIS carregadores de gguf a usam', () => {
        for (const nome of ['floor10Rascunhador', 'floor10SmallBrain']) {
            const fonte = readFileSync(
                new URL(`../npc/${nome}.ts`, import.meta.url), 'utf8',
            );
            expect(fonte, `${nome} não confere o cache`)
                .toContain('conferirCacheDeModelo(');
            expect(fonte, `${nome} não limpa o cache quebrado`)
                .toContain('limparModeloDoCache(');
        }
    });

    it('procura pela CHAVE, não pela metadata que some', () => {
        // Medido: uma escrita interrompida PERDE a metadata, e `originalURL`
        // mora nela. Procurar por `originalURL` nunca alcança a entrada
        // quebrada — nem para achar, nem para limpar.
        expect(compartilhado).toContain('getNameFromURL');
        expect(compartilhado).toContain('meu.size !== bytesEsperados');
        expect(compartilhado).toContain("return { tipo: 'sem-metadata'");
    });

    it('conferir nunca pode barrar o download', () => {
        // Sem API, ou com erro, responde 'ok' e sai da frente. Uma verificação
        // que reprova por não saber é pior que a ausência dela.
        expect(compartilhado).toMatch(/if \(typeof cofre\?\.list !== 'function'\) return \{ tipo: 'ok'/);
        expect(compartilhado).toMatch(/catch \{[\s\S]*return \{ tipo: 'ok', bytes: -1 \};/);
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

/**
 * ── O CARIMBO DO BUILD PRECISA SER GERADO, NÃO SÓ LIDO ───────────────────
 *
 * `origemEstavel.ts` lê `globalThis.__TNE_BUILD__` e busca `/version.json` no
 * endereço fixo para comparar as duas pontas. Durante meses ninguém escrevia o
 * global e ninguém gerava o arquivo: os dois lados respondiam "build
 * desconhecido", e o aviso feito para responder "qual versão estou rodando?"
 * respondia "não sei".
 *
 * O preço apareceu em três rodadas seguidas de relato — "continua mostrando o
 * LFM", "agora foi mas deu erro", "eu já estou no último commit" — em que nem o
 * dono do jogo nem eu conseguíamos dizer qual código estava no aparelho. A
 * única pista era o NÚMERO DE MB no card do revisor.
 */
describe('o build se identifica', () => {
    const vite = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');

    it('o plugin injeta o global e emite o version.json', () => {
        expect(vite).toContain('__TNE_BUILD__=');
        expect(vite).toContain("fileName: 'version.json'");
        // No <head> e antes do bundle: `buildLocal()` roda na primeira
        // renderização do aviso, e um script no fim do body chegaria tarde.
        expect(vite).toContain('head-prepend');
    });

    it('e está ligado — plugin escrito e não usado não carimba nada', () => {
        expect(vite).toMatch(/plugins:\s*\[[^\]]*carimbar\(\)/);
    });

    it('o version.json sai com CORS, que é o que permite a comparação', () => {
        // A pergunta é feita de UMA origem (o preview) para OUTRA (o endereço
        // fixo). Sem `Access-Control-Allow-Origin` o fetch morre no navegador e
        // `buildDoEnderecoFixo` devolve null — de novo "desconhecido". O
        // comentário em `origemEstavel.ts` já afirmava que este cabeçalho
        // existia; ele não existia.
        const vercel = JSON.parse(
            readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
        ) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
        const regra = vercel.headers.find((h) => h.source === '/version.json');
        expect(regra, 'vercel.json não tem regra para /version.json').toBeTruthy();
        expect(regra?.headers.map((h) => h.key)).toContain('Access-Control-Allow-Origin');
        // `no-store`: a resposta de cinco minutos atrás não serve para decidir
        // se um deploy novo já subiu.
        expect(regra?.headers.map((h) => h.key)).toContain('Cache-Control');
    });
});

/**
 * ── `?rascunhador=v2` ────────────────────────────────────────────────────
 *
 * O revisor escrevendo o primeiro jato. Medido na bancada: quebra 0/8 contra
 * 5/8 do granite, e as oito falas saíram limpas e completas — mas ~16 s por
 * frase contra ~5 s, porque ele abre um `<think>` que o pipeline descarta.
 *
 * Três formas de calar o bloco foram testadas e as três falharam: com a flag do
 * template ele pensa; com o bloco já fechado entregue à mão ele abre outro; e
 * com `stop` no `<think>` a saída vem VAZIA — porque a tag é o primeiro token
 * que ele emite. Está nos pesos, e não haverá novo treino.
 *
 * Por isso um interruptor, e não uma troca: a projeção para o aparelho de quem
 * joga dá o dobro do turno, mas projeção não é medição e a primeira lei do
 * projeto é que esta bancada não prevê aquele celular.
 */
describe('o rascunhador também se escolhe pela URL', () => {
    it('o padrão é o granite, e só ?rascunhador=v2 troca', async () => {
        const { rascunhadorEscolhido } = await import('../npc/floor10Rascunhador');
        expect(rascunhadorEscolhido('?pipeline')).toBe('granite');
        expect(rascunhadorEscolhido('')).toBe('granite');
        expect(rascunhadorEscolhido('?pipeline&rascunhador=v2')).toBe('v2');
        expect(rascunhadorEscolhido('?rascunhador=V2')).toBe('v2');
    });

    it('e a fila promete os bytes do escolhido, não os do titular', () => {
        // Prometer 822 MB e baixar 542 MB é o defeito que já fez a barra
        // mentir com `?revisor=lfm-onnx`. As duas telas leem a mesma função.
        for (const arquivo of ['../Floor10NpcChat.tsx', '../Floor10PipelineSala.tsx']) {
            const fonte = readFileSync(new URL(arquivo, import.meta.url), 'utf8');
            expect(fonte, `${arquivo} promete bytes fixos`).toContain('modeloDoRascunhador().bytes');
        }
    });
});
