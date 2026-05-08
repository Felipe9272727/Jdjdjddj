import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { SettingsProvider } from './Settings';
import './index.css';

// ⚙️ PIPELINE FIX: StrictMode removed. In dev, it causes double-mount which
// creates two WebGL contexts — R3F's internal store can end up pointing at the
// destroyed first context, producing a permanent black screen. This is a
// well-known R3F + StrictMode bug. Re-enable after upgrading R3F ≥8.15.
createRoot(document.getElementById('root')!).render(
  <SettingsProvider>
    <App />
  </SettingsProvider>,
);
