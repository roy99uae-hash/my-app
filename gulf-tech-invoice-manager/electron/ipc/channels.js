/**
 * Central list of IPC channels and whether they are allowed while the app is locked.
 * Only app/security channels are available on the lock screen; everything else
 * returns a LOCKED error until the PIN is entered.
 */
export const OPEN_CHANNELS = new Set([
  'app:info',
  'app:settings:get',
  'security:status',
  'security:unlock',
  'security:lock',
]);
