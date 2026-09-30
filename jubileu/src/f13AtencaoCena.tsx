/**
 * f13AtencaoCena.tsx — "Os Olhos da Vila", a parte que se vê e se ouve.
 *
 *  - `AtencaoNoMundo` (dentro do Canvas): o relógio do medidor, o desafino do
 *    ambiente e a silhueta do Halvard possuído atrás do jogador. Nenhuma luz
 *    nova (trocar o número de luzes recompila todos os shaders) e nenhuma
 *    alocação por quadro: vetores e geometrias são criados uma vez.
 *  - `OlhoDaVila` (HUD): o olho discreto na borda da tela, sem número, e os
 *    avisos da primeira vez que cada limiar é cruzado.
 * A lógica pura mora em f13Atencao.ts.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
    atencao, zerarAtencao, passoDaAtencao, desafinoEmCents, aberturaDoOlho, type EntradaDoQuadro, type Fontes,
} from './f13Atencao';
import { gatos } from './f13Gatos';
import { busca } from './f13Busca';
import { sinos } from './f13Sinos';
import { chaoEm, dentroDeCasa, type Estado13, entidadeAcorda } from './f13Mundo';
import type { IdNpc } from './f13Lore';
import { desafinarAmbiente, tocarGlitch, tocarBatimento, tocarSussurro } from './floor13Sfx';

/** A silhueta acabou de surgir atrás do jogador: o HUD avisa (lido a cada 250 ms). */
export const dicaDeOlhar = { pendente: false, ultima: -99 };

export interface JogAtencao { x: number; y: number; z: number; andando: number }

const VERDE = '#3dff8a';
const ALCANCE_DO_OLHAR = 16;
const COS_ENCARAR = Math.cos(.2);
const COS_VIROU = Math.cos(.55);
const ATE_A_SILHUETA = 6.2;
const ESPERA_DEPOIS_DE_SUMIR = 8;
const OFFSETS = [0, .5, -.5, 1, -1, 1.5, -1.5];

/** Um lugar 6 m atrás do olhar, em chão firme e fora de casas; false se não achou. */
function lugarAtras(px: number, pz: number, dx: number, dz: number, saida: { x: number; z: number }): boolean {
    const base = Math.atan2(-dx, -dz);
    for (let i = 0; i < OFFSETS.length; i++) {
        const a = base + OFFSETS[i];
        const x = px + Math.sin(a) * ATE_A_SILHUETA, z = pz + Math.cos(a) * ATE_A_SILHUETA;
        if (chaoEm(x, z) !== null && !dentroDeCasa(x, z, .8)) { saida.x = x; saida.z = z; return true; }
    }
    return false;
}

/** A silhueta: preto esverdeado, olhos verdes de possessão, um braço puxado pelo fio. */
const Silhueta: React.FC<{ grupo: React.RefObject<THREE.Group | null>; corpo: THREE.MeshBasicMaterial; olhos: THREE.MeshBasicMaterial }> = ({ grupo, corpo, olhos }) => {
    const g = useMemo(() => ({
        tronco: new THREE.CapsuleGeometry(.24, .78, 3, 8), cabeca: new THREE.SphereGeometry(.17, 10, 8),
        perna: new THREE.CylinderGeometry(.1, .08, .9, 6), braco: new THREE.CylinderGeometry(.06, .05, .8, 6),
        olho: new THREE.SphereGeometry(.028, 6, 4),
    }), []);
    useEffect(() => () => Object.values(g).forEach((x) => x.dispose()), [g]);
    return (
        <group ref={grupo} visible={false} name="olhosDaVilaSilhueta">
            <mesh geometry={g.tronco} material={corpo} position={[0, 1.25, 0]} />
            <mesh geometry={g.cabeca} material={corpo} position={[0, 1.86, 0]} rotation={[0, 0, .28]} />
            <mesh geometry={g.perna} material={corpo} position={[-.12, .45, 0]} />
            <mesh geometry={g.perna} material={corpo} position={[.12, .45, 0]} />
            <mesh geometry={g.braco} material={corpo} position={[.34, 1.1, 0]} rotation={[0, 0, .1]} />
            <mesh geometry={g.braco} material={corpo} position={[-.4, 1.62, .18]} rotation={[.9, 0, -.5]} />
            <mesh geometry={g.olho} material={olhos} position={[-.06, 1.88, .15]} />
            <mesh geometry={g.olho} material={olhos} position={[.06, 1.9, .15]} />
        </group>
    );
};

