import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { definirFilaDoAndar10, floor10Fila } from '../npc/floor10Fila';
import {
    passosDoAndar10, conversaLiberada, definirEtapaParaTestes, resetPrecargaForTests,
} from '../npc/floor10Precarga';
import { composicaoDaFila } from '../npc/floor10Composicao';
import { pipelineLigado } from '../npc/floor10Pipeline';
import { npcSet } from '../npc/npcStore';
import { DOWNLOAD_ZERO } from '../npc/floor10Download';

/**
 * A FILA QUANDO O PIPELINE ENTRA — e o defeito que a fiação nova revelou.
 *
 * Até aqui existiam DUAS listas com a mesma verdade: a ordem da barra, escrita
 * à mão em `floor10Fila`, e a ordem do download, escrita à mão em
 * `passosDoAndar10`. Ninguém as obrigava a concordar, e elas não concordavam.
 * Agora as duas leem `composicaoDaFila`, e estes testes prendem isso.
 */
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

const CARREGADORES = {
    fala: async () => true,
    vontade: async () => true,
    motor: async () => true,
    memoria: async () => true,
    reflexo: async () => true,
    rascunho: async () => true,
    juiz: async () => true,
    tradutor: async () => true,
    liberarVontade: async () => true,
    liberarMotor: async () => true,
};

beforeEach(() => { floor10Fila.reset(); });

describe('a barra e o download leem a MESMA lista', () => {
    it('e antes disso eles discordavam — este é o teste que impede a volta', () => {
        // O que o jogador via: enquanto a MEMÓRIA baixava, a linha dizia
        // "2 de 5 · vontade". `posicao` é calculada sobre a lista da barra, e a
        // barra tinha a vontade em segundo lugar enquanto o download tinha a
        // memória. Nome errado, na hora errada, por dois anos de commits.
        for (const busca of ['', '?pipeline']) {
            definirFilaDoAndar10(BYTES, busca);
            const daBarra = floor10Fila.ordem();
            const doDownload = passosDoAndar10(CARREGADORES, busca).map((p) => p.id);
            expect(daBarra, `a barra e o download discordam em "${busca}"`)
                .toEqual(doDownload);
        }
    });

    it('e as duas saem da composição, que é onde a ordem mora', () => {
        definirFilaDoAndar10(BYTES, '?pipeline');
        expect(floor10Fila.ordem()).toEqual(composicaoDaFila('?pipeline').map((p) => p.papel));
    });
});

describe('a fila com `?pipeline`', () => {
    it('tem as três peças novas e NÃO tem o SmolLM3', () => {
        definirFilaDoAndar10(BYTES, '?pipeline');
        const ordem = floor10Fila.ordem();
        expect(ordem).toContain('rascunho');
        expect(ordem).toContain('juiz');
        expect(ordem).toContain('tradutor');
        expect(ordem).not.toContain('fala');
    });

    it('o rascunhador aparece como "conversa" — o jogador não sabe o que é a400m', () => {
        // Do lado de fora é a mesma coisa chegando: aquilo sem o que ele não
        // conversa. Trocar o rótulo por "granite MoE" seria informar o
        // desenvolvedor às custas de quem joga.
        definirFilaDoAndar10(BYTES, '?pipeline');
        const rascunho = composicaoDaFila('?pipeline').find((p) => p.papel === 'rascunho');
        expect(rascunho).toBeDefined();
        floor10Fila.progresso('rascunho', {
            ...DOWNLOAD_ZERO, bytes: 1, totalBytes: BYTES.rascunho,
        });
        expect(floor10Fila.estado().atual?.label).toBe('conversa');
    });

    it('sem pipeline, as três não aparecem mesmo com tamanho informado', () => {
        // Os tamanhos vão sempre — quem decide quem entra é a composição.
        definirFilaDoAndar10(BYTES, '');
        expect(floor10Fila.ordem()).toEqual(['fala', 'memoria', 'reflexo', 'vontade', 'motor']);
    });

    it('quem não trouxe tamanho não entra, e isso vale para o reflexo como sempre valeu', () => {
        definirFilaDoAndar10({
            fala: 1, vontade: 1, motor: 1, memoria: 1,
        }, '');
        expect(floor10Fila.ordem()).toEqual(['fala', 'memoria', 'vontade', 'motor']);
    });
});

