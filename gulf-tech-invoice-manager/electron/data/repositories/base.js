/**
 * Small helpers shared by repositories: timestamps and row mapping.
 */

/** Current time as an ISO string (UTC). */
export const now = () => new Date().toISOString();

/** Convert a Node-style value to a number, defaulting to 0. */
export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Convert empty strings to null so optional columns stay clean. */
export const nullIfEmpty = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
