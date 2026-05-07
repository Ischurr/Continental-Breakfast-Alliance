import { NextResponse } from 'next/server';
import { getEmailOptouts, setEmailOptouts } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const teamIdStr = searchParams.get('teamId');
  const action = searchParams.get('action') ?? 'unsubscribe';
  const teamId = parseInt(teamIdStr ?? '', 10);

  if (!teamId || isNaN(teamId)) {
    return new NextResponse(errorPage('Invalid link — no team ID found.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const data = await getEmailOptouts();

  if (action === 'resubscribe') {
    data.optedOut = data.optedOut.filter(id => id !== teamId);
    await setEmailOptouts(data);
    return new NextResponse(confirmPage(teamId, false), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Default: unsubscribe
  if (!data.optedOut.includes(teamId)) {
    data.optedOut.push(teamId);
    await setEmailOptouts(data);
  }

  return new NextResponse(confirmPage(teamId, true), {
    headers: { 'Content-Type': 'text/html' },
  });
}

function confirmPage(teamId: number, unsubscribed: boolean): string {
  const siteUrl = process.env['NEWSLETTER_SITE_URL'] ?? 'https://continentalpressbox.com';
  const toggleAction = unsubscribed ? 'resubscribe' : 'unsubscribe';
  const toggleLabel = unsubscribed ? 'Re-subscribe to daily emails' : 'Unsubscribe from daily emails';
  const heading = unsubscribed ? "You're unsubscribed" : "You're re-subscribed";
  const body = unsubscribed
    ? "You won't receive daily lineup emails anymore. You can re-subscribe at any time."
    : "You'll start receiving daily lineup emails again tomorrow at 10 AM.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading} — CBA Daily Lineup</title>
  <style>
    body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 40px; max-width: 420px; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 24px; margin: 0 0 12px; }
    p { color: #8b949e; margin: 0 0 24px; line-height: 1.5; }
    .btn { display: inline-block; background: #21262d; border: 1px solid #30363d; color: #e6edf3; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; margin: 4px; }
    .btn:hover { background: #30363d; }
    .btn-primary { background: #238636; border-color: #2ea043; }
    .btn-primary:hover { background: #2ea043; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${unsubscribed ? '🔕' : '🔔'}</div>
    <h1>${heading}</h1>
    <p>${body}</p>
    <a href="${siteUrl}/api/email-optout?teamId=${teamId}&action=${toggleAction}" class="btn">${toggleLabel}</a>
    <a href="${siteUrl}" class="btn btn-primary">Back to CBA site</a>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Error — CBA</title>
  <style>body { background:#0d1117; color:#e6edf3; font-family:sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; } .card { background:#161b22; border:1px solid #30363d; border-radius:12px; padding:40px; max-width:400px; text-align:center; }</style>
</head>
<body><div class="card"><div style="font-size:48px">⚠️</div><h1>Something went wrong</h1><p style="color:#8b949e">${message}</p></div></body>
</html>`;
}
