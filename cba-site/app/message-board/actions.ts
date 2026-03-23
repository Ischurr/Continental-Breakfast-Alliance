'use server';

import { revalidatePath } from 'next/cache';
import { TrashTalkData } from '@/lib/types';
import { getTrashTalk, setTrashTalk } from '@/lib/store';
import { Resend } from 'resend';
import ownerEmails from '@/data/owner-emails.json';

function revalidateAll() {
  revalidatePath('/message-board');
  revalidatePath('/');
  revalidatePath('/teams/[teamId]');
}

export async function postMessage(
  authorTeamId: number,
  authorName: string,
  message: string,
  targetTeamId?: number,
  videoUrl?: string
): Promise<void> {
  const data: TrashTalkData = await getTrashTalk();

  data.posts.unshift({
    id: `post-${Date.now()}`,
    authorTeamId,
    authorName,
    targetTeamId: targetTeamId ?? undefined,
    message: message.trim(),
    videoUrl: videoUrl?.trim() || undefined,
    createdAt: new Date().toISOString(),
  });

  await setTrashTalk(data);
  revalidateAll();
}

export async function postTrade(
  authorTeamId: number,
  authorName: string,
  partnerTeamId: number,
  tradeGiving: string,
  tradeReceiving: string,
  message?: string
): Promise<void> {
  const data: TrashTalkData = await getTrashTalk();

  data.posts.unshift({
    id: `post-${Date.now()}`,
    authorTeamId,
    authorName,
    targetTeamId: partnerTeamId,
    message: message?.trim() ?? '',
    postType: 'trade',
    tradeGiving: tradeGiving.trim(),
    tradeReceiving: tradeReceiving.trim(),
    createdAt: new Date().toISOString(),
  });

  await setTrashTalk(data);
  revalidateAll();
}

export async function editPost(
  postId: string,
  newMessage: string,
  tradeGiving?: string,
  tradeReceiving?: string
): Promise<void> {
  const data: TrashTalkData = await getTrashTalk();
  const post = data.posts.find(p => p.id === postId);
  if (!post) return;
  post.message = newMessage.trim();
  if (tradeGiving !== undefined) post.tradeGiving = tradeGiving.trim();
  if (tradeReceiving !== undefined) post.tradeReceiving = tradeReceiving.trim();
  await setTrashTalk(data);
  revalidateAll();
}

export async function deletePost(postId: string): Promise<void> {
  try {
    const data: TrashTalkData = await getTrashTalk();
    data.posts = data.posts.filter(p => p.id !== postId);
    await setTrashTalk(data);
    revalidateAll();
  } catch (err) {
    console.error('[deletePost] failed:', err);
    throw err;
  }
}

export async function postAnnouncement(
  subject: string,
  message: string,
  password: string
): Promise<void> {
  if (password !== process.env.NEXT_PUBLIC_ADMIN_PIN) throw new Error('Unauthorized');

  const postId = `post-${Date.now()}`;
  const data: TrashTalkData = await getTrashTalk();

  data.posts.unshift({
    id: postId,
    authorTeamId: 0,
    authorName: 'The Commissioner',
    message: message.trim(),
    subject: subject.trim(),
    postType: 'announcement',
    createdAt: new Date().toISOString(),
  });

  await setTrashTalk(data);
  revalidateAll();

  // Send email to all league members
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.NEWSLETTER_FROM_EMAIL;
  const siteUrl = process.env.NEWSLETTER_SITE_URL ?? 'https://continental-breakfast-alliance.vercel.app';
  if (resendKey && fromEmail) {
    const resend = new Resend(resendKey);
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
          <h1 style="color:#fff;font-size:20px;margin:12px 0 4px;line-height:1.3">${subject.trim()}</h1>
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

    const recipients = ownerEmails.map((o: { owner: string; email: string }) => o.email);
    const result = await resend.emails.send({
      from: fromEmail,
      to: recipients,
      subject: `[CBA] ${subject.trim()}`,
      html,
    });
    if (result.error) {
      console.error('[postAnnouncement] Resend error:', JSON.stringify(result.error));
      throw new Error(`Email failed: ${result.error.message}`);
    }
    console.log('[postAnnouncement] Email sent:', result.data?.id);
  }
}

// ranking posts are stored separately in rankings.json; reuse existing action
import { postArticle } from '../rankings/actions';

export async function postRanking(title: string, content: string, password: string, emailLeague = false): Promise<void> {
  // forward to rankings module (will revalidate its own path)
  await postArticle(title, content, password);
  // ensure message-board also revalidates in case it displays links
  revalidateAll();

  if (!emailLeague) return;

  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.NEWSLETTER_FROM_EMAIL;
  const siteUrl = process.env.NEWSLETTER_SITE_URL ?? 'https://continentalpressbox.com';
  if (!resendKey || !fromEmail) return;

  const resend = new Resend(resendKey);
  const bodyHtml = content.trim()
    .split('\n')
    .map(line => line.trim() ? `<p style="margin:0 0 12px">${line}</p>` : '<br>')
    .join('');

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
      <div style="background:#581c87;padding:20px 24px;border-radius:8px 8px 0 0">
        <span style="background:#e9d5ff;color:#581c87;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;text-transform:uppercase;letter-spacing:.05em">
          📰 Power Rankings
        </span>
        <h1 style="color:#fff;font-size:20px;margin:12px 0 4px;line-height:1.3">${title.trim()}</h1>
        <p style="color:#d8b4fe;font-size:13px;margin:0">Continental Breakfast Alliance</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px;font-size:15px;line-height:1.7">
        ${bodyHtml}
        <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e2e8f0">
          <a href="${siteUrl}/rankings" style="display:inline-block;background:#581c87;color:#e9d5ff;font-weight:600;font-size:14px;padding:10px 20px;border-radius:6px;text-decoration:none">
            Read on the site →
          </a>
        </div>
      </div>
    </div>
  `;

  const recipients = ownerEmails.map((o: { owner: string; email: string }) => o.email);
  const result = await resend.emails.send({
    from: fromEmail,
    to: recipients,
    subject: `[CBA Rankings] ${title.trim()}`,
    html,
  });
  if (result.error) {
    console.error('[postRanking] Resend error:', JSON.stringify(result.error));
    throw new Error(`Email failed: ${result.error.message}`);
  }
  console.log('[postRanking] Email sent:', result.data?.id);
}
