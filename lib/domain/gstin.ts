import { isKnownStateCode, stateName } from './states';

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/** Check character for the first 14 characters of a GSTIN. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const idx = CHARSET.indexOf(first14[i]);
    if (idx < 0) throw new Error(`gstinCheckChar: bad character "${first14[i]}"`);
    const v = idx * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

export interface GstinResult {
  normalized: string;
  valid: boolean;
  formatOk: boolean;
  checksumOk: boolean;
  stateOk: boolean;
  stateCode: string | null;
  stateName: string | null;
  pan: string | null;
}

export function validateGstin(input: string): GstinResult {
  const g = normalizeGstin(input);
  const formatOk = FORMAT.test(g);
  const code = g.length >= 2 ? g.slice(0, 2) : '';
  const stateOk = /^\d{2}$/.test(code) && isKnownStateCode(code);
  const checksumOk = formatOk && gstinCheckChar(g.slice(0, 14)) === g[14];
  return {
    normalized: g,
    valid: formatOk && stateOk && checksumOk,
    formatOk,
    checksumOk,
    stateOk,
    stateCode: stateOk ? code : null,
    stateName: stateOk ? stateName(code) : null,
    pan: formatOk ? g.slice(2, 12) : null,
  };
}
export const isValidGstin = (s: string) => validateGstin(s).valid;
export const stateFromGstin = (s: string) => validateGstin(s).stateCode;
export const panFromGstin = (s: string) => validateGstin(s).pan;

/** Build a checksum-valid fictional GSTIN: state(2) + PAN(10) + entity(1) + 'Z' + check. */
export function makeGstin(stateCode: string, pan: string, entity = '1'): string {
  const first14 = `${stateCode}${pan}${entity}Z`;
  return first14 + gstinCheckChar(first14);
}
