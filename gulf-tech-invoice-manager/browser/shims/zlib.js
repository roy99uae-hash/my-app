/**
 * Browser replacement for the synchronous raw-deflate functions of `node:zlib`
 * that adm-zip uses. Implemented with fflate (pure JavaScript).
 */
import { Buffer } from 'buffer';
import { deflateSync, inflateSync } from 'fflate';

export function deflateRawSync(input, options = {}) {
  return Buffer.from(deflateSync(new Uint8Array(input), { level: options.level ?? 6 }));
}

export function inflateRawSync(input, options = {}) {
  const out = Buffer.from(inflateSync(new Uint8Array(input)));
  // Same guard Node applies through maxOutputLength: refuse decompression bombs.
  if (options.maxOutputLength && out.length > options.maxOutputLength) {
    throw new RangeError('Cannot create final Buffer. Output exceeds maxOutputLength.');
  }
  return out;
}

export default { deflateRawSync, inflateRawSync };
