import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { Chegada14, DUR } from '../carregamento-video/src/Chegada14';
registerRoot(() => <Composition id="Chegada14" component={Chegada14} durationInFrames={DUR} fps={24} width={1280} height={608} />);
