import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { SettingsProvider } from './Settings';
import './index.css';

// DEV-ONLY: isolated visual previews at `?f3preview` / `?f2preview`. Never hit
// in normal play; lets a scene be screenshotted/tuned without the full game.
const Floor3Preview = lazy(() => import('./Floor3Preview.tsx'));
const Floor2Preview = lazy(() => import('./Floor2Preview.tsx'));
const search = typeof window !== 'undefined' ? window.location.search : '';
const isF3Preview = search.includes('f3preview');
const isF2Preview = search.includes('f2preview');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isF2Preview ? (
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
