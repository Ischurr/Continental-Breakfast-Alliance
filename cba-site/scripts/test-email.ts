import { Resend } from 'resend';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.NEWSLETTER_FROM_EMAIL!;
const siteUrl = process.env.NEWSLETTER_SITE_URL ?? 'https://continentalpressbox.com';

const title = 'Week 1 Power Rankings — The Pre-Season Edition';
const content = `The 2026 season is upon us. Keepers are locked, rosters are set, and the Continental Press Box is officially open for business.

This is a test email to preview what league rankings emails will look like. Real rankings coming soon.`;

const bodyHtml = content.trim()
  .split('\n')
  .map(line => line.trim() ? `<p style="margin:0 0 12px">${line}</p>` : '<br>')
  .join('');

const postUrl = `${siteUrl}/rankings`;

const html = `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
    <div style="background:#581c87;padding:20px 24px;border-radius:8px 8px 0 0">
      <span style="background:#e9d5ff;color:#581c87;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;text-transform:uppercase;letter-spacing:.05em">
        📰 Power Rankings
      </span>
      <h1 style="color:#fff;font-size:20px;margin:12px 0 4px;line-height:1.3">${title}</h1>
      <p style="color:#d8b4fe;font-size:13px;margin:0">Continental Breakfast Alliance</p>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px;font-size:15px;line-height:1.7">
      ${bodyHtml}
      <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e2e8f0">
        <a href="${postUrl}" style="display:inline-block;background:#581c87;color:#e9d5ff;font-weight:600;font-size:14px;padding:10px 20px;border-radius:6px;text-decoration:none">
          Read on the site →
        </a>
      </div>
    </div>
  </div>
`;

async function main() {
  console.log(`Sending test email from: ${fromEmail}`);
  const result = await resend.emails.send({
    from: fromEmail,
    to: ['schurrian99@gmail.com'],
    subject: `[CBA Rankings] ${title}`,
    html,
  });
  console.log('Result:', JSON.stringify(result, null, 2));
}

main().catch(console.error);
