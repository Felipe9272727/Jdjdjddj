/**
 * A FOLHA DA BANCADA TEM QUE CONTINUAR DIZENDO A VERDADE.
 *
 * `bancada-navegador/o-rosto-inteiro.html` monta o rosto do Diabrete em duas
 * dimensões para eu ver boca, nariz, olho e sobrancelha JUNTOS numa foto só. Ela
 * COPIA as caixas do jogo em vez de importar `diabreteRig` — de propósito, porque
 * aquele módulo arrasta o three inteiro e a folha tem que abrir num piscar.
 *
 * O preço de copiar é envelhecer calado, e isso já aconteceu neste projeto: as
 * duas fichas antigas seguiram desenhando num canvas de 156 px depois que a
 * testa cresceu para 172, e eu passei a olhar uma régua que media outra coisa.
 * Uma régua desatualizada é pior do que régua nenhuma — ela dá confiança.
 *
 * Então este teste lê o HTML e confere número por número. Se alguém mexer na
 * cara do Diabrete e esquecer a folha, quebra aqui, não numa foto daqui a três
 * semanas.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CAIXAS_DO_ROSTO } from './diabreteRig';

const FOLHA = new URL('../bancada-navegador/o-rosto-inteiro.html', import.meta.url);
const texto = readFileSync(FOLHA, 'utf8');

/**
 * Lê `chave: { cy: … }` OU `chave = { cy: … }` de dentro do HTML — as caixas são
 * campos de um objeto e o nariz é uma constante solta.
 */
function caixaDaFolha(chave: string): Record<string, number> {
    const m = new RegExp(`${chave}\\s*[:=]\\s*\\{([^}]*)\\}`).exec(texto);
    if (!m) throw new Error(`a folha não tem mais a caixa "${chave}"`);
    const fora: Record<string, number> = {};
    for (const par of m[1].split(',')) {
        const [k, v] = par.split(':').map((s) => s.trim());
        if (k && v) fora[k] = Number(v);
    }
    return fora;
}

describe('o-rosto-inteiro.html copia as caixas do jogo', () => {
    it('a boca', () => {
        const f = caixaDaFolha('boca');
        expect(f.cy).toBe(CAIXAS_DO_ROSTO.boca.cy);
        expect(f.larg).toBe(CAIXAS_DO_ROSTO.boca.larg);
        expect(f.alt).toBe(CAIXAS_DO_ROSTO.boca.alt);
    });

    it('os olhos', () => {
        const f = caixaDaFolha('olhos');
        expect(f.cy).toBe(CAIXAS_DO_ROSTO.olhos.cy);
        expect(f.larg).toBe(CAIXAS_DO_ROSTO.olhos.larg);
        expect(f.alt).toBe(CAIXAS_DO_ROSTO.olhos.alt);
    });

    it('o nariz', () => {
        const f = caixaDaFolha('NARIZ');
        expect(f.cy).toBe(CAIXAS_DO_ROSTO.nariz.cy);
        expect(f.r).toBe(CAIXAS_DO_ROSTO.nariz.r);
    });
});

// ── E AS PEÇAS TÊM QUE CABER UMAS NAS OUTRAS ─────────────────────────────────
// Estas são as regras que a cara quebrou uma por uma, cada uma custando uma
// rodada de fotos. Elas não são estética; são as condições em que o desenho
// simplesmente SOME ou come outra peça.
describe('as peças do rosto cabem no rosto', () => {
    // Medido: o creme vai de Y 0,6482 (queixo) a 0,9234 (alto), e
    // régua = 3,633 * Y - 2,3549. Em cima do OLHO o cabelo desce até 0,946.
    const regua = (y: number) => 3.633 * y - 2.3549;

    it('o nariz fica entre os olhos e a boca, sem encostar em nenhum', () => {
        const { nariz, olhos, boca } = CAIXAS_DO_ROSTO;
        expect(nariz.cy).toBeLessThan(olhos.cy);
        expect(nariz.cy).toBeGreaterThan(boca.cy);
    });

    it('o nariz inteiro cai dentro do rosto', () => {
        const { nariz } = CAIXAS_DO_ROSTO;
        expect(regua(nariz.cy - nariz.r)).toBeGreaterThan(0);
        expect(regua(nariz.cy + nariz.r)).toBeLessThan(1);
    });

    it('a caixa da boca não volta a descer para o pescoço', () => {
        // O defeito original: com `cy` 0,685 o centro da boca caía na régua
        // 0,075, ou seja no PESCOÇO, e a boca desenhada se misturava com a
        // tinta do corpo. Nada de voltar para lá.
        expect(regua(CAIXAS_DO_ROSTO.boca.cy)).toBeGreaterThan(0.15);
    });

    it('sobra testa acima do olho para a sobrancelha', () => {
        // Acima do olho o creme acaba na régua 0,946; a sobrancelha mais alta
        // (`surpresa`) precisa de 0,165 de régua a partir do topo da órbita.
        const { olhos } = CAIXAS_DO_ROSTO;
        // A órbita ocupa 93,6 px de um canvas de 172, centrada em y 108,8.
        const topoDaOrbita = olhos.cy + olhos.alt * (172 / 2 - 108.8 + 93.6 / 2) / 172;
        expect(0.946 - regua(topoDaOrbita)).toBeGreaterThan(0.15);
    });
});
