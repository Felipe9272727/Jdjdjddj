/**
 * f3Boca.test.ts — a ficha do Felipe, cobrada.
 *
 * Ele mandou dezoito bocas com nome e oito expressões de uso. Isto verifica que
 * o jogo tem todas, que nenhuma é cópia de outra, e — a parte que é personagem e
 * não desenho — que a cara dele segue o mesmo arco que o chão, a voz e a trilha
 * já seguem.
 *
 * O que ISTO não julga: se a boca desenhada parece a da ficha. Isso é olho, e
 * foi conferido na foto (bancada `ver-o-diabrete.mjs`, vistas `boca-*`).
 */

import { describe, it, expect } from 'vitest';
import {
    BOCAS, NOMES_DAS_BOCAS, BOCA_EM_REPOUSO, BOCA_HZ,
    bocaDaNota, expressaoDoDiabrete, bocaNoInstante, quadroDaBoca, aberturaDaBoca, TORTO,
    bocaOciosa, RESPIRO_S, QUADROS_DE_TEMPERO, CICLO_FALA,
    PARTE_FALANDO,
    type MomentoExtra,
    type NomeDaBoca,
} from './f3Boca';
import { vozDoDiabrete } from './f3Voz';
import { BOIL_HZ } from './f3Tinta';

describe('a ficha inteira está no jogo', () => {
    it('as bocas das DUAS fichas existem', () => {
        // A primeira ficha trazia dezoito. A segunda trouxe o ciclo de fala
        // numerado (F1..F12) e uma fileira de extras — o vocabulário cresceu, e
        // este número cresce com ele em vez de travar o desenho novo.
        expect(NOMES_DAS_BOCAS.length).toBeGreaterThanOrEqual(18);
        // e o ciclo de doze quadros que ele nomeou está inteiro aqui
        for (const n of CICLO_FALA) expect(NOMES_DAS_BOCAS).toContain(n);
        expect(CICLO_FALA).toHaveLength(12);
        for (const n of NOMES_DAS_BOCAS) expect(BOCAS[n]).toBeTruthy();
    });
    it('cada uma tem desenho: ou contorno fechado, ou traço', () => {
        for (const n of NOMES_DAS_BOCAS) {
            const f = BOCAS[n];
            expect(f.caminho.length + f.traco.length).toBeGreaterThan(2);
            // aberta = contorno cheio; fechada = traço. Nunca as duas coisas.
            expect(f.cheia ? f.caminho.length > 0 : f.traco.length > 0).toBe(true);
        }
    });
    it('nenhuma boca é cópia de outra — um nome, um desenho', () => {
        const impressoes = NOMES_DAS_BOCAS.map(n => JSON.stringify(BOCAS[n]));
        expect(new Set(impressoes).size).toBe(NOMES_DAS_BOCAS.length);
    });
    it('nada sai do quadro normalizado', () => {
        for (const n of NOMES_DAS_BOCAS) {
            for (const p of [...BOCAS[n].caminho, ...BOCAS[n].traco]) {
                expect(Math.abs(p.x)).toBeLessThanOrEqual(1.0001);
                expect(Math.abs(p.y)).toBeLessThanOrEqual(1.0001);
            }
        }
    });
});

