const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below100(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
}
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? below100(r) : ''].filter(Boolean).join(' ');
}
/** Indian-system words for a non-negative integer (crore / lakh / thousand). */
export function integerWordsIN(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  if (crore) parts.push(`${integerWordsIN(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}

/** Bare words, no currency wrapper: "One Lakh", "... Seventy-Five and Fifty Paise". */
export function amountWordsBare(paise: number): string {
  if (!Number.isInteger(paise) || paise < 0) throw new Error('amountWordsBare: need non-negative integer paise');
  const rupees = Math.floor(paise / 100);
  const ps = paise % 100;
  if (ps === 0) return integerWordsIN(rupees);
  const paiseWords = `${below100(ps)} Paise`;
  return rupees === 0 ? paiseWords : `${integerWordsIN(rupees)} and ${paiseWords}`;
}

/** Invoice form: "Rupees Forty-One Thousand Eight Hundred Sixty-Eight Only". */
export function amountInWordsINR(paise: number): string {
  return `Rupees ${amountWordsBare(paise)} Only`;
}
