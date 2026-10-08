/**
 * Accessor for the bridge API (window.gulftech).
 *
 * The bridge is looked up on every call rather than once at import time: in the
 * browser edition it is installed asynchronously after the offline database opens.
 * Without a bridge (for example, opening the UI source outside the app), every call
 * rejects with a clear message instead of crashing.
 */
const notInDesktop = () =>
  Promise.reject(new Error('This screen must run inside the Gulf Tech Invoice Manager application.'));

const missingNamespace = () => new Proxy({}, { get: () => notInDesktop });

export const api = new Proxy(
  {},
  {
    get(_target, namespace) {
      const bridge = typeof window !== 'undefined' ? window.gulftech : undefined;
      return bridge ? bridge[namespace] : missingNamespace();
    },
  },
);
