/**
 * f13Fagulhas.tsx
 * ---------------------------------------------------------------------------
 * As fagulhas que saltam da mesa da bigorna a cada martelada, na forja do Brokk.
 *
 * Cada fagulha é uma fita finíssima — um risco — virada para a câmera e
 * alinhada na direção em que a brasa está voando. Todas as fitas moram numa
 * única geometria instanciada, desenhada numa única chamada, com material
 * próprio e sem nenhuma luz envolvida.
 *
 * O que faz a fagulha LER como fagulha, e não como poeira parada na frente da
 * pedra:
 *
 *   1. rajada: cada martelada dispara um leque para cima; a velocidade de saída
 *      sai da altura que a brasa deve subir (v = sqrt(2·g·h)), entre 0,6 m e
 *      1,2 m — ela sobe de verdade e cai depois;
 *   2. rastro: o risco é um borrão de movimento, comprimento = velocidade ×
 *      tempo de exposição, com piso e teto. Fagulha rápida = traço comprido;
 *      fagulha no alto da curva = quase um ponto. É esse traço que o olho
 *      procura para saber que a coisa está indo embora depressa;
 *   3. calor: nasce branco-amarelo quase estourando, passa por laranja e
 *      vermelho e apaga; a cabeça do risco é sempre mais quente que a cauda;
 *   4. quique: as que voltam e acham o tampo da bigorna ou o chão pulam e
 *      arrastam antes de virar cinza.
 *
 * Este arquivo só desenha partículas. Ele não importa, não cria, não remove e
 * não altera nenhuma fonte de iluminação da cena: a iluminação da forja segue
 * exatamente como já estava, sem recompilar shader nenhum no meio do quadro.
 * Nada é alocado dentro do useFrame: só números escritos nos arrays fixos.
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

/** Tamanho do reservatório: é o número de fitas da única chamada de desenho. */
const TOTAL_FAGULHAS = 112;

/** Ritmo da martelada, em segundos, com a leve variação que tira o metrônomo. */
const INTERVALO_BATIDA = 1.05;
const VARIACAO_BATIDA = 0.2;

/** Cada batida cospe entre 22 e 34 fagulhas. */
const MIN_POR_RAJADA = 22;
const MAX_POR_RAJADA = 34;

/** A rajada não sai toda no mesmo quadro: até 50 ms de espalhamento na partida. */
const ATRASO_MAX = 0.05;

/** Física: a gravidade puxa para baixo, o ar segura um pouco. */
const GRAVIDADE = -9.6;
const ARRASTO = 0.5;

/**
 * Quanto cada fagulha sobe, em metros, antes de virar e cair. É a régua do
 * impulso: a velocidade vertical sai de v = sqrt(2 · g · h).
 */
const SUBIDA_MIN = 0.6;
const SUBIDA_MAX = 1.2;

/** Compensação do arrasto do ar: sem ela a subida real fica alguns centímetros curta. */
const CORRECAO_SUBIDA = 1.1;

/** Abertura do leque em torno da vertical, em radianos (~6° a ~31°). */
const LEQUE_MIN = 0.1;
const LEQUE_MAX = 0.55;
/** Uma em cada quatro abre mais o leque, para a rajada não sair toda igual. */
const CHANCE_DE_LEQUE_ABERTO = 0.25;

/** A brasa vive entre 0,5 s e 1,25 s. */
const VIDA_MIN = 0.5;
const VIDA_MAX = 1.25;

/** Largura do risco, em metros. */
const LARGURA_BASE = 0.018;

/**
 * Borrão de movimento: o comprimento do risco é quanto a fagulha andaria
 * dentro do tempo de exposição. É isto que transforma o ponto em traço.
 */
const EXPOSICAO = 0.05;
const COMPRIMENTO_MIN = 0.03;
const COMPRIMENTO_MAX = 0.26;

/** Trava anti-salto: quadro engasgado não faz a simulação explodir. */
const PASSO_MAXIMO = 0.05;

