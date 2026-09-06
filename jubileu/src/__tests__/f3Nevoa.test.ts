// ── A NÉVOA E O SHADER QUE NÃO A ENXERGAVA ───────────────────────────────────
//
// Dois defeitos que se somavam no horizonte do Andar 3:
//
//  1. A faixa da névoa era 60 → 240, fixa, contra um `far` de câmera de 40, 80
//     ou 120. Na qualidade baixa a névoa NEM COMEÇAVA antes do corte.
//  2. `cartoonToon.ts` é ShaderMaterial cru e não incluía os chunks `fog_*`, de
//     modo que `scene.fog` pintava os espinhos (MeshToonMaterial) e o casco das
//     nuvens (MeshBasicMaterial) e NÃO pintava as plataformas nem o miolo
//     branco das nuvens — a mesma cena com dois horizontes.
//
// Este arquivo mede os dois: a conta contra os `far` que o menu realmente
// oferece, e o GLSL resolvido como o próprio three o resolve antes de compilar.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { faixaDaNevoa, NEVOA_INICIO, NEVOA_FIM } from '../f3Nevoa';
import { createToonMaterial } from '../cartoonToon';
import { QUALITY_PROFILES } from '../Settings';

describe('a névoa fecha antes do plano de corte, em toda qualidade', () => {
    const fars = Object.values(QUALITY_PROFILES).map((p) => p.far);

    it('o menu oferece mais de um `far` — a conta não é para um caso só', () => {
        expect(new Set(fars).size).toBeGreaterThan(1);
        expect(Math.min(...fars)).toBeLessThan(60);   // a qualidade baixa que quebrava
    });

    it('começa depois do jogador e fecha antes do corte', () => {
        for (const far of fars) {
            const f = faixaDaNevoa(far);
            expect(f.near, `far=${far}`).toBeGreaterThan(0);
            expect(f.near, `far=${far}`).toBeLessThan(f.far);
            expect(f.far, `far=${far}`).toBeLessThan(far);
            // ...e fecha PERTO do corte: no máximo 5% do alcance sobrando, se
            // não a geometria ainda pisca para fora em vez de se apagar.
            expect((far - f.far) / far, `far=${far}`).toBeLessThan(0.05);
        }
    });

    it('a faixa antiga (60 → 240) reprovaria em toda qualidade', () => {
        // A guarda contra voltar a cravar números: com 60 → 240, na qualidade
        // baixa (far 40) a névoa começa DEPOIS do corte, e na alta (120) mal
        // passa de um terço da opacidade quando a geometria some.
        for (const far of fars) {
            const opacidadeNoCorte = Math.max(0, Math.min(1, (far - 60) / (240 - 60)));
            expect(opacidadeNoCorte, `far=${far}`).toBeLessThan(0.4);
        }
        // A faixa nova chega ao corte com a névoa fechada.
        for (const far of fars) {
            const f = faixaDaNevoa(far);
            expect((far - f.near) / (f.far - f.near), `far=${far}`).toBeGreaterThan(1);
        }
    });

    it('um `far` inválido não vira NaN nem faixa invertida', () => {
        for (const ruim of [0, -1, Number.NaN]) {
            const f = faixaDaNevoa(ruim as number);
            expect(Number.isFinite(f.near)).toBe(true);
            expect(f.far).toBeGreaterThan(f.near);
        }
        expect(NEVOA_INICIO).toBeLessThan(NEVOA_FIM);
    });
});

// O mesmo resolvedor de `#include` que o WebGLProgram do three usa antes de
// compilar. Se um chunk não existir ou vier fora de ordem, o erro aparece aqui
// em vez de num shader silenciosamente preto no celular do jogador.
const INCLUDE = /^[ \t]*#include +<([\w\d./]+)>/gm;
function resolver(glsl: string): string {
    return glsl.replace(INCLUDE, (_m, nome: string) => {
        const chunk = (THREE.ShaderChunk as Record<string, string>)[nome];
        if (chunk === undefined) throw new Error(`chunk inexistente: ${nome}`);
        return resolver(chunk);
    });
}

describe('o shader toon enxerga a névoa da cena', () => {
    const mat = createToonMaterial({ color: '#ffffff' });

    it('declara fog e traz os uniforms que o define USE_FOG exige', () => {
        expect(mat.fog).toBe(true);
        for (const u of ['fogColor', 'fogNear', 'fogFar', 'fogDensity']) {
            expect(mat.uniforms[u], u).toBeDefined();
        }
        // ...e os uniforms próprios continuam lá (o merge não os comeu).
        expect(mat.uniforms.uColor.value).toBeInstanceOf(THREE.Color);
        expect(mat.uniforms.uBands.value).toBeGreaterThan(0);
    });

    it('o vértice calcula mvPosition ANTES de fog_vertex usar', () => {
        const v = resolver(mat.vertexShader);
        expect(v).toContain('varying float vFogDepth;');
        expect(v).toContain('vFogDepth = - mvPosition.z;');
        const declara = v.indexOf('vec4 mvPosition');
        const usa = v.indexOf('vFogDepth = - mvPosition.z;');
        expect(declara).toBeGreaterThanOrEqual(0);
        expect(declara).toBeLessThan(usa);   // ← senão não compila
    });

    it('o fragmento aplica a névoa DEPOIS de escrever gl_FragColor', () => {
        const f = resolver(mat.fragmentShader);
        expect(f).toContain('uniform vec3 fogColor;');
        expect(f).toContain('mix( gl_FragColor.rgb, fogColor, fogFactor )');
        const escreve = f.indexOf('gl_FragColor = vec4(col, 1.0);');
        const mistura = f.indexOf('mix( gl_FragColor.rgb, fogColor, fogFactor )');
        expect(escreve).toBeGreaterThanOrEqual(0);
        expect(escreve).toBeLessThan(mistura);   // ← senão a névoa é sobrescrita
    });

    it('sem cena com névoa nada muda: o define fica desligado', () => {
        // `fog: true` é permissão, não obrigação — os blocos são todos
        // `#ifdef USE_FOG`, que o three só define quando a cena tem névoa.
        const v = mat.vertexShader;
        expect(v).toContain('#include <fog_pars_vertex>');
        expect(resolver(v)).toContain('#ifdef USE_FOG');
    });
});

describe('o GLSL não pode ter crase — eu já quebrei isto duas vezes', () => {
    // Os shaders moram em template literals. Uma crase dentro de um comentário
    // GLSL (escrevendo `uTabuas` com aspas de código, que é o reflexo de quem
    // escreve markdown o dia todo) FECHA a string, e o TypeScript passa a ler
    // GLSL como código. Eu fiz isso duas vezes na mesma sessão. O `tsc` pega,
    // mas o erro que ele dá — "',' expected" numa linha de GLSL — não diz o
    // que houve, e a segunda vez eu levei o mesmo tempo da primeira para
    // entender. Este teste diz.
    it('nenhum shader do cartoonToon contém crase no corpo', async () => {
        const fonte = readFileSync(
            new URL('../cartoonToon.ts', import.meta.url), 'utf8',
        );
        // Cada shader é um template: as crases legítimas são as das pontas, e
        // elas vêm sempre em par com o marcador /* glsl */.
        const shaders = [...fonte.matchAll(/\/\* glsl \*\/`([\s\S]*?)`;/g)];
        expect(shaders.length).toBeGreaterThanOrEqual(2);
        for (const [, corpo] of shaders) {
            expect(corpo.includes('`'), 'crase dentro do GLSL').toBe(false);
        }
    });
});