describe('o repouso é metade do personagem', () => {
    it('parado ele NÃO está neutro — a ficha diz Irônico e Travesso', () => {
        expect(BOCA_EM_REPOUSO).toBe('sorrisoIronico');
        expect(BOCA_EM_REPOUSO).not.toBe('neutra');
    });
    it('e o sorriso irônico é torto, que é o que faz ele ser irônico', () => {
        // O torto mora no TRAÇO (um canto mais alto que o outro), não no giro.
        // Esta asserção cobrava `inclinacao > 4°` e travou o conserto de um
        // defeito real: giro e cisalhamento somados viravam uma risca
        // atravessada na cara. O giro encolheu; a ironia ficou.
        // O F4 da ficha nova é uma boca ABERTA (fresta com fileira de dentes),
        // então a régua olha o contorno, não o traço.
        const t = BOCAS.sorrisoIronico.cheia ? BOCAS.sorrisoIronico.caminho : BOCAS.sorrisoIronico.traco;
        const esq = t.reduce((a, p) => (p.x < a.x ? p : a));
        const dir = t.reduce((a, p) => (p.x > a.x ? p : a));
        expect(dir.y - esq.y).toBeGreaterThan(0.1);
    });
    it('e é uma boca PEQUENA — ela divide a cara com a nareba dele', () => {
        // Medido na foto com a pose congelada: a nareba está em 0,333 da régua
        // da cara e as bocas grandes chegavam a 0,323. A largura do repouso
        // caiu junto: a 0,78 ele virava uma risca de canto a canto do rosto.
        const larg = (n: NomeDaBoca) => {
            const p = BOCAS[n].cheia ? BOCAS[n].caminho : BOCAS[n].traco;
            return Math.max(...p.map(q => q.x)) - Math.min(...p.map(q => q.x));
        };
        expect(larg('sorrisoIronico')).toBeLessThan(1.3);
        for (const n of NOMES_DAS_BOCAS) expect(larg(n)).toBeLessThanOrEqual(1.7);
    });
});

describe('falar não é piscar', () => {
    it('a boca troca a cada QUADRO da nota, não uma vez por nota', () => {
        // O dono do jogo: "a boca dele se mexe muito pouco". Uma nota sozinha
        // tem que render vários desenhos.
        const dentroDaNota = [0, 1, 2, 3].map(q => bocaDaNota(0, false, q));
        expect(new Set(dentroDaNota).size).toBeGreaterThanOrEqual(3);
        for (let i = 1; i < dentroDaNota.length; i++) {
            expect(dentroDaNota[i]).not.toBe(dentroDaNota[i - 1]);
        }
    });
    it('notas seguidas não começam todas na mesma boca', () => {
        const inicios = [0, 1, 2, 3].map(i => bocaDaNota(i, false, 0));
        expect(new Set(inicios).size).toBeGreaterThan(1);
    });
    it('a palavra em CAIXA ALTA abre mais que as outras', () => {
        // Intenção, não nome: o CICLO de acento abre mais, na média. Quadro a
        // quadro não é a régua certa — um ciclo tem quadro fechado de
        // propósito, e é a média que o olho lê como "escancarou".
        const media = (acento: boolean) => [0, 1, 2, 3]
            .reduce((soma, q) => soma + aberturaDaBoca(bocaDaNota(0, acento, q)), 0) / 4;
        expect(media(true)).toBeGreaterThan(media(false));
    });
    it('índice de nota ou quadro estranho não quebra a boca', () => {
        for (const [i, q] of [[-3, 0], [0, -5], [1e9, 1e9], [2.7, 1.9]] as const) {
            expect(NOMES_DAS_BOCAS).toContain(bocaDaNota(i, false, q));
        }
    });
});

