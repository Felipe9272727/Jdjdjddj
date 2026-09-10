/**
 * f12Simulacao.ts — UM BOT QUE JOGA O ANDAR 12 INTEIRO, sem navegador.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * Eu entreguei este andar dizendo "não consegui verificar a dificuldade" e o
 * dono do jogo respondeu que estava ruim — controles, tiro e dificuldade. Ele
 * estava certo, e o motivo é que eu tinha verificado a coisa errada: os testes
 * provavam que cada PADRÃO era correto isoladamente, e as fotos provavam que a
 * tela desenhava. Nenhum dos dois diz se a luta é jogável.
 *
 * Dificuldade não é opinião: é quantas vidas se perde, em quanto tempo, contra
 * uma política de jogo conhecida. Este módulo roda a luta inteira em memória —
 * o mesmo relógio da boca, os mesmos ataques, a mesma colisão, a mesma nave —
 * com um piloto simples no comando, e devolve os números.
 *
 * O BOT NÃO É BOM DE PROPÓSITO. Ele só sabe três coisas: fugir do que está
 * perto, procurar a fresta quando há uma, e voltar para debaixo da boca para
 * atirar. Se um jogador humano razoável tem de ser MELHOR que isto para
 * sobreviver, o andar está difícil demais. Se este bot passa raspando, está no
 * ponto.
 *
 * Puro: sem three, sem react, sem DOM.
 */
import {
    ARENA, meioY, BOCA_ALVO, CICLO_DA_BOCA, bocaNoInstante, vulneravel,
    VIDA_MAXIMA, ataqueDaVez, LIMIAR_DA_VIRADA,
    nascerLeque, nascerTeleguiado, nascerNaves, nascerMare, nascerElevadores,
    nascerTiro, TIRO, NAVE, MARE, frestaDaMare,
    novaNave, passoDaNave, arrastarNave, tomarToque, tentarAtirar,
    passoDoProjetil, saiuDeCena, encostou, tiroNaBoca,
    type Nave, type Projetil, type NomeDoAtaque,
} from './f12Boss';

export interface Resultado {
    /** O jogador venceu antes de perder todas as vidas? */
    venceu: boolean;
    /** Segundos que a luta durou. */
    duracao: number;
    /** Vidas que sobraram (0 = derrota). */
    vidas: number;
    /** Quantos toques ele levou no total. */
    toques: number;
    /** Vida que sobrou na cabeça (0 = morta). */
    vidaDaCabeca: number;
    /** Quantas vezes a boca abriu. */
    aberturas: number;
    /** Fração do tempo de boca aberta em que ele estava alinhado com ela. */
    pontaria: number;
}

export interface Politica {
    /** 0 = não desvia de nada; 1 = desvia sempre que dá. Mede a mão do jogador. */
    reflexo: number;
    /** Vidas iniciais. */
    vidas: number;
    /** Teto de segundos, para a simulação não rodar para sempre. */
    limite: number;
}

const PADRAO: Politica = { reflexo: 1, vidas: 5, limite: 240 };

/** O ataque que está no ar agora, se houver um só tipo dominante. */
function tipoDominante(ps: Projetil[]): NomeDoAtaque | null {
    for (const p of ps) if (p.tipo !== 'tiro') return p.tipo;
    return null;
}

/**
 * PARA ONDE O BOT QUER IR.
 *
 * A ordem das regras é a ordem de urgência de um jogador de verdade: primeiro
 * não morrer, depois pontuar. Um bot que atirasse primeiro mediria a paciência
 * do jogo, não a dificuldade dele.
 */
