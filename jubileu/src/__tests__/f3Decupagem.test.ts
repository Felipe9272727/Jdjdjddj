import { describe, it, expect } from 'vitest';
import {
    LAJES_DA_CUTSCENE, caixaDaLaje, dentroDeAlgumaLaje,
    plano, planoDaSuplica, alturaDaCabeca, FUNDO_DA_BORDA, acimaDoConves, veOCorpoInteiro,
    planoDeApresentacao, planoDaApresentacao, alturaEnquadrada, ALTURA_DO_DIABRETE,
    DECUPAGEM_DA_APRESENTACAO, PALCO_DA_APRESENTACAO, foraDoPoco, type NomeDaApresentacao,
    DECUPAGEM_DA_SUPLICA, type Palco, type NomeDoPlano,
} from '../f3Decupagem';

// O palco real: o Diabrete cai numa laje qualquer da escadaria, então o teste
// varre várias alturas/posições em vez de confiar numa só.
const palcos: Palco[] = [
    { gx: 0,    gripY: 0,    edgeZ: 0.35,  hangY: -1.5 },
    { gx: 1.4,  gripY: 6.2,  edgeZ: 6.55,  hangY: 4.7 },
    { gx: -2.1, gripY: 18.9, edgeZ: 19.25, hangY: 17.4 },
];
const NOMES: NomeDoPlano[] = ['alto', 'raso', 'close', 'corpo'];

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

    // ── ALGUÉM TEM DE VER AS PERNINHAS ──────────────────────────────────
    // Toda a atuação da súplica acontece abaixo do tampo, e nenhum plano
    // mostrava. Não era descuido: quem está em cima do convés não vê o que
    // pendura sob a beirada. O plano `corpo` existe para isso e é o único que
    // precisa cumprir — os de rosto podem (e devem) ficar em cima.
    it('o plano `corpo` enxerga os pés dele; os de rosto não precisam', () => {
        for (const p of palcos) {
            for (let d = 0; d <= 1.0001; d += 0.25) {
                expect(veOCorpoInteiro(p, plano('corpo', p, d)),
                    `corpo d=${d.toFixed(2)} não vê os pés`).toBe(true);
            }
            // E a guarda não é vazia: o plano de cima, que é um plano de ROSTO,
            // é exatamente quem a laje tapa.
            expect(veOCorpoInteiro(p, plano('alto', p, 0))).toBe(false);
        }
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
            corpo:  [3.5, 8.0],
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


// ═══════════════════════════════════════════════════════════════════════════
describe('f3Decupagem — a apresentação do Diabrete', () => {
    const NOMES_AP: NomeDaApresentacao[] = ['apresenta', 'medio', 'perto', 'escadaria', 'pincel'];

    it('toda fala do roteiro tem plano', () => {
        expect(DECUPAGEM_DA_APRESENTACAO).toHaveLength(9);   // DIABRETE_SCRIPT
        for (const n of DECUPAGEM_DA_APRESENTACAO) expect(NOMES_AP).toContain(n);
    });

    // ── O CORPO TEM DE CABER ────────────────────────────────────────────
    // Foi ESTE o defeito que a bancada achou: um close fixo na cara dele
    // segurando as nove falas, com o corpo inteiro fora do quadro. Ele aponta,
    // se inclina, abre os braços, gargalha — e nada disso aparecia. Em
    // rubber-hose a atuação está no corpo, então plano de corpo é o normal e
    // close é tempero.
    it('os planos de corpo abraçam o Diabrete inteiro, com folga para o gesto', () => {
        for (const nome of ['apresenta', 'medio', 'escadaria'] as NomeDaApresentacao[]) {
            for (let d = 0; d <= 1.0001; d += 0.25) {
                const alt = alturaEnquadrada(planoDeApresentacao(nome, PALCO_DA_APRESENTACAO, d));
                expect(alt, `${nome} d=${d.toFixed(2)} corta o corpo`)
                    .toBeGreaterThan(ALTURA_DO_DIABRETE * 1.25);
            }
        }
    });

    it('e os closes são mesmo closes — senão não haveria variação nenhuma', () => {
        for (const nome of ['perto', 'pincel'] as NomeDaApresentacao[]) {
            const alt = alturaEnquadrada(planoDeApresentacao(nome));
            expect(alt, nome).toBeLessThan(ALTURA_DO_DIABRETE * 1.25);
        }
    });

    it('a maioria das falas é de CORPO; close é tempero', () => {
        const deCorpo = DECUPAGEM_DA_APRESENTACAO
            .filter((n) => n === 'apresenta' || n === 'medio' || n === 'escadaria').length;
        expect(deCorpo).toBeGreaterThan(DECUPAGEM_DA_APRESENTACAO.length / 2);
    });

    // ── NINGUÉM FILMA DE DENTRO DA PAREDE ───────────────────────────────
    // O jogador chega parado no vão da porta, com a cabine atrás e as paredes
    // dos dois lados. O plano da escadaria saía 3,9 m para o lado sem sair para
    // a frente, e entrava no poço: quatro quadros de marrom chapado no meio da
    // fala mais importante da cena — a que diz que a escadaria é dele.
    it('nenhum plano entra no poço do elevador', () => {
        for (const nome of NOMES_AP) {
            for (let d = 0; d <= 1.0001; d += 0.25) {
                expect(foraDoPoco(planoDeApresentacao(nome, PALCO_DA_APRESENTACAO, d)),
                    `${nome} d=${d.toFixed(2)}`).toBe(true);
            }
        }
    });

    it('foraDoPoco reprova o plano que realmente entrou na parede', () => {
        // as DUAS tentativas que a bancada mostrou entrando na parede
        const primeira = { x: PALCO_DA_APRESENTACAO.x + 3.9, y: 2.7,
                           z: PALCO_DA_APRESENTACAO.jogadorZ + 0.7,
                           lx: 1.6, ly: 1.0, lz: -8.3, fov: 50 };
        const segunda  = { x: PALCO_DA_APRESENTACAO.x + 3.4, y: 2.7,
                           z: PALCO_DA_APRESENTACAO.z - 2.6,
                           lx: 1.6, ly: 1.0, lz: -8.3, fov: 50 };
        expect(foraDoPoco(primeira)).toBe(false);
        expect(foraDoPoco(segunda)).toBe(false);
    });

    it('trocar de plano entre falas move a câmera de verdade', () => {
        let cortes = 0;
        for (let i = 1; i < DECUPAGEM_DA_APRESENTACAO.length; i++) {
            if (DECUPAGEM_DA_APRESENTACAO[i] === DECUPAGEM_DA_APRESENTACAO[i - 1]) continue;
            const a = planoDaApresentacao(i - 1, PALCO_DA_APRESENTACAO, 1);
            const b = planoDaApresentacao(i, PALCO_DA_APRESENTACAO, 0);
            expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), `corte ${i - 1}→${i}`)
                .toBeGreaterThan(0.8);
            cortes += 1;
        }
        expect(cortes).toBeGreaterThanOrEqual(5);   // é cena montada, não plano-sequência
    });

    it('todo plano olha para ele, e nenhum fica atrás dele', () => {
        for (const nome of NOMES_AP) {
            const c = planoDeApresentacao(nome);
            expect(Math.hypot(c.lx - PALCO_DA_APRESENTACAO.x, c.lz - PALCO_DA_APRESENTACAO.z), nome)
                .toBeLessThan(1.5);
            // ele encara o jogador (−Z); a câmera fica desse lado
            expect(c.z, `${nome} foi parar atrás dele`).toBeLessThan(PALCO_DA_APRESENTACAO.z);
        }
    });
});
