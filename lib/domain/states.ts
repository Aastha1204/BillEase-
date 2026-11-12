export const STATE_NAMES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
  '97': 'Other Territory',
};
/** Legacy codes: accepted when validating a GSTIN, never offered in dropdowns. */
export const LEGACY_STATE_CODES = ['25', '28'];

export function isKnownStateCode(code: string): boolean {
  return code in STATE_NAMES || LEGACY_STATE_CODES.includes(code);
}
export function stateName(code: string | null | undefined): string {
  if (!code) return '';
  if (code in STATE_NAMES) return STATE_NAMES[code];
  if (code === '25') return 'Daman & Diu (legacy)';
  if (code === '28') return 'Andhra Pradesh (legacy)';
  return '';
}
/** "Maharashtra (27)" */
export function stateLabel(code: string | null | undefined): string {
  const n = stateName(code);
  return n ? `${n} (${code})` : '';
}
export const STATE_LIST = Object.entries(STATE_NAMES)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));
