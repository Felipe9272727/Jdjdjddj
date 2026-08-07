import { describe, expect, it } from 'vitest';
import { mapaEmTexto } from '../npc/floor10Mapa';
import { perceiveFloor10 } from '../npc/floor10Perception';

const olhar = (npc: [number, number], yaw: number, jogador: [number, number] | null) =>
    perceiveFloor10({
        npcPosition: { x: npc[0], y: 0, z: npc[1] },
        npcYaw: yaw,
        playerPosition: jogador ? { x: jogador[0], y: 0, z: jogador[1] } : null,
    });

describe('os olhos escrevem o mapa — não duas distâncias', () => {
    // "o olho faz o mapa inteiro em texto... a vontade vai ficar jogando como
    //  se fosse um RPG de texto"
    it('tem as três seções que fazem dele um mapa', () => {
        const m = mapaEmTexto(olhar([0, 0], 0, [0, 5]), 0);
        expect(m).toContain('YOU ARE:');
        expect(m).toContain('AROUND YOU:');
        // Sem os verbos é uma foto, não uma jogada.
        expect(m).toContain('YOU CAN MOVE:');
    });

    it('as paredes entram, e só as duas mais próximas', () => {
        // Sem parede o modelo não sabe que "cinco passos à esquerda" bate no
        // concreto. Com as quatro, viram parede de texto e afogam o resto.
        const m = mapaEmTexto(olhar([18, 18], 0, null), 0);
        const linhasDeParede = m.split('\n').filter((l) => l.includes('wall'));
        expect(linhasDeParede).toHaveLength(2);
        // Encostado no canto nordeste: as próximas são a norte e a leste.
        expect(m).toContain('north wall');
        expect(m).toContain('east wall');
    });

    it('a parede muda de lado quando ELE vira', () => {
        // É o teste que prova que o mapa é do corpo, não do mapa-múndi.
        const olhandoNorte = mapaEmTexto(olhar([0, 0], 0, null), 0);
        const olhandoLeste = mapaEmTexto(olhar([0, 0], Math.PI / 2, null), Math.PI / 2);
        const norteEm = (t: string) => t.split('\n').find((l) => l.includes('north wall')) ?? '';
        expect(norteEm(olhandoNorte)).toContain('ahead');
        expect(norteEm(olhandoLeste)).toContain('to your left');
    });

    it('diz quando o jogador não está à vista, sem escondê-lo', () => {
        // Some da VISÃO, não do mapa: ele lembra que há alguém no andar. Apagar
        // a linha faria o Nilo agir como se estivesse sozinho toda vez que o
        // jogador virasse uma esquina.
        const m = mapaEmTexto(olhar([0, 0], 0, [0, -12]), 0);
        expect(m).toContain('the player');
        expect(m).toContain('cannot see him');
    });

    it('sem jogador nenhum, diz isso em vez de omitir', () => {
        expect(mapaEmTexto(olhar([0, 0], 0, null), 0)).toContain('nowhere in sight');
    });

    it('é todo em inglês, como o resto do prompt', () => {
        // `locationDescription` é em PORTUGUÊS (alimenta o painel do ?mente) e
        // eu quase o usei aqui. Idioma misturado no mesmo prompt é ruído para
        // um modelo de 1,2B.
        const m = mapaEmTexto(olhar([0, 0], 0, [3, 3]), 0);
        expect(m).not.toMatch(/sala|região|elevador|parede|você/i);
    });

    it('não inventa nada que os sensores não sabem', () => {
        // A regra que separa percepção de cânone: o mapa descreve geometria e
        // presença. Significado ("uma porta trancada com um segredo atrás") é
        // de outro módulo — é assim que um NPC começa a saber o que ninguém
        // lhe contou.
        const m = mapaEmTexto(olhar([0, 0], 0, [3, 3]), 0);
        const permitido = /player|elevator door|wall|YOU ARE|AROUND YOU|YOU CAN MOVE/;
        for (const linha of m.split('\n')) expect(linha).toMatch(permitido);
    });
});
