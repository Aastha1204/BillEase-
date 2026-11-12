// Server-side email via Resend. Active only when RESEND_API_KEY is set; otherwise the client falls back to mailto.
export interface EmailBody { to: string; subject: string; text: string; filename: string; pdfBase64: string }
export interface Env { RESEND_API_KEY?: string; RESEND_FROM?: string }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_PDF_B64 = 7_000_000; // ~5 MB of PDF

export function validateEmailBody(b: unknown): string | null {
  const x = b as Partial<EmailBody> | null;
  if (!x || typeof x !== 'object') return 'Invalid request';
  if (typeof x.to !== 'string' || !EMAIL.test(x.to) || x.to.length > 254) return 'Enter a valid recipient email';
  if (typeof x.subject !== 'string' || !x.subject.trim() || x.subject.length > 200) return 'Subject is required (max 200 characters)';
  if (typeof x.text !== 'string' || !x.text.trim() || x.text.length > 5000) return 'Message is required (max 5000 characters)';
  if (typeof x.filename !== 'string' || !/^[\w.\- ]{1,100}\.pdf$/i.test(x.filename)) return 'Invalid attachment name';
  if (typeof x.pdfBase64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(x.pdfBase64) || x.pdfBase64.length > MAX_PDF_B64) return 'Invalid or oversized attachment';
  return null;
}

export const emailEnabled = (env: Env) => !!env.RESEND_API_KEY;

export async function sendViaResend(body: EmailBody, env: Env, fetchImpl: typeof fetch = fetch): Promise<{ status: number; json: Record<string, unknown> }> {
  if (!env.RESEND_API_KEY) return { status: 501, json: { error: 'Email sending is not configured' } };
  const err = validateEmailBody(body);
  if (err) return { status: 400, json: { error: err } };
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM || 'BillEase <onboarding@resend.dev>',
      to: [body.to], subject: body.subject, text: body.text,
      attachments: [{ filename: body.filename, content: body.pdfBase64 }],
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return { status: 502, json: { error: 'The email provider rejected the message' } };
  return { status: 200, json: { ok: true, id: json.id } };
}