/** Altura do chão medida a partir da mesa (o grupo nasce em cima da mesa). */
const NIVEL_DO_CHAO = -0.86;

/** Meia-largura do tampo de pedra onde as fagulhas quicam antes de escorregar. */
const RAIO_DO_TAMPO = 0.42;

/** Devolução da velocidade no quique: a bigorna é dura, a grama não. */
const RESTITUICAO_BIGORNA = 0.45;
const RESTITUICAO_CHAO = 0.32;

/**
 * Quique: só estica a vida se ainda houver pancada para mostrar, e só nos dois
 * primeiros pinotes. Sem essa trava, uma brasa encostada no tampo ficaria
 * quicando para sempre em milímetros e nunca apagaria.
 */
const QUIQUE_MINIMO = 0.35;
const QUIQUES_MAXIMOS = 2;
const VIDA_APOS_QUIQUE = 0.3;
const VIDA_APOS_QUIQUE_FRACO = 0.06;

/* ------------------------------------------------------------------------- */
/*  Rampa de resfriamento                                                   */
/* ------------------------------------------------------------------------- */

/** Uma parada da rampa: [r, g, b, t], com t de 0 (recém-nascida) a 1 (morrendo). */
type ParadaDeCalor = readonly [number, number, number, number];

/**
 * O resfriamento do metal: o rgb pode passar de 1 de propósito, porque com
 * blending aditivo o que estoura a tela é exatamente o miolo branco-quente da
 * fagulha recém-nascida; conforme a brasa esfria, o valor cai e a cor desce
 * para amarelo, laranja, laranja-avermelhado e vermelho escuro até virar nada.
 */
const RAMPA_DE_CALOR: readonly ParadaDeCalor[] = [
  [2.60, 2.42, 2.00, 0.00], // branco-amarelo, recém-saída da martelada
  [2.05, 1.45, 0.55, 0.12], // amarelo da forja
  [1.35, 0.70, 0.14, 0.34], // laranja vivo
  [0.85, 0.22, 0.03, 0.62], // laranja-avermelhado
  [0.40, 0.045, 0.005, 0.85], // vermelho de brasa
  [0.08, 0.006, 0.00, 1.00], // apagando no escuro
];

/* ------------------------------------------------------------------------- */
/*  Shaders                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * O vértice monta a fita no mundo: parte da posição da cabeça, anda para trás
 * ao longo da velocidade (é o rastro) e abre para os lados numa direção
 * transversal calculada contra a câmera (é o que mantém a fita de frente para
 * quem olha, em vez de virar de perfil e sumir).
 */
const SHADER_VERTICE = /* glsl */ `
  attribute vec3 iOrigem;    // posição da cabeça da fagulha, no espaço do grupo
  attribute vec3 iEixo;      // velocidade atual: direção e módulo
  attribute vec2 iMedidas;   // x = comprimento do risco (m), y = largura (m)
  attribute vec4 iCor;       // rgb = radiação da brasa (pode passar de 1), a = opacidade

  varying vec4 vCor;
  varying float vAo;   // -1 = ponta da cauda, +1 = cabeça acesa
  varying float vPe;   // -1..1 transversal

  void main() {
    vCor = iCor;
    vAo = position.x;
    vPe = position.y;

    vec4 origemMundo = modelMatrix * vec4(iOrigem, 1.0);

    // Direção do movimento: se a fagulha está parada, a fita vira um ponto.
    float rapidez = length(iEixo);
    vec3 eixo = rapidez > 1e-4 ? iEixo / rapidez : vec3(0.0, 1.0, 0.0);
    vec3 eixoMundo = normalize(mat3(modelMatrix) * eixo);

    vec3 paraCamera = cameraPosition - origemMundo.xyz;
    float distancia = length(paraCamera);
    paraCamera = distancia > 1e-4 ? paraCamera / distancia : vec3(0.0, 0.0, 1.0);

    // Transversal deitada no plano da tela: a fita fica sempre de frente.
    vec3 transversal = cross(eixoMundo, paraCamera);
    float cruz = length(transversal);
    if (cruz < 1e-3) {
      // A fagulha vem na direção da câmera: qualquer perpendicular serve.
      transversal = cross(eixoMundo, vec3(0.0, 1.0, 0.0));
      cruz = length(transversal);
    }
    transversal = cruz > 1e-4 ? transversal / cruz : vec3(0.0, 1.0, 0.0);

    // A cabeça fica um pouco à frente da posição e a cauda arrasta atrás.
    float aoLongo = position.x * 0.5 - 0.32;

    vec3 ponto = origemMundo.xyz
      + eixoMundo * (aoLongo * iMedidas.x)
      + transversal * (position.y * iMedidas.y * 0.5);

    gl_Position = projectionMatrix * viewMatrix * vec4(ponto, 1.0);
  }
`;

