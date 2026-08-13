import { describe, it } from 'vitest';
import { PR, wallsForState } from '../constants';
import { resolveCollision } from '../physics';
import { stepFloor10Movement } from '../npc/floor10Will';
import {
    alcancaveis, construirGrade, limitesDaVista, paraMundo,
} from '../agente/agenteMapa';

// ── A VARREDURA FINA, QUE PRODUZIU OS NÚMEROS DO NAVEGADOR ────────────────
//
// Eu citei em comentário e em mensagem de commit: "103.362 rotas varridas",
// "1.194 com alvo dentro do cab morriam no mesmo ponto", "36 raspavam o
// batente". Um revisor tentou reproduzir e NÃO CONSEGUIU — a sonda que gerou
// esses números era temporária e eu a apaguei.
//
// Número que ninguém pode refazer é número em que ninguém precisa acreditar.
//
// O teste permanente (`floor10Navegacao.test.ts`) usa amostra grossa de
// propósito, para caber na suíte de 1100 testes. Esta é a fina, e leva ~1 min:
//
//     VARREDURA=1 npx vitest run src/__tests__/floor10Varredura.test.ts
//
// A amostra é o chão que o Nilo REALMENTE alcança a pé do berço dele, a cada
// 2 m — 322 pontos, e 322 × 321 = 103.362 pares ordenados. É de onde o número
// saiu.
const LIGADA = !!process.env.VARREDURA;

describe.skipIf(!LIGADA)('varredura fina do navegador do Nilo', () => {
    it('mede rotas que furam parede e rotas que não chegam', () => {
        const saida: string[] = [];
        const linha = (t: string) => { saida.push(t); };
        const paredes = wallsForState(10, false, true);

        const dentroDaParede = (x, z) => {
            const [nx, nz] = resolveCollision(x, z, PR, paredes);
            return Math.hypot(nx - x, nz - z) > 1e-3;
        };

        const berco = { x: 0, z: 2 };
        const grade = construirGrade(paredes, limitesDaVista(paredes, berco));
        const marca = alcancaveis(grade, berco);
        const pontos = [];
        for (let j = 0; j < grade.altura; j += 1) {
            for (let i = 0; i < grade.largura; i += 1) {
                if (!marca[j * grade.largura + i]) continue;
                const p = paraMundo(grade, i, j);
                // Amostra de 2 em 2 metros. A grade tem célula de 0,5 m, então isto
                // pega uma célula a cada quatro em cada eixo.
                if (Math.round(p.x * 2) % 4 !== 0 || Math.round(p.z * 2) % 4 !== 0) continue;
                if (!dentroDaParede(p.x, p.z)) pontos.push(p);
            }
        }

        let pares = 0;
        let furou = 0;
        let naoChegou = 0;
        let naoChegouComAlvoNoCab = 0;
        const exemplos = [];

        for (const de of pontos) {
            for (const ate of pontos) {
                if (de === ate) continue;
                pares += 1;
                let p = { x: de.x, z: de.z };
                let parado = 0;
                let entrou = false;
                let chegou = false;
                for (let i = 0; i < 4000; i += 1) {
                    const s = stepFloor10Movement(p, ate, 1.2, 1 / 60);
                    const andou = Math.hypot(s.x - p.x, s.z - p.z);
                    p = { x: s.x, z: s.z };
                    if (dentroDaParede(p.x, p.z)) { entrou = true; break; }
                    // NÃO parar no primeiro `moving:false`: o jogo chama isto todo
                    // quadro e a troca de ponto de passagem acontece na chamada
                    // SEGUINTE. Foi este detalhe que escondeu o travamento.
                    parado = andou < 1e-6 ? parado + 1 : 0;
                    if (parado > 200) break;
                    if (Math.hypot(p.x - ate.x, p.z - ate.z) < 0.5) { chegou = true; break; }
                }
                if (entrou) {
                    furou += 1;
                    if (exemplos.length < 8) {
                        exemplos.push(
                            `(${de.x.toFixed(1)},${de.z.toFixed(1)}) → (${ate.x.toFixed(1)},${ate.z.toFixed(1)})`
                            + ` entrou na parede em (${p.x.toFixed(2)},${p.z.toFixed(2)})`,
                        );
                    }
                } else if (!chegou) {
                    naoChegou += 1;
                    if (ate.z < -10) naoChegouComAlvoNoCab += 1;
                }
            }
        }

        linha(`pontos alcançáveis a pé, amostrados de 2 em 2 m: ${pontos.length}`);
        linha(`pares ordenados testados: ${pares}`);
        linha(`corpo entrou na parede: ${furou} (${(100 * furou / pares).toFixed(3)}%)`);
        linha(`não chegou: ${naoChegou} — destes, com alvo DENTRO do cab: ${naoChegouComAlvoNoCab}`);
        for (const e of exemplos) linha(`  ${e}`);
        linha(
            '\nAntes dos consertos de bb1fb18a, esta mesma varredura dava:\n'
            + '  entrou na parede ... 36\n'
            + '  não chegou ......... 1393, dos quais 1194 com alvo dentro do cab\n'
            + '                       (todos travados em (0,0089, −8,6747), a faixa morta da soleira)',
        );

        for (const t of saida) process.stdout.write(`${t}\n`);
    }, 600000);
});