export const AtencaoNoMundo: React.FC<{
    jog: React.MutableRefObject<JogAtencao>;
    est: React.MutableRefObject<Estado13>;
    npcOnde: Record<IdNpc, React.MutableRefObject<{ x: number; z: number }>>;
    /** 'explorar' (o jogador anda e olha livremente). */
    ativo: boolean;
    /** Conta quando o jogo está rodando (fora da queda e da saída). */
    correndo: boolean;
    sentado: () => boolean;
}> = ({ jog, est, npcOnde, ativo, correndo, sentado }) => {
    const grupo = useRef<THREE.Group>(null);
    const corpo = useMemo(() => new THREE.MeshBasicMaterial({ color: '#020c06', transparent: true, opacity: 0, depthWrite: false }), []);
    const olhos = useMemo(() => new THREE.MeshBasicMaterial({ color: VERDE, toneMapped: false }), []);
    useEffect(() => () => { corpo.dispose(); olhos.dispose(); }, [corpo, olhos]);
    const tmp = useMemo(() => ({ dir: new THREE.Vector3(), ponto: { x: 0, z: 0 } }), []);
    const entrada = useMemo<EntradaDoQuadro>(() => ({ encarando: false, andando: false, sentado: false }), []);
    const fontes = useMemo<Fontes>(() => ({ gatos: 0, graveto: 0, sinos: false, ovelhas: 0 }), []);
    const s = useRef({ vivo: false, x: 0, z: 0, t: 0, espera: 3, olhou: 0, cents: 0, tCents: 0 });

    // o medidor recomeça a cada entrada no andar
    useEffect(() => { zerarAtencao(); }, []);

    useFrame(({ camera, clock }, rawDt) => {
        const dt = Math.min(rawDt, 1), t = clock.elapsedTime, j = jog.current, e = est.current, st = s.current;
        if (!correndo) { if (grupo.current) grupo.current.visible = false; st.vivo = false; return; }
        camera.getWorldDirection(tmp.dir);
        const cx = tmp.dir.x, cz = tmp.dir.z, ch = Math.hypot(cx, cz) || 1;

        // ── encarar o Halvard possuído / a entidade ───────────────────────
        let encarando = false;
        if (ativo && e.entidade !== 'caido' && (e.entidade === 'falando' || entidadeAcorda(e))) {
            const h = npcOnde.halvard.current, y = (chaoEm(h.x, h.z) ?? 0) + 1.5;
            const vx = h.x - camera.position.x, vy = y - camera.position.y, vz = h.z - camera.position.z;
            const d = Math.hypot(vx, vy, vz);
            if (d < ALCANCE_DO_OLHAR && d > .1) encarando = (vx * tmp.dir.x + vy * tmp.dir.y + vz * tmp.dir.z) / d > COS_ENCARAR;
        }
        entrada.encarando = encarando; entrada.andando = ativo && j.andando > .5; entrada.sentado = sentado();
        fontes.gatos = gatos.alimentados; fontes.graveto = busca.entregas; fontes.sinos = sinos.resolvido;
        let ov = 0; for (let i = 0; i < e.ovelhas.length; i++) if (e.ovelhas[i]) ov++;
        fontes.ovelhas = ov;
        passoDaAtencao(dt, entrada, fontes);

        // ── o ambiente desafina (só re-aplica quando muda, e de 1,5 em 1,5 s) ──
        st.tCents += dt;
        if (st.tCents > 1.5) {
            st.tCents = 0;
            const c = desafinoEmCents();
            if (Math.abs(c - st.cents) >= 1 || c !== 0) { st.cents = c; desafinarAmbiente(c); }
        }

        // ── a silhueta atrás do jogador (nível >= 2) ──────────────────────
        const g = grupo.current; if (!g) return;
        if (!ativo || atencao.nivel < 2) { g.visible = false; st.vivo = false; corpo.opacity = 0; st.espera = Math.max(st.espera, 2); return; }
        if (!st.vivo) {
            st.espera -= dt;
            if (st.espera > 0) { g.visible = false; return; }
            if (!lugarAtras(j.x, j.z, cx / ch, cz / ch, tmp.ponto)) { st.espera = .5; return; }
            st.vivo = true; st.x = tmp.ponto.x; st.z = tmp.ponto.z; st.t = 0; st.olhou = 0;
            // ninguém a vê nascer atrás da câmera: um sussurro e um aviso mandam o jogador virar
            tocarSussurro();
            if (t - dicaDeOlhar.ultima > 25) { dicaDeOlhar.ultima = t; dicaDeOlhar.pendente = true; }
        }
        st.t += dt;
        const dx = st.x - camera.position.x, dz = st.z - camera.position.z, dist = Math.hypot(dx, dz) || 1;
        // se o jogador se afasta demais, ela some (e reaparece atrás de novo)
        const sumir = () => { st.vivo = false; st.espera = ESPERA_DEPOIS_DE_SUMIR; g.visible = false; corpo.opacity = 0; };
        if (dist > 20 || st.t > 30) { st.espera = 1; sumir(); st.espera = 1; return; }
        // o olhar chega nela: some sem deixar rastro (só um chiado curto)
        const olhando = (dx * cx + dz * cz) / (dist * ch) > COS_VIROU;
        st.olhou = olhando ? st.olhou + dt : 0;
        if (st.t > .25 && st.olhou > 0) { tocarGlitch(); sumir(); return; }
        const q = Math.floor(t * 14);
        g.visible = q % 23 !== 0;
        g.position.set(st.x, chaoEm(st.x, st.z) ?? j.y, st.z);
        g.rotation.y = Math.atan2(camera.position.x - st.x, camera.position.z - st.z);
        g.scale.set(1 + (((q * 7919) % 5) - 2) * .02, 1, 1);
        corpo.opacity = Math.min(.88, st.t / .8);
    });

    return <Silhueta grupo={grupo} corpo={corpo} olhos={olhos} />;
};

