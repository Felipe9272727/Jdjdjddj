/**
 * f13Chuva.ts — a simulação desligando Vindhjem.
 *
 * Um efeito de pós-processamento: o mundo vira riscos azuis de código, como
 * uma chuva de runas digitais, e some. Cada pixel tem o seu instante de virar:
 * a coluna dele (um sorteio), a altura na tela (o de cima vira antes, a frente
 * desce pela coluna) e a DISTÂNCIA do que está nele — o céu e o longe viram
 * código primeiro, quem está perto por último. Virando, a cor do mundo escorre
 * pela coluna em riscos, esfria para o azul e vira glifo; o glifo guarda por
 * um instante a silhueta do mundo (brilha onde o mundo era claro) e depois a
 * coluna apaga.
 *
 * `estado` vai de 0 (mundo inteiro) a 1 (tudo apagado). Andando de volta
 * (de 1 a 0) o mesmo efeito MATERIALIZA uma cena: a chuva continua caindo e o
 * que está perto aparece primeiro.
 *
 * Os glifos são runas do Futhark antigo desenhadas a traço num canvas — sem
 * depender de fonte (a maioria dos celulares não tem o bloco rúnico).
 */
import * as THREE from 'three';
import { Effect, EffectAttribute } from 'postprocessing';

/** Runas como traços numa caixa 0..1 (x para a direita, y para baixo). */
const RUNAS: ReadonlyArray<ReadonlyArray<ReadonlyArray<[number, number]>>> = [
    [[[.3, 0], [.3, 1]], [[.3, .35], [.75, .05]], [[.3, .62], [.75, .32]]],                 // ᚠ
    [[[.25, 1], [.25, 0], [.75, .35], [.75, 1]]],                                              // ᚢ
    [[[.3, 0], [.3, 1]], [[.3, .25], [.72, .5], [.3, .75]]],                                   // ᚦ
    [[[.3, 0], [.3, 1]], [[.3, .05], [.72, .3]], [[.3, .35], [.72, .6]]],                      // ᚨ
    [[[.3, 1], [.3, 0], [.72, .25], [.3, .5], [.75, 1]]],                                     // ᚱ
    [[[.72, .1], [.3, .5], [.72, .9]]],                                                        // ᚲ
    [[[.2, 0], [.8, 1]], [[.8, 0], [.2, 1]]],                                                  // ᚷ
    [[[.3, 1], [.3, 0], [.72, .25], [.3, .5]]],                                               // ᚹ
    [[[.25, 0], [.25, 1]], [[.75, 0], [.75, 1]], [[.25, .35], [.75, .62]]],                    // ᚺ
    [[[.5, 0], [.5, 1]], [[.28, .32], [.72, .62]]],                                            // ᚾ
    [[[.5, 0], [.5, 1]], [[.3, 0], [.7, 0]], [[.3, 1], [.7, 1]]],                              // ᛁ (com serifa: lê como código)
    [[[.46, .08], [.24, .33], [.46, .58]], [[.54, .42], [.76, .67], [.54, .92]]],              // ᛃ
    [[[.5, 0], [.5, 1]], [[.5, 0], [.78, .22]], [[.5, 1], [.22, .78]]],                        // ᛇ
    [[[.5, 0], [.5, 1]], [[.5, .42], [.18, .06]], [[.5, .42], [.82, .06]]],                    // ᛉ
    [[[.5, 0], [.5, 1]], [[.5, 0], [.18, .34]], [[.5, 0], [.82, .34]]],                        // ᛏ
    [[[.3, 0], [.3, 1]], [[.3, 0], [.72, .25], [.3, .5], [.72, .75], [.3, 1]]],               // ᛒ
];

let atlas: THREE.CanvasTexture | null = null;
/** 4×4 runas brancas em fundo preto, 64 px por célula. */
export function atlasDeRunas(): THREE.CanvasTexture {
    if (atlas) return atlas;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'square'; g.lineJoin = 'miter';
    RUNAS.forEach((tracos, i) => {
        const ox = (i % 4) * 64 + 14, oy = Math.floor(i / 4) * 64 + 8, w = 36, h = 48;
        for (const t of tracos) {
            g.beginPath();
            t.forEach(([x, y], k) => (k ? g.lineTo(ox + x * w, oy + y * h) : g.moveTo(ox + x * w, oy + y * h)));
            g.stroke();
        }
    });
    atlas = new THREE.CanvasTexture(c);
    atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.magFilter = THREE.LinearFilter;
    return atlas;
}

