import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { FinalDescida, FinalPortal, DUR_DESCIDA, DUR_PORTAL } from '../carregamento-video/src/Final14';
registerRoot(() => <>
  <Composition id="FinalDescida" component={FinalDescida} durationInFrames={DUR_DESCIDA} fps={24} width={1280} height={608} />
  <Composition id="FinalPortal" component={FinalPortal} durationInFrames={DUR_PORTAL} fps={24} width={1280} height={608} />
</>);
