/**
 * f13Fagulhas.tsx
 * ---------------------------------------------------------------------------
 * As fagulhas que saltam da mesa da bigorna a cada martelada, na forja do Brokk.
 *
 * Tudo vive num único THREE.Points — uma única chamada de desenho — com um
 * reservatório fixo de 60 partículas recicladas em rajadas periódicas de 12 a
 * 20 fagulhas a cada ~1,1 s.
 *
 * Este arquivo só desenha partículas. Ele não importa, não cria, não remove e
 * não altera nenhuma fonte de iluminação da cena: a iluminação da forja segue
 * exatamente como já estava, sem recompilar shader nenhum no meio do quadro.
 *
 * O contador `forja.batida` sobe de um em um a cada martelada, para o áudio
 * casar depois: o sistema de som lê `forja.batida`, compara com o valor do
 * quadro anterior e toca o clangor no mesmo instante em que a fagulha salta.
 *
 * Onde pendurar: a bigorna mora em [1.7, 0, .9] dentro do grupo da forja, com
 * -0.4 rad em Y, então a mesa do ferro cai perto de:
 *
 *   <FagulhasDaForja posicao={[ilha.x + 1.22, ilha.y + 0.86, ilha.z - 0.01]} />
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/* ------------------------------------------------------------------------- */
/*  Estado compartilhado da forja                                           */
/* ------------------------------------------------------------------------- */

/**
 * Estado global da forja. Hoje carrega só o contador de marteladas; é aqui que
 * o som vai se pendurar mais tarde.
 */
export const forja = { batida: 0 };

/* ------------------------------------------------------------------------- */
/*  Afinação                                                                */
/* ------------------------------------------------------------------------- */

/** Tamanho do reservatório: é o número de partículas do único draw call. */
const TOTAL_FAGULHAS = 60;

/** Ritmo da martelada, em segundos, com a leve variação que tira o metrônomo. */
const INTERVALO_BATIDA = 1.1;
const VARIACAO_BATIDA = 0.22;

/** Cada batida cospe entre 12 e 20 fagulhas. */
const MIN_POR_RAJADA = 12;
const MAX_POR_RAJADA = 20;

/** Física: a gravidade puxa para baixo, o ar segura um pouco. */
const GRAVIDADE = -7.4;
const ARRASTO = 1.6;

/** Impulso de saída da rajada, em metros por segundo. */
const IMPULSO_MIN = 1.3;
const IMPULSO_MAX = 3.0;

/** Empurrãozinho extra para cima, para o leque subir mais do que descer. */
const EMPURRAO_CIMA = 0.55;

/** Vida curta: a fagulha some entre 0,5 s e 1,2 s. */
const VIDA_MIN = 0.5;
const VIDA_MAX = 1.2;

/** Diâmetro de nascença, em metros (a mesa da bigorna tem ~0,46 m). */
const TAMANHO_INICIAL = 0.055;

/** Trava anti-salto: quadro engasgado não faz a simulação explodir. */
const PASSO_MAXIMO = 0.05;

/* ------------------------------------------------------------------------- */
/*  Rampa de resfriamento                                                   */
/* ------------------------------------------------------------------------- */

/** Uma parada da rampa: [r, g, b, t], com t de 0 (recém-nascida) a 1 (morrendo). */
type ParadaDeCalor = readonly [number, number, number, number];

/**
 * Nasce amarelo-branco de tão quente, vira laranja, depois laranja-avermelhado
 * e morre num vermelho escuro de brasa apagando.
 */
const RAMPA_DE_CALOR: readonly ParadaDeCalor[] = [
  [1.0, 0.96, 0.78, 0.0], // amarelo-branco da forja
  [1.0, 0.64, 0.22, 0.28], // laranja vivo
  [1.0, 0.27, 0.05, 0.62], // laranja-avermelhado
  [0.32, 0.03, 0.0, 1.0], // brasa morrendo
];

/* ------------------------------------------------------------------------- */
/*  Shaders                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * O vértice posiciona o ponto e calcula o tamanho em pixels. `uEscala` vale
 * "pixels por metro a um metro de distância", então a fagulha mantém o mesmo
 * tamanho aparente em qualquer tela e a qualquer distância da câmera.
 */
