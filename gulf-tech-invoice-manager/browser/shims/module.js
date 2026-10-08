/**
 * Browser replacement for `node:module`. The backend only needs `require` to load
 * the SQLite engine, which is bundled in its pure-JavaScript form (sql.js asm.js),
 * so no WebAssembly file has to be fetched.
 */
import initSqlJs from 'sql.js/dist/sql-asm.js';

export function createRequire() {
  const req = (id) => {
    if (id === 'sql.js') return initSqlJs;
    throw new Error(`Module "${id}" is not available in the browser edition`);
  };
  req.resolve = (id) => id;
  return req;
}

export default { createRequire };
