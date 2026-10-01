/**
 * f13Estilo — a interface de Vindhjem num só pergaminho: fala, aviso, cartão de pistas, menu de
 * assuntos e o cartão de fim usam as mesmas cores, borda, cantos, sombra e letras.
 */
import type React from 'react';

export const TINTA = '#2a1d14', LACRE = '#7a2f1f', MOLDURA = '#6b4a2e', OURO_VELHO = '#c9a13a';
const PAPEL = 'linear-gradient(180deg,#f3e5c4 0%,#e6d3ac 55%,#d9c399 100%)';
/** A folha de pergaminho: tudo que é caixa na tela parte daqui. */
export const PERGAMINHO: React.CSSProperties = {
    background: PAPEL, color: TINTA, fontFamily: 'Georgia, serif',
    border: `2.5px solid ${MOLDURA}`, borderRadius: 12,
    boxShadow: `0 5px 16px rgba(0,0,0,.42), inset 0 0 0 1.5px rgba(255,250,235,.55), inset 0 0 22px rgba(107,74,46,.28)`,
};
/** O nome de quem fala / título de caixa: versalete vermelho-lacre. */
export const ROTULO: React.CSSProperties = { fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, color: LACRE, letterSpacing: 1.2, textTransform: 'uppercase' };
/** Botão de escolha (assuntos, "chega"): pergaminho mais escuro, com relevo. */
export const BOTAO: React.CSSProperties = {
    fontFamily: 'Georgia, serif', fontSize: 16, color: TINTA, cursor: 'pointer', textAlign: 'left', minHeight: 44,
    background: 'linear-gradient(180deg,#e9d6ad,#cdb383)', border: `2px solid ${MOLDURA}`, borderRadius: 10, padding: '10px 12px',
    boxShadow: '0 2px 0 #8a6a45, inset 0 1px 0 rgba(255,250,235,.6)',
};
