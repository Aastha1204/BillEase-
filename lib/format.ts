import { formatDate } from './domain/money';

/** CSV/Excel-friendly date in the app's DD-MMM-YYYY style. */
export const formatCsvDate = (iso: string) => formatDate(iso);
