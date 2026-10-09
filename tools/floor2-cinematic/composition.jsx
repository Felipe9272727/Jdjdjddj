import React from 'react';
import { AbsoluteFill, Composition, Img, Sequence, registerRoot, staticFile, useCurrentFrame } from 'remotion';
import timing from '../../jubileu/src/Floor2/cinematic.json';
const shots=[{shot:'poco',frames:timing.introFrames},...timing.beats];
export const duration=shots.reduce((sum,shot)=>sum+shot.frames,0);
function Shot({shot,opening}) {
  const frame=useCurrentFrame();
  return <AbsoluteFill>
    <Img src={staticFile(`blender/${shot}_${String(frame).padStart(4,'0')}.jpg`)} style={{width:'100%',height:'100%'}} />
    {opening && <Img src={staticFile(`manim/Abismo${String(frame).padStart(4,'0')}.png`)} style={{position:'absolute',inset:0,width:'100%',height:'100%'}} />}
    <AbsoluteFill style={{background:'radial-gradient(ellipse at 50% 45%, transparent 38%, rgba(0,6,10,.28) 100%)',pointerEvents:'none'}} />
  </AbsoluteFill>;
}
function Film({review=false}) {
  let from=0;
  return <AbsoluteFill style={{backgroundColor:'#061014'}}>
    {shots.map(({shot,frames},index)=>{
      const start=from; from+=frames;
      return <Sequence key={shot} from={start} durationInFrames={frames}>
        <Shot shot={shot} opening={index===0} />
        {review && index>0 && <AbsoluteFill style={{justifyContent:'flex-end'}}>
          <div style={{background:'linear-gradient(transparent,rgba(2,7,11,.96) 36%)',padding:'42px 80px 28px',textAlign:'center',color:'#e4eeeb',fontFamily:'sans-serif'}}>
            <div style={{fontSize:13,letterSpacing:4,color:'#a0bdb5',marginBottom:10}}>MERGULHADOR</div>
            <div style={{fontSize:27,lineHeight:1.4,textWrap:'balance',maxWidth:1050,margin:'auto'}}>{timing.beats[index-1].text}</div>
          </div>
        </AbsoluteFill>}
      </Sequence>;
    })}
  </AbsoluteFill>;
}
registerRoot(()=><>
  <Composition id="Floor2" component={Film} durationInFrames={duration} fps={timing.fps} width={timing.width} height={timing.height} />
  <Composition id="Floor2Review" component={Film} defaultProps={{review:true}} durationInFrames={duration} fps={timing.fps} width={timing.width} height={timing.height} />
</>);
