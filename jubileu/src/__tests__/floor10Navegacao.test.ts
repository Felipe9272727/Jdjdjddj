import { describe, it, expect } from 'vitest';
import { PR, wallsForState } from '../constants';
import { resolveCollision } from '../physics';
import { stepFloor10Movement } from '../npc/floor10Will';
import { alcancaveis, construirGrade, limitesDaVista, paraMundo } from '../agente/agenteMapa';

// ── O NAVEGADOR DO NILO, COBRADO CONTRA A FÍSICA DO JOGO ──────────────────
//
// `stepFloor10Movement` é o único navegador do Nilo no jogo 3D. Ele conhece um
// obstáculo — a porta do prédio do elevador — por pontos de passagem cravados à
// mão. Nada disso era verificado; os números tinham sido escolhidos a olho, em
// momentos diferentes, e ninguém tinha medido se o corpo obedecia às paredes.
//
// Este arquivo mede. A régua não é minha: é `resolveCollision`, a mesma função
// que decide onde o JOGADOR pode estar. Se ela empurraria o corpo de um ponto,
// o Nilo não podia estar ali.

const paredes = wallsForState(10, false, true);

/** A física do jogo empurraria o corpo daqui? Então é dentro da parede. */
function dentroDaParede(x: number, z: number): boolean {
    const [nx, nz] = resolveCollision(x, z, PR, paredes);
    return Math.hypot(nx - x, nz - z) > 1e-3;
}

/**
 * O chão que o Nilo REALMENTE pisa: o que ele alcança a pé do berço dele.
 *
 * A primeira vez que eu medi isto, amostrei o retângulo inteiro do andar e
 * achei 32,4% de rotas atravessando parede — número que eu quase reportei. Era
 * meu erro: metade dos pontos ficava ATRÁS do prédio do elevador, onde o Nilo
 * nunca esteve nem pode estar. Restrito ao alcançável, o número real era 0,03%.
 * A amostra errada quase me fez trocar um navegador que funciona por um A*.
 */
function chaoDoNilo(): { x: number; z: number }[] {
    const berco = { x: 0, z: 2 };
    const grade = construirGrade(paredes, limitesDaVista(paredes, berco));
    const marca = alcancaveis(grade, berco);
    const pontos: { x: number; z: number }[] = [];
    for (let j = 0; j < grade.altura; j += 1) {
        for (let i = 0; i < grade.largura; i += 1) {
            if (!marca[j * grade.largura + i]) continue;
            const p = paraMundo(grade, i, j);
            // Amostra esparsa: o produto cartesiano precisa caber num teste, e
            // a geometria que importa é grossa — a única quina fina do andar é
            // o batente da porta, e ele fica no caminho de toda rota que cruza
            // a linha z = −10, que é a maioria dos pares desta amostra.
            if (Math.round(p.x * 2) % 12 !== 0 || Math.round(p.z * 2) % 12 !== 0) continue;
            if (!dentroDaParede(p.x, p.z)) pontos.push(p);
        }
    }
    return pontos;
}

/** Roda o navegador até ele parar de andar de verdade, ou até o teto. */
function caminhar(de: { x: number; z: number }, ate: { x: number; z: number }) {
    let p = { x: de.x, z: de.z };
    let parado = 0;
    let furou = false;
    for (let i = 0; i < 3000; i += 1) {
        const s = stepFloor10Movement(p, ate, 1.2, 1 / 60);
        const andou = Math.hypot(s.x - p.x, s.z - p.z);
        p = { x: s.x, z: s.z };
        if (dentroDaParede(p.x, p.z)) { furou = true; break; }
        // NÃO parar no primeiro `moving:false`: o jogo chama isto todo quadro,
        // e a troca de ponto de passagem acontece na chamada SEGUINTE. Foi
        // exatamente esse detalhe que escondeu o travamento por tanto tempo.
        parado = andou < 1e-6 ? parado + 1 : 0;
        if (parado > 120) break;
        if (Math.hypot(p.x - ate.x, p.z - ate.z) < 0.5) break;
    }
    return { fim: p, furou, faltou: Math.hypot(p.x - ate.x, p.z - ate.z) };
}

