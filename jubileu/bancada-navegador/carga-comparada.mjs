/**
 * ── OS DOIS MOTORES MONTAM O MESMO GRAFO? ───────────────────────────────
 *
 * Carrega o MESMO modelo em dois motores e imprime, lado a lado, as linhas de
 * carga que denunciam diferença estrutural: tamanho de cada buffer, número de
 * nós do grafo, fused ops resolvidos, flash attention.
 *
 * Existe porque o motor implantado roda o granite 3x mais rápido que qualquer
 * build que eu consiga produzir, e a primeira pergunta era se ele montava um
 * grafo diferente. NÃO monta — 3454 nós, mesmos buffers, mesmos fused ops nos
 * dois. A diferença é tempo de máquina, não estrutura.
 *
 *     MOTORES=agosto,cdn MODELO=/caminho/m.gguf node bancada-navegador/carga-comparada.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, copyFileSync, symlinkSync, rmSync, existsSync } from 'node:fs';
const RAIZ='/tmp/cgraiz', PORTA=3419, BASE=`http://127.0.0.1:${PORTA}`;
if (existsSync(RAIZ)) rmSync(RAIZ,{recursive:true,force:true});
mkdirSync(RAIZ,{recursive:true});
copyFileSync('bancada-navegador/vazio.html',`${RAIZ}/vazio.html`);
const M=process.env.MODELO, base=M.replace(/^.*\//,'');
const casa=base.match(/^(.*)-(\d{5})-of-(\d{5})\.gguf$/);
let ALVO='m.gguf';
if(casa){const dir=M.slice(0,M.length-base.length);const t=Number(casa[3]);
  for(let i=1;i<=t;i++){const n=String(i).padStart(5,'0');const nm=`${casa[1]}-${n}-of-${casa[3]}.gguf`;symlinkSync(`${dir}${nm}`,`${RAIZ}/${nm}`);}
  ALVO=base;} else symlinkSync(M,`${RAIZ}/m.gguf`);
for(const m of process.env.MOTORES.split(',')) symlinkSync(`/home/user/motores/${m}`,`${RAIZ}/${m}`);
const srv=spawn('node',['bancada-navegador/servidor.mjs',RAIZ,String(PORTA)],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,800));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--unlimited-storage']});
for(const motor of process.env.MOTORES.split(',')){
  const p=await b.newPage();
  await p.goto(`${BASE}/vazio.html`,{waitUntil:'domcontentloaded',timeout:120000});
  const L=await p.evaluate(async({base,motor,alvo})=>{
    const linhas=[]; const pega=(...a)=>linhas.push(a.map(String).join(' '));
    const mod=await import(`${base}/${motor}/index.js`);
    const w=new mod.Wllama({default:`${base}/${motor}/wllama.wasm`},{suppressNativeLog:false,logger:{debug:pega,log:pega,warn:pega,error:pega}});
    await w.loadModelFromUrl(`${base}/${alvo}`,{n_ctx:1024,n_batch:256,n_threads:4,n_gpu_layers:0,warmup:false});
    await w.exit?.();
    return linhas.filter(l=>/buffer size|n_threads|backend|SIMD|repack|flash|graph|sched_reserve|memory_recurrent|kv_cache|offload/i.test(l));
  },{base:BASE,motor,alvo:ALVO});
  console.log(`\n===== ${motor} =====`);
  for(const l of L) console.log('  '+l.slice(0,130));
  await p.close();
}
await b.close(); srv.kill();
