/**
 * f7Space.ts — Andar 7 "Constelação" (espaço, gravidade baixa).
 *
 * Módulo PURO (zero imports) com o mundo lógico do andar: ilhas flutuantes
 * num caminho ascendente, 7 estrelas coletáveis e respawn por checkpoint.
 * O Player.tsx tem um branch `currentLevel === 7` que espelha a física do
 * Floor 3, mas com gravidade/pulo LUNARES lidos daqui — pulo mais alto, queda
 * mais lenta, e cair no vazio só te devolve pro último checkpoint pisado.
 *
 * Física de referência (pra manter o layout SEMPRE pulável — o teste
 * f7Space.test.ts trava isso):
 *   altura máx de pulo  = J²/(2g)      ≈ 2.4
 *   tempo no ar (plano) = 2·J/g        ≈ 1.5s
 *   alcance horizontal  = SPEED·tempo  ≈ 6.0  (SPEED=4 do jogo)
 */

export const F7_GRAVITY = 8.5;    // bem menor que os 22 do Floor 3 — lua
export const F7_JUMP    = 6.4;
export const F7_VOID_Y  = -14;    // caiu além disso → respawn no checkpoint

export interface F7Platform {
    cx: number; cz: number;       // centro em XZ
    hw: number; hd: number;       // meia-largura / meia-profundidade
    topY: number;                 // nível do pé do player
}

// Caminho ascendente em zigue-zague. A plataforma 0 é o pad inicial na frente
// do elevador (mesma pegada do START do Floor 3: cobre a saída da cabine).
export const F7_PLATFORMS: readonly F7Platform[] = [
    { cx: 0,    cz: -5.0, hw: 6.5, hd: 4.5, topY: 0    },   // 0 START (elevador)
    { cx: 0,    cz:  2.5, hw: 1.6, hd: 1.6, topY: 0.6  },   // 1
    { cx: 2.5,  cz:  6.5, hw: 1.5, hd: 1.5, topY: 1.4  },   // 2
    { cx: -0.5, cz: 10.5, hw: 1.5, hd: 1.5, topY: 2.2  },   // 3
    { cx: -4.0, cz: 13.5, hw: 1.4, hd: 1.4, topY: 3.0  },   // 4
    { cx: -7.0, cz: 17.0, hw: 1.4, hd: 1.4, topY: 3.6  },   // 5
    { cx: -3.5, cz: 20.5, hw: 1.4, hd: 1.4, topY: 4.4  },   // 6
    { cx: 0.5,  cz: 23.0, hw: 1.4, hd: 1.4, topY: 5.2  },   // 7
    { cx: 4.5,  cz: 25.5, hw: 1.3, hd: 1.3, topY: 5.8  },   // 8
    { cx: 8.0,  cz: 28.5, hw: 1.3, hd: 1.3, topY: 6.6  },   // 9
    { cx: 4.5,  cz: 32.0, hw: 1.3, hd: 1.3, topY: 7.4  },   // 10
    { cx: 0,    cz: 34.5, hw: 1.3, hd: 1.3, topY: 8.2  },   // 11
    { cx: -4.5, cz: 37.0, hw: 1.3, hd: 1.3, topY: 9.0  },   // 12
    { cx: -8.0, cz: 40.0, hw: 1.3, hd: 1.3, topY: 9.8  },   // 13
    { cx: -4.0, cz: 43.5, hw: 1.4, hd: 1.4, topY: 10.6 },   // 14
    { cx: 0,    cz: 46.5, hw: 3.0, hd: 3.0, topY: 11.4 },   // 15 MIRANTE (fim)
];

// As 7 estrelas da constelação — flutuam 1.2 acima da plataforma-âncora.
const STAR_PLATFORMS = [1, 5, 7, 9, 11, 13, 15] as const;
export const F7_STAR_COUNT = STAR_PLATFORMS.length;
export const F7_STARS: readonly { id: number; x: number; y: number; z: number }[] =
    STAR_PLATFORMS.map((pi, id) => {
        const p = F7_PLATFORMS[pi];
        return { id, x: p.cx, y: p.topY + 1.2, z: p.cz };
    });

// ── Estado compartilhado (padrão f3Hazards/f6Maze) ───────────────────────────
export const f7State = {
    stars: 0,
    needed: F7_STAR_COUNT,
    won: false,
};
const starTaken: boolean[] = new Array(F7_STAR_COUNT).fill(false);
export const f7StarTaken = (i: number): boolean => starTaken[i];

// Último checkpoint: índice da última plataforma PISADA (Player.tsx escreve
// quando aterrissa; cair no vazio respawna aqui em vez de zerar a subida).
export const f7Checkpoint = { current: 0 };
export function f7RespawnPoint(): { x: number; y: number; z: number } {
    const p = F7_PLATFORMS[Math.max(0, Math.min(F7_PLATFORMS.length - 1, f7Checkpoint.current))];
    return { x: p.cx, y: p.topY + 0.1, z: p.cz };
}

let onProgress: (() => void) | null = null;
export function setOnF7Progress(cb: (() => void) | null): void { onProgress = cb; }
const notify = () => { if (onProgress) onProgress(); };

/** Coleta por proximidade (xz < 1.3 e altura compatível). Índice ou -1. */
export function f7TryCollectStar(x: number, y: number, z: number): number {
    for (const st of F7_STARS) {
        if (!starTaken[st.id]) {
            const dx = x - st.x, dz = z - st.z;
            const dy = st.y - y;                        // estrela acima do pé
            if (dx * dx + dz * dz < 1.69 && dy > -0.6 && dy < 2.4) {
                starTaken[st.id] = true;
                f7State.stars++;
                if (f7State.stars >= f7State.needed) f7State.won = true;
                notify();
                return st.id;
            }
        }
    }
    return -1;
}

export function f7Reset(): void {
    f7State.stars = 0;
    f7State.won = false;
    starTaken.fill(false);
    f7Checkpoint.current = 0;
}
