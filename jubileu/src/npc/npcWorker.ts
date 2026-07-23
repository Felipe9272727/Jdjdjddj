// ── O WORKER DO CÉREBRO ────────────────────────────────────────────────────
// Roda a inferência do LLM FORA da thread principal (o jogo não congela).
// Empacotado JUNTO do app (?worker&inline + worker.format='iife' no vite): o
// código vira um Blob CLÁSSICO autossuficiente — NADA de importar CDN como
// module worker. Module workers são BLOQUEADOS pelo Chrome em file:// (era o
// "WORKER_MORTO" instantâneo em todos os tiers ao abrir o index.html baixado).
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
