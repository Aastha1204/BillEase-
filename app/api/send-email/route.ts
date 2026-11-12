import { NextResponse } from 'next/server';
import { emailEnabled, sendViaResend } from '@/lib/server/email';

export const dynamic = 'force-dynamic';

/** Tells the client whether real sending is available (RESEND_API_KEY set). The key itself is never exposed. */
export async function GET() {
  return NextResponse.json({ enabled: emailEnabled({ RESEND_API_KEY: process.env.RESEND_API_KEY }) });
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { status, json } = await sendViaResend(body as never, { RESEND_API_KEY: process.env.RESEND_API_KEY, RESEND_FROM: process.env.RESEND_FROM });
  return NextResponse.json(json, { status });
}
