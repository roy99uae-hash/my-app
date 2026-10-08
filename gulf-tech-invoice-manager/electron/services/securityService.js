/**
 * Security service: PIN lock with brute-force throttling.
 *
 * The PIN is stored only as a salted scrypt hash. After five consecutive wrong
 * attempts the unlock is locked out for 30 seconds (in-memory, per process).
 */
import { hashPin, verifyPin, isValidPinFormat } from '../security/crypto.js';

const MAX_FAILURES = 5;
const LOCKOUT_MS = 30_000;

export class SecurityService {
  /** @param {{settings: *, now?: () => number}} deps */
  constructor({ settings, now = () => Date.now() }) {
    this.settings = settings;
    this.now = now;
    this.failures = 0;
    this.lockedUntil = 0;
  }

  hasPin() {
    return !!this.settings.get('security.pinHash');
  }

  status() {
    return {
      hasPin: this.hasPin(),
      lockedOutSeconds: Math.max(0, Math.ceil((this.lockedUntil - this.now()) / 1000)),
      sessionTimeoutMinutes: this.settings.get('security.sessionTimeoutMinutes'),
    };
  }

  /** Verify the PIN. Returns {ok, message?}. */
  unlock(pin) {
    if (!this.hasPin()) return { ok: true };
    const wait = this.lockedUntil - this.now();
    if (wait > 0) return { ok: false, message: `Too many attempts. Try again in ${Math.ceil(wait / 1000)} seconds.` };
    if (verifyPin(pin, this.settings.get('security.pinHash'))) {
      this.failures = 0;
      return { ok: true };
    }
    this.failures += 1;
    if (this.failures >= MAX_FAILURES) {
      this.failures = 0;
      this.lockedUntil = this.now() + LOCKOUT_MS;
      return { ok: false, message: 'Too many wrong PIN attempts. The app is locked for 30 seconds.' };
    }
    return { ok: false, message: `Incorrect PIN. ${MAX_FAILURES - this.failures} attempt(s) left.` };
  }

  /**
   * Set or change the PIN. When a PIN already exists, the current PIN is required.
   */
  setPin({ currentPin, newPin }) {
    if (!isValidPinFormat(newPin)) throw new Error('PIN must be 4 to 8 digits.');
    if (this.hasPin() && !verifyPin(currentPin, this.settings.get('security.pinHash'))) {
      throw new Error('The current PIN is incorrect.');
    }
    this.settings.setInternal('security.pinHash', hashPin(newPin));
    return this.status();
  }

  /** Remove the PIN lock. Requires the current PIN. */
  removePin({ currentPin }) {
    if (!this.hasPin()) return this.status();
    if (!verifyPin(currentPin, this.settings.get('security.pinHash'))) throw new Error('The PIN is incorrect.');
    this.settings.deleteInternal('security.pinHash');
    return this.status();
  }
}
