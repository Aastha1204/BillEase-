// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { emailEnabled, sendViaResend, validateEmailBody, type EmailBody } from '@/lib/server/email';

const ok: EmailBody = { to: 'buyer@example.com', subject: 'Invoice SSE/26-27/0418', text: 'Hello', filename: 'SSE-26-27-0418.pdf', pdfBase64: 'JVBERi0xLjQ=' };

describe('email handler (no real network)', () => {
  it('is disabled without a key and refuses to send', async () => {
    const f = vi.fn();
    expect(emailEnabled({})).toBe(false);
    expect((await sendViaResend(ok, {}, f as never)).status).toBe(501);
    expect(f).not.toHaveBeenCalled();
  });
  it('validates every field', () => {
    expect(validateEmailBody(ok)).toBeNull();
    expect(validateEmailBody({ ...ok, to: 'nope' })).toMatch(/recipient/);
    expect(validateEmailBody({ ...ok, subject: ' ' })).toMatch(/Subject/);
    expect(validateEmailBody({ ...ok, filename: '../evil.exe' })).toMatch(/attachment/);
    expect(validateEmailBody({ ...ok, pdfBase64: '***' })).toMatch(/attachment/);
    expect(validateEmailBody({ ...ok, pdfBase64: 'A'.repeat(7_000_001) })).toMatch(/oversized/);
    expect(validateEmailBody(null)).toBe('Invalid request');
  });
  it('posts to Resend with the key and the PDF attached', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: 're_1' }), { status: 200 }));
    const r = await sendViaResend(ok, { RESEND_API_KEY: 'k_test', RESEND_FROM: 'Me <me@x.example>' }, f as never);
    expect(r).toEqual({ status: 200, json: { ok: true, id: 're_1' } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k_test');
    const sent = JSON.parse(init.body as string);
    expect(sent.to).toEqual(['buyer@example.com']);
    expect(sent.from).toBe('Me <me@x.example>');
    expect(sent.attachments[0]).toEqual({ filename: 'SSE-26-27-0418.pdf', content: 'JVBERi0xLjQ=' });
  });
  it('maps a provider failure to 502 without leaking details', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ message: 'secret detail' }), { status: 422 }));
    const r = await sendViaResend(ok, { RESEND_API_KEY: 'k' }, f as never);
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.json)).not.toContain('secret');
  });
});
