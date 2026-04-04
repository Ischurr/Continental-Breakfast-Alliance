import { NextRequest, NextResponse } from 'next/server';
import { getAdminNotes, setAdminNotes } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const notes = await getAdminNotes();
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pin, week, text } = body as { pin?: string; week?: number; text?: string };

    if (!pin || pin !== process.env.NEXT_PUBLIC_ADMIN_PIN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (week === undefined || text === undefined) {
      return NextResponse.json({ error: 'Missing week or text' }, { status: 400 });
    }

    const notes = await getAdminNotes();
    notes.weeks[String(week)] = { text, updatedAt: new Date().toISOString() };
    await setAdminNotes(notes);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/notes] error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
