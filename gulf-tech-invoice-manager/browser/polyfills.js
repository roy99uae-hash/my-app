/**
 * Must be the first import of the browser entry: provides the Node globals the
 * shared backend code expects.
 */
import { Buffer } from 'buffer';

globalThis.Buffer ??= Buffer;
globalThis.global ??= globalThis;
globalThis.process ??= { env: {}, versions: {}, platform: 'browser', browser: true };
