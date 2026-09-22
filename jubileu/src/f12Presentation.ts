/** Shared staging for the elevator-to-aircraft transformation. Progress is
 * normalized so gameplay remains responsible for entering and leaving intro. */
const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const f12Ease = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const stage = (p: number, a: number, b: number) => f12Ease((p - a) / (b - a));

export function f12Transformation(progress: number) {
  const p = clamp(progress);
  return {
    doors: stage(p, .04, .24),
    shell: stage(p, .15, .48),
    wings: stage(p, .27, .62),
    tail: stage(p, .38, .69),
    canopy: stage(p, .19, .46),
    engine: stage(p, .48, .76),
    flight: stage(p, .66, .94),
    companion: stage(p, .70, .92),
    reveal: stage(p, .78, 1),
    wingRebound: Math.sin(Math.PI * clamp((p - .43) / .25)) * (1 - stage(p, .56, .70)),
  };
}

export const F12_PALETTE = {
  sky: '#222138',
  fog: '#234354',
  brass: '#d5aa56',
  brassDark: '#775229',
  ivory: '#eee1bf',
  hull: '#245264',
  hullDark: '#112b39',
  glass: '#82d9dc',
  friendly: '#71fff0',
  danger: '#ff684b',
  ritual: '#c19bff',
};

/** Cinematic marks relative to the plane. The last mark is the gameplay
 * chase camera, so taking control does not require a hard camera cut. */
/** Hold the cabin reveal, orbit the unfolding wings, then follow the wingman. */
export function f12IntroCamera(progress: number) {
  const p = clamp(progress);
  const exterior = stage(p, .22, .48);
  const orbit = stage(p, .48, .69);
  const formation = stage(p, .69, .91);
  return {
    x: 5.6 * exterior - 9.1 * orbit + 3.5 * formation,
    y: .35 + 1.9 * exterior + .6 * orbit,
    z: .55 + 5.8 * exterior + 3.8 * orbit + .8 * formation,
    targetY: .35 + .45 * exterior,
    targetZ: -4 + 3.4 * exterior - 6 * formation,
    fov: 57 + 7 * exterior - 4 * formation,
  };
}

export function f12ChaseDistance(aspect: number) {
  return 19 - 7 * f12Ease((aspect - .65) / .65);
}

/**
 * ── O `fov` VERTICAL TEM DE ENCOLHER EM PAISAGEM ─────────────────────────────
 *
 * `ENQUADRAMENTO.fov` é 62 e foi composto para um CELULAR EM PÉ. O `fov` do
 * three é VERTICAL, e a abertura horizontal sai de `tan(fov/2) * aspecto` — ou
 * seja, virar o aparelho não corta o quadro, ele ALARGA. Medido a 844x390, com
 * a câmera já no recuo de paisagem (12 unidades):
 *
 *     largura do quadro = 2 * 12 * tan(31°) * 2,164 = 31 unidades
 *     largura da arena  = 9,8
 *
 * A arena ocupava menos de um terço da tela. O resto eram bancos de nuvem
 * vazios dos dois lados, e a cabeça — que em retrato domina o quadro — virava
 * um quinto da largura. O chefe deixava de ser colossal só porque o jogador
 * deitou o telefone.
 *
 * Encolher o `fov` resolve os dois lados de uma vez, e é melhor do que só
 * aproximar a câmera: aproximar mexe no enquadramento do AVIÃO (a câmera é de
 * perseguição), enquanto fechar a lente aumenta tudo sem mudar a distância de
 * jogo. A trava por baixo é a altura: a arena tem 7,2 de altura e precisa caber.
 *
 *     a 12 unidades e 38°: vertical = 2 * 12 * tan(19°) = 8,3  (cabe em 7,2)
 *                          horizontal = 8,3 * 2,164   = 17,9 (arena 9,8)
 *
 * Em retrato nada muda — a conta devolve os mesmos 62 de sempre.
 */
export function f12ChaseFov(aspect: number) {
  return 62 - 24 * f12Ease((aspect - .65) / .65);
}

/** Quanto do mundo cabe na ALTURA do quadro, à distância `d` e com este `fov`. */
export function f12FrameHeight(d: number, fov: number) {
  return 2 * d * Math.tan((fov * Math.PI) / 180 / 2);
}
