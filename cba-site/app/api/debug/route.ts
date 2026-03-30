import { NextResponse } from 'next/server';

export async function GET() {
  const kvUrl = process.env['KV_REST_API_URL'];
  const kvToken = process.env['KV_REST_API_TOKEN'];
  const isVercel = process.env['VERCEL'];

  const swid = process.env['ESPN_SWID'];
  const s2 = process.env['ESPN_S2'];

  return NextResponse.json({
    VERCEL: isVercel ?? '(not set)',
    KV_REST_API_URL: kvUrl ? `SET: ${kvUrl.slice(0, 40)}` : 'MISSING',
    KV_REST_API_TOKEN: kvToken ? `SET: ${kvToken.slice(0, 10)}...` : 'MISSING',
    ESPN_SWID: swid ? `SET (length: ${swid.length})` : 'MISSING',
    ESPN_S2: s2 ? `SET (length: ${s2.length})` : 'MISSING',
    NODE_ENV: process.env.NODE_ENV,
  });
}