describe('o Nilo consegue entrar no elevador', () => {
    // ── O TRAVAMENTO PERMANENTE QUE ESTE TESTE PRENDE ─────────────────────
    //
    // Três constantes soltas que não conversavam: ponto de passagem em
    // z = −8,75, "já estou na soleira" em z ≤ −8,70, e "cheguei" a 0,08 m.
    // Vindo do norte ele parava em z ≈ −8,67 — perto demais do ponto para
    // andar, e ao norte demais do limiar para trocar de ponto. Travava ali
    // PARA SEMPRE, em (0,0089, −8,6747).
    //
    // Nas 103.362 rotas varridas, TODAS as 1.194 com alvo dentro do cab
    // morriam nesse ponto. A meta `inspect-elevator` era inalcançável.
    it('vindo do norte, ele atravessa a soleira em vez de congelar nela', () => {
        const r = caminhar({ x: 0.1, z: -7.9 }, { x: 0, z: -13 });
        expect(r.furou).toBe(false);
        expect(r.faltou, `parou a ${r.faltou.toFixed(2)}m em (${r.fim.x.toFixed(2)}, ${r.fim.z.toFixed(2)})`)
            .toBeLessThan(0.5);
        // O ponto exato onde ele congelava. Se alguém reintroduzir a faixa
        // morta, é aqui que o corpo vai parar.
        expect(r.fim.z).toBeLessThan(-8.7);
    });

    it('de vários pontos da sala, ele entra', () => {
        for (const de of [{ x: -6, z: 4 }, { x: 6, z: 4 }, { x: 0, z: 8 }, { x: -7, z: -6 }]) {
            const r = caminhar(de, { x: 0, z: -13 });
            expect(r.faltou, `de (${de.x},${de.z}) parou a ${r.faltou.toFixed(2)}m`).toBeLessThan(0.5);
        }
    });

    it('e consegue sair de volta para a sala', () => {
        const r = caminhar({ x: 0, z: -13 }, { x: 0, z: 4 });
        expect(r.furou).toBe(false);
        expect(r.faltou).toBeLessThan(0.5);
    });
});

describe('o corpo do Nilo obedece às paredes', () => {
    // ── POR QUE ISTO NÃO É "SÓ MAIS UM PONTO DE PASSAGEM" ─────────────────
    //
    // Antes do conserto, 36 rotas em 103.362 terminavam com o corpo DENTRO do
    // batente: ele saía do cab, os pontos de passagem soltavam, e ele cortava a
    // quina em diagonal. Acrescentar um quarto ponto cravado resolveria essas
    // 36 e não resolveria a 37ª — nem a geometria que o Andar 10 ganhar depois.
    //
    // O passo agora atravessa `resolveCollision`, a MESMA física do jogador.
    // Isso não é uma regra a mais: é a regra que já existia, aplicada também ao
    // Nilo. Custa uma chamada por quadro.
    // ── AS ROTAS QUE RASPAVAM, CRAVADAS UMA A UMA ────────────────────────
    //
    // Eu tinha só a varredura por grade aqui, e ela é DECORATIVA para este bug:
    // testei tirando o `resolveCollision` inteiro e os cinco testes continuaram
    // passando, porque a amostra grossa não contém nenhum dos pares que raspam.
    //
    // Estes seis vieram da medição real — sair de dentro do cab rumo a um alvo
    // bem lateral logo ao norte da parede. É a rota em que os pontos de
    // passagem soltam na soleira e o corpo corta a quina do batente, que fica
    // em (±1,3, −10) e exige o centro do corpo a |x| ≤ 0,8 na passagem.
    for (const [dx, dz, ax, az] of [
        [-1.9, -13.9, -19.9, -7.9], [-1.9, -13.9, -15.9, -7.9], [-1.9, -13.9, 16.1, -7.9],
        [0.1, -13.9, -19.9, -7.9], [0.1, -13.9, 18.1, -7.9], [0.1, -13.9, 20.1, -7.9],
    ]) {
        it(`saindo do cab para (${ax}, ${az}), não raspa o batente`, () => {
            const r = caminhar({ x: dx, z: dz }, { x: ax, z: az });
            expect(r.furou, `entrou na parede em (${r.fim.x.toFixed(2)}, ${r.fim.z.toFixed(2)})`)
                .toBe(false);
        });
    }

    it('nenhuma rota entre pontos alcançáveis põe o corpo dentro de uma parede', () => {
        const pontos = chaoDoNilo();
        expect(pontos.length).toBeGreaterThan(20);
        const furadas: string[] = [];
        for (const de of pontos) {
            for (const ate of pontos) {
                if (de === ate) continue;
                if (caminhar(de, ate).furou) {
                    furadas.push(`(${de.x.toFixed(1)},${de.z.toFixed(1)})→(${ate.x.toFixed(1)},${ate.z.toFixed(1)})`);
                }
            }
        }
        expect(furadas.length, `rotas que furaram: ${furadas.slice(0, 6).join(' ')}`).toBe(0);
    });

    it('encostado numa parede, ele para a animação de andar', () => {
        // `moving` passou a ser o deslocamento REAL, não o pretendido. Sem
        // isso, um Nilo bloqueado marcha no lugar — a cara de um NPC quebrado.
        const naParede = { x: 0, z: -9.9 };
        const s = stepFloor10Movement(naParede, { x: 20, z: -9.9 }, 1.2, 1 / 60);
        expect(Math.hypot(s.x - naParede.x, s.z - naParede.z) > 1e-6).toBe(s.moving);
    });
});