describe('quem espera a geração, e quem não pode esperar', () => {
    it('as ESSENCIAIS não adiam — elas são a própria conversa', () => {
        // A fala nunca adiou porque é por ela que o jogador espera. Sob
        // `?pipeline` quem ocupa esse lugar é o rascunhador MAIS o tradutor:
        // sem tradução não existe português, e nem sequer existe pergunta (o
        // jogador digita em português e a cadeia toda trabalha em inglês).
        // Fazê-los adiar prenderia a conversa esperando a própria conversa.
        const passos = passosDoAndar10(CARREGADORES, '?pipeline');
        const adia = Object.fromEntries(passos.map((p) => [p.id, Boolean(p.adiarEnquanto)]));
        expect(adia.rascunho).toBe(false);
        expect(adia.tradutor).toBe(false);
        // O juiz adia: sem ele o rascunho passa direto, o que é pior em
        // qualidade e não em silêncio.
        expect(adia.juiz).toBe(true);
        for (const outro of ['memoria', 'reflexo', 'vontade', 'motor']) {
            expect(adia[outro], `${outro} devia adiar a geração`).toBe(true);
        }
    });

    it('e fora do pipeline a regra é a de sempre: só a fala não adia', () => {
        const passos = passosDoAndar10(CARREGADORES, '');
        const adia = Object.fromEntries(passos.map((p) => [p.id, Boolean(p.adiarEnquanto)]));
        expect(adia.fala).toBe(false);
        for (const outro of ['memoria', 'reflexo', 'vontade', 'motor']) {
            expect(adia[outro], `${outro} devia adiar a geração`).toBe(true);
        }
    });

    it('só a vontade e o motor sabem se liberar', () => {
        // A fala e a memória ficam de pé com o chat aberto — desenho do dono do
        // jogo. O rascunhador entra nessa lista pelo mesmo motivo que a fala:
        // sob `?pipeline` é ele quem responde.
        const passos = passosDoAndar10(CARREGADORES, '?pipeline');
        const libera = passos.filter((p) => p.liberar).map((p) => p.id);
        expect(libera.sort()).toEqual(['motor', 'vontade']);
    });
});

describe('o que a conversa espera antes de abrir', () => {
    beforeEach(() => { npcSet({ phase: 'cold' }); resetPrecargaForTests(); });

    it('fora do pipeline, só a fala — como sempre foi', () => {
        definirEtapaParaTestes('fala');
        expect(conversaLiberada('')).toBe(false);
        definirEtapaParaTestes('memoria');
        expect(conversaLiberada('')).toBe(true);
    });

    it('COM pipeline, o rascunhador E o tradutor', () => {
        // Com a pergunta antiga (`etapa !== 'fala'`) a conversa abriria assim
        // que o rascunhador descesse — e a primeira pergunta do jogador
        // chegaria a um pipeline sem tradutor, ou seja, a nada: ele pergunta em
        // português e a cadeia inteira do meio trabalha em inglês.
        definirEtapaParaTestes('rascunho');
        expect(conversaLiberada('?pipeline')).toBe(false);
        definirEtapaParaTestes('tradutor');
        expect(conversaLiberada('?pipeline')).toBe(false);
        // O juiz já não segura: sem ele o rascunho passa direto, o que é pior
        // em qualidade e não em silêncio.
        definirEtapaParaTestes('juiz');
        expect(conversaLiberada('?pipeline')).toBe(true);
    });

    it('e um cérebro já de pé libera de qualquer jeito', () => {
        definirEtapaParaTestes('rascunho');
        npcSet({ phase: 'ready' });
        expect(conversaLiberada('?pipeline')).toBe(true);
        npcSet({ phase: 'cold' });
    });
});

