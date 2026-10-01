/**
 * f13Concluido — o cartão de fim do Andar 13: a cabine fechou, e antes do próximo andar o hóspede vê
 * o que fez em Vindhjem. Os três selos carimbam um por um (o mesmo carimbo do HUD), os números sobem,
 * e uma linha deixa a pista do final secreto para quem não o achou. Toque (ou 9 s) segue viagem.
 * Só DOM + CSS: a cena 3D já pode estar sendo desmontada por trás.
 */
import React, { useEffect, useRef, useState } from 'react';
import { SelosDasPistas } from './f13Selos';
import type { Pista } from './f13Lore';

export interface ResumoDoAndar {
    pistas: ReadonlySet<Pista>;
    segundos: number;
    portas: number;
    conversas: number;
    /** Maior nível a que o olho da vila chegou (0 a 3). */
    olho: number;
    /** O final da aceitação (ficar no banco com o Árni) foi visto. */
    segredo: boolean;
}
const ORDEM: Pista[] = ['latao', 'fumaca', 'botao'];
const OLHO = ['a vila nem reparou em você', 'a vila ficou de olho', 'a vila te seguiu', 'a vila inteira te encarou'];
/** Arredonda antes de dividir: 59,6 s é "1 min 00 s", não "0 min 60 s". */
const mmss = (seg: number) => { const s = Math.round(seg); return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`; };

export const CartaoDeConclusao: React.FC<{ resumo: ResumoDoAndar; aoFim: () => void; retrato: boolean }> = ({ resumo, aoFim, retrato }) => {
    // os selos entram um por um (o SelosDasPistas carimba cada pista nova)
    const [n, setN] = useState(0);
    const fim = useRef(aoFim); fim.current = aoFim;
    const saindo = useRef(false);
    const sair = () => { if (saindo.current) return; saindo.current = true; fim.current(); };
    useEffect(() => {
        const ids = [900, 1500, 2100].map((t, i) => window.setTimeout(() => setN(i + 1), t));
        ids.push(window.setTimeout(sair, 9000));
        return () => ids.forEach((id) => window.clearTimeout(id));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const mostradas = new Set(ORDEM.filter((p, i) => i < n && resumo.pistas.has(p)));
    const linha = (atraso: number, txt: React.ReactNode) => <div style={{ opacity: 0, animation: `f13cc-sobe .5s ${atraso}s ease-out forwards` }}>{txt}</div>;
    return (
        <div role="dialog" aria-label="Andar 13 concluído" onPointerDown={(ev) => { ev.stopPropagation(); if (n >= 3) sair(); }}
            style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'radial-gradient(ellipse at 50% 45%, rgba(40,26,14,.82), rgba(5,3,2,.96))', animation: 'f13cc-entra .8s ease-out both' }}>
            <style>{'@keyframes f13cc-entra{from{opacity:0}to{opacity:1}}@keyframes f13cc-sobe{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}'
                + '@keyframes f13cc-carta{0%{opacity:0;transform:scale(.86) rotate(-2deg)}60%{opacity:1;transform:scale(1.03) rotate(.5deg)}100%{opacity:1;transform:none}}'}</style>
            <div style={{ width: retrato ? 'calc(100vw - 40px)' : 420, maxWidth: 460, padding: retrato ? '22px 20px' : '26px 28px', borderRadius: 14,
                background: 'linear-gradient(180deg,#f3e5c4,#d9c399)', border: '3px solid #6b4a2e', boxShadow: '0 12px 40px rgba(0,0,0,.6), inset 0 0 0 2px rgba(255,250,235,.5)',
                fontFamily: 'Georgia, serif', color: '#2a1d14', textAlign: 'center', animation: 'f13cc-carta .7s .2s ease-out both' }}>
                <div style={{ fontSize: 13, letterSpacing: 4, color: '#7a2f1f', fontWeight: 700 }}>ᚨ ANDAR 13 CONCLUÍDO ᚨ</div>
                <div style={{ fontSize: retrato ? 30 : 34, fontWeight: 700, margin: '4px 0 2px', letterSpacing: 2 }}>VINDHJEM</div>
                <div style={{ fontSize: 13, opacity: .75, marginBottom: 12 }}>a vila que flutua nas nuvens deixou você ir</div>
                <div style={{ display: 'flex', justifyContent: 'center', transform: 'scale(1.5)', transformOrigin: '50% 0', marginBottom: 34 }}>
                    <SelosDasPistas pistas={mostradas} retrato={false} aberto={false} />
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.7 }}>
                    {linha(2.4, <>ᛞ {mmss(resumo.segundos)} em Vindhjem</>)}
                    {linha(2.7, <>ᚦ {resumo.portas} {resumo.portas === 1 ? 'porta batida' : 'portas batidas'} · ᚨ {resumo.conversas} {resumo.conversas === 1 ? 'conversa' : 'conversas'}</>)}
                    {linha(3.0, <>ᛟ {OLHO[Math.max(0, Math.min(3, resumo.olho))]}</>)}
                </div>
                {linha(3.6, <div style={{ marginTop: 12, fontSize: 13, fontStyle: 'italic', color: '#6b4a2e' }}>
                    {resumo.segredo ? 'Você também viu o outro final. Poucos ficam.' : 'Dizem que há outro jeito de sair de Vindhjem: sentar no banco com o velho Árni… e ficar.'}
                </div>)}
                {linha(4.2, <div style={{ marginTop: 14, fontSize: 12, letterSpacing: 2, opacity: .7 }}>TOQUE PARA SUBIR AO PRÓXIMO ANDAR</div>)}
            </div>
        </div>
    );
};