function decidir(n: Nave, ps: Projetil[], reflexo: number): { x: number; y: number } {
    // 1. A MARÉ manda em tudo: é uma parede, e só há um lugar seguro.
    //    E ela obedece ao `reflexo` como todo o resto: a primeira versão deste
    //    bot procurava a fresta MESMO com reflexo 0, então o "jogador que não
    //    desvia" desviava do ataque mais letal do jogo. A linha de base estava
    //    mentindo, e uma linha de base que mente afina o jogo para o lado errado.
    if (reflexo > 0.15) {
        for (const p of ps) {
            if (p.tipo !== 'mare') continue;
            const chegando = p.z > ARENA.zNave - 16 && p.z < ARENA.zNave + 2;
            if (chegando) return { x: frestaDaMare(p), y: n.y };
        }
    }

    // 2. Fugir do que está perto e vindo. A ameaça é ponderada pelo quão perto
    //    está de chegar — o que está a quinze metros não muda uma decisão.
    let fugaX = 0, fugaY = 0, ameaca = 0;
    for (const p of ps) {
        if (p.tipo === 'tiro') continue;
        const dz = p.z - ARENA.zNave;
        if (dz < -14 || dz > 3) continue;
        const dx = n.x - p.x, dy = n.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > 4.2 || d < 1e-4) continue;
        const peso = (1 - d / 4.2) * (1 - Math.min(1, Math.abs(dz) / 14));
        fugaX += (dx / d) * peso; fugaY += (dy / d) * peso;
        ameaca = Math.max(ameaca, peso);
    }
    if (ameaca > 0.05 && reflexo > 0.02) {
        const m = Math.hypot(fugaX, fugaY) || 1;
        const forca = 3.4 * reflexo;
        return {
            x: n.x + (fugaX / m) * forca,
            y: n.y + (fugaY / m) * forca,
        };
    }

    // 3. Nada ameaçando: volta para debaixo da boca, que é de onde se acerta.
    //
    // O Y NÃO SEGUE MAIS A BOCA. Ele era `BOCA_ALVO.y - 0.8`, o que fazia
    // sentido enquanto a bala voava reto e acertar queria dizer estar na altura
    // da boca. Com a boca a 24,2 e o teto do voo a 9,0, aquilo virava um
    // `min()` que grudava o bot no TETO da arena — o canto onde as cabines de
    // elevador chegam — e ele passava a luta inteira lá em cima. Hoje a bala
    // sobe sozinha: o que a mira pede é o X, e o Y de descanso é o meio da
    // arena, que é de onde dá para desviar para os dois lados.
    return { x: BOCA_ALVO.x, y: meioY() };
}