describe('o atalho roda ANTES de abrir o 3B', () => {
    const motor = readFileSync(new URL('../npc/wllamaEngine.ts', import.meta.url), 'utf8');

    it('e não depois, que foi como eu liguei da primeira vez', () => {
        // Sob `?pipeline` o SmolLM3 não está na fila. Com o atalho depois de
        // `loadConversationBrain()`, a primeira mensagem do jogador baixaria
        // 1,92 GB para em seguida não usar nada disso — o contrário exato de um
        // atalho. Ordem no arquivo é a única coisa que prende isto sem montar o
        // motor inteiro de mentira.
        const atalho = motor.indexOf('if (pipelineDisponivel()) {');
        const abre3B = motor.indexOf('engine = await loadConversationBrain();');
        expect(atalho).toBeGreaterThan(-1);
        expect(abre3B).toBeGreaterThan(-1);
        expect(atalho).toBeLessThan(abre3B);
    });

    it('a fala do atalho passa pelas MESMAS checagens da fala do 3B', () => {
        // Ele não tem permissão de falar pior. Reprovou, some sem escrever
        // nada e o caminho de sempre assume.
        const i = motor.indexOf('async function falarPeloAtalho');
        const corpo = motor.slice(i, motor.indexOf('\n}', i));
        expect(corpo).toContain('parseFloor10WillLanguageDecision(');
        expect(corpo).toContain('floor10ReplyIssue(');
        expect(corpo).toMatch(/if \(problema\) return false;/);
    });

    it('e a etapa é limpa quando ele desiste', () => {
        // `etapa` alimenta o relógio da bolha de espera. Deixá-la em
        // "traduzindo…" durante os 13 s do 3B seria mentir na tela — que é
        // exatamente o defeito que o campo `etapa` nasceu para consertar.
        const i = motor.indexOf('if (atalhou) return;');
        expect(i).toBeGreaterThan(-1);
        expect(motor.slice(i, i + 400)).toMatch(/etapa: ''/);
    });
});

