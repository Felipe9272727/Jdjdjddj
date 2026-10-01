import React from 'react';
import { registerRoot, Composition, staticFile, continueRender, delayRender } from 'remotion';
import { Elevador, DUR as DUR_EL } from './Elevador';
import { Briga, DUR as DUR_BR } from './Briga';
import { Malas, DUR as DUR_MA } from './Malas';
import { Cha, DUR as DUR_CH } from './Cha';
import { Suite, DUR as DUR_SU } from './Suite';
import { Conves, DUR as DUR_CO } from './Conves';
import { Arquivo, DUR as DUR_AR } from './Arquivo';
import { Ceu, DUR as DUR_CE } from './Ceu';

// a fonte de cartum do jogo (Luckiest Guy, Apache 2.0), servida localmente
const espera = delayRender('fonte');
new FontFace('Luckiest Guy', `url(${staticFile('luckiest.woff2')})`).load().then((f) => { document.fonts.add(f); continueRender(espera); });

export const CENAS = [['Briga', Briga, DUR_BR], ['Elevador', Elevador, DUR_EL], ['Malas', Malas, DUR_MA], ['Cha', Cha, DUR_CH], ['Suite', Suite, DUR_SU], ['Conves', Conves, DUR_CO], ['Arquivo', Arquivo, DUR_AR], ['Ceu', Ceu, DUR_CE]];
registerRoot(() => <>{CENAS.map(([id, C, d]) => <Composition key={id} id={id} component={C} durationInFrames={d} fps={24} width={1280} height={608} />)}</>);