/** Roda a luta inteira e devolve o placar. */
export function simular(politica: Partial<Politica> = {}): Resultado {
    const pol = { ...PADRAO, ...politica };
    const dt = 1 / 60;

    const n = novaNave(0, meioY(), pol.vidas);
    const irmao = novaNave(-3, meioY() + 1, 3);
    let projeteis: Projetil[] = [];
    let vida = VIDA_MAXIMA;
    let bocaT = 0, t = 0, toques = 0;
    let cuspiu = -1, aberturas = 0;
    let faixa = 0, faseMare = 0;
    let quadrosAberta = 0, quadrosMirando = 0;
    let ladoJ: -1 | 1 = 1, ladoI: -1 | 1 = 1;

    while (t < pol.limite && vida > 0 && n.vidas > 0) {
        t += dt; bocaT += dt;
        const b = bocaNoInstante(bocaT);
        const ciclo = Math.floor(bocaT / CICLO_DA_BOCA);
        const viradaJa = vida <= LIMIAR_DA_VIRADA;

        // a boca cospe uma vez por ciclo, no instante em que escancara
        if (b.estado === 'aberta' && cuspiu !== ciclo) {
            cuspiu = ciclo; aberturas++;
            const qual = ataqueDaVez(ciclo, viradaJa);
            if (qual === 'leque') projeteis.push(...nascerLeque(n.x * 0.4, n.y));
            else if (qual === 'teleguiado') projeteis.push(nascerTeleguiado());
            else if (qual === 'naves') projeteis.push(...nascerNaves());
            else if (qual === 'mare') { faseMare += 1.7; projeteis.push(nascerMare(faseMare)); }
            else { faixa = (faixa + 2) % 5; projeteis.push(...nascerElevadores(faixa)); }
        }

        // o piloto decide e a nave persegue
        const quer = decidir(n, projeteis, pol.reflexo);
        arrastarNave(n, quer.x - n.alvoX, quer.y - n.alvoY);
        passoDaNave(n, dt);

        // o irmão fica de ala, sem inteligência nenhuma. A formatura sai da
        // arena, como no jogo: um deslocamento fixo o grudaria na parede numa
        // tela estreita.
        arrastarNave(irmao, (n.x - ARENA.x * 0.5 - irmao.alvoX) * 0.4, (n.y + 1 - irmao.alvoY) * 0.4);
        passoDaNave(irmao, dt);

        // ── O TIRO PASSA PELA MESMA PORTA QUE O DO JOGO ──────────────────
        //
        // Estas duas linhas eram uma CÓPIA do ritmo da arma, escrita à mão aqui
        // dentro. Enquanto foi só `recarga = cadencia` ninguém notou; no dia em
        // que a arma virou rajada-com-pausa, a simulação continuaria medindo o
        // jato contínuo — ou seja, mediria um jogo que não existe mais, e diria
        // que a luta é mais curta do que é. Uma régua que mede outro programa é
        // pior do que régua nenhuma, porque dá confiança.
        //
        // E o irmão aqui atirava SEMPRE, enquanto no jogo ele só atira com a
        // boca aberta ou com camareiras no ar. A simulação creditava ao jogador
        // um dano de ala que o jogo não entrega.
        if (tentarAtirar(n)) { ladoJ = ladoJ === 1 ? -1 : 1; projeteis.push(nascerTiro(n.x, n.y, 'jogador', ladoJ)); }
        if ((vulneravel(b) || projeteis.some((p) => p.tipo === 'naves')) && tentarAtirar(irmao, true)) {
            ladoI = ladoI === 1 ? -1 : 1; projeteis.push(nascerTiro(irmao.x, irmao.y, 'irmao', ladoI));
        }

        for (const p of projeteis) passoDoProjetil(p, n.x, n.y, dt);

        if (vulneravel(b)) {
            quadrosAberta++;
            if (Math.hypot(n.x - BOCA_ALVO.x, n.y - BOCA_ALVO.y) < BOCA_ALVO.raio) quadrosMirando++;
        }

        const mortos = new Set<number>();
        for (const p of projeteis) {
            if (p.tipo === 'tiro') {
                for (const q of projeteis) {
                    if (q.tipo !== 'naves' || mortos.has(q.id)) continue;
                    if (Math.hypot(p.x - q.x, p.y - q.y) < q.r + p.r && Math.abs(p.z - q.z) < 1.2) {
                        q.hp = (q.hp ?? 1) - 1; mortos.add(p.id);
                        if ((q.hp ?? 0) <= 0) mortos.add(q.id);
                        break;
                    }
                }
                if (mortos.has(p.id)) continue;
                if (vulneravel(b) && tiroNaBoca(p)) {
                    mortos.add(p.id);
                    vida = Math.max(0, vida - (p.de === 'irmao' ? TIRO.danoIrmao : TIRO.dano));
                }
                continue;
            }
            if (encostou(p, n.x, n.y, NAVE.raio) && tomarToque(n)) {
                toques++;
                if (p.tipo !== 'mare') mortos.add(p.id);
            }
            if (encostou(p, irmao.x, irmao.y, NAVE.raio) && tomarToque(irmao)) {
                if (irmao.vidas <= 0) irmao.vidas = 2;
            }
        }
        projeteis = projeteis.filter((p) => !mortos.has(p.id) && !saiuDeCena(p));
    }

    return {
        venceu: vida <= 0 && n.vidas > 0,
        duracao: +t.toFixed(1),
        vidas: n.vidas,
        toques,
        vidaDaCabeca: +vida.toFixed(1),
        aberturas,
        pontaria: quadrosAberta ? +(quadrosMirando / quadrosAberta).toFixed(2) : 0,
    };
}
