/**
 * Floor12Trafego.tsx — o trânsito da cidade.
 *
 * O cenário era um quadro parado: torres, nuvens, dois dirigíveis. Uma cidade
 * de hotel no céu precisa de gente indo e vindo, e o jeito barato de dizer isso
 * é trânsito — carros voadores em faixas, nos dois sentidos, com farol e
 * lanterna acesos no crepúsculo.
 *
 * Regras que o trânsito obedece:
 *  - Fica ATRÁS e AOS LADOS da cabeça, nunca entre ela e o avião: nada que se
 *    mexe no campo de batalha pode ser confundido com um ataque.
 *  - Cores da paleta do hotel (creme, petróleo, vinho, latão), apagadas pela
 *    névoa: é pano de fundo. As luzes é que acendem (fora do tonemapping, para
 *    o bloom pegar), porque luz pequena longe é o que dá "cidade viva".
 *  - Tudo instanciado: 4 draw calls para todos os carros, custo de celular.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { f12 } from './f12Boss';

/** Uma faixa: altura, profundidade, sentido, velocidade e quantos carros. */
type Faixa = { y: number; z: number; sentido: 1 | -1; vel: number; n: number };

/** Metade do vão que os carros percorrem antes de dar a volta. */
const MEIO_VAO = 78;
const CORES = ['#d8cfb4', '#2f6f73', '#7c2f36', '#b9924c', '#3d4d6b', '#e0e3dc', '#5c7d4f'];

export function Floor12Trafego({ bossZ }: { bossZ: number }) {
    const faixas = useMemo<Faixa[]>(() => [
        // entre as torres do fundo
        { y: 4, z: bossZ - 60, sentido: 1, vel: 9, n: 6 },
        { y: 7.5, z: bossZ - 66, sentido: -1, vel: 11, n: 6 },
        { y: 14, z: bossZ - 90, sentido: 1, vel: 7, n: 5 },
        { y: 19, z: bossZ - 96, sentido: -1, vel: 8, n: 5 },
        // uma faixa alta, logo atrás da cabeça (mais perto que isso invadia o HUD)
        { y: 21, z: bossZ - 48, sentido: 1, vel: 12, n: 4 },
    ], [bossZ]);

    const carros = useMemo(() => {
        const lista: { faixa: Faixa; fase: number; cor: THREE.Color; bob: number }[] = [];
        faixas.forEach(f => {
            for (let i = 0; i < f.n; i++) {
                const r = Math.sin(lista.length * 12.9898) * 43758.5453;
                const acaso = r - Math.floor(r);
                lista.push({
                    faixa: f,
                    // espalhados pela faixa, com folga irregular (fila de carro de verdade)
                    fase: (i / f.n) * 2 * MEIO_VAO + acaso * 9,
                    cor: new THREE.Color(CORES[(lista.length * 3 + i) % CORES.length]),
                    bob: acaso * 6.28,
                });
            }
        });
        return lista;
    }, [faixas]);

    const geos = useMemo(() => {
        // carroceria baixa e comprida com "saias" de flutuador: sedã voador anos 50
        const corpo = new THREE.BoxGeometry(3.2, .7, 1.4);
        const cabine = new THREE.BoxGeometry(1.5, .55, 1.15); cabine.translate(-.15, .6, 0);
        const farol = new THREE.BoxGeometry(.14, .26, 1.4); farol.translate(1.62, 0, 0);
        const lanterna = new THREE.BoxGeometry(.14, .24, 1.4); lanterna.translate(-1.62, .05, 0);
        return { corpo, cabine, farol, lanterna };
    }, []);
    const mats = useMemo(() => ({
        corpo: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
        cabine: new THREE.MeshLambertMaterial({ color: '#1c2a33' }),
        farol: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2a8').multiplyScalar(2.2), toneMapped: false }),
        lanterna: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b2f').multiplyScalar(1.8), toneMapped: false }),
    }), []);
    useEffect(() => () => {
        Object.values(geos).forEach(g => g.dispose());
        Object.values(mats).forEach(m => m.dispose());
    }, [geos, mats]);

    const refs = {
        corpo: useRef<THREE.InstancedMesh>(null),
        cabine: useRef<THREE.InstancedMesh>(null),
        farol: useRef<THREE.InstancedMesh>(null),
        lanterna: useRef<THREE.InstancedMesh>(null),
    };

    useEffect(() => {
        const c = refs.corpo.current; if (!c) return;
        carros.forEach((carro, i) => c.setColorAt(i, carro.cor));
        if (c.instanceColor) c.instanceColor.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [carros]);

    const tmp = useMemo(() => new THREE.Object3D(), []);
    // ── A CIDADE REAGE À LUTA ────────────────────────────────────────────
    // Trânsito que só dá voltas é papel de parede. Depois da virada a cidade
    // entra em pânico: os carros FREIAM (a distância é acumulada, então a
    // freada é suave, sem salto) e o farol vira pisca-alerta âmbar.
    const andado = useRef(0);
    const ritmo = useRef(1);
    const farolNormal = useMemo(() => mats.farol.color.clone(), [mats]);
    const alerta = useMemo(() => new THREE.Color('#ffb020').multiplyScalar(2.6), []);
    useFrame(({ clock }, dt) => {
        const t = clock.elapsedTime;
        const panico = f12.passouDaVirada && f12.fase !== 'vitoria' && f12.fase !== 'despedida';
        ritmo.current += ((panico ? .35 : 1) - ritmo.current) * Math.min(1, dt * 1.5);
        andado.current += Math.min(dt, .1) * ritmo.current;
        if (panico) mats.farol.color.copy(Math.sin(t * 9) > 0 ? alerta : farolNormal);
        else mats.farol.color.copy(farolNormal);
        carros.forEach((carro, i) => {
            const f = carro.faixa;
            // posição ao longo da faixa, dando a volta no fim do vão
            const s = ((carro.fase + andado.current * f.vel) % (2 * MEIO_VAO) + 2 * MEIO_VAO) % (2 * MEIO_VAO);
            const x = f.sentido * (s - MEIO_VAO);
            tmp.position.set(x, f.y + Math.sin(t * 1.3 + carro.bob) * .18, f.z + (i % 2) * 1.8);
            // de frente para onde anda, com um tico de inclinação lateral
            tmp.rotation.set(0, f.sentido > 0 ? 0 : Math.PI, Math.sin(t * .9 + carro.bob) * .03);
            // 1,8×: no tamanho real um carro a 60 unidades virava um cisco.
            tmp.scale.setScalar(1.8);
            tmp.updateMatrix();
            for (const k of ['corpo', 'cabine', 'farol', 'lanterna'] as const) refs[k].current?.setMatrixAt(i, tmp.matrix);
        });
        for (const k of ['corpo', 'cabine', 'farol', 'lanterna'] as const) {
            const m = refs[k].current; if (m) m.instanceMatrix.needsUpdate = true;
        }
    });

    const n = carros.length;
    return <group name="transito-da-cidade">
        <instancedMesh ref={refs.corpo} args={[geos.corpo, mats.corpo, n]} frustumCulled={false} />
        <instancedMesh ref={refs.cabine} args={[geos.cabine, mats.cabine, n]} frustumCulled={false} />
        <instancedMesh ref={refs.farol} args={[geos.farol, mats.farol, n]} frustumCulled={false} />
        <instancedMesh ref={refs.lanterna} args={[geos.lanterna, mats.lanterna, n]} frustumCulled={false} />
    </group>;
}
