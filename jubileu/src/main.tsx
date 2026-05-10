import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { SettingsProvider } from './Settings';
import './index.css';

// NOTE: StrictMode removed intentionally. In React 18+ dev mode it causes
// double-mount (mount → unmount → mount) which destroys and recreates the
// WebGL context, leading to black screen / context loss bugs. See commit
// 4c74234 for prior investigation. Do NOT re-add StrictMode.

createRoot(document.getElementById('root')!).render(
  <SettingsProvider>
    <App />
  </SettingsProvider>,
);
