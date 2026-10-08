/**
 * Browser edition entry point: starts the offline backend, then renders the same
 * React application used by the desktop edition.
 */
import './polyfills.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { startBackend } from './backend.js';
import App from '../src/App.jsx';
import '../src/styles/app.css';

let runtime = null;

async function boot() {
  try {
    runtime = await startBackend();
  } catch (err) {
    console.error(err);
    document.getElementById('root').innerHTML =
      `<div class="boot"><div class="boot-error"><h1>Gulf Tech Dubai Invoice Manager could not start</h1>` +
      `<p>${String(err.message || err).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])}</p>` +
      `<p>Your data has not been changed. Try a different browser, or contact support.</p></div></div>`;
    return;
  }
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// Save pending changes whenever the page is hidden or closed.
const persistNow = () => {
  if (runtime) runtime.saveAll().catch((err) => console.error('Save failed', err));
};
window.addEventListener('pagehide', persistNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistNow();
});

boot();
