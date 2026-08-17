import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { definirFilaDoAndar10, floor10Fila } from '../npc/floor10Fila';
import {
    passosDoAndar10, conversaLiberada, definirEtapaParaTestes, resetPrecargaForTests,
} from '../npc/floor10Precarga';
import { composicaoDaFila } from '../npc/floor10Composicao';
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