// ═══ HUD ═════════════════════════════════════════════════════════════════════
const AVISOS = [
    '',
    'O som da vila ficou meio fora do tom. Dá a impressão de que todo mundo te acompanha com o canto do olho.',
    'Você tem a sensação de que tem alguém logo atrás de você.',
];
const AVISO_VERDE = { titulo: 'A VILA INTEIRA ESTÁ DE OLHO EM VOCÊ', corpo: 'O que os moradores contam agora pode estar errado.' };

const Olho: React.FC<{ abertura: number; nivel: number }> = ({ abertura, nivel }) => {
    // pálpebras: duas curvas que se afastam do eixo; a íris cresce junto
    const o = .1 + abertura * .9, alto = 11 * o, cor = nivel >= 2 ? VERDE : '#FFE3A0';
    const forma = `M3 14 Q24 ${14 - alto * 1.9} 45 14 Q24 ${14 + alto * 1.9} 3 14 Z`;
    return (
        <svg width="48" height="30" viewBox="0 0 48 28" style={{ display: 'block', overflow: 'visible' }}>
            <defs><clipPath id="f13olhoClip"><path d={forma} /></clipPath></defs>
            <path d={forma} fill="rgba(6,10,8,.7)" stroke={cor} strokeWidth="2.6" strokeLinejoin="round" />
            <g clipPath="url(#f13olhoClip)">
                <circle cx="24" cy="14" r={Math.max(.1, 3.5 + abertura * 5.5)} fill={cor} />
                <circle cx="24" cy="14" r={Math.max(.1, 1.6 + abertura * 2.2)} fill="#050805" />
            </g>
        </svg>
    );
};