/**
 * O fragmento desenha o risco: fino e macio nas laterais, aceso na cabeça e
 * apagando na cauda, com o bico tendendo ao branco. Nada de textura: a máscara
 * é analítica.
 */
const SHADER_FRAGMENTO = /* glsl */ `
  varying vec4 vCor;
  varying float vAo;
  varying float vPe;

  void main() {
    // Largura: fita fina com borda macia, sem aresta dura.
    float transversal = abs(vPe);
    float perfil = 1.0 - transversal * transversal;
    perfil *= perfil;

    // Comprimento: a cabeça é a brasa viva, a cauda é rastro que já esfriou.
    float queda = smoothstep(-1.0, 0.55, vAo);

    float alfa = vCor.a * perfil * queda;
    if (alfa < 0.004) discard;

    // A cor da rampa sobe de tom na cabeça, e o bico ganha um empurrão branco.
    vec3 cor = vCor.rgb * (0.5 + 0.8 * queda)
      + vec3(0.75, 0.55, 0.30) * pow(max(vAo, 0.0), 3.0);

    gl_FragColor = vec4(cor, alfa);
  }
`;

/* ------------------------------------------------------------------------- */
/*  Reservatório (arrays alocados uma vez, nada nasce no useFrame)          */
/* ------------------------------------------------------------------------- */

/**
 * Todos os arrays são alocados uma única vez e reaproveitados para sempre.
 * Nenhum objeto novo (Vector3, array, cor) nasce dentro do useFrame.
 *
 * Truque: tudo zerado já significa "apagada", porque a fagulha está morta
 * quando `idades >= vidas + atrasos` e 0 >= 0 é verdade. Não precisa de laço
 * de inicialização.
 */
type Reservatorio = {
  origens: Float32Array; // 3 por fagulha — cabeça da fita, no espaço do grupo
  velocidades: Float32Array; // 3 por fagulha — física E direção do rastro
  medidas: Float32Array; // 2 por fagulha — [comprimento do risco, largura]
  cores: Float32Array; // 4 por fagulha — rgb (pode passar de 1) + alfa
  idades: Float32Array; // 1 por fagulha
  vidas: Float32Array; // 1 por fagulha (duração do voo, depois do atraso)
  atrasos: Float32Array; // 1 por fagulha (espera antes de sair)
  escalas: Float32Array; // 1 por fagulha (variação de tamanho sorteada)
  quiques: Uint8Array; // 1 por fagulha (quantos pinotes já deu)
  atributoOrigem: THREE.InstancedBufferAttribute;
  atributoEixo: THREE.InstancedBufferAttribute;
  atributoMedidas: THREE.InstancedBufferAttribute;
  atributoCor: THREE.InstancedBufferAttribute;
  geometria: THREE.InstancedBufferGeometry;
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

  // Acende num piscar de dois quadros e apaga quadrático no fim: nada de
  // fagulha pipocando no nascimento nem sumindo de repente na morte.
  const acender = t < 0.03 ? t / 0.03 : 1;
  const apagar = 1 - t * t;
  cores[i4 + 3] = acender * apagar;
}

