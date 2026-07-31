// O aviso que aparece quando o jogo foi aberto numa URL de deploy.
//
// Ele existe porque o prejuízo é invisível até ser tarde: a tela é idêntica, o
// jogo abre igual, e só quando o Andar 10 começa a baixar 4,2 GB é que dá para
// perceber que este Chrome está num cofre vazio. Aqui a informação chega ANTES
// do primeiro byte.
//
// Quando os dois lados estão no mesmo commit o salto já aconteceu sozinho
// (origemEstavel.ts) e este componente nunca chega a desenhar nada.
import React, { useEffect, useState } from 'react';
import {
    avaliarOrigem,
    ficarNestaOrigem,
    identidadeDoBuild,
    ORIGEM_ESTAVEL,
    type BuildStamp,
    type Veredito,
} from './origemEstavel';

/** "2 h atrás" — o dado que decide se o endereço fixo está velho demais. */
function quandoFoi(iso: string): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    const min = Math.round((Date.now() - t) / 60_000);
    if (min < 2) return 'agora';
    if (min < 60) return `${min} min atrás`;
    const h = Math.round(min / 60);
    if (h < 48) return `${h} h atrás`;
    return `${Math.round(h / 24)} dias atrás`;
}

function descreve(stamp: BuildStamp | null): string {
    if (!stamp) return 'build desconhecido';
    const quando = quandoFoi(stamp.built);
    const ref = stamp.ref ? ` · ${stamp.ref}` : '';
    return `${identidadeDoBuild(stamp) ?? '?'}${ref}${quando ? ` · ${quando}` : ''}`;
}

export function OrigemEstavelAviso(): React.ReactElement | null {
    const [veredito, setVeredito] = useState<Veredito | null>(null);
    const [oculto, setOculto] = useState(false);

    useEffect(() => {
        let vivo = true;
        void avaliarOrigem().then((v) => { if (vivo) setVeredito(v); });
        return () => { vivo = false; };
    }, []);

    if (oculto || !veredito || veredito.acao !== 'perguntar') return null;

    return (
        <div style={caixaStyle} role="status">
            <div style={tituloStyle}>
                ⚠ Você abriu a URL de UM deploy — o Chrome trata como site novo
            </div>
            <div style={textoStyle}>
                Os cérebros do Nilo (~4,2 GB) e o jogo inteiro ficam guardados por endereço.
                Nesta URL o cofre está vazio: baixa tudo de novo. No endereço fixo já está baixado.
            </div>
            <div style={buildsStyle}>
                <span>aqui: {descreve(veredito.aqui)}</span>
                <span style={{ opacity: 0.45 }}>│</span>
                <span>{ORIGEM_ESTAVEL}: {descreve(veredito.la)}</span>
            </div>
            <div style={botoesStyle}>
                <button
                    style={botaoPrincipalStyle}
                    onClick={() => { globalThis.location.replace(veredito.destino); }}
                >
                    Abrir no endereço fixo
                </button>
                <button
                    style={botaoSecundarioStyle}
                    onClick={() => { ficarNestaOrigem(); setOculto(true); }}
                >
                    Ficar aqui (vou baixar de novo)
                </button>
            </div>
        </div>
    );
}

const caixaStyle: React.CSSProperties = {
    position: 'fixed',
    top: 'max(8px, env(safe-area-inset-top))',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 2_147_483_000,
    width: 'min(560px, calc(100vw - 16px))',
    boxSizing: 'border-box',
    padding: '12px 14px',
    borderRadius: 12,
    background: 'rgba(10,10,12,0.96)',
    border: '1px solid rgba(224,160,32,0.45)',
    boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    color: '#f0e6d2',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

const tituloStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: '#e0a020',
    lineHeight: 1.3,
};

const textoStyle: React.CSSProperties = {
    fontSize: 12,
    lineHeight: 1.45,
    color: '#c8c2b8',
};

const buildsStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 11,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    color: '#8a8a96',
};

const botoesStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
};

const botaoBase: React.CSSProperties = {
    flex: '1 1 auto',
    padding: '9px 12px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid transparent',
};

const botaoPrincipalStyle: React.CSSProperties = {
    ...botaoBase,
    background: '#e0a020',
    color: '#120d02',
};

const botaoSecundarioStyle: React.CSSProperties = {
    ...botaoBase,
    background: 'transparent',
    borderColor: 'rgba(255,255,255,0.18)',
    color: '#c8c2b8',
};
