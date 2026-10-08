/**
 * Accessor for the preload-exposed API (window.gulftech).
 * Outside the desktop shell every call rejects with a clear message instead of crashing.
 */
const notInDesktop = () =>
  Promise.reject(new Error('This screen must run inside the Gulf Tech desktop application.'));

export const api =
  typeof window !== 'undefined' && window.gulftech
    ? window.gulftech
    : new Proxy({}, { get: () => new Proxy({}, { get: () => notInDesktop }) });
