import { describe, it, expect } from 'vitest';
import {
    LAJES_DA_CUTSCENE, caixaDaLaje, dentroDeAlgumaLaje,
    plano, planoDaSuplica, alturaDaCabeca, FUNDO_DA_BORDA, acimaDoConves,
    DECUPAGEM_DA_SUPLICA, type Palco, type NomeDoPlano,
} from '../f3Decupagem';

// O palco real: o Diabrete cai numa laje qualquer da escadaria, então o teste
// varre várias alturas/posições em vez de confiar numa só.
const palcos: Palco[] = [
    { gx: 0,    gripY: 0,    edgeZ: 0.35,  hangY: -1.5 },
    { gx: 1.4,  gripY: 6.2,  edgeZ: 6.55,  hangY: 4.7 },
    { gx: -2.1, gripY: 18.9, edgeZ: 19.25, hangY: 17.4 },
];
const NOMES: NomeDoPlano[] = ['alto', 'raso', 'close', 'perfil'];

describe('f3Decupagem — a decupagem da súplica', () => {
    it('toda fala tem um plano, e a lista cobre o diálogo inteiro', () => {
        expect(DECUPAGEM_DA_SUPLICA).toHaveLength(8);   // FALL_DIALOGUE em App.tsx
        for (const n of DECUPAGEM_DA_SUPLICA) expect(NOMES).toContain(n);
    });

    // ── O QUADRO PRETO ───────────────────────────────────────────────────
    // No meio da cutscene havia um quadro inteiramente preto: a câmera passava
    // POR DENTRO de uma laje. Isso não aparece em teste de tipo nem em foto
    // parada — só numa foto que calhe de cair naquele instante. Aqui é uma
    // invariante: nenhum plano, em nenhuma deriva, em nenhum palco.
    it('nenhum plano põe a câmera dentro de uma laje', () => {
        for (const p of palcos) {
            for (const nome of NOMES) {
                for (let d = 0; d <= 1.0001; d += 0.1) {
                    const c = plano(nome, p, d);
                    // As lajes vivem no espaço do palco (o grupo fica em
                    // gx/gripY/edgeZ−EDGE_Z), então a câmera vai para lá.
                    const lx = c.x - p.gx, ly = c.y - p.gripY, lz = c.z - (p.edgeZ - 0.35);
                    expect(dentroDeAlgumaLaje(lx, ly, lz),
                        `${nome} deriva=${d.toFixed(1)} palco=${p.gripY}`).toBe(false);
                }
            }
        }
    });

    // ── DE ONDE DÁ PARA FILMAR ─────────────────────────────────────────
    // Três dos catorze quadros da bancada saíram PRETOS. Não era câmera dentro
    // de laje (o teste acima já cobria isso): era a cabeça de tinta do Diabrete
    // caindo em cima da BORDA DE TINTA da laje, um paredão preto de 70 cm que
    // fica exatamente na altura dele. De qualquer ângulo horizontal o resultado
    // é preto sobre preto.
    //
    // A regra que separa os dois é uma só: filmar DE CIMA. Aí o que fica atrás
    // da cabeça dele é o vazio, que é creme. É também o que a cena quer dizer.
    it('todo plano olha de CIMA para baixo — o único ângulo que separa tinta de tinta', () => {
        for (const p of palcos) {
            const cabeca = alturaDaCabeca(p);
            for (const nome of NOMES) {
                for (let d = 0; d <= 1.0001; d += 0.25) {
                    const c = plano(nome, p, d);
                    // acima do fundo da borda de tinta: nunca por baixo da laje
                    expect(c.y, `${nome} d=${d}`).toBeGreaterThan(p.gripY - FUNDO_DA_BORDA);
                    // e acima da cabeça dele, com folga: o olhar desce
                    expect(c.y, `${nome} d=${d} não olha para baixo`).toBeGreaterThan(cabeca + 0.4);
                    // o alvo tem de estar ABAIXO da câmera, senão não é plongée
                    expect(c.ly, `${nome} alvo acima da câmera`).toBeLessThan(c.y - 0.5);
                }
            }
        }
    });

    // ── A BARRIGA DA LAJE ───────────────────────────────────────────────
    // O primeiro teste daqui traçava um raio da câmera pela cabeça dele e
    // cobrava que não batesse na laje. A premissa era falsa: eu tinha a cabeça
    // 40 cm baixa demais, chutada de uma foto, e a sonda mediu `gripY + 0.04`.
    //
    // O que realmente escurece o quadro é a BARRIGA: 5 m de tampo com um bloco
    // de tinta embaixo, virando céu para qualquer câmera abaixo do convés. É
    // isso que se cobra agora — e é a mesma coisa que a cena quer dizer.
    it('nenhum plano desce abaixo do convés — a barriga da laje não vira céu', () => {
        for (const p of palcos) {
            for (const nome of NOMES) {
                for (let d = 0; d <= 1.0001; d += 0.25) {
                    expect(acimaDoConves(p, plano(nome, p, d)),
                        `${nome} d=${d.toFixed(2)}`).toBe(true);
                }
            }
        }
    });

    // Não é vazia: o contra-plongée que a cutscene REALMENTE tinha na pegada do
    // intro (`cam.y = HANG_Y + 0.2`, olhando para cima) é justamente o que
    // devolvia tela preta, e ele é reprovado.
    it('acimaDoConves reprova o contra-plongée que saía preto', () => {
        const p = palcos[0];
        const oContraPlongee = {
            x: p.gx - 2.0, y: p.hangY + 0.2, z: p.edgeZ + 3.2,
            lx: p.gx, ly: p.gripY + 0.3, lz: p.edgeZ, fov: 50,
        };
        expect(acimaDoConves(p, oContraPlongee)).toBe(false);
    });

    // ── ENQUADRAR QUEM ESTÁ ATUANDO ──────────────────────────────────────
    // Um plano que não olha para ele é um plano do cenário. O alvo tem de ficar
    // perto da cabeça, e a câmera a uma distância que caiba na história: um
    // primeiro plano é primeiro plano, um plano aberto é aberto.
    it('todo plano olha para ele, e a distância combina com o nome', () => {
        const faixa: Record<NomeDoPlano, [number, number]> = {
            alto:   [2.0, 5.0],
            raso:   [5.5, 9.0],
            close:  [1.2, 2.6],
            perfil: [6.0, 10.0],
        };
        for (const p of palcos) {
            const cabeca = alturaDaCabeca(p);
            for (const nome of NOMES) {
                const c = plano(nome, p, 0);
                // o alvo fica no corpo dele, não no horizonte
                expect(Math.hypot(c.lx - p.gx, c.lz - p.edgeZ), nome).toBeLessThan(1.0);
                expect(c.ly, nome).toBeGreaterThan(p.hangY - 1.6);
                expect(c.ly, nome).toBeLessThan(p.gripY + 0.6);
                const dist = Math.hypot(c.x - p.gx, c.y - cabeca, c.z - p.edgeZ);
                const [min, max] = faixa[nome];
                expect(dist, `${nome} dist=${dist.toFixed(2)}`).toBeGreaterThanOrEqual(min);
                expect(dist, `${nome} dist=${dist.toFixed(2)}`).toBeLessThanOrEqual(max);
            }
        }
    });

    // ── O CORTE TEM DE SER UM CORTE ──────────────────────────────────────
    // O defeito original era a câmera andar 11 cm em 24 segundos. Quando a
    // decupagem troca de plano entre duas falas, a câmera tem de SALTAR — um
    // corte de desenho animado, não uma panorâmica.
    it('trocar de plano entre falas move a câmera de verdade', () => {
        const p = palcos[0];
        let cortes = 0;
        for (let i = 1; i < DECUPAGEM_DA_SUPLICA.length; i++) {
            const a = planoDaSuplica(i - 1, p, 1);   // fim da fala anterior
            const b = planoDaSuplica(i, p, 0);       // início da próxima
            const salto = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
            if (DECUPAGEM_DA_SUPLICA[i] !== DECUPAGEM_DA_SUPLICA[i - 1]) {
                expect(salto, `corte ${i - 1}→${i}`).toBeGreaterThan(1.5);
                cortes += 1;
            }
        }
        expect(cortes).toBeGreaterThanOrEqual(5);   // é uma cena montada, não um plano-sequência
    });

    it('a deriva mexe, mas não vira outro plano', () => {
        const p = palcos[0];
        for (const nome of NOMES) {
            const a = plano(nome, p, 0), b = plano(nome, p, 1);
            const anda = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
            expect(anda, `${nome} parado demais`).toBeGreaterThan(0.05);
            expect(anda, `${nome} deriva virou corte`).toBeLessThan(1.2);
        }
    });

    // A GUARDA NÃO PODE SER VAZIA. Se `dentroDeAlgumaLaje` respondesse "não"
    // para tudo, o teste do quadro preto passaria sozinho e não protegeria nada.
    it('dentroDeAlgumaLaje realmente acusa quem está dentro', () => {
        for (const laje of LAJES_DA_CUTSCENE) {
            const c = caixaDaLaje(laje);
            const meio = [(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, (c.z0 + c.z1) / 2] as const;
            expect(dentroDeAlgumaLaje(meio[0], meio[1], meio[2]), `laje ${laje.id}`).toBe(true);
        }
        expect(dentroDeAlgumaLaje(0, 400, 0)).toBe(false);       // lá no céu
        expect(dentroDeAlgumaLaje(0, -400, 0)).toBe(false);      // lá no abismo
    });

    it('a caixa da laje inclui a borda de tinta, que é mais larga que o tampo', () => {
        const laje = LAJES_DA_CUTSCENE[0];
        const c = caixaDaLaje(laje);
        expect(c.x1 - c.x0).toBeGreaterThan(laje.hw * 2);
        expect(c.y1).toBe(laje.topY);
        expect(c.y0).toBeLessThan(laje.topY - laje.h);   // o bloco de tinta desce mais
    });
});
