import { describe, expect, it } from 'vitest';
import {
    classificarOrigem,
    decidir,
    type BuildStamp,
} from '../origemEstavel';

const FIXO = 'jdjdjddj-five.vercel.app';
const build = (id: string): BuildStamp => ({
    build: id, commit: 'c0ffee1', ref: 'main', built: '2026-07-31T12:00:00.000Z',
});

describe('origemEstavel — o commit novo virava site novo', () => {
    it('reconhece o endereço fixo como estável', () => {
        expect(classificarOrigem(`https://${FIXO}/`, FIXO).tipo).toBe('estavel');
        expect(classificarOrigem(`https://${FIXO}/?mente`, FIXO).tipo).toBe('estavel');
    });

    it('marca a URL de UM deploy como descartável — é o caso do jogo', () => {
        const origem = classificarOrigem(
            'https://jdjdjddj-a1b2c3d4e-felipe9272727s-projects.vercel.app/',
            FIXO,
        );
        expect(origem.tipo).toBe('descartavel');
        if (origem.tipo !== 'descartavel') return;
        expect(origem.destino).toBe(`https://${FIXO}/`);
    });

    it('o alias de branch também é outra origem, e portanto outro cofre', () => {
        const origem = classificarOrigem(
            'https://jdjdjddj-git-claude-floor-7-felipe.vercel.app/',
            FIXO,
        );
        expect(origem.tipo).toBe('descartavel');
    });

    it('leva junto caminho, query e hash — o ?bancada não pode se perder no salto', () => {
        const origem = classificarOrigem(
            'https://jdjdjddj-a1b2c3d4e-escopo.vercel.app/index.html?bancada=1#nilo',
            FIXO,
        );
        if (origem.tipo !== 'descartavel') throw new Error('deveria ser descartável');
        expect(origem.destino).toBe(`https://${FIXO}/index.html?bancada=1#nilo`);
    });

    it('não mexe em localhost, domínio próprio nem file:// — lá não existe o problema', () => {
        expect(classificarOrigem('http://localhost:3000/', FIXO).tipo).toBe('estavel');
        expect(classificarOrigem('https://thenormalelevator.com/', FIXO).tipo).toBe('estavel');
        expect(classificarOrigem('file:///storage/index.html', FIXO).tipo).toBe('estavel');
        expect(classificarOrigem('lixo', FIXO).tipo).toBe('estavel');
    });

    it('mesmo commit dos dois lados: salta sozinho, porque não custa nada', () => {
        const origem = classificarOrigem('https://jdjdjddj-abc-escopo.vercel.app/', FIXO);
        const veredito = decidir(origem, build('9f3c1a2'), build('9f3c1a2'));
        expect(veredito.acao).toBe('saltar');
        if (veredito.acao !== 'saltar') return;
        expect(veredito.destino).toBe(`https://${FIXO}/`);
    });

    it('commits diferentes: PERGUNTA — pode ser justamente o build novo que ele quer ver', () => {
        const origem = classificarOrigem('https://jdjdjddj-abc-escopo.vercel.app/', FIXO);
        const veredito = decidir(origem, build('9f3c1a2'), build('1264d59'));
        expect(veredito.acao).toBe('perguntar');
    });

    it('sem saber o que há no endereço fixo, nunca salta sozinho', () => {
        const origem = classificarOrigem('https://jdjdjddj-abc-escopo.vercel.app/', FIXO);
        expect(decidir(origem, build('9f3c1a2'), null).acao).toBe('perguntar');
        expect(decidir(origem, null, build('9f3c1a2')).acao).toBe('perguntar');
    });

    it('o commit NÃO decide: dois builds do mesmo commit podem ter conteúdo diferente', () => {
        const origem = classificarOrigem('https://jdjdjddj-abc-escopo.vercel.app/', FIXO);
        const aqui: BuildStamp = { build: 'aaaaaaaaaaaa', commit: 'c0ffee1', ref: 'main', built: '' };
        const la: BuildStamp = { build: 'bbbbbbbbbbbb', commit: 'c0ffee1', ref: 'main', built: '' };
        expect(decidir(origem, aqui, la).acao).toBe('perguntar');
    });

    it('deploy antigo, sem hash de conteúdo, ainda vale pelo commit', () => {
        const origem = classificarOrigem('https://jdjdjddj-abc-escopo.vercel.app/', FIXO);
        const antigo: BuildStamp = { build: '', commit: '1264d59f', ref: 'main', built: '' };
        expect(decidir(origem, antigo, { ...antigo }).acao).toBe('saltar');
    });

    it('na origem estável não há nada a decidir', () => {
        expect(decidir({ tipo: 'estavel' }, build('a'), build('b')).acao).toBe('nada');
    });
});