export const OlhoDaVila: React.FC<{ visivel: boolean; avisar: (texto: string) => void }> = ({ visivel, avisar }) => {
    const [estado, setEstado] = useState({ ab: 0, nivel: 0 });
    const [verde, setVerde] = useState(false);
    const [pulso, setPulso] = useState(0);
    const nivelAnt = useRef(0);
    const avisarRef = useRef(avisar); avisarRef.current = avisar;
    useEffect(() => {
        const id = window.setInterval(() => {
            // 12 degraus: o olho abre em passos, sem redesenhar a cada décimo
            const ab = Math.round(aberturaDoOlho() * 12) / 12;
            setEstado((p) => (p.ab === ab && p.nivel === atencao.nivel ? p : { ab, nivel: atencao.nivel }));
            // o nível subiu: batimento grave e o selo pulsa
            if (atencao.nivel > nivelAnt.current) { tocarBatimento(atencao.nivel); setPulso((p) => p + 1); }
            nivelAnt.current = atencao.nivel;
            if (dicaDeOlhar.pendente) { dicaDeOlhar.pendente = false; avisarRef.current('Você sente alguém atrás de você…'); }
            const n = atencao.pendente;
            if (n) { atencao.pendente = 0; if (n >= 3) setVerde(true); else avisarRef.current(AVISOS[n]); }
        }, 250);
        return () => window.clearInterval(id);
    }, []);
    useEffect(() => { if (!verde) return; const id = window.setTimeout(() => setVerde(false), 7500); return () => window.clearTimeout(id); }, [verde]);
    const retrato = typeof window !== 'undefined' && window.innerWidth < window.innerHeight;
    return <>
        {visivel && <div aria-hidden style={{ position: 'absolute', right: 8, top: '38%', pointerEvents: 'none' }}>
            {/* remonta a cada subida de nível para reiniciar o pulso */}
            <div key={pulso} style={{
                padding: '6px 7px 5px', borderRadius: 10, background: 'rgba(6,10,8,.72)',
                border: `2px solid ${estado.nivel >= 2 ? VERDE : estado.nivel === 1 ? '#FFE3A0' : 'rgba(255,227,160,.55)'}`,
                boxShadow: estado.nivel >= 2 ? `0 0 ${8 + estado.ab * 10}px ${VERDE}` : '0 0 6px rgba(0,0,0,.6)',
                opacity: .7 + estado.ab * .3, transition: 'opacity .6s, box-shadow .6s, border-color .6s',
                animation: estado.nivel >= 3 ? 'f13olhoTreme .25s steps(2) infinite' : pulso > 0 ? `f13olhoPulso 1.4s ease-out 1${estado.nivel >= 2 ? ', f13olhoBate 1.6s ease-in-out 1.4s infinite' : ''}` : estado.nivel >= 2 ? 'f13olhoBate 1.6s ease-in-out infinite' : undefined,
            }}>
                <Olho abertura={estado.ab} nivel={estado.nivel} />
            </div>
            <style>{'@keyframes f13olhoTreme{0%{transform:translate(0,0)}50%{transform:translate(-2px,1px)}100%{transform:translate(1px,-1px)}}@keyframes f13olhoPulso{0%{transform:scale(1)}18%{transform:scale(1.5)}40%{transform:scale(1.1)}60%{transform:scale(1.35)}100%{transform:scale(1)}}@keyframes f13olhoBate{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}'}</style>
        </div>}
        {visivel && verde && <div role="status" style={{
            position: 'absolute', top: 'calc(env(safe-area-inset-top) + 56px)', pointerEvents: 'none', textAlign: 'center',
            ...(retrato ? { left: 12, right: 12, margin: '0 auto', width: 'fit-content', maxWidth: 'calc(100vw - 24px)' } : { left: 330, right: 16, margin: '0 auto', width: 'fit-content', maxWidth: 'calc(100vw - 346px)', top: 'calc(env(safe-area-inset-top) + 8px)' }),
            background: 'rgba(4,14,8,.93)', border: `2px solid ${VERDE}`, borderRadius: 6, padding: '8px 12px',
            boxShadow: '0 0 18px rgba(61,255,138,.35)', fontFamily: 'monospace', animation: 'f13olhoTreme .18s steps(2) infinite',
        }}>
            <div style={{ color: VERDE, fontWeight: 900, fontSize: 12, letterSpacing: 1.5, marginBottom: 3 }}>{AVISO_VERDE.titulo}</div>
            <div style={{ color: '#b8ffd2', fontSize: 14, lineHeight: 1.3 }}>{AVISO_VERDE.corpo}</div>
        </div>}
    </>;
};
