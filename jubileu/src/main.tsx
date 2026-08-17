import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { SettingsProvider } from './Settings';
import { iniciarPersistencia } from './armazenamentoPersistente';
import { OrigemEstavelAviso } from './OrigemEstavelAviso';
import './index.css';

// Pede ao navegador para NÃO despejar os 4,2 GB de cérebros quando o aparelho
// apertar de espaço. Fora do caminho crítico: nada aqui bloqueia o jogo.
iniciarPersistencia();

// Alguns previews do Vercel não aplicam os headers COOP/COEP do projeto e
// derrubam o wllama para CPU×1. O Service Worker injeta os mesmos headers na
// navegação seguinte. Recarrega no máximo uma vez e nunca bloqueia o jogo.
//
// O REGISTRO DEIXOU DE SER CONDICIONAL. Antes, um host que já mandava os
// cabeçalhos certos (o caso da Vercel com o vercel.json) fazia esta função sair
// na primeira linha e o worker nunca era instalado. Isso bastava para o
// isolamento, mas hoje o mesmo arquivo também é quem guarda os 84 MB do
// index.html — e sem registro nada era guardado: o jogo inteiro descia de novo
// a cada abertura. Agora registra sempre; o recarregamento é que continua
// acontecendo só quando falta isolamento.
const COI_RELOAD_KEY = 'floor10-coi-reload-v1';
async function enableCpuThreadsFallback(): Promise<void> {
  if (
    typeof window === 'undefined'
    || !window.isSecureContext
    || !('serviceWorker' in navigator)
  ) return;

  try {
    await navigator.serviceWorker.register('/coi-serviceworker.js', {
      updateViaCache: 'none',
    });
    if (window.crossOriginIsolated) return; // já isolado: nada a recarregar
    if (sessionStorage.getItem(COI_RELOAD_KEY) === 'done') return;
    const reloadIsolated = () => {
      sessionStorage.setItem(COI_RELOAD_KEY, 'done');
      window.location.reload();
    };
    if (navigator.serviceWorker.controller) {
      reloadIsolated();
    } else {
      navigator.serviceWorker.addEventListener('controllerchange', reloadIsolated, {
        once: true,
      });
    }
  } catch {
    // Host sem Service Worker: o motor continua funcional em CPU×1.
  }
}
void enableCpuThreadsFallback();

// DEV-ONLY: isolated visual previews at `?f3preview` / `?f2preview`. Never hit
// in normal play; lets a scene be screenshotted/tuned without the full game.
const Floor3Preview = lazy(() => import('./Floor3Preview.tsx'));
const Floor2Preview = lazy(() => import('./Floor2Preview.tsx'));
// `?bancada` abre a bancada do cérebro do Nilo: cota do navegador, cronômetro
// por etapa e erros na tela, sem o jogo em volta. Precisa estar AQUI porque o
// build publicado emite um único index.html — o floor10.html só existe no dev,
// e no celular (que é onde o problema aparece) a página não seria alcançável.
const Floor10Bench = lazy(() => import('./Floor10Bench.tsx'));
// `?comparacao` isola o teste A/B pedido pelo dono do jogo: mesmo SmolLM3,
// mesmo cache e mesmas perguntas; muda apenas o runtime normal/N-gram.
const Floor10Comparacao = lazy(() => import('./Floor10Comparacao.tsx'));
// `?mente` abre a sala da mente: o Andar 10 de cima, para observar o cérebro
// pequeno pensar. Em jogo a deliberação é invisível de propósito, então é a
// única forma de flagrar uma cadeia de pensamento circular.
const Floor10Prisao = lazy(() => import('./Floor10Prisao'));
const Floor10Mente = lazy(() => import('./Floor10Mente.tsx'));
// `?campo` é a réplica simples do Andar 10 vista de cima, feita para julgar
// VONTADE + MOTOR juntos: o triângulo pensamento -> meta -> plano -> posição.
// No jogo em primeira pessoa esse triângulo é invisível.
const Floor10Campo = lazy(() => import('./Floor10Campo.tsx'));
// `?rascunho` abre a sala do rascunho: o desenho "modelo pequeno escreve, 3B
// confere e troca só a frase errada" com as quatro etapas à vista. No jogo ela
// é invisível — o jogador vê a espera e depois a fala —, e sem ver as etapas
// não dá para saber se o atalho valeu ou se o 3B reescreveu tudo assim mesmo.
const Floor10Rascunho = lazy(() => import('./Floor10Rascunho.tsx'));
// `?pipeline` abre a sala do pipeline inglês-primeiro: a pergunta em português
// descendo por desabreviar -> Bergamot -> granite a400m -> juiz de tom ->
// revisor -> Bergamot, com o tempo de cada etapa. Ela existe porque o dono do
// jogo digitou `?pipeline` esperando uma aba como as outras e não veio nada —
// e ele estava certo: sem ver as etapas, "o pipeline rodou e ganhou", "o juiz
// marcou tudo e ele perdeu" e "ele nem ligou" são indistinguíveis na tela.
const Floor10PipelineSala = lazy(() => import('./Floor10PipelineSala.tsx'));
const search = typeof window !== 'undefined' ? window.location.search : '';
const isF3Preview = search.includes('f3preview');
const isF2Preview = search.includes('f2preview');
const isBench = search.includes('bancada');
const isComparacao = search.includes('comparacao');
const isMente = search.includes('mente');
// `?prisao` abre a bancada do campo de provas do Andar 10: a sala vista de
// cima, os aparelhos, e o Nilo tentando. Existe porque o andar ainda não é
// alcançável pelo elevador — sem ela o campo de provas seria invisível.
const isPrisao = search.includes('prisao');
const isCampo = search.includes('campo');
const isRascunho = search.includes('rascunho');
// ── DUAS URLs PARA O PIPELINE, E A DIFERENÇA IMPORTA ─────────────────────
//
//     ?pipeline        abre a SALA (medir etapa por etapa)
//     ?pipeline=jogo   liga o pipeline DENTRO do jogo de verdade
//
// `pipelineLigado()` continua verdadeiro nos dois — a sala chama exatamente o
// mesmo `falarPeloPipelineReal` que o jogo chama, e uma bancada que roda outro
// código mede outro programa.
const isPipelineNoJogo = /[?&]pipeline=jogo\b/i.test(search);
const isPipelineSala = /[?&]pipeline\b/i.test(search) && !isPipelineNoJogo;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Fora do jogo de propósito: vale para a bancada, o ?mente e os previews
        também — qualquer um deles aberto numa URL de deploy paga os 4,2 GB. */}
    <OrigemEstavelAviso />
    {isPipelineSala ? (
      <Suspense fallback={null}><Floor10PipelineSala /></Suspense>
    ) : isRascunho ? (
      <Suspense fallback={null}><Floor10Rascunho /></Suspense>
    ) : isCampo ? (
      <Suspense fallback={null}><Floor10Campo /></Suspense>
    ) : isComparacao ? (
      <Suspense fallback={null}><Floor10Comparacao /></Suspense>
    ) : isPrisao ? (
      <Suspense fallback={null}><Floor10Prisao /></Suspense>
    ) : isMente ? (
      <Suspense fallback={null}><Floor10Mente /></Suspense>
    ) : isBench ? (
      <Suspense fallback={null}><Floor10Bench /></Suspense>
    ) : isF2Preview ? (
      <Suspense fallback={null}><Floor2Preview /></Suspense>
    ) : isF3Preview ? (
      <Suspense fallback={null}><Floor3Preview /></Suspense>
    ) : (
      <SettingsProvider>
        <App />
      </SettingsProvider>
    )}
  </StrictMode>,
);