const SHADER_VERTICE = /* glsl */ `
  attribute vec4 aCor;        // rgb = cor da brasa, a = opacidade
  attribute float aTamanho;   // diâmetro em metros

  uniform float uEscala;      // pixels por metro a um metro de distância

  varying vec4 vCor;

  void main() {
    vCor = aCor;

    vec4 posicaoNaVista = modelViewMatrix * vec4(position, 1.0);
    float distancia = max(0.05, -posicaoNaVista.z);
    gl_PointSize = clamp(aTamanho * uEscala / distancia, 0.0, 90.0);

    gl_Position = projectionMatrix * posicaoNaVista;
  }
`;

/**
 * O fragmento pega a máscara circular do canvas e multiplica pela cor da brasa.
 * Com blending aditivo o resultado é `cor * alfa * mascara` somado ao que já
 * estava na tela.
 */
const SHADER_FRAGMENTO = /* glsl */ `
  uniform sampler2D uTextura;

  varying vec4 vCor;

  void main() {
    float mascara = texture2D(uTextura, gl_PointCoord).a;
    if (mascara < 0.004) discard;
    gl_FragColor = vec4(vCor.rgb, vCor.a * mascara);
  }
`;

/* ------------------------------------------------------------------------- */
/*  Textura circular desenhada em canvas (nenhum arquivo externo)           */
/* ------------------------------------------------------------------------- */

/**
 * Desenha a chama da fagulha num canvas 64x64 e devolve como textura: um ponto
 * quente no centro que se desmancha em transparente na borda. O shader lê só o
 * canal alfa como máscara; a cor vem do atributo, não da textura.
 */
function criarTexturaFagulha(): THREE.CanvasTexture {
  const lado = 64;
  const tela = document.createElement('canvas');
  tela.width = lado;
  tela.height = lado;

  const pincel = tela.getContext('2d');
  if (pincel) {
    const centro = lado * 0.5;
    const tinta = pincel.createRadialGradient(centro, centro, 0, centro, centro, centro);
    tinta.addColorStop(0.0, 'rgba(255, 255, 255, 1)');
    tinta.addColorStop(0.22, 'rgba(255, 240, 205, 0.9)');
    tinta.addColorStop(0.5, 'rgba(255, 178, 80, 0.4)');
    tinta.addColorStop(0.78, 'rgba(255, 120, 24, 0.11)');
    tinta.addColorStop(1.0, 'rgba(255, 90, 0, 0)');
    pincel.fillStyle = tinta;
    pincel.fillRect(0, 0, lado, lado);
  }

  const textura = new THREE.CanvasTexture(tela);
  textura.minFilter = THREE.LinearFilter;
  textura.magFilter = THREE.LinearFilter;
  textura.generateMipmaps = false;
  textura.needsUpdate = true;
  return textura;
}

/* ------------------------------------------------------------------------- */
/*  Reservatório (arrays alocados uma vez, nada nasce no useFrame)          */
/* ------------------------------------------------------------------------- */

/**
 * Todos os arrays são alocados uma única vez e reaproveitados para sempre.
 * Nenhum objeto novo (Vector3, array, cor) nasce dentro do useFrame.
 *
 * Truque: tudo zerado já significa "apagada", porque a condição de vida é
 * `idade >= vida` e 0 >= 0 é verdade. Não precisa de laço de inicialização.
 */
type Reservatorio = {
  posicoes: Float32Array; // 3 por fagulha
  cores: Float32Array; // 4 por fagulha (rgb + alfa)
  tamanhos: Float32Array; // 1 por fagulha (diâmetro atual)
  velocidades: Float32Array; // 3 por fagulha
  idades: Float32Array; // 1 por fagulha
  vidas: Float32Array; // 1 por fagulha
  escalas: Float32Array; // 1 por fagulha (variação de tamanho sorteada)
  atributoPosicao: THREE.BufferAttribute;
  atributoCor: THREE.BufferAttribute;
  atributoTamanho: THREE.BufferAttribute;
  geometria: THREE.BufferGeometry;
};

/* ------------------------------------------------------------------------- */
/*  Simulação (tudo em arrays, nada de objetos)                             */
/* ------------------------------------------------------------------------- */

/**
 * Escreve direto nos buffers a cor e o alfa de uma fagulha com idade
 * normalizada `t`. Nenhuma alocação: só leitura da rampa fixa e contas soltas.
 */
