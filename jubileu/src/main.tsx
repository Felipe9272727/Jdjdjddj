import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { SettingsProvider } from './Settings';
import './index.css';

// Alguns previews do Vercel não aplicam os headers COOP/COEP do projeto e
// derrubam o wllama para CPU×1. O Service Worker injeta os mesmos headers na
// navegação seguinte. Recarrega no máximo uma vez e nunca bloqueia o jogo.
const COI_RELOAD_KEY = 'floor10-coi-reload-v1';
async function enableCpuThreadsFallback(): Promise<void> {
  if (
    typeof window === 'undefined'
    || window.crossOriginIsolated
    || !window.isSecureContext
    || !('serviceWorker' in navigator)
  ) return;

  try {
    await navigator.serviceWorker.register('/coi-serviceworker.js', {
      updateViaCache: 'none',
    });
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
// `?mente` abre a sala da mente: o Andar 10 de cima, para observar o cérebro
// pequeno pensar. Em jogo a deliberação é invisível de propósito, então é a
// única forma de flagrar uma cadeia de pensamento circular.
const Floor10Prisao = lazy(() => import('./Floor10Prisao'));
const Floor10Mente = lazy(() => import('./Floor10Mente.tsx'));
const search = typeof window !== 'undefined' ? window.location.search : '';
const isF3Preview = search.includes('f3preview');
const isF2Preview = search.includes('f2preview');
const isBench = search.includes('bancada');
const isMente = search.includes('mente');
// `?prisao` abre a bancada do campo de provas do Andar 10: a sala vista de
// cima, os aparelhos, e o Nilo tentando. Existe porque o andar ainda não é
// alcançável pelo elevador — sem ela o campo de provas seria invisível.
const isPrisao = search.includes('prisao');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPrisao ? (
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
