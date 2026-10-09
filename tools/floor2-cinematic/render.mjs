import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {configureLoopback} from './loopback.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const deps=path.join(root,'tools/carregamento-video'),require=createRequire(path.join(deps,'package.json'));
configureLoopback(deps);
const {bundle}=require('@remotion/bundler');
const {renderMedia,renderStill,selectComposition}=require('@remotion/renderer');
const pub=path.join(here,'frames/public');
await fs.mkdir(path.join(pub,'blender'),{recursive:true});
await fs.mkdir(path.join(pub,'manim'),{recursive:true});
const timing=JSON.parse(await fs.readFile(path.join(root,'jubileu/src/Floor2/cinematic.json')));
const shots=[{shot:'poco',frames:timing.introFrames},...timing.beats];
for(const shot of shots) {
  for(let i=0;i<=Math.ceil(shot.frames/8);i++) {
    const master=path.join(here,'frames/blender',`${shot.shot}_${String(i).padStart(4,'0')}.png`);
    if((await fs.stat(master)).size<8000)throw Error(`Incomplete Blender master: ${master}`);
  }
}
// Interpolate each shot independently: optical flow never crosses a cut.
for(const shot of shots) {
  execFileSync('ffmpeg',['-y','-loglevel','error','-threads','2','-filter_threads','2','-framerate','3',
    '-i',path.join(here,'frames/blender',`${shot.shot}_%04d.png`),
    '-vf','tpad=start_mode=clone:start_duration=1:stop_mode=clone:stop_duration=1,minterpolate=fps=24:mi_mode=mci:mc_mode=aobmc:vsbmc=1,trim=start=1,setpts=PTS-STARTPTS',
    '-frames:v',String(shot.frames),'-q:v','2','-start_number','0',path.join(pub,'blender',`${shot.shot}_%04d.jpg`)]);
  await fs.stat(path.join(pub,'blender',`${shot.shot}_${String(shot.frames-1).padStart(4,'0')}.jpg`));
}
const manim=path.join(here,'frames/manim/images/opening');
const images=(await fs.readdir(manim)).filter(f=>f.endsWith('.png')).sort();
if(images.length<72)throw Error(`Opening needs 72 frames, got ${images.length}`);
for(let i=0;i<72;i++)await fs.copyFile(path.join(manim,images[i]),path.join(pub,'manim',`Abismo${String(i).padStart(4,'0')}.png`));
const serveUrl=await bundle({entryPoint:path.join(here,'composition.jsx'),publicDir:pub,
  webpackOverride:c=>({...c,resolve:{...c.resolve,alias:{...c.resolve?.alias,
    react:path.join(deps,'node_modules/react'),'react-dom':path.join(deps,'node_modules/react-dom'),remotion:path.join(deps,'node_modules/remotion')}}})});
const browserExecutable=process.env.CHROMIUM_PATH||'/tmp/chromium';
const composition=await selectComposition({serveUrl,id:'Floor2',browserExecutable});
const output=path.join(root,'jubileu/public/floor2-mergulhador.mp4');
await renderMedia({composition,serveUrl,browserExecutable,codec:'h264',pixelFormat:'yuv420p',crf:19,concurrency:2,outputLocation:output});
const fast=output+'.tmp.mp4';
execFileSync('ffmpeg',['-y','-loglevel','error','-i',output,'-c','copy','-movflags','+faststart',fast]);
await fs.rename(fast,output);
for(const frame of [38,118,260,430,566,715])await renderStill({composition,serveUrl,browserExecutable,frame,output:path.join(here,'frames',`review-${frame}.png`)});
const review=await selectComposition({serveUrl,id:'Floor2Review',browserExecutable});
const preview=path.join(root,'previas/floor2-cutscene.mp4');
await fs.mkdir(path.dirname(preview),{recursive:true});
await renderMedia({composition:review,serveUrl,browserExecutable,codec:'h264',pixelFormat:'yuv420p',crf:21,concurrency:2,outputLocation:preview});
console.log(output);