describe('a boca segue a MESMA partitura que o trombone', () => {
    const frase = 'Olha o TRAÇO! Espinho fresquinho, saindo do forno!';
    const voz = vozDoDiabrete(frase, { roubados: 0 });

    it('antes da fala e depois dela, a cara é a de repouso', () => {
        expect(bocaNoInstante(voz, -0.2, 'sorrisoIronico')).toBe('sorrisoIronico');
        expect(bocaNoInstante(voz, voz.total + 0.5, 'sorrisoIronico')).toBe('sorrisoIronico');
    });
    it('durante a fala, a boca se mexe em toda nota', () => {
        const vistas = new Set<NomeDaBoca>();
        for (const b of voz.blats) vistas.add(bocaNoInstante(voz, b.t + 0.001, 'neutra'));
        expect(vistas.size).toBeGreaterThan(1);
        expect(vistas.has('neutra')).toBe(false);   // nenhuma nota fica de boca fechada
    });
    it('o acento da frase abre mais a boca que as notas caladas', () => {
        const i = voz.blats.findIndex(b => b.acento);
        expect(i).toBeGreaterThanOrEqual(0);
        const j = voz.blats.findIndex(b => !b.acento);
        const naNota = (k: number) => aberturaDaBoca(bocaNoInstante(voz, voz.blats[k].t + 0.001, 'neutra'));
        expect(naNota(i)).toBeGreaterThan(0);
        expect(naNota(i)).toBeGreaterThanOrEqual(naNota(j));
    });
    // ── A RÉGUA DO DEFEITO QUE ELE RELATOU ───────────────────────────────
    // "percebi que a boca dele se mexe muito pouco". A causa não era o ciclo:
    // era que o som dura 0,55 s e o BALÃO fica 3 s no ar. Estes dois testes
    // fixam o conserto para ele não voltar.
    const DURA = 3.0;   // o que `f3Falas` dá a uma fala destas

    const filme = (dura: number) => {
        const q0 = 0, q1 = Math.ceil(dura * BOCA_HZ);
        const quadros: NomeDaBoca[] = [];
        for (let q = q0; q < q1; q++) quadros.push(bocaNoInstante(voz, (q + 0.5) / BOCA_HZ, 'sorrisoIronico', dura));
        return quadros;
    };

    it('o som acaba em meio segundo, mas o balão fica três — e a boca acompanha o balão', () => {
        expect(voz.total).toBeLessThan(1);          // o trombone é curto de propósito
        // Ele passa a maior parte do balão de boca mexendo, não meio segundo.
        const mexendo = filme(DURA).slice(0, Math.floor(DURA * PARTE_FALANDO * BOCA_HZ));
        expect(mexendo.length).toBeGreaterThan(voz.total * BOCA_HZ * 3);
        expect(new Set(mexendo).size).toBeGreaterThan(2);
        // e nenhum desses quadros é a cara de repouso parada
        expect(mexendo.filter(n => n !== 'sorrisoIronico').length)
            .toBeGreaterThan(mexendo.length * 0.6);
    });

    it('e troca de desenho em quase todo quadro de 8 Hz', () => {
        const quadros = filme(DURA).slice(0, Math.floor(DURA * PARTE_FALANDO * BOCA_HZ));
        let trocas = 0;
        for (let k = 1; k < quadros.length; k++) if (quadros[k] !== quadros[k - 1]) trocas++;
        expect(trocas).toBeGreaterThan(quadros.length * 0.8);
        expect(trocas).toBeGreaterThan(voz.blats.length);   // muito mais que uma por palavra
    });

    it('no fim do balão ele volta ao sorriso torto — a piada precisa do silêncio', () => {
        expect(bocaNoInstante(voz, DURA * 0.99, 'sorrisoIronico', DURA)).toBe('sorrisoIronico');
    });
    it('fala sem nota nenhuma não trava a cara', () => {
        expect(bocaNoInstante({ ...voz, blats: [] }, 0.5, 'triste')).toBe('triste');
    });
});