function pintarFagulha(t: number, cores: Float32Array, i4: number): void {
  const paradas = RAMPA_DE_CALOR;
  const ultimo = paradas.length - 1;

  let trecho = ultimo - 1;
  for (let s = 0; s < ultimo; s++) {
    if (t <= paradas[s + 1][3]) {
      trecho = s;
      break;
    }
  }

  const a = paradas[trecho];
  const b = paradas[trecho + 1];
  const largura = b[3] - a[3];
  const k = largura > 0 ? (t - a[3]) / largura : 0;

  cores[i4] = a[0] + (b[0] - a[0]) * k;
  cores[i4 + 1] = a[1] + (b[1] - a[1]) * k;
  cores[i4 + 2] = a[2] + (b[2] - a[2]) * k;

  // Acende num piscar de três quadros e apaga quadrático no fim: nada de
  // fagulha pipocando no nascimento nem sumindo de repente na morte.
  const acender = t < 0.06 ? t / 0.06 : 1;
  const apagar = 1 - t * t;
  cores[i4 + 3] = acender * apagar;
}

/**
 * Sorteia fagulhas apagadas do reservatório e joga todas para o alto de uma vez.
 * Varre o array atrás de mortas: nunca atropela uma fagulha que ainda está no ar.
 */
function dispararRajada(res: Reservatorio, quantidade: number): void {
  const { posicoes, velocidades, idades, vidas, cores, tamanhos, escalas } = res;

  let faltam = quantidade;

  for (let i = 0; i < TOTAL_FAGULHAS && faltam > 0; i++) {
    if (idades[i] < vidas[i]) continue; // viva, não é a vez dela
    faltam--;

    const i3 = i * 3;
    const i4 = i * 4;

    // Ponto de partida: a mesa da bigorna, com um dedo de espalhamento em volta.
    posicoes[i3] = (Math.random() - 0.5) * 0.16;
    posicoes[i3 + 1] = (Math.random() - 0.5) * 0.06;
    posicoes[i3 + 2] = (Math.random() - 0.5) * 0.16;

    // Leque: quase tudo para cima, abrindo para os lados.
    const volta = Math.random() * Math.PI * 2;
    const inclinacao = 0.5 + Math.random() * 0.9; // ~29° a ~80° acima do horizonte
    const forca = IMPULSO_MIN + Math.random() * (IMPULSO_MAX - IMPULSO_MIN);
    const raio = Math.cos(inclinacao) * forca;

    velocidades[i3] = Math.cos(volta) * raio;
    velocidades[i3 + 1] = Math.sin(inclinacao) * forca + EMPURRAO_CIMA;
    velocidades[i3 + 2] = Math.sin(volta) * raio;

    idades[i] = 0;
    vidas[i] = VIDA_MIN + Math.random() * (VIDA_MAX - VIDA_MIN);
    escalas[i] = 0.65 + Math.random() * 0.7;
    tamanhos[i] = TAMANHO_INICIAL * escalas[i];

    // Nasce já quente, senão o primeiro quadro mostraria a cor do quadro anterior.
    pintarFagulha(0, cores, i4);
  }
}

/* ------------------------------------------------------------------------- */
/*  Componente                                                              */
/* ------------------------------------------------------------------------- */

export type PropsFagulhas = {
  /** Onde fica a mesa da bigorna, no espaço do mundo. As fagulhas nascem em volta. */
  posicao: [number, number, number];
};

