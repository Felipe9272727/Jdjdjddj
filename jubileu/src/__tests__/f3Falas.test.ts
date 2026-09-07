import { describe, it, expect, beforeEach } from 'vitest';
import {
    dizer, escolherFala, falaViva, limparFalas, f3Fala, aoFalar,
    type EventoDoDiabrete,
} from '../f3Falas';

const EVENTOS: EventoDoDiabrete[] = ['desenhou', 'espetou', 'roubou', 'caiu', 'provoca'];

describe('f3Falas — a voz do Diabrete durante a escalada', () => {
    beforeEach(() => { limparFalas(); aoFalar(null); });

    it('todo evento do andar tem resposta dele', () => {
        for (const e of EVENTOS) {
            const f = escolherFala(e, { roubados: 1 });
            expect(f.texto.length, e).toBeGreaterThan(4);
            expect(f.dura, e).toBeGreaterThan(1);
        }
    });

    // NADA MATA UM PERSONAGEM MAIS RÁPIDO do que ouvir a mesma piada duas vezes
    // seguidas. O rodízio é cursor, não sorteio: dá para cobrar isso.
    it('nunca repete a mesma fala duas vezes seguidas', () => {
        for (const e of EVENTOS) {
            if (e === 'roubou') continue;              // esse escala, não roda
            let anterior = '';
            for (let i = 0; i < 12; i++) {
                const t = escolherFala(e).texto;
                expect(t, `${e} repetiu`).not.toBe(anterior);
                anterior = t;
            }
        }
    });

    it('e passa por todas antes de voltar ao começo', () => {
        limparFalas();
        const vistas = new Set<string>();
        for (let i = 0; i < 5; i++) vistas.add(escolherFala('provoca').texto);
        expect(vistas.size).toBe(5);
        expect(escolherFala('provoca').texto).toBe([...vistas][0]);   // fechou o giro
    });

    // ── O ARCO ───────────────────────────────────────────────────────────
    // A história do andar são três falas: dono do lugar → nervoso → desesperado.
    // Se a ordem embaralhar, o desmonte dele deixa de existir.
    it('o roubo ESCALA, e cada pincel tem a sua fala', () => {
        const um   = escolherFala('roubou', { roubados: 1 }).texto;
        const dois = escolherFala('roubou', { roubados: 2 }).texto;
        const tres = escolherFala('roubou', { roubados: 3 }).texto;
        expect(new Set([um, dois, tres]).size).toBe(3);
        // ele começa mandando e termina implorando
        expect(um).toMatch(/EI|MEU|ladrão/i);
        expect(tres).toMatch(/não sou NADA|não…/i);
        // a mesma contagem dá sempre a mesma fala (é arco, não rodízio)
        expect(escolherFala('roubou', { roubados: 2 }).texto).toBe(dois);
    });

    it('contagem fora da faixa não quebra nem sai indefinida', () => {
        for (const n of [-3, 0, 1, 3, 9, 99]) {
            expect(escolherFala('roubou', { roubados: n }).texto.length).toBeGreaterThan(4);
        }
        expect(escolherFala('roubou', {}).texto.length).toBeGreaterThan(4);
    });

    // ── O QUE ESTÁ NO AR ─────────────────────────────────────────────────
    it('a fala sobe, dura o tempo dela e sai do ar', () => {
        const f = dizer('provoca');
        const t0 = f3Fala.ate - f.dura * 1000;
        expect(falaViva(t0 + 100)).toBe(f.texto);
        expect(falaViva(t0 + f.dura * 1000 - 50)).toBe(f.texto);
        expect(falaViva(t0 + f.dura * 1000 + 50)).toBe('');
    });

    // Reação atrasada não é personagem, é legenda: a fala nova atropela.
    it('fala nova atropela a que estava no ar', () => {
        const a = dizer('provoca');
        const b = dizer('espetou');
        expect(f3Fala.texto).toBe(b.texto);
        expect(f3Fala.texto).not.toBe(a.texto);
        expect(f3Fala.serie).toBe(2);
    });

    it('avisa o HUD uma vez por fala, e a série sobe junto', () => {
        let avisos = 0;
        aoFalar(() => { avisos += 1; });
        dizer('desenhou'); dizer('caiu'); dizer('provoca');
        expect(avisos).toBe(3);
        expect(f3Fala.serie).toBe(3);
    });

    it('limparFalas devolve tudo ao começo — inclusive o rodízio', () => {
        const primeira = escolherFala('provoca').texto;
        escolherFala('provoca'); escolherFala('provoca');
        dizer('espetou');
        limparFalas();
        expect(f3Fala.texto).toBe('');
        expect(f3Fala.serie).toBe(0);
        expect(falaViva()).toBe('');
        expect(escolherFala('provoca').texto).toBe(primeira);
    });
});

// ── DEPOIS QUE O ANDAR COMEÇA A FALTAR ───────────────────────────────────────
// O Andar 3 se desfaz conforme ele perde os pincéis (f3Desenho): as setas
// desbotam, depois somem, e o tabuado rareia. As falas não sabiam disso — ele
// continuava se gabando do traço enquanto o traço sumia do chão atrás dele. A
// mecânica dizia uma coisa e a boca dizia outra, e é a boca que se escuta.
describe('f3Falas — o tom muda quando a ferramenta some', () => {
    beforeEach(() => { limparFalas(); aoFalar(null); });

    it('com pincel roubado ele passa a falar do ESTRAGO', () => {
        for (const ev of ['provoca', 'desenhou'] as EventoDoDiabrete[]) {
            limparFalas();
            const inteiro = new Set<string>();
            for (let i = 0; i < 6; i++) inteiro.add(escolherFala(ev, { roubados: 0 }).texto);
            limparFalas();
            const estragado = new Set<string>();
            for (let i = 0; i < 6; i++) estragado.add(escolherFala(ev, { roubados: 1 }).texto);
            for (const t of estragado) expect(inteiro.has(t), `${ev}: "${t}" repetiu o repertório de antes`).toBe(false);
        }
    });

    it('e o que ele fala nomeia o que o jogador está vendo sumir', () => {
        limparFalas();
        const ditas: string[] = [];
        for (let i = 0; i < 4; i++) ditas.push(escolherFala('provoca', { roubados: 2 }).texto);
        const juntas = ditas.join(' | ');
        expect(juntas).toMatch(/escadaria|setas?|tabuado/i);
    });

    it('trocar de repertório no meio não faz ele repetir a fala anterior', () => {
        limparFalas();
        const antes = escolherFala('provoca', { roubados: 0 }).texto;
        const depois = escolherFala('provoca', { roubados: 1 }).texto;
        expect(depois).not.toBe(antes);
    });

    it('sem pincel roubado, nada muda — o repertório de sempre', () => {
        limparFalas();
        const a = escolherFala('desenhou', { roubados: 0 }).texto;
        limparFalas();
        const b = escolherFala('desenhou').texto;
        expect(a).toBe(b);
    });
});
