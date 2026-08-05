import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { contagemPreguicosa, texturaPreguicosa } from '../texturaPreguicosa';

/** O ambiente dos testes é `node`: não há canvas de verdade, e não precisa. */
const canvasFalso = (marca: string) =>
    ({ width: 8, height: 8, marca } as unknown as HTMLCanvasElement);

describe('texturaPreguicosa — o desenho só acontece quando alguém olha', () => {
    it('NÃO desenha na criação', () => {
        // Este é o defeito inteiro. `export const carpetTex = colorTex(512,512,…)`
        // roda quando o MÓDULO é avaliado, e o bundle é um chunk só: todos os
        // módulos são avaliados na abertura. Eram 15,6 MB de buffer RGBA e mais
        // de cem mil operações de canvas antes do menu principal aparecer.
        let desenhou = 0;
        texturaPreguicosa(() => { desenhou++; return canvasFalso('a'); });
        expect(desenhou).toBe(0);
    });

    it('desenha na PRIMEIRA leitura dos pixels, e só uma vez', () => {
        // `texture.image` é `texture.source.data`, que é de onde o renderizador
        // lê na hora de subir para a GPU — ou seja, no primeiro quadro em que o
        // material aparece na tela.
        let desenhou = 0;
        const t = texturaPreguicosa(() => { desenhou++; return canvasFalso('b'); });
        expect(t.image).toMatchObject({ marca: 'b' });
        expect(t.image).toMatchObject({ marca: 'b' });
        expect(desenhou).toBe(1);
    });

    it('aplica os ajustes na criação, sem tocar em pixel', () => {
        // wrap/repeat/colorSpace precisam valer desde já: quem monta o material
        // lê essas propriedades muito antes de existir um quadro.
        let desenhou = 0;
        const t = texturaPreguicosa(
            () => { desenhou++; return canvasFalso('c'); },
            (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(4, 8);
                tex.anisotropy = 4;
            },
        );
        expect(t.colorSpace).toBe(THREE.SRGBColorSpace);
        expect(t.wrapS).toBe(THREE.RepeatWrapping);
        expect(t.repeat.x).toBe(4);
        expect(t.repeat.y).toBe(8);
        expect(t.anisotropy).toBe(4);
        expect(desenhou).toBe(0);
    });

    it('cada textura tem a SUA fonte — uma não materializa a outra', () => {
        // `new THREE.Texture(img)` cria um `Source` próprio. Se o getter fosse
        // parar num Source compartilhado, ler uma desenharia todas.
        let a = 0; let b = 0;
        const ta = texturaPreguicosa(() => { a++; return canvasFalso('a'); });
        const tb = texturaPreguicosa(() => { b++; return canvasFalso('b'); });
        // `Object.is` na mão, de propósito: `expect(x).not.toBe(y)` compara os
        // dois EM PROFUNDIDADE para decidir se sugere `toEqual`, e essa leitura
        // percorre `source.data` — ou seja, a própria asserção desenharia as
        // duas texturas e apagaria o que este teste quer medir.
        expect(Object.is(ta.source, tb.source)).toBe(false);
        void ta.image;
        expect(a).toBe(1);
        expect(b).toBe(0);
    });

    it('quem escreve em `image` manda, e o desenho nem roda', () => {
        // `texture.image = x` é API pública do three. Sobrescrever tem de vencer.
        let desenhou = 0;
        const t = texturaPreguicosa(() => { desenhou++; return canvasFalso('nunca'); });
        t.image = canvasFalso('meu');
        expect(t.image).toMatchObject({ marca: 'meu' });
        expect(desenhou).toBe(0);
    });

    it('conta criadas e materializadas, para o boot ser verificável', () => {
        const antes = { ...contagemPreguicosa };
        const t = texturaPreguicosa(() => canvasFalso('d'));
        expect(contagemPreguicosa.criadas).toBe(antes.criadas + 1);
        expect(contagemPreguicosa.materializadas).toBe(antes.materializadas);
        void t.image;
        expect(contagemPreguicosa.materializadas).toBe(antes.materializadas + 1);
    });
});
