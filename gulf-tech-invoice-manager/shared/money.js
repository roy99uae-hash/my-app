/**
 * Money helpers shared by the Electron main process and the React renderer.
 * All monetary arithmetic is rounded to 2 decimal places (fils/cents) to avoid
 * floating point drift in invoice totals.
 */

/**
 * Round a number to two decimal places using a half-away-from-zero strategy.
 * @param {number|string} value
 * @returns {number}
 */
export function round2(value) {
  const n = Number(value) || 0;
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100;
}

/**
 * Sum an array of numbers with rounding applied to the final result.
 * @param {number[]} values
 * @returns {number}
 */
export function sum2(values) {
  return round2(values.reduce((acc, v) => acc + (Number(v) || 0), 0));
}
