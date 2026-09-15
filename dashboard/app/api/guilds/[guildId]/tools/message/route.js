import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { hasManageServer } from '@/lib/permissions';

export async function POST(request, { params }) {
  const { guildId } = await params;
  const sessionToken = request.cookies.get('session')?.value;
  const user = sessionToken ? await verifySession(sessionToken) : null;
  if (!user || !(await hasManageServer(user, guildId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body.channelId || !['embed', 'announce'].includes(body.type)) {
      return NextResponse.json({ error: 'A channel and valid message type are required' }, { status: 400 });
    }

    const botUrl = process.env.BOT_API_URL || 'http://localhost:3000';
    const response = await fetch(`${botUrl}/api/guilds/${guildId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.BOT_API_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    return NextResponse.json(result, { status: response.status });
  } catch (error) {
    console.error('Failed to send tool message:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 502 });
  }
}
