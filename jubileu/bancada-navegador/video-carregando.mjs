// Vídeo de uma cena de carregamento a 24 qps (quadro a quadro pelo relógio congelado).
//   node bancada-navegador/video-carregando.mjs <cena> <saida.mp4> [dur=10]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
const [cena, saida, dur = '10'] = process.argv.slice(2);
const dir = mkdtempSync('/tmp/claude-0/-home-user-Jdjdjddj/5fdb4135-da04-565f-a0ec-1b437258dbc7/scratchpad/vid-');
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true, args:['--no-sandbox'] });
const p = await (await b.newContext({ viewport:{width:960,height:456} })).newPage();
await p.goto(`http://127.0.0.1:3131/index.html?carregando&cena=${cena}&t=0`, { waitUntil:'domcontentloaded', timeout:90000 });
await new Promise(r=>setTimeout(r,6000));
const n = Math.round(+dur * 24);
for (let i = 0; i < n; i++) {
  await p.evaluate(t => window.__carregandoT?.(t), i / 24);
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.screenshot({ path: `${dir}/q${String(i).padStart(4,'0')}.png` });
}
await b.close();
const FF = execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
execFileSync(FF, ['-y','-loglevel','error','-framerate','24','-i',`${dir}/q%04d.png`,'-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-movflags','+faststart',saida]);
rmSync(dir, { recursive: true });
console.log(saida);