describe('as duas URLs do pipeline', () => {
    const main = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8');

    it('`?pipeline` abre a SALA e `?pipeline=jogo` vai para o jogo', () => {
        // O dono do jogo digitou `?pipeline` esperando uma aba como as outras
        // (`?rascunho`, `?campo`, `?mente`, `?bancada`) e não veio nada. A sala
        // passou a existir, e as duas URLs precisam continuar distintas: sem a
        // segunda não há como sentir o pipeline no jogo de verdade, que é onde
        // a perda de memória e histórico aparece.
        expect(main).toContain('isPipelineSala');
        expect(main).toContain('isPipelineNoJogo');
        const sala = main.indexOf('isPipelineSala ?');
        const rascunho = main.indexOf('isRascunho ?');
        expect(sala).toBeGreaterThan(-1);
        expect(rascunho).toBeGreaterThan(sala);
    });

    it('e a flag do jogo continua ligada nas DUAS', () => {
        // `falarPeloPipelineReal` é o mesmo nos dois caminhos: a sala mede o
        // código que o jogo roda, e não uma reimplementação.
        expect(pipelineLigado('?pipeline')).toBe(true);
        expect(pipelineLigado('?pipeline=jogo')).toBe(true);
        expect(pipelineLigado('')).toBe(false);
        expect(pipelineLigado('?bancada')).toBe(false);
    });

    it('a sala chama o MESMO código do jogo, e não uma cópia', () => {
        const sala = readFileSync(new URL('../Floor10PipelineSala.tsx', import.meta.url), 'utf8');
        // A chamada ganhou um segundo argumento (o diário de bordo, para a
        // sala desenhar cada etapa) — mas continua sendo a MESMA função do
        // jogo, que é o que este teste protege.
        expect(sala).toMatch(/falarPeloPipelineReal\(emIngles,/);
        // Se ela montasse o pipeline à mão, mediria outro programa. O que
        // vale é o que ela IMPORTA — citar `PECAS_REAIS` num comentário para
        // explicar de onde vem a `etapa` é outra coisa, e a primeira versão
        // deste teste reprovou justamente por isso.
        const imports = sala.slice(0, sala.indexOf('export default function'))
            .split('\n').filter((l) => l.trimStart().startsWith('import ') || l.includes("} from './npc/"))
            .join('\n');
        for (const naoDeveria of ['PECAS_REAIS', 'rascunharEmIngles', 'frasesForaDoTom', 'remendarFraseEmIngles']) {
            expect(imports, `a sala importa ${naoDeveria} — está remontando o pipeline`)
                .not.toContain(naoDeveria);
        }
    });

    it('e NADA baixa ao abrir a aba', () => {
        // São 983 MB somando as peças. Abrir uma aba não pode custar isso —
        // mesma regra do `?rascunho`, que importa o wllamaEngine só no clique.
        const sala = readFileSync(new URL('../Floor10PipelineSala.tsx', import.meta.url), 'utf8');
        const ateOComponente = sala.slice(0, sala.indexOf('export default function'));
        for (const proibido of ['baixarRascunhador()', 'prepararTradutor()', 'prepararJuizDeTom()']) {
            expect(ateOComponente, `${proibido} roda ao importar o módulo`)
                .not.toContain(proibido);
        }
    });
});

describe('a sala NUNCA sobe dois runtimes pesados ao mesmo tempo', () => {
    const sala = readFileSync(
        new URL('../Floor10PipelineSala.tsx', import.meta.url), 'utf8',
    );

    it('a fila só BAIXA — subir é passo separado', () => {
        // ── O QUE ACONTECEU ──────────────────────────────────────────────
        //
        // A sala fazia, em sequência e sem pausa: baixar+SUBIR o granite
        // (822 MB), depois baixar+SUBIR o LFM2.5 (1,25 GB). Dois llama.cpp de
        // pé com seus pools de thread, mais o runtime ONNX do juiz, mais o
        // worker WASM do Bergamot — quatro runtimes num celular.
        //
        // O celular do dono do jogo DESLIGOU no meio dessa instalação.
        //
        // A fila do JOGO nunca fez isso, e o comentário em `passosDoAndar10`
        // guarda o motivo com as palavras dele: "quando começa a baixar [a
        // vontade], começa a travar meu celular todo". Por isso ela usa
        // `baixarVontade` — baixar é rede, subir é núcleo. Eu sabia e escrevi a
        // sala ignorando.
        expect(sala).toContain('carregar: baixarRascunhador');
        expect(sala).toContain('carregar: baixarVontade');
        expect(sala).not.toContain('carregar: precarregarVontade');
        // `precarregarRevisor` é apelido de `precarregarVontade` — sobe o
        // runtime do mesmo jeito, e não pode entrar aqui por outro nome.
        expect(sala).not.toContain('carregar: precarregarRevisor');
        // E o `subirRascunhador` não pode estar dentro do `carregar` de peça.
        expect(sala).not.toMatch(/carregar:[^\n]*subirRascunhador/);
    });

    it('e descarrega a vontade ANTES de subir o rascunhador', () => {
        // A garantia de que nunca existem dois llama.cpp de pé. A vontade volta
        // sozinha quando o juiz marcar uma frase — e aí o rascunhador já
        // terminou de escrever, então eles não se cruzam.
        const i = sala.indexOf('const subirParaRodar');
        const corpo = sala.slice(i, sala.indexOf('/** Uma peça só', i));
        const desliga = corpo.indexOf('unloadSmallBrain()');
        const sobe = corpo.indexOf('subirRascunhador()');
        expect(desliga).toBeGreaterThan(-1);
        expect(sobe).toBeGreaterThan(desliga);
    });

    it('e a fila respira entre uma peça e outra', () => {
        // Downloads colados, cada um terminando com uma gravação grande em
        // disco, não dão ao aparelho janela para dissipar calor nem para o
        // coletor de lixo rodar.
        expect(sala).toContain('await esperar(RESPIRO_ENTRE_PECAS_MS)');
    });
});

describe('a fila do JOGO também respira', () => {
    it('entre um passo e outro, e dá para zerar no teste', () => {
        // Mesmo motivo, no caminho que o jogador de verdade percorre. O
        // override existe porque dormir 3 s por passo levou a suíte de 12 s a
        // 80 s e não testava nada — o que importa é a ORDEM.
        const fonte = readFileSync(
            new URL('../npc/floor10Precarga.ts', import.meta.url), 'utf8',
        );
        expect(fonte).toContain('RESPIRO_ENTRE_PASSOS_MS');
        expect(fonte).toContain('__f10RespiroMs');
        expect(fonte).toMatch(/if \(respiro > 0\) await esperar\(respiro\)/);
    });
});

describe('a sala mostra TODAS as etapas, não só duas', () => {
    const sala = readFileSync(
        new URL('../Floor10PipelineSala.tsx', import.meta.url), 'utf8',
    );
    const pipe = readFileSync(
        new URL('../npc/floor10Pipeline.ts', import.meta.url), 'utf8',
    );

    it('o pipeline relata cada passo, e o JOGO não paga por isso', () => {
        // Relato: "não consigo ver o rascunho, não consigo ver pra onde o juiz
        // apontou erro, e nem o lsfm corrigindo". A sala mostrava 2 de 5
        // passos, porque o pipeline só devolvia CONTADORES — e contador
        // responde "vale a pena?", não "o que ele escreveu?".
        for (const passo of ['rascunho', 'frases', 'juiz', 'limpeza', 'remendo', 'traducao']) {
            expect(pipe, `o passo ${passo} não é relatado`).toContain(`passo: '${passo}'`);
        }
        // `aoPassar` é OPCIONAL: o jogo não passa nada e não paga nada.
        expect(pipe).toContain('aoPassar?: (passo: PassoDoPipeline) => void');
        expect(pipe).toMatch(/aoPassar\?\.\(/);
    });

    it('e a sala desenha o conteúdo, não o contador', () => {
        expect(sala).toContain('corrida.passos.map');
        // O antes/depois de cada remendo é o que diz se o revisor presta.
        expect(sala).toContain('devolveu a MESMA frase');
        // E as frases numeradas, senão "marcou a 2" não quer dizer nada.
        expect(sala).toMatch(/<ol style/);
    });

    it('os passos aparecem AO VIVO, não só no fim', () => {
        // Numa corrida de 15 s, esperar o fim é olhar para um botão parado.
        expect(sala).toMatch(/passos: \[\.\.\.c\.passos, passo\]/);
    });
});

describe('a sala é usada no celular', () => {
    const sala = readFileSync(
        new URL('../Floor10PipelineSala.tsx', import.meta.url), 'utf8',
    );

    it('alvo de toque de 44 px, e fonte que dá para ler', () => {
        // Relato: "tá muito ruim de mexer do jeito que tá". Os botões tinham
        // ~30 px de altura; o mínimo confortável no toque é ~44.
        expect(sala).toContain('const TOQUE = { minHeight: 44');
        // E o textarea a 16 px: abaixo disso o iOS dá zoom sozinho ao focar.
        expect(sala).toMatch(/fontSize: 16/);
    });

    it('a página rola no eixo certo e NUNCA no outro', () => {
        // Uma URL de erro ou uma frase em inglês sem espaço arrastava a tela
        // para o lado, e aí o scroll vertical briga com o horizontal.
        expect(sala).toContain("overflowX: 'hidden'");
        expect(sala).toContain("overflowWrap: 'anywhere'");
        // `100dvh` saiu: a sala deixou de depender da altura do html/body e
        // passou a ser o PRÓPRIO contêiner de rolagem (`position: fixed` +
        // `inset: 0` + `overflowY: auto`). Assim ela rola com o corpo travado
        // — que é o que o jogo pede para o canvas 3D — e sem ele.
        expect(sala).toContain("position: 'fixed'");
        expect(sala).toContain("overflowY: 'auto'");
        expect(sala).toContain("touchAction: 'pan-y'");
        // Inércia no Safari antigo: a ausência dela É a sensação de "não
        // funciona no celular".
        expect(sala).toContain("WebkitOverflowScrolling: 'touch'");
    });

    it('a barra do revisor lê o campo DELE', () => {
        // Relato: "não dá pra ver a barra de download do revisor". Ele publica
        // em `deliberationDownload` — o campo que a tela da vontade usa no
        // jogo —, e a sala só olhava `loadDownload`.
        expect(sala).toContain('amostraPropria: () => npc.deliberationDownload');
    });
});

/**
 * ── A TERCEIRA LISTA ─────────────────────────────────────────────────────
 *
 * `composicaoDaFila` uniu a barra e o download do JOGO. Ficou de fora uma
 * terceira lista, escrita à mão em `Floor10PipelineSala.tsx`, e ela já cobrou
 * dois preços:
 *
 *   1. `?revisor=llama` não mudou nada, porque a escolha foi ligada na fila do
 *      jogo e esta tela nunca leu de lá (o comentário está lá, no lugar);
 *   2. a memória NUNCA descia aqui — e como `lembrarPorSignificado()` devolve
 *      'modelo desligado' sem subir nada sob demanda, toda rodada de pipeline
 *      nesta sala rodou com o rascunhador às cegas, sem o fato do cânone que a
 *      pergunta pediu. A bancada media um pipeline pior que o do jogo.
 *
 * Enquanto as duas listas não virarem uma, este teste é o que as obriga a
 * concordar sobre QUEM desce.
 */
describe('a sala do ?pipeline baixa as mesmas peças que o jogo', () => {
    it('inclui a memória, que é quem direciona o rascunhador', () => {
        const sala = readFileSync(
            new URL('../Floor10PipelineSala.tsx', import.meta.url), 'utf8',
        );
        expect(sala).toContain("id: 'memoria'");
        // ── BAIXAR NA FILA, SUBIR NO BOTÃO ──────────────────────────────
        //
        // A primeira versão pôs `precarregarMemoria` na fila e quebrou a tela:
        // ela SOBE um llama.cpp de 333 MB, e a fila desta sala só pode baixar
        // — a regra está escrita na peça do rascunhador e existe porque o
        // aparelho do dono do jogo desligou com quatro runtimes de pé.
        expect(sala).toContain('carregar: baixarMemoria');
        // Mas `lembrarPorSignificado` exige o `residentEngine`, então alguém
        // tem de subir: é o botão, junto com o rascunhador.
        expect(sala).toContain('await precarregarMemoria()');
    });

    it('e a barra lê o campo onde a memória publica, não o do rascunhador', () => {
        // Cada peça publica em um campo diferente do npcStore. A memória usa
        // `memoriaDownload`; sem dizer isso, ela baixa de verdade e a tela não
        // mostra nada — "está na fila mas não mostra baixando", que de fora é
        // igual a uma peça travada.
        const sala = readFileSync(
            new URL('../Floor10PipelineSala.tsx', import.meta.url), 'utf8',
        );
        expect(sala).toContain('npc.memoriaDownload');
        expect(sala).toContain('npc.memoriaLoadText');
    });

    it('e não perde nenhum papel que a fila do jogo traz para o pipeline', () => {
        const sala = readFileSync(
            new URL('../Floor10PipelineSala.tsx', import.meta.url), 'utf8',
        );
        // O reflexo e o motor ficam de fora de propósito: nenhum dos dois
        // participa de uma fala pelo pipeline. Os outros têm de estar.
        for (const papel of ['rascunho', 'tradutor', 'juiz', 'memoria']) {
            expect(sala, `a sala não baixa ${papel}`).toContain(`id: '${papel}'`);
        }
    });
});
