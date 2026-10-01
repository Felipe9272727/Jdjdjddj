import React from 'react';
import { registerRoot, Composition, staticFile, continueRender, delayRender } from 'remotion';
import { Elevador, DUR as DUR_EL } from './Elevador';

// a fonte de cartum do jogo (Luckiest Guy, Apache 2.0), servida localmente
const espera = delayRender('fonte');
new FontFace('Luckiest Guy', `url(${staticFile('luckiest.woff2')})`).load().then((f) => { document.fonts.add(f); continueRender(espera); });

export const CENAS = [['Elevador', Elevador, DUR_EL]];
registerRoot(() => <>{CENAS.map(([id, C, d]) => <Composition key={id} id={id} component={C} durationInFrames={d} fps={24} width={1280} height={608} />)}</>);
