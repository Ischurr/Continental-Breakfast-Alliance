import { Resend } from 'resend';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.NEWSLETTER_FROM_EMAIL!;
const siteUrl = process.env.NEWSLETTER_SITE_URL ?? 'https://continentalpressbox.com';

const subject = 'Test Bulletin — League Email Preview';
const message = `This is a test of the Commissioner Bulletin email system.

If you're reading this in your inbox, the league announcement emails are working correctly. Real bulletins will look just like this.`;

const postId = `post-test-${Date.now()}`;
const postUrl = `${siteUrl}/message-board#${postId}`;

const bodyHtml = message.trim()
  .split('\n')
  .map(line => line.trim() ? `<p style="margin:0 0 12px">${line}</p>` : '<br>')
  .join('');

const html = `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
    <div style="background:#0f172a;padding:20px 24px;border-radius:8px 8px 0 0">
      <span style="background:#facc15;color:#0f172a;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;text-transform:uppercase;letter-spacing:.05em">
        📣 League Bulletin
      </span>
      <h1 style="color:#fff;font-size:20px;margin:12px 0 4px;line-height:1.3">${subject}</h1>
      <p style="color:#94a3b8;font-size:13px;margin:0">From The Commissioner · Continental Breakfast Alliance</p>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px;font-size:15px;line-height:1.7">
      ${bodyHtml}
      <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e2e8f0">
        <a href="${postUrl}" style="display:inline-block;background:#0f172a;color:#facc15;font-weight:600;font-size:14px;padding:10px 20px;border-radius:6px;text-decoration:none">
          Read on the site →
        </a>
      </div>
    </div>
  </div>
`;

async function main() {
  console.log(`Sending test bulletin from: ${fromEmail}`);
  const result = await resend.emails.send({
    from: fromEmail,
    to: ['schurrian99@gmail.com'],
    subject: `[CBA] ${subject}`,
    html,
  });
  console.log('Result:', JSON.stringify(result, null, 2));
}

main().catch(console.error);