const FRAG = /* glsl */`
uniform float uS;
uniform float uT;
uniform sampler2D uGlifos;
uniform vec2 uCel;

float h1(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    if (uS <= 0.0) { outputColor = inputColor; return; }
    vec2 px = uv * resolution;
    float col = floor(px.x / uCel.x), row = floor(px.y / uCel.y);
    vec2 dentro = fract(px / uCel);
    float r1 = h1(col + 3.1), r2 = h1(col * 1.7 + 17.0), r3 = h1(col * 2.9 + 41.0);

    // o longe (e o céu) vira código primeiro; quem está perto, por último
    float dist = -getViewZ(depth);
    float longe = clamp(log2(max(dist, 1.0)) / log2(260.0), 0.0, 1.0);
    float m = 0.08 + r1 * 0.26 + (1.0 - uv.y) * 0.24 + (1.0 - longe) * 0.30;
    float idade = uS * 2.1 - m;

    // o mundo ainda inteiro esfria e ganha linhas de varredura
    float frio = smoothstep(0.0, 0.3, uS);
    float lum = dot(inputColor.rgb, vec3(0.299, 0.587, 0.114));
    vec3 mundo = mix(inputColor.rgb, vec3(lum) * vec3(0.5, 0.78, 1.4), frio * 0.5);
    mundo *= 1.0 - frio * 0.16 * step(0.5, fract(px.y * 0.5));

    // a chuva de runas: gotas descendo cada coluna, cabeça clara e rastro azul
    float vel = 3.0 + r2 * 9.0, L = 9.0 + r3 * 22.0;
    float fase = (row + uT * vel + r1 * 97.0) / L;
    float rastro = 1.0 - fract(fase);
    float existe = step(0.12, h2(vec2(col, floor(fase))));
    float b = pow(rastro, 2.2) * existe;
    float troca = floor(uT * (2.0 + r3 * 6.0) + h2(vec2(col, row)) * 7.0);
    float g = floor(h2(vec2(col * 1.3 + troca * 0.17, row)) * 16.0);
    float glifo = texture2D(uGlifos, (vec2(mod(g, 4.0), floor(g / 4.0)) + 0.1 + dentro * 0.8) / 4.0).r;
    vec3 azul = vec3(0.03, 0.3, 1.0), ciano = vec3(0.6, 0.92, 1.0);
    vec3 chuva = glifo * (azul * b * 2.0 + ciano * pow(rastro, 14.0) * existe * 2.2);
    chuva += glifo * azul * 0.1 * h2(vec2(col, row + floor(uT * 3.0)));

    if (idade < 0.0) {
        // ainda mundo: a chuva já passa por cima, fraca
        outputColor = vec4(mundo + chuva * smoothstep(-0.25, 0.0, idade) * 0.35, inputColor.a);
        return;
    }
    // virando: a cor de cima escorre pela coluna em riscos e esfria
    float escorre = clamp(idade / 0.22, 0.0, 1.0);
    vec2 uvRisco = vec2((col + 0.5) * uCel.x / resolution.x, min(0.999, uv.y + idade * 0.5));
    vec3 risco = texture2D(inputBuffer, uvRisco).rgb;
    vec3 riscoAzul = mix(risco, vec3(dot(risco, vec3(0.299, 0.587, 0.114))) * vec3(0.35, 0.7, 1.6), escorre);
    float borda = 1.0 - smoothstep(0.0, 0.035, idade);
    // o código guarda a silhueta do mundo por um instante
    float silhueta = mix(0.4 + lum * 2.2, 1.0, smoothstep(0.15, 0.5, idade));
    float some = 1.0 - smoothstep(0.5 + r2 * 0.2, 0.95 + r2 * 0.2, idade);
    vec3 cor = mix(riscoAzul * (1.0 - escorre * 0.85), chuva * silhueta, escorre) * some;
    cor += ciano * borda * 0.9 * some;
    outputColor = vec4(max(cor, vec3(0.0, 0.006, 0.02)), inputColor.a);
}
`;

/** O efeito. Quem conduz a cena escreve `estado` (0..1) a cada quadro. */
export class EfeitoChuva extends Effect {
    estado = 0;
    constructor() {
        super('EfeitoChuva', FRAG, {
            attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
            uniforms: new Map<string, THREE.Uniform>([
                ['uS', new THREE.Uniform(0)],
                ['uT', new THREE.Uniform(0)],
                ['uGlifos', new THREE.Uniform(atlasDeRunas())],
                ['uCel', new THREE.Uniform(new THREE.Vector2(10, 14))],
            ]),
        });
    }
    override update(_r: THREE.WebGLRenderer, entrada: THREE.WebGLRenderTarget, dt = 1 / 60): void {
        this.uniforms.get('uS')!.value = this.estado;
        this.uniforms.get('uT')!.value += Math.min(dt, .1);
        // ~58 linhas de runas na altura da tela, runas mais altas que largas
        const alto = Math.max(11, Math.round(entrada.height / 58));
        (this.uniforms.get('uCel')!.value as THREE.Vector2).set(Math.round(alto * .72), alto);
    }
}
