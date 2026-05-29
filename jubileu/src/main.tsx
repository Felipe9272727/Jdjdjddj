import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { SettingsProvider } from './Settings';
import './index.css';

// DEV-ONLY: isolated Floor 3 visual preview at `?f3preview`. Never hit in
// normal play; lets the scene be screenshotted/tuned without the full game.
const Floor3Preview = lazy(() => import('./Floor3Preview.tsx'));
const isF3Preview = typeof window !== 'undefined' && window.location.search.includes('f3preview');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isF3Preview ? (
      <Suspense fallback={null}><Floor3Preview /></Suspense>
    ) : (
      <SettingsProvider>
        <App />
      </SettingsProvider>
    )}
  </StrictMode>,
);