describe('a cara segue o arco do andar', () => {
    it('ele começa dono do lugar e termina assustado', () => {
        expect(expressaoDoDiabrete('apresentacao', 0)).toBe('sorrisoIronico');
        expect(expressaoDoDiabrete('suplica', 3)).toBe('assustado');
    });
    it('perder pincel piora a cara dele, nunca melhora', () => {
        const ordem: NomeDaBoca[] = ['sorrisoIronico', 'deboche', 'empolgado', 'feliz',
            'bravo', 'irritado', 'assustado', 'triste'];
        const pior = (n: NomeDaBoca) => ordem.indexOf(n);
        for (const momento of ['desenhou', 'provoca', 'roubou'] as const) {
            for (let r = 1; r <= 3; r++) {
                expect(pior(expressaoDoDiabrete(momento, r)))
                    .toBeGreaterThanOrEqual(pior(expressaoDoDiabrete(momento, r - 1)));
            }
        }
    });
    it('espetar o jogador é gozação, não desespero — mesmo já tendo perdido', () => {
        // Cobra a INTENÇÃO, não a forma exata: esta asserção fixava
        // 'empolgado' e quebrou quando o vocabulário se abriu e o espetar com o
        // andar inteiro passou a ser 'feliz'. Teste de intenção sobrevive ao
        // ajuste; teste de valor literal vira atrito.
        const gozacao: NomeDaBoca[] = ['feliz', 'empolgado', 'deboche', 'sorrisoIronico', 'sorriso'];
        expect(gozacao).toContain(expressaoDoDiabrete('espetou', 0));
        expect(expressaoDoDiabrete('espetou', 3)).not.toBe('assustado');
        expect(expressaoDoDiabrete('espetou', 3)).not.toBe('triste');
    });
    it('contagem fora da faixa não quebra a cara', () => {
        expect(expressaoDoDiabrete('provoca', 99)).toBe(expressaoDoDiabrete('provoca', 3));
        expect(expressaoDoDiabrete('provoca', -2)).toBe(expressaoDoDiabrete('provoca', 0));
    });
});

describe('a boca é tinta, não interpolação', () => {
    it('troca no mesmo 8 Hz do resto do andar', () => {
        expect(BOCA_HZ).toBe(BOIL_HZ);
        expect(quadroDaBoca(0.4)).toBe(quadroDaBoca(0.49));
        expect(quadroDaBoca(0.4)).not.toBe(quadroDaBoca(0.55));
    });
});

// ── ELE SORRI IRÔNICO O TEMPO TODO ───────────────────────────────────────────
// "ele tinha que sempre sorrir ironicamente", disse o dono do jogo. Isso não é
// uma expressão que se escolhe — é o traço de todas elas. O teste cobra a
// ASSIMETRIA: em toda forma da ficha, um canto da boca está mais alto que o
// outro. Boca simétrica não é irônica, por mais que se gire.
describe('a ironia está no traço, não na escolha', () => {
    const cantos = (n: string) => {
        const f = BOCAS[n as NomeDaBoca];
        const pts = f.cheia ? f.caminho : f.traco;
        const esq = pts.reduce((a, p) => (p.x < a.x ? p : a));
        const dir = pts.reduce((a, p) => (p.x > a.x ? p : a));
        return dir.y - esq.y;
    };

    it('toda boca da ficha tem um canto mais alto que o outro', () => {
        for (const n of NOMES_DAS_BOCAS) {
            expect(Math.abs(cantos(n))).toBeGreaterThan(0.05);
        }
    });
    it('e é sempre o MESMO canto — senão ele faz careta, não ironia', () => {
        const sinais = new Set(NOMES_DAS_BOCAS.map(n => Math.sign(cantos(n))));
        expect(sinais.size).toBe(1);
    });
    it('o torto é forte o bastante para se ver, e não tanto que vire careta', () => {
        expect(TORTO).toBeGreaterThan(0.08);
        expect(TORTO).toBeLessThan(0.30);
    });
});

