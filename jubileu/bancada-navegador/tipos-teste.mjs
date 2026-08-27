import { chromium } from 'playwright';
const BASE='http://127.0.0.1:3406';
const TIPOS=process.env.TIPOS ?? 'ngram-cache';
const PERSONA='You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator". Answer in 1 or 2 short complete sentences. Reply with Nilo\'s line only, no label.';
const PEDIR='Rewrite this line so it does not break the canon, changing as little as possible:\n\n"My name is Nilo Azevedo, and as an AI language model I was designed to help you navigate the corridors of this hotel and reach the window at the end of the hallway."';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--unlimited-storage']});
const p=await b.newPage();
p.on('console',m=>{const t=m.text(); if(/WLLAMA_PATCH_TNE|implementation|no implementations|spec /i.test(t)) console.log('  ‹nativo› '+t.slice(0,180));});
await p.goto(`${BASE}/vazio.html`,{waitUntil:'domcontentloaded',timeout:120000});
const r=await p.evaluate(async({base,tipos,persona,pedir})=>{
  const mod=await import(`${base}/wllama-espec/index.js`);
  const w=new mod.Wllama({default:`${base}/wllama-espec/wllama.wasm`});
  await w.loadModelFromUrl(`${base}/smollm3.gguf`,{
    n_ctx:2048,n_batch:512,n_threads:4,n_gpu_layers:0,jinja:true,reasoning:false,warmup:false,
    ...(tipos?{spec_draft_model:`types:${tipos}`, spec_draft_n_max:5}:{}),
  });
  const msgs=[{role:'system',content:persona},{role:'user',content:pedir}];
  const uma=async()=>{const t0=performance.now();
    const res=await w.createChatCompletion({messages:msgs,n_predict:64,temp:0,cache_prompt:true,ignore_eos:true});
    const txt=res?.choices?.[0]?.message?.content??'';
    const ms=Math.round(performance.now()-t0);
    return {ms,txt:txt.slice(0,70),n:txt.length};};
  return {a:await uma(),b:await uma(),c:await uma(),d:await uma()};
},{base:BASE,tipos:TIPOS,persona:PERSONA,pedir:PEDIR});
console.log(`\n  tipos = "${TIPOS||'(nenhum)'}"`);
console.log(`    fria ${(r.a.ms/1000).toFixed(1)}s · quentes ${(r.b.ms/1000).toFixed(1)}s ${(r.c.ms/1000).toFixed(1)}s ${(r.d.ms/1000).toFixed(1)}s · ${r.b.n} chars`);
console.log(`    "${r.b.txt}"`);
await b.close();
