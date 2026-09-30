/**
 * carregando-dev.tsx — bancada da tela de carregamento animada (`?carregando`).
 *
 * Mostra a tela cheia, sem o jogo em volta. Parâmetros de URL:
 *   ?carregando&p=0.42        progresso fixo (0..1); sem `p`, a barra é indeterminada
 *   ?carregando&t=2.35        congela a cena nesse instante (s) — para capturas
 *   ?carregando&r=Texto       rótulo
 * `window.__carregandoT(n)` muda o instante congelado sem recarregar a página
 * (as capturas em sequência usam isso).
 */
import React, { useEffect, useState } from 'react';
import { CarregandoAnimado } from './CarregandoAnimado';

const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

export const CarregandoDev: React.FC = () => {
    const [t, setT] = useState<number | undefined>(q.has('t') ? parseFloat(q.get('t') ?? '0') : undefined);
    const [p, setP] = useState<number | undefined>(q.has('p') ? parseFloat(q.get('p') ?? '0') : undefined);
    useEffect(() => {
        const w = window as unknown as { __carregandoT?: (n?: number) => void; __carregandoP?: (n?: number) => void };
        w.__carregandoT = setT;
        w.__carregandoP = setP;
        return () => { delete w.__carregandoT; delete w.__carregandoP; };
    }, []);
    return <CarregandoAnimado progresso={p} rotulo={q.get('r') ?? 'Carregando o Andar 13…'} congelar={t} />;
};

export default CarregandoDev;
