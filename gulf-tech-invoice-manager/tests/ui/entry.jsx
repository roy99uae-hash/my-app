/**
 * UI smoke-test entry: renders the real App against a fake window.gulftech.
 * Bundled by tests/ui/run.mjs with Vite (SSR-style bundle) and executed in jsdom.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import App from '../../src/App.jsx';

export async function mount() {
  const el = document.getElementById('root');
  const root = createRoot(el);
  await act(async () => {
    root.render(<App />);
  });
  return root;
}
export { act };