// ── BOCA PARADA NÃO FICA PARADA ──────────────────────────────────────────────
// "a boca dele se mexe muito pouco" — a segunda causa, atrás do relógio da fala:
// fora do balão ela era um desenho congelado, e fora do balão é quase todo o
// tempo em que ele aparece.
describe('o respiro da boca parada', () => {
    it('a maior parte do tempo ele fica na cara dele', () => {
        let noRepouso = 0;
        const passos = Math.round(RESPIRO_S * BOCA_HZ) * 4;
        for (let q = 0; q < passos; q++) {
            if (bocaOciosa('sorrisoIronico', q / BOCA_HZ) === 'sorrisoIronico') noRepouso++;
        }
        expect(noRepouso / passos).toBeGreaterThan(0.6);
        expect(noRepouso).toBeLessThan(passos);      // mas NÃO fica parada
    });
    it('e o pulinho volta sempre para o sorriso torto', () => {
        const vistas = new Set<NomeDaBoca>();
        for (let q = 0; q < RESPIRO_S * BOCA_HZ * 3; q++) vistas.add(bocaOciosa('sorrisoIronico', q / BOCA_HZ));
        expect(vistas.has('sorrisoIronico')).toBe(true);
        expect(vistas.size).toBe(2);                 // o repouso e a vizinha dele
    });
    it('o respiro nunca contradiz a cena — pendurado no abismo ele não sorri', () => {
        const vistas = new Set<NomeDaBoca>();
        for (let q = 0; q < RESPIRO_S * BOCA_HZ * 3; q++) vistas.add(bocaOciosa('assustado', q / BOCA_HZ));
        for (const n of vistas) {
            expect(['assustado', 'surpreso']).toContain(n);
        }
    });
    it('toda boca da ficha tem vizinha, e a vizinha existe', () => {
        for (const n of NOMES_DAS_BOCAS) {
            const v = bocaOciosa(n as NomeDaBoca, RESPIRO_S - 0.01);
            expect(NOMES_DAS_BOCAS).toContain(v);
            expect(v).not.toBe(n);
        }
    });
    it('a fase desencontra dois personagens na mesma tela', () => {
        const a = bocaOciosa('sorrisoIronico', RESPIRO_S - 0.01, 0);
        const b = bocaOciosa('sorrisoIronico', RESPIRO_S - 0.01, 0.5);
        expect(a).not.toBe(b);
    });
    it('tempo inválido não trava a cara', () => {
        for (const t of [-1, NaN, Infinity]) {
            expect(NOMES_DAS_BOCAS).toContain(bocaOciosa('sorrisoIronico', t));
        }
    });
});

// ── NENHUMA FORMA DA FICHA FICA NA GAVETA ────────────────────────────────────
// O dono do jogo jogou e disse "tem poucas expressões". Estava certo: as
// dezoito estavam desenhadas e o jogo usava seis. Forma que nunca aparece é
// conteúdo morto — a mesma classe de defeito que `f3Coerencia` varre no andar.
describe('as dezoito formas são alcançáveis em jogo', () => {
    const MOMENTOS = ['apresentacao', 'desenhou', 'espetou', 'roubou', 'provoca',
        'caiu', 'suplica', 'ocioso', 'quaseLaEmCima', 'perdeuOPrimeiro',
        'perdeuOUltimo', 'tonto', 'pensando', 'confuso', 'vitorioso',
        'derrotado'] as const;

    it('toda forma da ficha tem pelo menos um momento que a produz', () => {
        const alcancadas = new Set<NomeDaBoca>();
        for (const m of MOMENTOS) {
            for (let r = 0; r <= 3; r++) alcancadas.add(expressaoDoDiabrete(m as MomentoExtra, r));
        }
        // as de fala vêm da partitura, não da expressão
        for (let q = 0; q < 8; q++) {
            alcancadas.add(bocaDaNota(0, false, q));
            alcancadas.add(bocaDaNota(0, true, q));
        }
        // e o RESPIRO alcança a vizinha de cada uma: é por aqui que `sorriso` e
        // `neutra` continuam aparecendo depois que os momentos mornos viraram
        // sorriso torto.
        for (const n of [...alcancadas]) alcancadas.add(bocaOciosa(n, RESPIRO_S - 0.01));

        const naGaveta = NOMES_DAS_BOCAS.filter(n => !alcancadas.has(n));
        expect(naGaveta).toEqual([]);
    });

    it('e cada momento devolve uma forma que existe de verdade', () => {
        for (const m of MOMENTOS) {
            for (let r = 0; r <= 3; r++) {
                expect(NOMES_DAS_BOCAS).toContain(expressaoDoDiabrete(m as MomentoExtra, r));
            }
        }
    });
});