export const FagulhasDaForja = ({ posicao }: PropsFagulhas) => {
  // ---------------------------------------------------------------- reservatório
  const dados = useMemo<Reservatorio>(() => {
    const posicoes = new Float32Array(TOTAL_FAGULHAS * 3);
    const cores = new Float32Array(TOTAL_FAGULHAS * 4);
    const tamanhos = new Float32Array(TOTAL_FAGULHAS);
    const velocidades = new Float32Array(TOTAL_FAGULHAS * 3);
    const idades = new Float32Array(TOTAL_FAGULHAS);
    const vidas = new Float32Array(TOTAL_FAGULHAS);
    const escalas = new Float32Array(TOTAL_FAGULHAS);
    // Zerado já quer dizer "apagada": idade 0 >= vida 0. Sem laço de inicialização.

    const atributoPosicao = new THREE.BufferAttribute(posicoes, 3).setUsage(
      THREE.DynamicDrawUsage,
    );
    const atributoCor = new THREE.BufferAttribute(cores, 4).setUsage(THREE.DynamicDrawUsage);
    const atributoTamanho = new THREE.BufferAttribute(tamanhos, 1).setUsage(
      THREE.DynamicDrawUsage,
    );

    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute('position', atributoPosicao);
    geometria.setAttribute('aCor', atributoCor);
    geometria.setAttribute('aTamanho', atributoTamanho);

    return {
      posicoes,
      cores,
      tamanhos,
      velocidades,
      idades,
      vidas,
      escalas,
      atributoPosicao,
      atributoCor,
      atributoTamanho,
      geometria,
    };
  }, []);

  // ------------------------------------------------------------------- material
  const textura = useMemo(() => criarTexturaFagulha(), []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        name: 'fagulhasDaForja',
        uniforms: {
          uEscala: { value: 600 }, // recalibrado todo quadro no useFrame
          uTextura: { value: textura },
        },
        vertexShader: SHADER_VERTICE,
        fragmentShader: SHADER_FRAGMENTO,
        transparent: true,
        depthWrite: false,
        depthTest: true, // a bigorna e o telhado ainda tapam as fagulhas atrás deles
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [textura],
  );

  // ------------------------------------------------------------------ descarte
  useEffect(() => {
    return () => {
      dados.geometria.dispose();
      material.dispose();
      textura.dispose();
    };
  }, [dados, material, textura]);

  // ------------------------------------------------- contador da martelada
  /** Segundos que faltam para a próxima martelada. A primeira vem logo ao montar. */
  const relogio = useRef(0.35);

  // ------------------------------------------------------------------- quadro
  useFrame((estado, delta) => {
    const dt = delta > PASSO_MAXIMO ? PASSO_MAXIMO : delta;

    const {
      posicoes,
      cores,
      tamanhos,
      velocidades,
      idades,
      vidas,
      escalas,
      atributoPosicao,
      atributoCor,
      atributoTamanho,
    } = dados;

    // ---- a martelada: dispara a rajada e avisa quem estiver escutando ----
    relogio.current -= dt;
    if (relogio.current <= 0) {
      const quantidade =
        MIN_POR_RAJADA + Math.floor(Math.random() * (MAX_POR_RAJADA - MIN_POR_RAJADA + 1));
      dispararRajada(dados, quantidade);
      forja.batida += 1;
      relogio.current = INTERVALO_BATIDA + (Math.random() - 0.5) * VARIACAO_BATIDA;
    }

    // ---- a física, fagulha por fagulha, sem alocar nada ----
    let sujo = false;

    for (let i = 0; i < TOTAL_FAGULHAS; i++) {
      if (idades[i] >= vidas[i]) continue; // já virou cinza

      const i3 = i * 3;
      const i4 = i * 4;

      idades[i] += dt;

      if (idades[i] >= vidas[i]) {
        // Morreu agora: preto com alfa zero não soma nada num blending aditivo.
        cores[i4] = 0;
        cores[i4 + 1] = 0;
        cores[i4 + 2] = 0;
        cores[i4 + 3] = 0;
        tamanhos[i] = 0;
        sujo = true;
        continue;
      }

      // gravidade e arrasto do ar
      const freio = 1 - ARRASTO * dt;
      velocidades[i3 + 1] += GRAVIDADE * dt;
      velocidades[i3] *= freio;
      velocidades[i3 + 1] *= freio;
      velocidades[i3 + 2] *= freio;

      // integração
      posicoes[i3] += velocidades[i3] * dt;
      posicoes[i3 + 1] += velocidades[i3 + 1] * dt;
      posicoes[i3 + 2] += velocidades[i3 + 2] * dt;

      // esfriando e encolhendo
      const t = idades[i] / vidas[i];
      pintarFagulha(t, cores, i4);
      tamanhos[i] = TAMANHO_INICIAL * escalas[i] * (1 - 0.75 * t);

      sujo = true;
    }

    if (sujo) {
      atributoPosicao.needsUpdate = true;
      atributoCor.needsUpdate = true;
      atributoTamanho.needsUpdate = true;
    }

    // ---- escala em pixels: mantém a fagulha do mesmo tamanho em qualquer tela ----
    const camera = estado.camera as THREE.PerspectiveCamera;
    const fov = camera.isPerspectiveCamera ? camera.fov : 50;
    const alturaDoBuffer = estado.gl.domElement.height;
    material.uniforms.uEscala.value = (alturaDoBuffer * 0.5) / Math.tan((fov * Math.PI) / 360);
  });

  // --------------------------------------------------------------------- render
  return (
    <group position={posicao}>
      {/* Uma única chamada de desenho para as 60 fagulhas. */}
      <points geometry={dados.geometria} material={material} frustumCulled={false} />
    </group>
  );
};