/**
 * Comprimento do rastro de uma fagulha que voa a `rapidez` m/s: é um borrão de
 * movimento (velocidade × tempo de exposição), com piso para não virar poeira
 * e teto para não virar risco de lápis.
 */
function comprimentoDoRastro(rapidez: number): number {
  let comprimento = rapidez * EXPOSICAO;
  if (comprimento < COMPRIMENTO_MIN) comprimento = COMPRIMENTO_MIN;
  else if (comprimento > COMPRIMENTO_MAX) comprimento = COMPRIMENTO_MAX;
  return comprimento;
}

/**
 * Sorteia fagulhas apagadas do reservatório e joga todas para o alto de uma vez.
 * Varre o array atrás de mortas: nunca atropela uma fagulha que ainda está no ar.
 *
 * O impulso vertical vem da altura que se quer subir (0,6 m a 1,2 m), não de um
 * número arbitrário: assim a rajada sobe de verdade, e não só "parece rápida".
 */
function dispararRajada(res: Reservatorio, quantidade: number): void {
  const { origens, velocidades, medidas, cores, idades, vidas, atrasos, escalas, quiques } = res;

  let faltam = quantidade;

  for (let i = 0; i < TOTAL_FAGULHAS && faltam > 0; i++) {
    if (idades[i] < vidas[i] + atrasos[i]) continue; // viva, não é a vez dela
    faltam--;

    const i2 = i * 2;
    const i3 = i * 3;
    const i4 = i * 4;

    // Ponto de partida: a mesa do ferro, com um palmo de espalhamento em volta.
    origens[i3] = (Math.random() - 0.5) * 0.18;
    origens[i3 + 1] = Math.random() * 0.04;
    origens[i3 + 2] = (Math.random() - 0.5) * 0.18;

    // Leque: azimute livre, inclinação pequena em relação à vertical.
    const azimute = Math.random() * Math.PI * 2;
    const abreMais = Math.random() < CHANCE_DE_LEQUE_ABERTO;
    const lequeMax = abreMais ? LEQUE_MAX * 1.35 : LEQUE_MAX;
    const leque = LEQUE_MIN + Math.random() * (lequeMax - LEQUE_MIN);

    const alturaDesejada = SUBIDA_MIN + Math.random() * (SUBIDA_MAX - SUBIDA_MIN);
    const subida =
      Math.sqrt(2 * -GRAVIDADE * alturaDesejada) * CORRECAO_SUBIDA * (0.97 + Math.random() * 0.08);
    const lateral = Math.tan(leque) * subida;

    velocidades[i3] = Math.cos(azimute) * lateral;
    velocidades[i3 + 1] = subida;
    velocidades[i3 + 2] = Math.sin(azimute) * lateral;

    idades[i] = 0;
    atrasos[i] = Math.random() * ATRASO_MAX;
    vidas[i] = VIDA_MIN + Math.random() * (VIDA_MAX - VIDA_MIN);
    escalas[i] = 0.7 + Math.random() * 0.8;
    quiques[i] = 0;

    // Nasce já quente e já com o rastro do primeiro quadro, senão o impacto
    // mostraria por um instante a cor e o tamanho do quadro anterior.
    pintarFagulha(0, cores, i4);
    const rapidez = Math.hypot(velocidades[i3], velocidades[i3 + 1], velocidades[i3 + 2]);
    medidas[i2] = comprimentoDoRastro(rapidez);
    medidas[i2 + 1] = LARGURA_BASE * escalas[i];
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
    const origens = new Float32Array(TOTAL_FAGULHAS * 3);
    const velocidades = new Float32Array(TOTAL_FAGULHAS * 3);
    const medidas = new Float32Array(TOTAL_FAGULHAS * 2);
    const cores = new Float32Array(TOTAL_FAGULHAS * 4);
    const idades = new Float32Array(TOTAL_FAGULHAS);
    const vidas = new Float32Array(TOTAL_FAGULHAS);
    const atrasos = new Float32Array(TOTAL_FAGULHAS);
    const escalas = new Float32Array(TOTAL_FAGULHAS);
    const quiques = new Uint8Array(TOTAL_FAGULHAS);
    // Zerado já quer dizer "apagada": idade 0 >= vida 0. Sem laço de inicialização.

    const atributoOrigem = new THREE.InstancedBufferAttribute(origens, 3).setUsage(
      THREE.DynamicDrawUsage,
    );
    // Sem cópia: o mesmo array de velocidades alimenta a física e a direção do rastro.
    const atributoEixo = new THREE.InstancedBufferAttribute(velocidades, 3).setUsage(
      THREE.DynamicDrawUsage,
    );
    const atributoMedidas = new THREE.InstancedBufferAttribute(medidas, 2).setUsage(
      THREE.DynamicDrawUsage,
    );
    const atributoCor = new THREE.InstancedBufferAttribute(cores, 4).setUsage(
      THREE.DynamicDrawUsage,
    );

    // O quadrilátero base: dois triângulos, coordenadas -1..1 (não tem escala
    // própria — quem manda no tamanho é iMedidas, dentro do shader).
    const cantos = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

    const geometria = new THREE.InstancedBufferGeometry();
    geometria.setAttribute('position', new THREE.BufferAttribute(cantos, 3));
    geometria.setIndex(new THREE.BufferAttribute(indices, 1));
    geometria.setAttribute('iOrigem', atributoOrigem);
    geometria.setAttribute('iEixo', atributoEixo);
    geometria.setAttribute('iMedidas', atributoMedidas);
    geometria.setAttribute('iCor', atributoCor);
    geometria.instanceCount = TOTAL_FAGULHAS;

    return {
      origens,
      velocidades,
      medidas,
      cores,
      idades,
      vidas,
      atrasos,
      escalas,
      quiques,
      atributoOrigem,
      atributoEixo,
      atributoMedidas,
      atributoCor,
      geometria,
    };
  }, []);

  // ------------------------------------------------------------------- material
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        name: 'fagulhasDaForja',
        uniforms: {}, // nada a calibrar: as medidas já vêm em metros por instância
        vertexShader: SHADER_VERTICE,
        fragmentShader: SHADER_FRAGMENTO,
        transparent: true,
        depthWrite: false,
        depthTest: true, // a bigorna e o telhado ainda tapam as fagulhas atrás deles
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide, // a fita pode virar de costas quando a brasa volta a cair
        toneMapped: false,
      }),
    [],
  );

  // ------------------------------------------------------------------ descarte
  useEffect(() => {
    return () => {
      dados.geometria.dispose();
      material.dispose();
    };
  }, [dados, material]);

  // ------------------------------------------------- contador da martelada
  /** Segundos que faltam para a próxima martelada. A primeira vem logo ao montar. */
  const relogio = useRef(0.35);

  // ------------------------------------------------------------------- quadro
  useFrame((_estado, delta) => {
    const dt = delta > PASSO_MAXIMO ? PASSO_MAXIMO : delta;

    const {
      origens,
      velocidades,
      medidas,
      cores,
      idades,
      vidas,
      atrasos,
      escalas,
      quiques,
      atributoOrigem,
      atributoEixo,
      atributoMedidas,
      atributoCor,
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
    const freio = 1 - ARRASTO * dt;

    for (let i = 0; i < TOTAL_FAGULHAS; i++) {
      const i2 = i * 2;
      const i3 = i * 3;
      const i4 = i * 4;
      const atraso = atrasos[i];
      const fim = vidas[i] + atraso;

      if (idades[i] >= fim) continue; // já virou cinza

      const idade = idades[i] + dt;
      idades[i] = idade;

      if (idade >= fim) {
        // Morreu agora: preto com alfa zero não soma nada num blending aditivo,
        // e a fita encolhe para zero para não deixar risco fantasma no ar.
        cores[i4] = 0;
        cores[i4 + 1] = 0;
        cores[i4 + 2] = 0;
        cores[i4 + 3] = 0;
        medidas[i2] = 0;
        medidas[i2 + 1] = 0;
        velocidades[i3] = 0;
        velocidades[i3 + 1] = 0;
        velocidades[i3 + 2] = 0;
        sujo = true;
        continue;
      }

      if (idade < atraso) {
        // Ainda esperando a vez de sair do impacto: fica no lugar, invisível.
        medidas[i2] = 0;
        medidas[i2 + 1] = 0;
        cores[i4 + 3] = 0;
        sujo = true;
        continue;
      }

      // gravidade e arrasto do ar
      let vx = velocidades[i3] * freio;
      let vy = (velocidades[i3 + 1] + GRAVIDADE * dt) * freio;
      let vz = velocidades[i3 + 2] * freio;

      // integração
      let x = origens[i3] + vx * dt;
      let y = origens[i3 + 1] + vy * dt;
      let z = origens[i3 + 2] + vz * dt;

      // quique: primeiro no tampo da bigorna, depois no chão da ilha
      if (
        y < 0 &&
        vy < 0 &&
        x > -RAIO_DO_TAMPO &&
        x < RAIO_DO_TAMPO &&
        z > -RAIO_DO_TAMPO &&
        z < RAIO_DO_TAMPO
      ) {
        y = 0;
        const pancada = -vy;
        vy = pancada * RESTITUICAO_BIGORNA;
        vx *= 0.78;
        vz *= 0.78;
        if (pancada > QUIQUE_MINIMO && quiques[i] < QUIQUES_MAXIMOS) {
          quiques[i] += 1;
          vidas[i] = idade + VIDA_APOS_QUIQUE - atraso; // o pinote estica um pouco a brasa
        } else {
          vidas[i] = idade + VIDA_APOS_QUIQUE_FRACO - atraso; // encostou: apaga já
        }
      } else if (y < NIVEL_DO_CHAO && vy < 0) {
        y = NIVEL_DO_CHAO;
        const pancada = -vy;
        vy = pancada * RESTITUICAO_CHAO;
        vx *= 0.62;
        vz *= 0.62;
        if (pancada > QUIQUE_MINIMO && quiques[i] < QUIQUES_MAXIMOS) {
          quiques[i] += 1;
          vidas[i] = idade + VIDA_APOS_QUIQUE - atraso;
        } else {
          vidas[i] = idade + VIDA_APOS_QUIQUE_FRACO - atraso;
        }
      }

      origens[i3] = x;
      origens[i3 + 1] = y;
      origens[i3 + 2] = z;
      velocidades[i3] = vx;
      velocidades[i3 + 1] = vy;
      velocidades[i3 + 2] = vz;

      // esfriando e encolhendo
      let t = (idade - atraso) / vidas[i];
      if (t > 1) t = 1;
      pintarFagulha(t, cores, i4);

      // O rastro é o borrão de movimento: rápido = traço comprido, parado = ponto.
      const rapidez = Math.hypot(vx, vy, vz);
      medidas[i2] = comprimentoDoRastro(rapidez) * (1 - 0.2 * t);
      medidas[i2 + 1] = LARGURA_BASE * escalas[i] * (1 - 0.45 * t);

      sujo = true;
    }

    if (sujo) {
      atributoOrigem.needsUpdate = true;
      atributoEixo.needsUpdate = true;
      atributoMedidas.needsUpdate = true;
      atributoCor.needsUpdate = true;
    }
  });

  // --------------------------------------------------------------------- render
  return (
    <group position={posicao}>
      {/* Uma única chamada de desenho para as 112 fitas de fagulha. */}
      <mesh geometry={dados.geometria} material={material} frustumCulled={false} />
    </group>
  );
};
