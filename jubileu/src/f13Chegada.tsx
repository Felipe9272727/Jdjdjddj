/* ─────────────────────────────────────────────────────────────────────────
   f13Chegada.tsx — gancho de abertura de 20–40 s.

   Dispara quando `ativo` vira true (fim da queda). Faz três arremessos do
   graveto da busca rumo ao sino, em pontos validados por chaoEm(); cada
   passo só fecha quando o jogador anda até o alvo anterior (teto de tempo
   garante progresso mesmo passivo). Ao fim, assume o aviso "0/3 pistas"
   com distância + rumo vivos até o primeiro pisteiro.

   Não importa, cria, altera nem desliga nenhuma fonte de iluminação.
   Não aloca nada por quadro. Não remove nem substitui nada existente.
   ───────────────────────────────────────────────────────────────────────── */

import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { busca } from './f13Busca';
import { chaoEm, INICIO, SINO } from './f13Mundo';
import * as THREE from 'three';

// ── Tipos e nomes ────────────────────────────────────────────────────────
interface Ponto { x: number; z: number }

const _origem = new THREE.Vector3(), _dir = new THREE.Vector3();
const ID_PISTEIRO = 'ragnhild' as const;

const NOME_DE: Readonly<Record<string, string>> = Object.freeze({
    ragnhild: 'RAGNHILD', ulfgar: 'ULFGAR', eira: 'EIRA',
    brokk: 'BROKK', sigrun: 'SIGRUN', torvald: 'TORVALD',
});

// -Z é NORTE, +X é LESTE (convenção de three).
const ROSA: ReadonlyArray<string> = Object.freeze([
    'NORTE', 'NORDESTE', 'LESTE', 'SUDESTE',
    'SUL', 'SUDOESTE', 'OESTE', 'NOROESTE',
]);

/** Rumo em palavra: só indexa array congelado — zero alocação. */
function rumoDe(dx: number, dz: number): string {
    const i = Math.round(Math.atan2(dx, -dz) / (Math.PI / 4));
    return ROSA[((i % 8) + 8) % 8];
}

// ── Geografia do gancho (calculada uma vez, no carregamento) ─────────────
const DX = SINO.x - INICIO.x;
const DZ = SINO.z - INICIO.z;
const DIST_SINO = Math.hypot(DX, DZ) || 1;
const RX = DX / DIST_SINO;
const RZ = DZ / DIST_SINO;

/** Ponto a `d` metros do feno na direção do sino, encostado em chão firme. */
function pontoFirmeEm(d: number): Ponto {
    for (let k = 0; k <= 6; k += 0.5) {
        const x = INICIO.x + RX * (d - k);
        const z = INICIO.z + RZ * (d - k);
        if (chaoEm(x, z) !== null) return { x, z };
    }
    return { x: INICIO.x, z: INICIO.z };
}

/** Até onde dá para ir sem cair no vazio (vão de até 4 m conta como ponte). */
const ALCANCE = (() => {
    let ultimo = 0, vazio = 0;
    for (let d = 1; d <= DIST_SINO - 2; d += 0.5) {
        if (chaoEm(INICIO.x + RX * d, INICIO.z + RZ * d) !== null) {
            ultimo = d; vazio = 0;
        } else {
            vazio += 0.5;
            if (vazio > 4) break;
        }
    }
    return Math.max(ultimo, 6);
})();

const ALVO_1 = pontoFirmeEm(ALCANCE / 3);
const ALVO_2 = pontoFirmeEm((ALCANCE * 2) / 3);
const ALVO_3 = pontoFirmeEm(ALCANCE);
const ALVOS: ReadonlyArray<Ponto> = Object.freeze([ALVO_1, ALVO_2, ALVO_3]);

const CHEGOU = 4;    // metros: "o jogador andou até aqui" fecha antes do teto
const TETO_1 = 14;   // s
const TETO_2 = 26;   // s
const TETO_3 = 40;   // s

// ── Passos ───────────────────────────────────────────────────────────────
interface Passo {
    teto: number;       // teto em segundos desde que o passo anterior fechou
    aviso: string;
    arremesso: number;  // índice em ALVOS, ou -1
    perto: number;      // índice em ALVOS cuja proximidade antecipa o passo, ou -1
}

const PASSOS: ReadonlyArray<Passo> = Object.freeze([
    { teto: 0, aviso: 'Um cão vem correndo pelo feno, rabo em pé, com um graveto na boca.', arremesso: -1, perto: -1 },
    { teto: 2, aviso: 'Ele larga o graveto aos seus pés… e pega de volta, e dispara rumo à vila.', arremesso: 0, perto: -1 },
    { teto: TETO_1, aviso: 'O shiba late lá adiante, no caminho. Quer que você vá junto.', arremesso: 1, perto: 0 },
    { teto: TETO_2, aviso: 'Da praça vêm gritos de criança: “Caiu um! Caiu um no feno!”', arremesso: 2, perto: 1 },
    { teto: TETO_3, aviso: 'A vila está logo ali. Alguém ali deve saber o que é este lugar.', arremesso: -1, perto: 2 },
]);

// ── Componente ───────────────────────────────────────────────────────────
export const GanchoDaChegada: React.FC<{
    ativo: boolean;
    jog: React.MutableRefObject<{ x: number; y: number; z: number }>;
    avisar: (texto: string) => void;
}> = ({ ativo, jog, avisar }) => {
    const passo = useRef(-1);
    const t = useRef(0);
    const ultimaDist = useRef(-1);
    // conta pelo relógio real (não pelo dt do quadro, que trava em quadros lentos)
    const ultimoRelogio = useRef(0);

    useEffect(() => {
        passo.current = -1;
        t.current = 0;
        ultimaDist.current = -1;
    }, [ativo]);

    useFrame(() => {
        if (!ativo) return;
        const p = jog.current;
        const agoraS = performance.now() / 1000;
        if (import.meta.env.DEV) (window as unknown as { __chegada?: unknown }).__chegada = { passo: passo.current, t: t.current, arremessar: !!busca.arremessar };

        // 1) Máquina de passos ──────────────────────────────────────────
        const prox = passo.current + 1;
        if (prox < PASSOS.length) {
            t.current += Math.min(1, agoraS - (ultimoRelogio.current || agoraS));
            ultimoRelogio.current = agoraS;
            const s = PASSOS[prox];

            let dentro = false;
            if (s.perto >= 0) {
                const a = ALVOS[s.perto];
                const dx = p.x - a.x;
                const dz = p.z - a.z;
                dentro = dx * dx + dz * dz <= CHEGOU * CHEGOU;
            }
            if (!dentro && t.current < s.teto) return;

            passo.current = prox;
            t.current = 0;
            ultimaDist.current = -1;
            avisar(s.aviso);

            if (s.arremesso >= 0) {
                const a = ALVOS[s.arremesso];
                // arremesso de 45° que cai no alvo: alcance = v²/g
                const o = busca.graveto, dx = a.x - o.x, dz = a.z - o.z, d = Math.max(.5, Math.hypot(dx, dz));
                _origem.set(o.x, (chaoEm(o.x, o.z) ?? o.y) + 1.1, o.z);
                _dir.set(dx / d, 1, dz / d);
                busca.arremessar?.(_origem, _dir, Math.sqrt(d * 9.8));
            }
            return;
        }

    });

    return null;
};

export default GanchoDaChegada;
